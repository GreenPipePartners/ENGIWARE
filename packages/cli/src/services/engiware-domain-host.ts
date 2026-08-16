import type { EngiwareCatalogNode, EngiwareDomainClient } from "@opencode-ai/tui"
import { CrossSpawnSpawner } from "@opencode-ai/util/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Cause, Effect, Queue, Schema, Semaphore, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import path from "node:path"

const PROTOCOL_VERSION = 1
const MAX_REQUEST_LINE_BYTES = 1024 * 1024
const MAX_RESPONSE_LINE_BYTES = 32 * 1024 * 1024
const CLOSE_TIMEOUT_MS = 1_000
const STARTUP_TIMEOUT_MS = 15_000

const Command = Schema.fromJsonString(Schema.NonEmptyArray(Schema.NonEmptyString))
const decodeCommandJson = Schema.decodeUnknownSync(Command)
const Response = Schema.Struct({
  id: Schema.String,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      code: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
      message: Schema.String,
      data: Schema.optional(Schema.Json),
    }),
  ),
})
const decodeResponse = Schema.decodeUnknownSync(Schema.fromJsonString(Response))
const decodeReady = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      ready: Schema.Literal(true),
      protocolVersion: Schema.Literal(PROTOCOL_VERSION),
    }),
  ),
)
const DomainOperation = Schema.Union([
  Schema.Literal("host.hello"),
  Schema.Literal("plc.open"),
  Schema.Literal("plc.importL5x"),
  Schema.Literal("plc.openRoutine"),
  Schema.Literal("plc.setMode"),
  Schema.Literal("plc.moveSelection"),
  Schema.Literal("plc.selectAt"),
  Schema.Literal("plc.close"),
])
const decodeHello = Schema.decodeUnknownSync(
  Schema.Struct({
    protocolVersion: Schema.Literal(PROTOCOL_VERSION),
    operations: Schema.optional(Schema.Array(DomainOperation)),
  }),
)
const Status = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      value: Schema.String,
      tone: Schema.optional(
        Schema.Union([
          Schema.Literal("neutral"),
          Schema.Literal("info"),
          Schema.Literal("success"),
          Schema.Literal("warning"),
          Schema.Literal("error"),
        ]),
      ),
    }),
  ),
})
const ObjectReference = Schema.Struct({ snapshotId: Schema.String, objectId: Schema.String })
const CatalogTarget = Schema.Struct({ id: Schema.String })
const CatalogNode: Schema.Codec<EngiwareCatalogNode> = Schema.suspend(() =>
  Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    kind: Schema.Union([
      Schema.Literal("controller"),
      Schema.Literal("group"),
      Schema.Literal("program"),
      Schema.Literal("aoi"),
      Schema.Literal("routine"),
    ]),
    target: Schema.optional(CatalogTarget),
    objectRef: Schema.optional(ObjectReference),
    status: Schema.optional(Status),
    children: Schema.optional(Schema.Array(CatalogNode)),
  }),
)
const Projection = Schema.Struct({
  coordinateSystem: Schema.Literal("terminal-cell-v1"),
  mode: Schema.Union([Schema.Literal("summary"), Schema.Literal("detail")]),
  target: Schema.Struct({ navigationId: Schema.String }),
  rows: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      segments: Schema.Array(
        Schema.Struct({
          text: Schema.String,
          style: Schema.optional(Schema.String),
          componentID: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
  hits: Schema.Array(
    Schema.Struct({
      row: Schema.Number,
      startCell: Schema.Number,
      endCell: Schema.Number,
      componentID: Schema.String,
    }),
  ),
  selectedComponentID: Schema.optional(Schema.String),
  objectRefs: Schema.optional(Schema.Array(ObjectReference)),
  selectionRef: Schema.optional(ObjectReference),
  context: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      entries: Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })),
    }),
  ),
  status: Status,
})
const OpenResult = Schema.Struct({
  catalog: Schema.Array(CatalogNode),
  activeTarget: Schema.optional(CatalogTarget),
  projection: Schema.optional(Projection),
  status: Status,
})
const decodeOpenResult = Schema.decodeUnknownSync(OpenResult)
const decodeProjection = Schema.decodeUnknownSync(Projection)

export type Options = {
  readonly recoveryIndex?: string
  readonly command?: ReadonlyArray<string>
  readonly fluxDeepProject?: string
  readonly startupTimeoutMs?: number
}

type ResolvedOptions = {
  readonly recoveryIndex?: string
  readonly command: readonly [string, ...string[]]
  readonly startupTimeoutMs: number
}

type Pending = {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

export function decodeCommand(input: string) {
  const command = decodeCommandJson(input)
  if (command.some((part) => part.trim() === ""))
    throw new Error("Engiware domain host command entries must be non-empty")
  return command
}

const makeClient = Effect.fn("cli.engiware-domain-host.client")(function* (options: ResolvedOptions) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const outgoing = yield* Queue.unbounded<string, Cause.Done>()
  const writeLock = yield* Semaphore.make(1)
  const [executable, ...args] = options.command
  const hostArgs = options.recoveryIndex ? [...args, "--recovery-index", options.recoveryIndex] : args
  const proc = yield* spawner.spawn(
    ChildProcess.make(executable, hostArgs, {
      cwd: process.cwd(),
      stdin: { stream: Stream.encodeText(Stream.fromQueue(outgoing)), endOnDone: true },
      stdout: "pipe",
      stderr: "pipe",
      killSignal: "SIGTERM",
      forceKillAfter: "3 seconds",
    }),
  )
  const pending = new Map<string, Pending>()
  const readiness = Promise.withResolvers<void>()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const state: {
    buffer: Buffer
    trailingBytes: number
    nextID: number
    closing?: Promise<void>
    terminating?: Promise<void>
    closed: boolean
    error?: Error
    ready: boolean
  } = {
    buffer: Buffer.alloc(0),
    trailingBytes: 0,
    nextID: 0,
    closed: false,
    ready: false,
  }

  const rejectPending = (error: Error) => {
    state.error ??= error
    pending.forEach((entry) => entry.reject(error))
    pending.clear()
  }

  const terminate = () =>
    (state.terminating ??= Effect.runPromise(
      Effect.gen(function* () {
        state.closed = true
        Queue.endUnsafe(outgoing)
        rejectPending(state.error ?? new Error("Engiware domain host closed"))
        yield* proc.kill({ killSignal: "SIGTERM", forceKillAfter: "3 seconds" }).pipe(Effect.ignore)
      }),
    ))

  const fail = (error: Error) => {
    if (state.closed) return
    state.error = error
    state.closed = true
    readiness.reject(error)
    Queue.endUnsafe(outgoing)
    rejectPending(error)
    void terminate()
  }

  const request = <Result>(method: string, params: unknown, closing = false) => {
    if (state.closed) return Promise.reject(state.error ?? new Error("Engiware domain host is closed"))
    if (state.closing && !closing) return Promise.reject(new Error("Engiware domain host is closing"))
    const id = String(++state.nextID)
    const line = JSON.stringify({ id, method, params })
    if (Buffer.byteLength(line) > MAX_REQUEST_LINE_BYTES) {
      return Promise.reject(new Error(`Engiware domain host request exceeded ${MAX_REQUEST_LINE_BYTES} bytes`))
    }
    return new Promise<Result>((resolve, reject) => {
      pending.set(id, { resolve: (value) => resolve(value as Result), reject })
      void Effect.runPromise(writeLock.withPermit(Queue.offer(outgoing, line + "\n"))).then(
        (offered) => {
          if (offered) return
          if (!pending.delete(id)) return
          reject(state.error ?? new Error("Engiware domain host is closed"))
        },
        (cause) => {
          if (!pending.delete(id)) return
          reject(cause instanceof Error ? cause : new Error(String(cause)))
        },
      )
    })
  }

  const close = () => {
    if (state.closing) return state.closing
    state.closing = (async () => {
      if (!state.closed) {
        const timer = Promise.withResolvers<void>()
        const timeout = setTimeout(
          () => timer.reject(new Error("Timed out closing Engiware domain host")),
          CLOSE_TIMEOUT_MS,
        )
        timeout.unref()
        await Promise.race([request<unknown>("plc.close", {}, true), timer.promise]).catch(() => undefined)
        clearTimeout(timeout)
      }
      await terminate()
    })()
    return state.closing
  }

  const client: EngiwareDomainClient = {
    host: {
      hello: () => request<unknown>("host.hello", { protocolVersion: PROTOCOL_VERSION }).then(decodeHello),
    },
    plc: {
      open: () => request<unknown>("plc.open", {}).then(decodeOpenResult),
      importL5x: (source) => request<unknown>("plc.importL5x", { source }).then(decodeOpenResult),
      openRoutine: (target) => request<unknown>("plc.openRoutine", { target }).then(decodeProjection),
      setMode: (mode) => request<unknown>("plc.setMode", { mode }).then(decodeProjection),
      moveSelection: (direction) => request<unknown>("plc.moveSelection", { direction }).then(decodeProjection),
      selectAt: (point) => request<unknown>("plc.selectAt", { point }).then(decodeProjection),
      close,
    },
  }

  const handleLine = (line: string) => {
    if (!state.ready) {
      decodeReady(line)
      state.ready = true
      readiness.resolve()
      return
    }
    const response = decodeResponse(line)
    const entry = pending.get(response.id)
    if (!entry) throw new Error(`Engiware domain host returned unknown request ID ${response.id}`)
    const hasResult = "result" in response
    const hasError = response.error !== undefined
    if (hasResult === hasError) {
      throw new Error("Engiware domain host response must contain exactly one result or error")
    }
    pending.delete(response.id)
    if (hasError) {
      const code = response.error.code === undefined ? "" : ` (${response.error.code})`
      entry.reject(new Error(`Engiware domain host error${code}: ${response.error.message}`))
      return
    }
    entry.resolve(response.result)
  }

  const handleChunk = (chunk: Uint8Array) => {
    for (const byte of chunk) {
      state.trailingBytes = byte === 10 ? 0 : state.trailingBytes + 1
      if (state.trailingBytes > MAX_RESPONSE_LINE_BYTES) {
        throw new Error(`Engiware domain host response exceeded ${MAX_RESPONSE_LINE_BYTES} bytes`)
      }
    }
    state.buffer = Buffer.concat([state.buffer, chunk])
    while (true) {
      const newline = state.buffer.indexOf(10)
      if (newline === -1) return
      const end = newline > 0 && state.buffer[newline - 1] === 13 ? newline - 1 : newline
      const line = decoder.decode(state.buffer.subarray(0, end))
      state.buffer = state.buffer.subarray(newline + 1)
      if (line === "") throw new Error("Engiware domain host returned an empty protocol line")
      handleLine(line)
    }
  }

  yield* proc.stdout.pipe(
    Stream.runForEach((chunk) =>
      Effect.try({
        try: () => handleChunk(chunk),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }),
    ),
    Effect.matchCauseEffect({
      onFailure: (cause) => Effect.sync(() => fail(new Error("Engiware domain host protocol failed", { cause }))),
      onSuccess: () => Effect.sync(() => fail(new Error("Engiware domain host stdout closed"))),
    }),
    Effect.forkScoped,
  )
  yield* proc.stderr.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => Effect.logDebug("Engiware domain host stderr", { line })),
    Effect.catchCause((cause) => Effect.logWarning("Failed to drain Engiware domain host stderr", { cause })),
    Effect.forkScoped,
  )
  yield* proc.exitCode.pipe(
    Effect.match({
      onFailure: (cause) => fail(new Error("Engiware domain host process failed", { cause })),
      onSuccess: (code) => fail(new Error(`Engiware domain host exited with code ${code}`)),
    }),
    Effect.forkScoped,
  )
  yield* Effect.addFinalizer(() => Effect.promise(close))

  yield* Effect.tryPromise({
    try: () => readiness.promise,
    catch: (cause) => new Error("Engiware domain host returned malformed readiness", { cause }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: `${options.startupTimeoutMs} millis`,
      orElse: () => Effect.fail(new Error("Timed out waiting for Engiware domain host readiness")),
    }),
    Effect.tapError(() => Effect.promise(terminate)),
  )
  const hello = yield* Effect.tryPromise({
    try: () => client.host.hello(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(
    Effect.timeoutOrElse({
      duration: `${options.startupTimeoutMs} millis`,
      orElse: () => Effect.fail(new Error("Timed out waiting for Engiware domain host hello")),
    }),
    Effect.tapError(() => Effect.promise(terminate)),
  )
  yield* Effect.try({
    try: () => decodeHello(hello),
    catch: (cause) => new Error("Engiware domain host returned malformed readiness", { cause }),
  }).pipe(Effect.tapError(() => Effect.promise(terminate)))
  return client
})

export function start(options?: Options) {
  return Effect.try({
    try: () => resolveOptions(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(
    Effect.flatMap((resolved) => (resolved ? makeClient(resolved) : Effect.succeed(undefined))),
    Effect.provide(LayerNode.compile(CrossSpawnSpawner.node)),
  )
}

function resolveOptions(options: Options | undefined): ResolvedOptions | undefined {
  const recoveryIndex = options ? options.recoveryIndex : process.env.ENGIWARE_PLC_RECOVERY_INDEX
  const command = options ? options.command : environmentCommand()
  const project = options ? options.fluxDeepProject : process.env.ENGIWARE_FLUX_DEEP_PROJECT
  if ((!recoveryIndex || recoveryIndex.trim() === "") && command === undefined && (!project || project.trim() === "")) {
    return undefined
  }
  const startupTimeoutMs = options?.startupTimeoutMs ?? STARTUP_TIMEOUT_MS
  if (!Number.isSafeInteger(startupTimeoutMs) || startupTimeoutMs <= 0) {
    throw new Error("Engiware domain host startup timeout must be a positive integer")
  }
  const resolved = command ?? projectCommand(project)
  if (resolved.length === 0 || resolved.some((part) => part.trim() === "")) {
    throw new Error("Engiware domain host command must be a non-empty array of non-empty strings")
  }
  return {
    recoveryIndex: recoveryIndex && recoveryIndex.trim() !== "" ? path.resolve(recoveryIndex) : undefined,
    command: resolved as [string, ...string[]],
    startupTimeoutMs,
  }
}

function environmentCommand() {
  const input = process.env.ENGIWARE_PLC_DOMAIN_HOST_COMMAND
  return input === undefined ? undefined : decodeCommand(input)
}

function projectCommand(project: string | undefined) {
  if (project && project.trim() !== "") {
    return ["uv", "run", "--project", path.resolve(project), "--extra", "mine", "flux-deep-domain-host"]
  }
  return ["flux-deep-domain-host"]
}

export * as EngiwareDomainHost from "./engiware-domain-host"
