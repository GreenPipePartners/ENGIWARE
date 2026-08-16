import { For, Match, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useEngiwareApplication } from "../application/provider"

export function ContextPane() {
  const controller = useEngiwareApplication()
  const theme = useTheme()

  return (
    <scrollbox
      id="engiware-context-content"
      focusable={false}
      flexGrow={1}
      minHeight={0}
      paddingLeft={1}
      paddingRight={1}
      verticalScrollbarOptions={{ visible: false }}
      horizontalScrollbarOptions={{ visible: false }}
    >
      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text fg={theme.text.default}>Source / authority</text>
          <Switch>
            <Match when={controller.model.source.kind === "ready"}>
              <For each={controller.model.source.kind === "ready" ? controller.model.source.data.items : []}>
                {(item) => (
                  <text wrapMode="word">
                    <span style={{ fg: theme.text.subdued }}>{item.label}: </span>
                    <span style={{ fg: theme.text.default }}>{item.value}</span>
                  </text>
                )}
              </For>
            </Match>
            <Match when={controller.model.source.kind !== "ready"}>
              <text fg={theme.text.subdued} wrapMode="word">
                {sourceMessage(controller.model.source)}
              </text>
            </Match>
          </Switch>
        </box>
        <Switch>
          <Match when={controller.model.context.kind === "ready"}>
            <For each={controller.model.context.kind === "ready" ? controller.model.context.data : []}>
              {(section) => (
                <box flexDirection="column">
                  <text fg={theme.text.default}>{section.title}</text>
                  <For each={section.entries}>
                    {(entry) => (
                      <text wrapMode="word">
                        <span style={{ fg: theme.text.subdued }}>{entry.label}: </span>
                        <span style={{ fg: theme.text.default }}>{entry.value}</span>
                      </text>
                    )}
                  </For>
                </box>
              )}
            </For>
          </Match>
          <Match when={controller.model.context.kind !== "ready"}>
            <text fg={theme.text.subdued} wrapMode="word">
              {contextMessage(controller.model.context)}
            </text>
          </Match>
        </Switch>
      </box>
    </scrollbox>
  )
}

function sourceMessage(state: ReturnType<typeof useEngiwareApplication>["model"]["source"]) {
  return state.kind === "ready" ? "" : state.message
}

function contextMessage(state: ReturnType<typeof useEngiwareApplication>["model"]["context"]) {
  return state.kind === "ready" ? "" : state.message
}
