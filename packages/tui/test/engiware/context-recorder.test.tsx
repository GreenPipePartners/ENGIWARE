/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import {
  EngiwareContextRecorderProvider,
  useEngiwareContextRecorder,
} from "../../src/engiware/context/recorder"

let observed: ReturnType<typeof useEngiwareContextRecorder> | undefined

function Probe() {
  observed = useEngiwareContextRecorder()
  return <text>{observed.state.entries.length}</text>
}

test("deduplicates immutable references and renders a bounded chat attachment", async () => {
  observed = undefined
  const app = await testRender(() => (
    <EngiwareContextRecorderProvider>
      <Probe />
    </EngiwareContextRecorderProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("0"))
  const recorder = observed!
  const reference = { snapshotId: "snapshot:example", objectId: "view:Main" }
  recorder.record({
    moduleID: "ignition",
    label: "Main View",
    reference,
    sections: [{ title: "View", entries: [{ label: "Path", value: "Main" }] }],
  })
  recorder.record({
    moduleID: "ignition",
    label: "Main View",
    reference,
    sections: [{ title: "View", entries: [{ label: "Path", value: "Main" }] }],
  })
  await app.waitForFrame((frame) => frame.includes("1"))
  recorder.comment(recorder.state.entries[0]!.id, "Review this event binding")

  expect(recorder.state.entries).toHaveLength(1)
  expect(recorder.toMarkdown()).toContain("Review this event binding")
  expect(recorder.toMarkdown()).toContain("snapshot:example")
  app.renderer.destroy()
})
