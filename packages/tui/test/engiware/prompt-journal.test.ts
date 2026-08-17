import { expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildPromptJournalRecords,
  materializePromptJournals,
  promptJournalPath,
} from "../../src/engiware/journal/prompt-journal"
import type { PromptJournalAdmission } from "../../src/engiware/application/contracts"

const created = Date.parse("2026-08-16T20:12:34.567Z")
const messages: readonly SessionMessageInfo[] = [
  { id: "msg_user", type: "user", text: "Load the Applicator", time: { created } },
  {
    id: "msg_initial",
    type: "assistant",
    agent: "build",
    model: { providerID: "openai", id: "gpt-initial" },
    content: [{ type: "text", text: "Initial response" }],
    time: { created: created + 1, completed: created + 2 },
  },
  {
    id: "msg_final",
    type: "assistant",
    agent: "build",
    model: { providerID: "anthropic", id: "claude-final", variant: "high" },
    content: [{ type: "text", text: "Final response" }],
    time: { created: created + 3, completed: created + 4 },
  },
]

test("records the prompt with first and final assistant model identities", () => {
  expect(buildPromptJournalRecords("ses_test", messages, created - 1, true)).toEqual([
    {
      sessionID: "ses_test",
      promptID: "msg_user",
      created,
      prompt: "Load the Applicator",
      initial: { text: "Initial response", providerID: "openai", modelID: "gpt-initial", variant: undefined },
      final: { text: "Final response", providerID: "anthropic", modelID: "claude-final", variant: "high" },
    },
  ])
})

test("shares the following response across a delivered prompt batch", () => {
  const batched: readonly SessionMessageInfo[] = [
    { id: "msg_first", type: "user", text: "First steer", time: { created } },
    { id: "msg_second", type: "user", text: "Second steer", time: { created: created + 1 } },
    messages[1]!,
    messages[2]!,
  ]
  const records = buildPromptJournalRecords("ses_batch", batched, created - 1, true)
  expect(records.map((record) => record.promptID)).toEqual(["msg_first", "msg_second"])
  expect(records.map((record) => record.initial?.modelID)).toEqual(["gpt-initial", "gpt-initial"])
  expect(records.map((record) => record.final?.modelID)).toEqual(["claude-final", "claude-final"])
})

test("partitions overlapping prompts at project timeline boundaries", () => {
  const boundary = created + 1
  const overlapping: readonly SessionMessageInfo[] = [
    { id: "msg_project_a", type: "user", text: "Inspect project A", time: { created } },
    { id: "msg_project_b", type: "user", text: "Load project B", time: { created: boundary } },
    messages[1]!,
    messages[2]!,
  ]
  const projectA = buildPromptJournalRecords("ses_switch", overlapping, created, true, boundary)
  const projectB = buildPromptJournalRecords("ses_switch", overlapping, boundary, true)
  expect(projectA.map((record) => record.promptID)).toEqual(["msg_project_a"])
  expect(projectB.map((record) => record.promptID)).toEqual(["msg_project_b"])
})

test("retains admission ownership when a queued prompt receives a later delivery time", () => {
  const boundary = created + 10
  const delayed: readonly SessionMessageInfo[] = [
    { id: "msg_project_b", type: "user", text: "Load project B", time: { created: boundary + 1 } },
    { id: "msg_queued_a", type: "user", text: "Queued for project A", time: { created: boundary + 20 } },
    messages[1]!,
  ]
  const admissions: Readonly<Record<string, PromptJournalAdmission>> = {
    msg_queued_a: { projectID: 1, created: created + 1 },
  }
  const projectA = buildPromptJournalRecords("ses_queue", delayed, created, true, boundary, 1, admissions)
  const projectB = buildPromptJournalRecords("ses_queue", delayed, boundary, true, undefined, 2, admissions)
  expect(projectA.map((record) => ({ id: record.promptID, created: record.created }))).toEqual([
    { id: "msg_queued_a", created: created + 1 },
  ])
  expect(projectB.map((record) => record.promptID)).toEqual(["msg_project_b"])
})

test("materializes one idempotent daily Markdown journal and preserves manual content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "engiware-prompt-journal-test-"))
  try {
    const source = path.join(root, "Applicator.L5X")
    await writeFile(source, "fixture")
    const records = buildPromptJournalRecords("ses_test", messages, created - 1, true)
    await materializePromptJournals(source, records)
    const file = promptJournalPath(source, "2026-08-16")
    await writeFile(file, `${await readFile(file, "utf8")}\nManual project note.\n`)
    await materializePromptJournals(source, records)
    const journal = await readFile(file, "utf8")
    expect(journal).toContain("# Prompt Journal - 2026-08-16")
    expect(journal).toContain("`openai/gpt-initial`")
    expect(journal).toContain("`anthropic/claude-final` (high)")
    expect(journal).toContain("    Initial response")
    expect(journal).toContain("    Final response")
    expect(journal).toContain("Manual project note.")
    expect(journal.match(/engiware-prompt:ses_test:msg_user:start/g)).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects a symlinked Logs directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "engiware-prompt-journal-symlink-test-"))
  const outside = await mkdtemp(path.join(tmpdir(), "engiware-prompt-journal-outside-"))
  try {
    const source = path.join(root, "Applicator.L5X")
    await writeFile(source, "fixture")
    await symlink(outside, path.join(root, "Logs"))
    const records = buildPromptJournalRecords("ses_test", messages, created - 1, true)
    await expect(materializePromptJournals(source, records)).rejects.toThrow("not a directory")
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test("preserves a journal with an unterminated managed block", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "engiware-prompt-journal-marker-test-"))
  try {
    const source = path.join(root, "Applicator.L5X")
    await writeFile(source, "fixture")
    const records = buildPromptJournalRecords("ses_test", messages, created - 1, true)
    await materializePromptJournals(source, records)
    const file = promptJournalPath(source, "2026-08-16")
    const damaged = (await readFile(file, "utf8")).replace("<!-- engiware-prompt:ses_test:msg_user:end -->", "")
    await writeFile(file, `${damaged}\nManual project note.\n`)

    await expect(materializePromptJournals(source, records)).rejects.toThrow("unterminated managed block")
    expect(await readFile(file, "utf8")).toBe(`${damaged}\nManual project note.\n`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
