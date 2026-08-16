import { Match, Switch } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { usePromptRef } from "../../context/prompt"
import { useTheme } from "../../context/theme"
import { useEngiwareApplication } from "../application/provider"
import { useEngiwareContextRecorder } from "../context/recorder"
import { useIgnitionWorkspaceModule } from "../applications/ignition/workspace-module"
import { useMenuWorkspaceModule, type EngiwareRecentProject } from "../applications/menu/workspace-module"
import { usePlcWorkspaceModule } from "../applications/plc/workspace-module"
import { useEngibookWorkspaceModule } from "../applications/engibook/workspace-module"
import { workspaceSidePanesFit } from "./layout"
import { EngiwareWorkspaceContainer } from "./workspace"

export type { EngiwareRecentProject } from "../applications/menu/workspace-module"

export function EngiwareShell(props: {
  sessionID: string
  recentProjects?: readonly EngiwareRecentProject[]
  onOpenProject?: (directory: string) => void
  composerDisabled?: boolean
  availableWidth?: number
  onPrepareComposer?: () => void
}) {
  const controller = useEngiwareApplication()
  const contextRecorder = useEngiwareContextRecorder()
  const prompt = usePromptRef()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const availableWidth = () => props.availableWidth ?? dimensions().width
  const showSidePanes = () => workspaceSidePanesFit(availableWidth())
  const inject = (command: string) => {
    if (props.composerDisabled) return
    props.onPrepareComposer?.()
    const apply = () => {
      if (!prompt.current) return
      prompt.current.set({ ...prompt.current.current, text: `/${command}` })
      prompt.current?.focus()
    }
    if (prompt.current) {
      apply()
      return
    }
    requestAnimationFrame(apply)
  }
  const injectHeader = (command: string) => {
    if (props.composerDisabled) return
    const apply = () => {
      if (!prompt.current) return
      prompt.current.set({ ...prompt.current.current, text: `/${command}` })
    }
    if (prompt.current) {
      apply()
      return
    }
    props.onPrepareComposer?.()
    requestAnimationFrame(apply)
  }
  const attachContext = () => {
    if (props.composerDisabled || contextRecorder.state.entries.length === 0) return
    props.onPrepareComposer?.()
    const apply = () => {
      if (!prompt.current) return
      const markdown = contextRecorder.toMarkdown()
      const attachment = {
        uri: `data:text/plain;charset=utf-8,${encodeURIComponent(markdown)}`,
        name: "engiware-context.md",
        description: `${contextRecorder.state.entries.length} recorded Engiware context reference(s)`,
      }
      prompt.current.set({
        ...prompt.current.current,
        files: [...(prompt.current.current.files ?? []), attachment],
      })
      prompt.current.focus()
    }
    if (prompt.current) {
      apply()
      return
    }
    requestAnimationFrame(apply)
  }
  const menu = useMenuWorkspaceModule({
    recentProjects: props.recentProjects,
    onOpenProject: props.onOpenProject,
    onCommand: inject,
  })
  const plc = usePlcWorkspaceModule()
  const ignition = useIgnitionWorkspaceModule()
  const engibook = useEngibookWorkspaceModule()
  const workspace = (module: typeof menu) => (
    <EngiwareWorkspaceContainer
      id={`engiware-shell-${props.sessionID}`}
      module={module}
      showSidePanes={showSidePanes()}
      contextVisible={controller.model.contextVisible}
      onHeaderCommand={injectHeader}
      onAttachContext={attachContext}
    />
  )

  return (
    <Switch>
      <Match when={controller.model.view === "opencode"}>
        <box
          id={`engiware-shell-${props.sessionID}`}
          height={3}
          flexShrink={0}
          border
          borderStyle="rounded"
          borderColor={theme.border.default}
          paddingLeft={1}
          paddingRight={1}
          onMouseUp={() => inject("engineering")}
        >
          <text fg={theme.text.subdued} wrapMode="none">
            Engineering workspace collapsed | /engineering to restore
          </text>
        </box>
      </Match>
      <Match when={controller.model.view === "menu"}>{workspace(menu)}</Match>
      <Match when={controller.model.view === "plc"}>{workspace(plc)}</Match>
      <Match when={controller.model.view === "ignition"}>{workspace(ignition)}</Match>
      <Match when={controller.model.view === "engibook"}>{workspace(engibook)}</Match>
    </Switch>
  )
}
