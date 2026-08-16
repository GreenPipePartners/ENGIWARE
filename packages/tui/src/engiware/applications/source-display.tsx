import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { EngiwareSourceProjection } from "../domain/client"

export function SourceDisplay(props: { readonly id: string; readonly projection: EngiwareSourceProjection }) {
  const theme = useTheme()
  return (
    <scrollbox
      id={props.id}
      focusable={false}
      flexGrow={1}
      minHeight={0}
      paddingLeft={1}
      paddingRight={1}
      scrollX
      verticalScrollbarOptions={{ visible: false }}
      horizontalScrollbarOptions={{ visible: false }}
    >
      <For each={props.projection.text.split("\n")}>
        {(line, index) => (
          <text id={`${props.id}-line-${index()}`} fg={theme.text.default} wrapMode="none" flexShrink={0}>
            {line || " "}
          </text>
        )}
      </For>
    </scrollbox>
  )
}
