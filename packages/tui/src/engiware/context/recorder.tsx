import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "../../context/helper"
import type { EngiwareContextSection, EngiwareObjectReference } from "../domain/client"

export type EngiwareRecordedContext = {
  readonly id: string
  readonly moduleID: string
  readonly label: string
  readonly reference: EngiwareObjectReference
  readonly sections: readonly EngiwareContextSection[]
  comment?: string
}

const MAX_CONTEXT_ENTRIES = 100
const MAX_ATTACHMENT_CHARS = 512 * 1024

const recorder = createSimpleContext({
  name: "EngiwareContextRecorder",
  init: () => {
    const [state, setState] = createStore<{ entries: EngiwareRecordedContext[] }>({ entries: [] })
    return {
      state,
      record(input: Omit<EngiwareRecordedContext, "id">) {
        const existing = state.entries.findIndex(
          (entry) =>
            entry.reference.snapshotId === input.reference.snapshotId &&
            entry.reference.objectId === input.reference.objectId,
        )
        const value: EngiwareRecordedContext = { ...input, id: contextID(input.reference) }
        if (existing >= 0) {
          setState("entries", existing, value)
          return
        }
        if (state.entries.length >= MAX_CONTEXT_ENTRIES) return
        setState("entries", state.entries.length, value)
      },
      comment(id: string, value: string) {
        const comment = value.trim()
        setState(
          "entries",
          (entry) => entry.id === id,
          produce((entry) => {
            entry.comment = comment || undefined
          }),
        )
      },
      remove(id: string) {
        setState("entries", state.entries.filter((entry) => entry.id !== id))
      },
      clear() {
        setState("entries", [])
      },
      toMarkdown() {
        const lines = ["# Engiware Context", "", "References captured from immutable application snapshots.", ""]
        for (const entry of state.entries) {
          lines.push(`## ${entry.label}`, "")
          lines.push(`- Module: \`${entry.moduleID}\``)
          lines.push(`- Snapshot: \`${entry.reference.snapshotId}\``)
          lines.push(`- Object: \`${entry.reference.objectId}\``)
          if (entry.comment) lines.push(`- Comment: ${entry.comment}`)
          for (const section of entry.sections) {
            lines.push("", `### ${section.title}`, "")
            for (const item of section.entries) lines.push(`- **${item.label}:** ${item.value}`)
          }
          lines.push("")
        }
        const result = lines.join("\n")
        return result.length <= MAX_ATTACHMENT_CHARS ? result : result.slice(0, MAX_ATTACHMENT_CHARS)
      },
    }
  },
})

export const EngiwareContextRecorderProvider = recorder.provider
export const useEngiwareContextRecorder = recorder.use

function contextID(reference: EngiwareObjectReference) {
  return `context:${reference.snapshotId}:${reference.objectId}`
}
