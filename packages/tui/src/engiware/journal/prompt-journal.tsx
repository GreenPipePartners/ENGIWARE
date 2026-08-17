import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode-ai/client"
import { Flock } from "@opencode-ai/util/flock"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { useData } from "../../context/data"
import { useToast } from "../../ui/toast"
import type { PromptJournalAdmission, PromptJournalProject } from "../application/contracts"
import { useEngiwareApplication } from "../application/provider"

export type PromptJournalResponse = {
  readonly text?: string
  readonly providerID: string
  readonly modelID: string
  readonly variant?: string
}

export type PromptJournalRecord = {
  readonly sessionID: string
  readonly promptID: string
  readonly created: number
  readonly prompt: string
  readonly initial?: PromptJournalResponse
  readonly final?: PromptJournalResponse
}

export function PromptJournalAdmissionRecorder() {
  const data = useData()
  const controller = useEngiwareApplication()
  createEffect(() => {
    for (const sessionID of Object.keys(controller.model.promptJournalProjects)) {
      for (const item of data.session.pending.list(sessionID)) {
        if (item.type === "user") controller.actions.observePromptAdmission(sessionID, item.id, item.timeCreated)
      }
    }
  })
  return null
}

export function PromptJournalRecorder(props: { readonly sessionID: string }) {
  const data = useData()
  const controller = useEngiwareApplication()
  const toast = useToast()
  const [retry, setRetry] = createSignal(0)
  let signature = ""
  let requested = ""
  let writing = Promise.resolve()
  let disposed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let reported = ""

  createEffect(() => {
    retry()
    const projects = controller.model.promptJournalProjects[props.sessionID]
    if (!projects?.length) return
    const admissions = controller.model.promptJournalAdmissions[props.sessionID] ?? {}
    const messages = data.session.message
      .list(props.sessionID)
      .filter((message) => message.type !== "user" || !data.session.input.has(props.sessionID, message.id))
    const idle = data.session.status(props.sessionID) === "idle"
    const journals = [...Map.groupBy(projects.filter(hasSource), (project) => project.source)].flatMap(
      ([source, segments]) => {
        const records = segments.flatMap((project) =>
          buildPromptJournalRecords(
            props.sessionID,
            messages,
            project.since,
            idle,
            project.until,
            project.id,
            admissions,
          ),
        )
        return records.length ? [{ source, records }] : []
      },
    )
    if (!journals.length) return
    const next = JSON.stringify(journals)
    if (next === signature || next === requested) return
    requested = next
    writing = writing
      .then(async () => {
        const errors: unknown[] = []
        for (const journal of journals) {
          await materializePromptJournals(journal.source, journal.records).catch((cause) => errors.push(cause))
        }
        if (!disposed) await controller.actions.refreshPromptJournals()
        if (errors.length === 1) throw errors[0]
        if (errors.length) throw new AggregateError(errors, `${errors.length} prompt journal writes failed`)
      })
      .then(() => {
        signature = next
        if (requested === next) requested = ""
        reported = ""
      })
      .catch((cause) => {
        if (requested === next) requested = ""
        if (reported !== next) {
          reported = next
          toast.show({
            title: "Prompt journal write failed",
            message: cause instanceof Error ? cause.message : String(cause),
            variant: "error",
          })
        }
        if (disposed) return
        clearTimeout(retryTimer)
        retryTimer = setTimeout(() => setRetry((value) => value + 1), 5_000)
      })
  })

  onCleanup(() => {
    disposed = true
    clearTimeout(retryTimer)
  })
  return null
}

export function buildPromptJournalRecords(
  sessionID: string,
  messages: readonly SessionMessageInfo[],
  since: number,
  idle: boolean,
  until = Number.POSITIVE_INFINITY,
  projectID?: number,
  admissions?: Readonly<Record<string, PromptJournalAdmission | undefined>>,
) {
  return messages.flatMap((message, index): PromptJournalRecord[] => {
    if (message.type !== "user") return []
    const admission = admissions?.[message.id]
    const created = admission?.created ?? message.time.created
    if (admission ? admission.projectID !== projectID : created < since || created >= until) return []
    const nextUser = messages.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.type === "user" &&
        messages
          .slice(index + 1, candidateIndex)
          .some((between) => between.type === "assistant" && !!between.time.completed),
    )
    const end = nextUser === -1 ? messages.length : nextUser
    const assistants = messages
      .slice(index + 1, end)
      .filter(
        (candidate): candidate is SessionMessageAssistant =>
          candidate.type === "assistant" && !!candidate.time.completed,
      )
    const initial = assistants[0]
    const final = nextUser !== -1 || idle ? assistants.at(-1) : undefined
    return [
      {
        sessionID,
        promptID: message.id,
        created,
        prompt: message.text,
        initial: initial ? response(initial) : undefined,
        final: final ? response(final) : undefined,
      },
    ]
  })
}

function hasSource(project: PromptJournalProject): project is PromptJournalProject & { readonly source: string } {
  return project.source !== undefined
}

export async function materializePromptJournals(source: string, records: readonly PromptJournalRecord[]) {
  const project = await realpath(path.dirname(source))
  const directory = await requireJournalDirectory(project)
  const grouped = Map.groupBy(records, (record) => date(record.created))
  for (const [day, entries] of grouped) {
    const file = path.join(directory, `${day}.md`)
    await Flock.withLock(
      file,
      async () => {
        const info = await lstat(file).catch((cause) => (code(cause) === "ENOENT" ? undefined : Promise.reject(cause)))
        if (info && !info.isFile()) throw new Error(`Prompt journal is not a regular file: ${file}`)
        const existing = await readFile(file, "utf8").catch((cause) => {
          if (code(cause) === "ENOENT") return `# Prompt Journal - ${day}\n`
          throw cause
        })
        const updated = entries.reduce((text, entry) => upsert(text, entry), existing)
        if (updated === existing) return
        const temporary = path.join(directory, `.${day}.${randomUUID()}.tmp`)
        await writeFile(temporary, updated, { flag: "wx", mode: 0o600 })
        await readFile(file, "utf8")
          .catch((cause) => {
            if (code(cause) === "ENOENT") return `# Prompt Journal - ${day}\n`
            throw cause
          })
          .then((current) => {
            if (current !== existing) throw new Error(`Prompt journal changed while writing: ${file}`)
            return rename(temporary, file)
          })
          .finally(() => rm(temporary, { force: true }))
      },
      { dir: path.join(tmpdir(), "engiware-prompt-journal-locks") },
    )
  }
}

async function requireJournalDirectory(project: string) {
  const logs = path.join(project, "Logs")
  const prompts = path.join(logs, "Prompts")
  for (const directory of [logs, prompts]) {
    const info = await lstat(directory).catch((cause) => (code(cause) === "ENOENT" ? undefined : Promise.reject(cause)))
    if (info && !info.isDirectory()) throw new Error(`Prompt journal path is not a directory: ${directory}`)
    if (!info) await mkdir(directory)
  }
  return prompts
}

function code(cause: unknown) {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return
  return typeof cause.code === "string" ? cause.code : undefined
}

export function promptJournalPath(source: string, day: string) {
  return path.join(path.dirname(source), "Logs", "Prompts", `${day}.md`)
}

function response(message: SessionMessageAssistant): PromptJournalResponse {
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim()
  return {
    text: text || undefined,
    providerID: message.model.providerID,
    modelID: message.model.id,
    variant: message.model.variant,
  }
}

function date(created: number) {
  return new Date(created).toISOString().slice(0, 10)
}

function upsert(document: string, record: PromptJournalRecord) {
  const key = `${record.sessionID}:${record.promptID}`
  const start = `<!-- engiware-prompt:${key}:start -->`
  const end = `<!-- engiware-prompt:${key}:end -->`
  const block = render(record, start, end)
  const from = document.indexOf(start)
  if (from === -1) return `${document.trimEnd()}\n\n${block}\n`
  const until = document.indexOf(end, from)
  if (until === -1) throw new Error(`Prompt journal has an unterminated managed block: ${key}`)
  const duplicate = document.indexOf(start, from + start.length)
  if (duplicate !== -1 && duplicate < until) throw new Error(`Prompt journal has overlapping managed blocks: ${key}`)
  return document.slice(0, from) + block + document.slice(until + end.length)
}

function render(record: PromptJournalRecord, start: string, end: string) {
  return [
    start,
    `## ${new Date(record.created).toISOString().slice(11, 23)} UTC`,
    "",
    `- Session: \`${record.sessionID}\``,
    `- Prompt: \`${record.promptID}\``,
    `- Initial model: ${model(record.initial)}`,
    `- Final model: ${model(record.final)}`,
    "",
    "### Prompt",
    "",
    indent(record.prompt),
    "",
    "### Initial response",
    "",
    record.initial ? indent(record.initial.text ?? "[No textual response]") : "_Pending_",
    "",
    "### Final response",
    "",
    record.final ? indent(record.final.text ?? "[No textual response]") : "_Pending_",
    "",
    end,
  ].join("\n")
}

function model(value: PromptJournalResponse | undefined) {
  if (!value) return "_Pending_"
  const variant = value.variant ? ` (${value.variant})` : ""
  return `\`${value.providerID}/${value.modelID}\`${variant}`
}

function indent(value: string) {
  return value
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")
}
