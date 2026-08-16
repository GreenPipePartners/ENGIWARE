import { For, Show } from "solid-js"
import { useTheme } from "../../../context/theme"
import { ENGIWARE_APPLICATIONS } from "../../application/commands"
import type { EngiwareWorkspaceModule } from "../../application/module"
import { useEngiwareApplication } from "../../application/provider"

export type EngiwareRecentProject = {
  readonly id: string
  readonly name: string
  readonly directory: string
}

export function useMenuWorkspaceModule(props: {
  readonly recentProjects?: readonly EngiwareRecentProject[]
  readonly onOpenProject?: (directory: string) => void
  readonly onCommand: (command: string) => void
}): EngiwareWorkspaceModule {
  const controller = useEngiwareApplication()
  const theme = useTheme()

  const ProjectTree = () => (
    <scrollbox
      id="engiware-recent-scroll"
      focusable={false}
      flexGrow={1}
      minHeight={0}
      paddingLeft={1}
      paddingRight={1}
      verticalScrollbarOptions={{ visible: false }}
    >
      <text fg={theme.text.subdued}>Recent projects</text>
      <Show when={props.recentProjects?.length} fallback={<text fg={theme.text.subdued}>No recent projects</text>}>
        <For each={props.recentProjects}>
          {(project) => (
            <box
              id={`engiware-recent-${project.id}`}
              flexDirection="column"
              minHeight={2}
              marginTop={1}
              onMouseUp={() => props.onOpenProject?.(project.directory)}
            >
              <text fg={theme.text.default} wrapMode="none">
                {project.name}
              </text>
              <text fg={theme.text.subdued} wrapMode="none">
                {project.directory}
              </text>
            </box>
          )}
        </For>
      </Show>
    </scrollbox>
  )

  const Workstation = () => (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1} padding={1}>
      <text fg={theme.text.subdued}>Select an engineering context</text>
      <scrollbox
        id="engiware-launcher-scroll"
        focusable={false}
        flexGrow={1}
        minHeight={0}
        verticalScrollbarOptions={{ visible: false }}
      >
        <box flexDirection="column" width="100%" maxWidth={72} alignSelf="center" gap={1}>
          <For each={ENGIWARE_APPLICATIONS}>
            {(application) => (
              <box
                id={`engiware-launch-${application.command}`}
                height={4}
                flexShrink={0}
                border
                borderStyle="rounded"
                borderColor={theme.border.default}
                paddingLeft={1}
                paddingRight={1}
                onMouseUp={() => props.onCommand(application.command)}
              >
                <text fg={theme.text.default} wrapMode="none">
                  {String(ENGIWARE_APPLICATIONS.indexOf(application) + 1).padStart(2, "0")} /{application.command} |{" "}
                  {application.name}
                </text>
                <text fg={theme.text.subdued} wrapMode="none">
                  {application.detail}
                </text>
              </box>
            )}
          </For>
        </box>
      </scrollbox>
    </box>
  )

  const Context = () => (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.text.default}>No context selected</text>
      <text fg={theme.text.subdued} wrapMode="word">
        Clicking a workstation option places its command in the composer. Press Enter to open it.
      </text>
      <Show when={controller.model.notice}>
        <text fg={theme.text.feedback.warning.default} wrapMode="word">
          {controller.model.notice}
        </text>
      </Show>
    </box>
  )

  return {
    id: "menu",
    ProjectTree,
    workstation: {
      Component: Workstation,
      openTarget: () => Promise.resolve(),
    },
    Context,
  }
}
