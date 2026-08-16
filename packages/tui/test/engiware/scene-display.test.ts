import { expect, test } from "bun:test"
import type { EngiwareSceneProjection } from "../../src/engiware/domain/client"
import { renderSceneToTerminal } from "../../src/engiware/applications/scene-display"

test("renders a bounded scene with selectable object references", () => {
  const projection: EngiwareSceneProjection = {
    coordinateSystem: "scene-v1",
    mode: "scene",
    target: { navigationId: "sheet:main" },
    objectRefs: [
      { snapshotId: "snapshot:example", objectId: "device:a" },
      { snapshotId: "snapshot:example", objectId: "device:b" },
    ],
    context: [],
    status: { items: [] },
    viewport: { width: 100, height: 100 },
    nodes: [
      {
        nodeId: "a",
        primitive: "rectangle",
        x: 5,
        y: 10,
        width: 25,
        height: 20,
        zIndex: 1,
        text: "Device A",
        objectRef: { snapshotId: "snapshot:example", objectId: "device:a" },
      },
      {
        nodeId: "b",
        primitive: "rectangle",
        x: 65,
        y: 60,
        width: 25,
        height: 20,
        zIndex: 1,
        text: "Device B",
        objectRef: { snapshotId: "snapshot:example", objectId: "device:b" },
      },
    ],
    connectors: [{ connectorId: "wire:1", fromNodeId: "a", toNodeId: "b", arrow: "none" }],
  }

  const rows = renderSceneToTerminal(projection, 60, 20)
  const text = rows.map((row) => row.segments.map((segment) => segment.text).join("")).join("\n")
  expect(rows).toHaveLength(20)
  expect(text).toContain("Device A")
  expect(text).toContain("Device B")
  expect(rows.flatMap((row) => row.segments).some((segment) => segment.objectRef?.objectId === "device:a")).toBe(
    true,
  )
})
