import type { ScrollBoxRenderable } from "@opentui/core"
import { createEffect, For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { NavigationTreeRow } from "./tree"

export function NavigationTreeView(props: {
  readonly rows: readonly NavigationTreeRow[]
  readonly expanded: ReadonlySet<string>
  readonly selectedID?: string
  readonly activeID?: string
  readonly focused: boolean
  readonly onSelect: (row: NavigationTreeRow) => void
  readonly onActivate: (row: NavigationTreeRow) => void
  readonly onRecordContext?: (row: NavigationTreeRow) => void
}) {
  const theme = useTheme()
  let scroll: ScrollBoxRenderable | undefined

  createEffect(() => {
    const index = props.rows.findIndex((row) => row.node.id === props.selectedID)
    if (index === -1) return
    const reveal = () => scrollNavigationTreeRow(scroll, index)
    reveal()
    requestAnimationFrame(reveal)
  })

  return (
    <scrollbox
      id="engiware-navigation-scroll"
      ref={(element: ScrollBoxRenderable) => (scroll = element)}
      focusable={false}
      flexGrow={1}
      minHeight={0}
      verticalScrollbarOptions={{ visible: false }}
      horizontalScrollbarOptions={{ visible: false }}
    >
      <For each={props.rows}>
        {(row) => {
          const selected = () => props.focused && props.selectedID === row.node.id
          const active = () => props.activeID === row.node.id
          const expandable = () => Boolean(row.node.children?.length)
          const marker = () => (expandable() ? (props.expanded.has(row.node.id) ? "▾ " : "▸ ") : "  ")
          return (
            <box
              id={`engiware-navigation-row-${row.node.id}`}
              flexDirection="row"
              width="100%"
              minWidth={0}
              paddingLeft={row.depth * 2}
              backgroundColor={selected() ? theme.background.action.primary.focused : undefined}
              onMouseDown={(event) => {
                if (event.button !== 0) return
                props.onSelect(row)
              }}
              onMouseUp={(event) => {
                if (event.button !== 0) return
                const modified = event as typeof event & { ctrl?: boolean; meta?: boolean }
                if ((modified.ctrl || modified.meta) && props.onRecordContext) {
                  props.onRecordContext(row)
                  return
                }
                props.onActivate(row)
              }}
            >
              <text
                fg={selected() ? theme.text.action.primary.focused : theme.text.subdued}
                wrapMode="none"
                flexShrink={0}
              >
                {marker()}
              </text>
              <box flexDirection="row" flexGrow={1} minWidth={0}>
                <text
                  fg={
                    selected()
                      ? theme.text.action.primary.focused
                      : active()
                        ? theme.text.formfield.selected
                        : theme.text.default
                  }
                  wrapMode="none"
                >
                  {row.node.label}
                  {row.node.detail ? ` ${row.node.detail}` : ""}
                </text>
              </box>
            </box>
          )
        }}
      </For>
    </scrollbox>
  )
}

function scrollNavigationTreeRow(scroll: ScrollBoxRenderable | undefined, index: number) {
  if (!scroll) return
  if (index < scroll.scrollTop) {
    scroll.scrollTo(index)
    return
  }
  if (index >= scroll.scrollTop + scroll.viewport.height) scroll.scrollTo(index - scroll.viewport.height + 1)
}
