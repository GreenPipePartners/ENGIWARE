import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { EngiwareObjectReference, EngiwareSceneNode, EngiwareSceneProjection } from "../domain/client"

type SceneCell = {
  character: string
  objectRef?: EngiwareObjectReference
}

export type SceneTerminalSegment = {
  text: string
  readonly objectRef?: EngiwareObjectReference
}

export type SceneTerminalRow = {
  readonly id: string
  readonly segments: readonly SceneTerminalSegment[]
}

export function SceneDisplay(props: {
  readonly id: string
  readonly projection: EngiwareSceneProjection
  readonly width?: number
  readonly height?: number
  readonly onSelect?: (reference: EngiwareObjectReference) => void | Promise<void>
  readonly onRecordContext?: (reference: EngiwareObjectReference) => void | Promise<void>
}) {
  const theme = useTheme()
  const rows = () => renderSceneToTerminal(props.projection, props.width ?? 96, props.height ?? 28)
  const selected = () => new Set(props.projection.selectedObjectIDs ?? [])
  return (
    <scrollbox
      id={props.id}
      focusable={false}
      flexGrow={1}
      minHeight={0}
      scrollX
      verticalScrollbarOptions={{ visible: false }}
      horizontalScrollbarOptions={{ visible: false }}
    >
      <For each={rows()}>
        {(row, rowIndex) => (
          <box id={`${props.id}-row-${rowIndex()}`} flexDirection="row" flexShrink={0}>
            <For each={row.segments}>
              {(segment, segmentIndex) => {
                const active = () => segment.objectRef !== undefined && selected().has(segment.objectRef.objectId)
                return (
                  <text
                    id={`${props.id}-segment-${rowIndex()}-${segmentIndex()}`}
                    fg={
                      active()
                        ? theme.text.action.primary.focused
                        : segment.objectRef
                          ? theme.text.default
                          : theme.text.subdued
                    }
                    bg={active() ? theme.background.action.primary.focused : undefined}
                    wrapMode="none"
                    flexShrink={0}
                    onMouseUp={(event) => {
                      if (event.button !== 0 || !segment.objectRef) return
                      const modified = event as typeof event & { ctrl?: boolean; meta?: boolean }
                      if (modified.ctrl || modified.meta) {
                        void props.onRecordContext?.(segment.objectRef)
                        return
                      }
                      void props.onSelect?.(segment.objectRef)
                    }}
                  >
                    {segment.text}
                  </text>
                )
              }}
            </For>
          </box>
        )}
      </For>
    </scrollbox>
  )
}

export function renderSceneToTerminal(
  projection: EngiwareSceneProjection,
  requestedWidth: number,
  requestedHeight: number,
): SceneTerminalRow[] {
  const width = Math.max(20, Math.min(240, Math.floor(requestedWidth)))
  const height = Math.max(8, Math.min(80, Math.floor(requestedHeight)))
  const cells: SceneCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ character: " " })),
  )
  const nodes = new Map(projection.nodes.map((node) => [node.nodeId, node]))
  const point = (node: EngiwareSceneNode) => {
    const centerX = node.x + node.width / 2
    const centerY = node.y + node.height / 2
    return {
      x: scale(centerX, projection.viewport.width, width),
      y: scale(centerY, projection.viewport.height, height),
    }
  }
  for (const connector of projection.connectors) {
    const from = nodes.get(connector.fromNodeId)
    const to = nodes.get(connector.toNodeId)
    if (!from || !to) continue
    const start = point(from)
    const end = point(to)
    drawLine(cells, start.x, start.y, end.x, start.y, "-")
    drawLine(cells, end.x, start.y, end.x, end.y, "|")
    setCell(cells, end.x, start.y, "+")
    if (connector.arrow !== "none") setCell(cells, end.x, end.y, connector.arrow === "both" ? "*" : ">")
  }
  for (const node of [...projection.nodes].sort((left, right) => left.zIndex - right.zIndex)) {
    if (node.primitive === "group") continue
    const left = scale(node.x, projection.viewport.width, width)
    const top = scale(node.y, projection.viewport.height, height)
    const right = Math.max(left, scale(node.x + node.width, projection.viewport.width, width) - 1)
    const bottom = Math.max(top, scale(node.y + node.height, projection.viewport.height, height) - 1)
    if (node.primitive === "text") {
      drawText(cells, left, top, node.text ?? "", node.objectRef)
      continue
    }
    drawBox(cells, left, top, right, bottom, node.objectRef, node.primitive === "ellipse")
    if (node.text) drawText(cells, left + 1, top, node.text.slice(0, Math.max(0, right - left - 1)), node.objectRef)
  }
  return cells.map((row, rowIndex) => {
    const segments: SceneTerminalSegment[] = []
    for (const cell of row) {
      const previous = segments.at(-1)
      if (previous && sameReference(previous.objectRef, cell.objectRef)) {
        previous.text += cell.character
      } else {
        segments.push({ text: cell.character, objectRef: cell.objectRef })
      }
    }
    return { id: `scene:${rowIndex}`, segments }
  })
}

function scale(value: number, source: number, target: number) {
  if (!Number.isFinite(value) || !Number.isFinite(source) || source <= 0) return 0
  return Math.max(0, Math.min(target - 1, Math.round((value / source) * (target - 1))))
}

function drawLine(cells: SceneCell[][], x1: number, y1: number, x2: number, y2: number, character: string) {
  const dx = Math.sign(x2 - x1)
  const dy = Math.sign(y2 - y1)
  let x = x1
  let y = y1
  while (true) {
    setCell(cells, x, y, character)
    if (x === x2 && y === y2) return
    x += dx
    y += dy
  }
}

function drawBox(
  cells: SceneCell[][],
  left: number,
  top: number,
  right: number,
  bottom: number,
  objectRef: EngiwareObjectReference | undefined,
  ellipse: boolean,
) {
  const horizontal = ellipse ? "~" : "-"
  for (let x = left; x <= right; x++) {
    setCell(cells, x, top, horizontal, objectRef)
    setCell(cells, x, bottom, horizontal, objectRef)
  }
  for (let y = top; y <= bottom; y++) {
    setCell(cells, left, y, ellipse ? "(" : "|", objectRef)
    setCell(cells, right, y, ellipse ? ")" : "|", objectRef)
  }
  if (!ellipse) {
    setCell(cells, left, top, "+", objectRef)
    setCell(cells, right, top, "+", objectRef)
    setCell(cells, left, bottom, "+", objectRef)
    setCell(cells, right, bottom, "+", objectRef)
  }
}

function drawText(cells: SceneCell[][], x: number, y: number, text: string, objectRef?: EngiwareObjectReference) {
  let column = x
  for (const character of text.replace(/[\r\n\t\p{C}]/gu, " ")) {
    if (column >= (cells[0]?.length ?? 0)) return
    setCell(cells, column, y, character, objectRef)
    column++
  }
}

function setCell(cells: SceneCell[][], x: number, y: number, character: string, objectRef?: EngiwareObjectReference) {
  const cell = cells[y]?.[x]
  if (!cell) return
  cell.character = character
  cell.objectRef = objectRef
}

function sameReference(left: EngiwareObjectReference | undefined, right: EngiwareObjectReference | undefined) {
  return left?.snapshotId === right?.snapshotId && left?.objectId === right?.objectId
}
