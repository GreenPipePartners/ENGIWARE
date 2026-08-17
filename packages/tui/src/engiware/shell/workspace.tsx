import { createComponent, For, Show, type ParentProps } from "solid-js"
import { useTheme } from "../../context/theme"
import type {
  EngiwareWorkspaceModule,
  EngiwareWorkstationHeaderAction,
  EngiwareWorkstationTab,
} from "../application/module"

export function ProjectTreeContainer(props: ParentProps) {
  const theme = useTheme()
  return (
    <box
      id="engiware-project-tree-container"
      width="20%"
      minWidth={18}
      border
      borderStyle="rounded"
      borderColor={theme.border.default}
      title=" Project Tree "
      titleColor={theme.text.subdued}
    >
      {props.children}
    </box>
  )
}

export function EngineeringWorkstationContainer(
  props: ParentProps<{
    readonly actions?: () => readonly EngiwareWorkstationHeaderAction[]
    readonly tabs?: () => readonly EngiwareWorkstationTab[]
    readonly onCommand: (command: string) => void
  }>,
) {
  const theme = useTheme()
  return (
    <box
      id="engiware-workstation-container"
      flexGrow={1}
      minWidth={0}
      border
      borderStyle="rounded"
      borderColor={theme.border.default}
    >
      <box
        id="engiware-workstation-header"
        height={1}
        flexShrink={0}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={theme.text.default} wrapMode="none">
          Engineering Workstation
        </text>
        <box flexGrow={1} minWidth={1} />
        <For each={props.tabs?.() ?? []}>
          {(tab, index) => (
            <box
              id={`engiware-${tab.id}-label`}
              paddingLeft={index() === 0 ? 1 : 2}
              onMouseUp={(event) => {
                if (event.button !== 0) return
                void tab.activate()
              }}
            >
              <text fg={tab.active() ? theme.text.default : theme.text.subdued} wrapMode="none">
                {tab.label}
              </text>
            </box>
          )}
        </For>
        <For each={props.actions?.() ?? []}>
          {(action, index) => (
            <box
              id={`engiware-${action.id}-label`}
              paddingLeft={index() === 0 ? 1 : 2}
              onMouseUp={() => props.onCommand(action.command)}
            >
              <text fg={action.active?.() ? theme.text.default : theme.text.subdued} wrapMode="none">
                {action.label}
              </text>
            </box>
          )}
        </For>
      </box>
      {props.children}
    </box>
  )
}

export function ContextContainer(
  props: ParentProps<{
    readonly onCommand: (command: string) => void
    readonly onAttach?: () => void
  }>,
) {
  const theme = useTheme()
  return (
    <box
      id="engiware-context-container"
      width="20%"
      minWidth={18}
      border
      borderStyle="rounded"
      borderColor={theme.border.default}
    >
      <box height={1} flexShrink={0} flexDirection="row" paddingLeft={1} paddingRight={1}>
        <box id="engiware-context-label" onMouseUp={() => props.onCommand("context")}>
          <text fg={theme.text.subdued} wrapMode="none">
            Context
          </text>
        </box>
        <box flexGrow={1} minWidth={1} />
        <Show when={props.onAttach}>
          <box id="engiware-context-attach" onMouseUp={() => props.onAttach?.()}>
            <text fg={theme.text.subdued} wrapMode="none">
              Attach
            </text>
          </box>
        </Show>
      </box>
      {props.children}
    </box>
  )
}

export function EngiwareWorkspaceContainer(props: {
  readonly id: string
  readonly module: EngiwareWorkspaceModule
  readonly showSidePanes: boolean
  readonly contextVisible: boolean
  readonly workspacePercent?: number
  readonly onHeaderCommand: (command: string) => void
  readonly onAttachContext?: () => void
}) {
  return (
    <box
      id={props.id}
      flexDirection="row"
      flexGrow={props.workspacePercent ?? 75}
      flexBasis={0}
      minHeight={0}
      gap={1}
      padding={1}
    >
      <Show when={props.showSidePanes}>
        <ProjectTreeContainer>
          {createComponent(props.module.ProjectTree, {
            onActivate: props.module.workstation.openTarget,
            onRecordContext: props.module.recordTarget,
          })}
        </ProjectTreeContainer>
      </Show>
      <EngineeringWorkstationContainer
        actions={props.module.workstation.headerActions}
        tabs={props.module.workstation.tabs}
        onCommand={props.onHeaderCommand}
      >
        {createComponent(props.module.workstation.Component, {})}
      </EngineeringWorkstationContainer>
      <Show when={props.showSidePanes && props.contextVisible}>
        <ContextContainer onCommand={props.onHeaderCommand} onAttach={props.onAttachContext}>
          {createComponent(props.module.Context, {})}
        </ContextContainer>
      </Show>
    </box>
  )
}
