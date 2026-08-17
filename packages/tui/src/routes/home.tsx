import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, onMount, Show, untrack } from "solid-js"
import { Logo } from "../component/logo"
import { EngiwareLogo } from "../component/engiware-logo"
import { useArgs } from "../context/args"
import { useRouteData } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { useEditorContext } from "../context/editor"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { FormPrompt } from "./session/form"
import { Slot } from "../plugin/render"
import { useTerminalDimensions } from "@opentui/solid"
import { EngiwareShell } from "../engiware/shell/engiware-shell"
import { useEngiwareApplication } from "../engiware/application/provider"
import { EngiwareCommands } from "../engiware/application/commands"

let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const data = useData()
  const location = useLocation()
  const dimensions = useTerminalDimensions()
  const engiware = useEngiwareApplication()
  // Global MCP elicitations can arrive without a session route, so keep them reachable from Home.
  const currentLocation = () => route.location ?? data.location.default()
  const forms = createMemo(() => data.session.form.list("global", currentLocation()) ?? [])
  let sent = false

  // Track only the route location and (when absent) the default location; location.set
  // reads other signals internally and tracking them would re-assert the route location
  // after the user overrides it with /cd.
  createEffect(() => {
    const target = currentLocation()
    untrack(() => location.set(target))
  })

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ text: args.prompt, files: [], agents: [], pasted: [] })
    once = true
  }

  // Wait for the model store to be ready before auto-submitting --prompt.
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!local.model.ready) return
    if (!args.prompt) return
    if (r.current.text !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <EngiwareCommands baseDirectory={location.ref?.directory ?? currentLocation().directory} />
      <box
        flexGrow={1}
        minHeight={0}
        paddingLeft={dimensions().width < 44 ? 1 : 2}
        paddingRight={dimensions().width < 44 ? 1 : 2}
      >
        <Show
          when={
            engiware.model.view === "plc" || engiware.model.view === "ignition" || engiware.model.view === "engibook"
          }
        >
          <EngiwareShell sessionID="home" composerDisabled={forms().length > 0} availableWidth={dimensions().width} />
        </Show>
        <Show
          when={
            engiware.model.view !== "plc" && engiware.model.view !== "ignition" && engiware.model.view !== "engibook"
          }
        >
          <box flexGrow={1} minHeight={0} />
          <box height={4} minHeight={0} flexShrink={1} />
          <box alignSelf="center" flexShrink={0}>
            <EngiwareLogo />
          </box>
          <box height={1} minHeight={0} flexShrink={1} />
          <box alignSelf="center" flexShrink={0}>
            <Logo />
          </box>
        </Show>
        <box width="100%" maxWidth={75} alignSelf="center" zIndex={1000} paddingTop={1} flexShrink={0}>
          <Prompt
            ref={bind}
            placeholders={placeholder}
            disabled={forms().length > 0}
            onSubmitStart={(input, mode, sessionID) =>
              mode === "normal" && engiware.actions.observePrompt(input, sessionID)
            }
          />
        </box>
        <Show
          when={
            engiware.model.view !== "plc" && engiware.model.view !== "ignition" && engiware.model.view !== "engibook"
          }
        >
          <box flexGrow={1} minHeight={0} />
        </Show>
      </box>
      <box width="100%" flexShrink={0}>
        <Slot path="home.footer" />
      </box>
      <Show when={forms()[0]?.id} keyed>
        {(_) => {
          const form = forms()[0]
          return form ? (
            <box position="absolute" zIndex={2000} left={0} right={0} bottom={1} paddingLeft={2} paddingRight={2}>
              <box width="100%">
                <FormPrompt form={form} />
              </box>
            </box>
          ) : null
        }}
      </Show>
    </>
  )
}
