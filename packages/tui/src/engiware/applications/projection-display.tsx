import type { RGBA, ScrollBoxRenderable } from "@opentui/core"
import { createEffect, For, Match, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { stringWidth } from "../../util/string-width"
import { useEngiwareApplication } from "../application/provider"
import type { EngiwareProjectionPoint, EngiwareProjectionSegment, EngiwareTerminalProjection } from "../domain/client"

export function ProjectionDisplay(props: {
  application: "plc" | "ignition" | "engibook"
  onSelect: (point: EngiwareProjectionPoint) => Promise<void>
}) {
  const controller = useEngiwareApplication()
  const theme = useTheme()
  let scroll: ScrollBoxRenderable | undefined
  const projection = () => {
    const display = controller.model.display
    return display.kind === "ready" && display.data.coordinateSystem === "terminal-cell-v1" ? display.data : undefined
  }

  const revealSelection = () => {
    const current = projection()
    if (!current) return
    const selected = selectedRegion(current)
    if (selected === undefined) return
    scrollProjectionRegion(scroll, selected)
  }

  createEffect(() => {
    const current = projection()
    if (current && scroll) {
      scroll.content.width = projectionWidth(current)
    }
    revealSelection()
    requestAnimationFrame(() => {
      revealSelection()
      requestAnimationFrame(revealSelection)
    })
  })

  return (
    <box id={`engiware-${props.application}-display`} flexGrow={1} minHeight={0}>
      <Switch>
        <Match when={projection()}>
          {(current) => (
            <>
              <box flexDirection="row" paddingLeft={1} paddingRight={1} flexShrink={0}>
                <text fg={theme.text.subdued} wrapMode="none">
                  {projectionStatus(current(), controller.model.projectionPending, controller.model.projectionError)}
                </text>
              </box>
              <scrollbox
                id={`engiware-${props.application}-scroll`}
                focusable={false}
                ref={(element: ScrollBoxRenderable) => {
                  scroll = element
                  element.content.maxWidth = undefined
                  element.content.width = projectionWidth(current())
                }}
                onSizeChange={revealSelection}
                flexGrow={1}
                minHeight={0}
                scrollX
                verticalScrollbarOptions={{ visible: false }}
                horizontalScrollbarOptions={{ visible: false }}
              >
                <For each={current().rows}>
                  {(row, rowIndex) => (
                    <box
                      id={`engiware-${props.application}-row-${rowIndex()}`}
                      flexDirection="row"
                      width={row.segments.reduce((width, segment) => width + stringWidth(segment.text), 0)}
                      minWidth="100%"
                      flexShrink={0}
                    >
                      <For each={segmentsWithCells(row.segments)}>
                        {(item, segmentIndex) => {
                          const selected = () =>
                            item.segment.style === "selected" ||
                            (item.segment.componentID !== undefined &&
                              item.segment.componentID === current().selectedComponentID)
                          const colors = () => segmentColors(item.segment, selected(), theme)
                          return (
                            <text
                              id={`engiware-${props.application}-segment-${rowIndex()}-${segmentIndex()}`}
                              fg={colors().fg}
                              bg={colors().bg}
                              wrapMode="none"
                              flexShrink={0}
                              onMouseUp={(event) => {
                                if (event.button !== 0) return
                                void props.onSelect({ row: rowIndex(), cell: item.startCell })
                              }}
                            >
                              {item.segment.text}
                            </text>
                          )
                        }}
                      </For>
                    </box>
                  )}
                </For>
              </scrollbox>
            </>
          )}
        </Match>
        <Match when={!projection()}>
          <box flexGrow={1} alignItems="center" justifyContent="center" padding={1}>
            <text fg={theme.text.subdued} wrapMode="word">
              {controller.model.display.kind === "ready"
                ? "The active projection requires a module-specific renderer"
                : paneMessage(controller.model.display)}
            </text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}

function paneMessage(state: ReturnType<typeof useEngiwareApplication>["model"]["display"]) {
  return state.kind === "ready" ? "" : state.message
}

function segmentsWithCells(segments: readonly EngiwareProjectionSegment[]) {
  return segments.reduce(
    (result, segment) => ({
      cell: result.cell + stringWidth(segment.text),
      items: [...result.items, { segment, startCell: result.cell }],
    }),
    { cell: 0, items: [] as { readonly segment: EngiwareProjectionSegment; readonly startCell: number }[] },
  ).items
}

function projectionWidth(projection: EngiwareTerminalProjection) {
  return Math.max(
    1,
    ...projection.rows.map((row) => row.segments.reduce((width, segment) => width + stringWidth(segment.text), 0)),
  )
}

function segmentColors(
  segment: EngiwareProjectionSegment,
  selected: boolean,
  theme: ReturnType<typeof useTheme>,
): { readonly fg: RGBA; readonly bg?: RGBA } {
  if (selected) return { fg: theme.text.action.primary.focused, bg: theme.background.action.primary.focused }
  if (segment.style === "wire") return { fg: theme.text.subdued }
  if (segment.style === "line-number") return { fg: theme.diff.lineNumber.text }
  if (segment.style === "comment") return { fg: theme.syntax.comment }
  if (segment.style === "keyword") return { fg: theme.syntax.keyword }
  if (segment.style === "function") return { fg: theme.syntax.function }
  if (segment.style === "variable") return { fg: theme.syntax.variable }
  if (segment.style === "string") return { fg: theme.syntax.string }
  if (segment.style === "number") return { fg: theme.syntax.number }
  if (segment.style === "type") return { fg: theme.syntax.type }
  if (segment.style === "operator") return { fg: theme.syntax.operator }
  if (segment.style === "punctuation") return { fg: theme.syntax.punctuation }
  if (segment.style === "builtin") return { fg: theme.text.feedback.error.default }
  if (segment.style === "energized") return { fg: theme.text.feedback.success.default }
  return { fg: theme.text.default }
}

function selectedRegion(projection: EngiwareTerminalProjection) {
  if (!projection.selectedComponentID) return undefined
  const hit = projection.hits.find((item) => item.componentID === projection.selectedComponentID)
  if (hit) return hit
  return projection.rows
    .map((row, rowIndex) => {
      const segment = segmentsWithCells(row.segments).find(
        (item) => item.segment.componentID === projection.selectedComponentID,
      )
      if (!segment) return undefined
      return {
        row: rowIndex,
        startCell: segment.startCell,
        endCell: segment.startCell + stringWidth(segment.segment.text),
      }
    })
    .find((region) => region !== undefined)
}

function scrollProjectionRegion(
  scroll: ScrollBoxRenderable | undefined,
  region: { readonly row: number; readonly startCell: number; readonly endCell: number },
) {
  if (!scroll || region.row < 0) return
  const y =
    region.row < scroll.scrollTop
      ? region.row
      : region.row >= scroll.scrollTop + scroll.viewport.height
        ? region.row - scroll.viewport.height + 1
        : scroll.scrollTop
  const x =
    region.startCell < scroll.scrollLeft
      ? region.startCell
      : region.endCell > scroll.scrollLeft + scroll.viewport.width
        ? region.endCell - scroll.viewport.width
        : scroll.scrollLeft
  if (x !== scroll.scrollLeft || y !== scroll.scrollTop) scroll.scrollTo({ x, y })
}

function projectionStatus(projection: EngiwareTerminalProjection, pending: boolean, error: string | undefined) {
  const status = projection.status.items.map((item) => `${item.label}: ${item.value}`).join(" | ")
  const base = status ? `${projection.mode} | ${status}` : projection.mode
  if (pending) return `${base} | updating`
  if (error) return `${base} | ${error}`
  return base
}
