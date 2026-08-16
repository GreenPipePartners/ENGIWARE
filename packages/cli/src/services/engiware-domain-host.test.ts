import { expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { decodeCommand, start } from "./engiware-domain-host"

const fixture = path.join(import.meta.dir, "../../test/fixture/engiware-domain-host.ts")

test("does not launch without sidecar configuration", async () => {
  expect(await Effect.runPromise(Effect.scoped(start({})))).toBeUndefined()
})

test("starts an import-ready sidecar without a recovery index", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "normal"] })
        if (!client) throw new Error("Expected Engiware domain client")
        const source = "/project/Controller.L5X"
        const result = yield* Effect.promise(() => client.plc.importL5x(source))
        expect(result.catalog[0]?.label).toBe(source)
        expect(result.status.items[0]?.value).toBe(source)
        expect(result.status.items[1]?.value).toBe("[]")
      }),
    ),
  )
})

test("rejects malformed domain result DTOs", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "malformed-result"] })
        if (!client) throw new Error("Expected Engiware domain client")
        const error = yield* Effect.promise(() =>
          client.plc.importL5x("/project/Controller.L5X").catch((cause) => cause),
        )
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain("catalog")
      }),
    ),
  )
})

test("accepts only JSON command arrays", () => {
  expect(decodeCommand('["bun", "host.ts"]')).toEqual(["bun", "host.ts"])
  expect(() => decodeCommand("bun host.ts")).toThrow()
  expect(() => decodeCommand('["bun", " "]')).toThrow()
})

test("handshakes and correlates concurrent requests", async () => {
  const scope = await Effect.runPromise(Scope.make())
  try {
    const client = await Effect.runPromise(
      start({ recoveryIndex: "fixture-index", command: [process.execPath, fixture, "normal"] }).pipe(
        Scope.provide(scope),
      ),
    )
    expect(client).toBeDefined()
    if (!client) throw new Error("Expected Engiware domain client")
    expect(await client.host.hello()).toEqual({ protocolVersion: 1 })
    expect(await client.plc.open()).toEqual({
      catalog: [],
      status: { items: [{ label: "host", value: "ready" }] },
    })
    const imported = await client.plc.importL5x("/project/Controller.L5X")
    expect(imported.status.items[1]?.value).toContain("--recovery-index")
    expect(imported.status.items[1]?.value).toContain(path.resolve("fixture-index"))

    const slow = client.plc.openRoutine({ id: "slow" })
    const fast = client.plc.openRoutine({ id: "fast" })
    expect((await fast).rows[0]?.id).toBe("fast")
    expect((await slow).rows[0]?.id).toBe("slow")
    await client.plc.close()
    await client.plc.close()
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

test("rejects malformed readiness", async () => {
  await expect(
    Effect.runPromise(
      Effect.scoped(
        start({ recoveryIndex: "fixture-index", command: [process.execPath, fixture, "malformed-readiness"] }),
      ),
    ),
  ).rejects.toThrow("malformed readiness")
})

test("rejects malformed responses without leaving startup pending", async () => {
  await expect(
    Effect.runPromise(
      Effect.scoped(
        start({
          recoveryIndex: "fixture-index",
          command: [process.execPath, fixture, "malformed-response"],
          startupTimeoutMs: 500,
        }),
      ),
    ),
  ).rejects.toThrow("protocol failed")
})

test("times out a host that never becomes ready", async () => {
  await expect(
    Effect.runPromise(
      Effect.scoped(
        start({
          recoveryIndex: "fixture-index",
          command: [process.execPath, fixture, "silent-readiness"],
          startupTimeoutMs: 25,
        }),
      ),
    ),
  ).rejects.toThrow("Timed out waiting for Engiware domain host readiness")
})

test("times out a host that never answers hello", async () => {
  await expect(
    Effect.runPromise(
      Effect.scoped(
        start({
          recoveryIndex: "fixture-index",
          command: [process.execPath, fixture, "silent-hello"],
          startupTimeoutMs: 1_500,
        }),
      ),
    ),
  ).rejects.toThrow("Timed out waiting for Engiware domain host hello")
})

test("rejects pending requests when the child exits", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({
          recoveryIndex: "fixture-index",
          command: [process.execPath, fixture, "exit-on-request"],
        })
        if (!client) throw new Error("Expected Engiware domain client")
        const error = yield* Effect.promise(() => client.plc.setMode("detail").catch((cause) => cause))
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain("Engiware domain host")
      }),
    ),
  )
})

test("terminates the child when its scope closes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-engiware-host-"))
  const pidFile = path.join(root, "pid")
  const scope = await Effect.runPromise(Scope.make())
  try {
    const client = await Effect.runPromise(
      start({ recoveryIndex: "fixture-index", command: [process.execPath, fixture, "normal", pidFile] }).pipe(
        Scope.provide(scope),
      ),
    )
    expect(client).toBeDefined()
    expect(await Bun.file(pidFile).exists()).toBe(true)
    await Effect.runPromise(Scope.close(scope, Exit.void))
    expect(await waitForFile(pidFile + ".terminated")).toBe(true)
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
    await fs.rm(root, { recursive: true, force: true })
  }
})

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await Bun.file(file).exists()) return true
    await Bun.sleep(20)
  }
  return false
}
