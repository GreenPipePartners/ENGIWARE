/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfigProvider } from "../../src/config"
import { EngiwareApplicationProvider } from "../../src/engiware/application/provider"
import type { EngiwareDomainClient, EngiwareEngibookDomainClient } from "../../src/engiware/domain/client"
import { EngiwareShell } from "../../src/engiware/shell/engiware-shell"
import { ThemeProvider } from "../../src/context/theme"
import { Keymap } from "../../src/context/keymap"
import { emptyThemeSource } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFakeEngibookClient, createFakeEngiwareClient } from "./fixture"
import { onMount } from "solid-js"
import { PromptRefProvider, usePromptRef } from "../../src/context/prompt"
import type { PromptRef } from "../../src/component/prompt"
import { useEngiwareApplication } from "../../src/engiware/application/provider"
import type { KeymapCommand } from "../../src/context/keymap"
import { EngiwareCommands } from "../../src/engiware/application/commands"

let promptText = ""
let promptFocuses = 0
let commandList: (() => readonly KeymapCommand[]) | undefined

function OpenPlc() {
  const controller = useEngiwareApplication()
  onMount(() => void controller.actions.openPlc())
  return null
}

function OpenEngibook() {
  const controller = useEngiwareApplication()
  onMount(() => void controller.actions.openEngibook())
  return null
}

function PromptProbe() {
  const prompt = usePromptRef()
  onMount(() => {
    const value: PromptRef = {
      focused: true,
      current: { text: "", files: [], agents: [], pasted: [] },
      set(input) {
        promptText = input.text
      },
      focus() {
        promptFocuses++
      },
      blur() {},
      reset() {},
      submit() {},
    }
    prompt.set(value)
  })
  return null
}

function CommandProbe() {
  commandList = Keymap.useCommands()
  return null
}

function Harness(props: {
  client?: EngiwareDomainClient
  engibookClient?: EngiwareEngibookDomainClient
  open?: boolean
  openEngibook?: boolean
  recentProjects?: readonly { id: string; name: string; directory: string }[]
  onOpenProject?: (directory: string) => void
  composerDisabled?: boolean
  availableWidth?: number
  onPrepareComposer?: () => void
}) {
  return (
    <ConfigProvider config={createTuiResolvedConfig()}>
      <Keymap.Provider>
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <EngiwareApplicationProvider client={props.client} engibookClient={props.engibookClient}>
            <PromptRefProvider>
              <PromptProbe />
              {props.open ? <OpenPlc /> : null}
              {props.openEngibook ? <OpenEngibook /> : null}
              <EngiwareCommands baseDirectory="/workspace/plant" />
              <EngiwareShell
                sessionID="session-test"
                recentProjects={props.recentProjects}
                onOpenProject={props.onOpenProject}
                composerDisabled={props.composerDisabled}
                availableWidth={props.availableWidth}
                onPrepareComposer={props.onPrepareComposer}
              />
              <CommandProbe />
            </PromptRefProvider>
          </EngiwareApplicationProvider>
        </ThemeProvider>
      </Keymap.Provider>
    </ConfigProvider>
  )
}

test("starts on the engineering context menu without opening PLC", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} />, { width: 180, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  const frame = app.captureCharFrame()
  expect(frame).toContain("Project Tree")
  expect(frame).toContain("Context")
  expect(frame).toContain("/plc")
  expect(frame).toContain("/schematics")
  expect(app.renderer.root.findDescendantById("engiware-launch-opencode")).toBeDefined()
  expect(fake.calls.order).toEqual([])
  app.renderer.destroy()
})

test("renders live navigation, workstation, and context projections", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} open />, { width: 180, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("VIEW main"))

  const frame = app.captureCharFrame()
  expect(frame).toContain("Project Tree")
  expect(frame).toContain("Engineering Workstation")
  expect(frame).toContain("Context")
  expect(frame).toContain("Recovered Controller")
  expect(frame).toContain("Safety Program")
  expect(frame).toContain("Main Routine")
  expect(frame).toContain("Source / authority")
  expect(frame).toContain("Recovery index")
  expect(frame).toContain("Flux Deep")
  expect(frame).toContain("PLC")
  expect(app.renderer.root.findDescendantById("engiware-navigation-scroll")?.focusable).toBe(false)
  expect(app.renderer.root.findDescendantById("engiware-plc-scroll")?.focusable).toBe(false)
  expect(app.renderer.root.findDescendantById("engiware-context-content")?.focusable).toBe(false)
  expect(fake.calls.order).toEqual(["hello", "open"])
  app.renderer.destroy()
})

test("renders Engibook source and scene tabs through the generic workspace", async () => {
  const fake = createFakeEngibookClient()
  const app = await testRender(() => <Harness engibookClient={fake.client} openEngibook />, {
    width: 180,
    height: 30,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Read-only snapshot review"))

  const sourceFrame = app.captureCharFrame()
  expect(sourceFrame).toContain("Main Panel")
  expect(sourceFrame).toContain("Overview")
  expect(sourceFrame).toContain("Front")
  expect(sourceFrame).toContain("immutable snapshot")

  const front = app.renderer.root.findDescendantById("engiware-tab:front-label")
  expect(front).toBeDefined()
  await app.mockMouse.click(front!.screenX + 1, front!.screenY)
  await app.waitForFrame((frame) => frame.includes("PLC1"))
  expect(fake.calls.tabs).toEqual(["tab:front"])
  expect(app.renderer.root.findDescendantById("engiware-engibook-scene")?.focusable).toBe(false)
  app.renderer.destroy()
})

test("activates module-owned workstation tabs and injects the Context command", async () => {
  promptText = ""
  promptFocuses = 0
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} open />, {
    width: 180,
    height: 30,
    useMouse: true,
  })
  app.renderer.start()
  const frame = await app.waitForFrame((value) => value.includes("VIEW main"))
  expect(frame).toContain("Engineering Workstation")
  expect(frame).toContain("Summary")
  expect(frame).toContain("Detail")

  const summary = app.renderer.root.findDescendantById("engiware-summary-label")
  expect(summary).toBeDefined()
  await app.mockMouse.click(summary!.screenX + 1, summary!.screenY)
  expect(promptText).toBe("")
  expect(fake.calls.modes).toEqual(["summary"])

  const detail = app.renderer.root.findDescendantById("engiware-detail-label")
  expect(detail).toBeDefined()
  await app.mockMouse.click(detail!.screenX + 1, detail!.screenY)
  expect(promptText).toBe("")
  expect(fake.calls.modes).toEqual(["summary", "detail"])

  const context = app.renderer.root.findDescendantById("engiware-context-label")
  expect(context).toBeDefined()
  await app.mockMouse.click(context!.screenX + 1, context!.screenY)
  expect(promptText).toBe("/context")
  expect(promptFocuses).toBe(0)
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeDefined()

  const initialWidth = app.renderer.root.findDescendantById("engiware-workstation-container")?.width ?? 0
  commandList?.()
    .find((command) => command.id === "engiware.context")
    ?.run()
  await app.flush()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeUndefined()
  expect(app.renderer.root.findDescendantById("engiware-workstation-container")?.width).toBeGreaterThan(initialWidth)
  commandList?.()
    .find((command) => command.id === "engiware.context")
    ?.run("show")
  await app.flush()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeDefined()
  commandList?.()
    .find((command) => command.id === "engiware.context")
    ?.run("hide")
  await app.flush()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeUndefined()
  app.renderer.destroy()
})

test("injects and toggles Context from the fallback menu", async () => {
  promptText = ""
  promptFocuses = 0
  const app = await testRender(() => <Harness />, { width: 180, height: 30, useMouse: true })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Select an engineering context"))

  const context = app.renderer.root.findDescendantById("engiware-context-label")
  expect(context).toBeDefined()
  await app.mockMouse.click(context!.screenX + 1, context!.screenY)
  expect(promptText).toBe("/context")
  expect(promptFocuses).toBe(0)

  const initialWidth = app.renderer.root.findDescendantById("engiware-workstation-container")?.width ?? 0
  commandList?.()
    .find((command) => command.id === "engiware.context")
    ?.run("hide")
  await app.flush()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeUndefined()
  expect(app.renderer.root.findDescendantById("engiware-workstation-container")?.width).toBeGreaterThan(initialWidth)
  commandList?.()
    .find((command) => command.id === "engiware.context")
    ?.run("show")
  await app.flush()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeDefined()
  app.renderer.destroy()
})

test("keeps branch and routine mouse selection separate from routine activation", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} open />, {
    width: 180,
    height: 30,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("VIEW main"))

  const program = app.renderer.root.findDescendantById("engiware-navigation-row-program")
  expect(program).toBeDefined()
  await app.mockMouse.click(program!.screenX, program!.screenY)
  await app.flush()
  expect(fake.calls.routines).toEqual([])

  const collapsed = app.renderer.root.findDescendantById("engiware-navigation-row-program")
  expect(collapsed).toBeDefined()
  await app.mockMouse.click(collapsed!.screenX, collapsed!.screenY)
  await app.waitForFrame((frame) => frame.includes("Backup Routine"))
  const backup = app.renderer.root.findDescendantById("engiware-navigation-row-routine:backup")
  expect(backup).toBeDefined()
  await app.mockMouse.click(backup!.screenX, backup!.screenY)
  await app.waitForFrame((frame) => frame.includes("VIEW routine:backup"))
  expect(fake.calls.routines).toEqual(["backup"])
  app.renderer.destroy()
})

test("renders stable unavailable states without a domain client", async () => {
  const app = await testRender(() => <Harness open />, { width: 120, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("PLC domain client unavailable"))

  const frame = app.captureCharFrame()
  expect(frame).toContain("Project Tree")
  expect(frame).toContain("Engineering Workstation")
  expect(frame).toContain("Context")
  expect(frame).not.toContain("Recovered Controller")
  app.renderer.destroy()
})

test("injects menu commands into the composer and refocuses it", async () => {
  promptText = ""
  promptFocuses = 0
  let prepared = 0
  const app = await testRender(() => <Harness onPrepareComposer={() => prepared++} />, {
    width: 180,
    height: 30,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  const card = app.renderer.root.findDescendantById("engiware-launch-plc")
  expect(card).toBeDefined()
  await app.mockMouse.click(card!.screenX + 2, card!.screenY + 1)
  expect(promptText).toBe("/plc")
  expect(promptFocuses).toBe(1)
  expect(prepared).toBe(1)
  app.renderer.destroy()
})

test("does not focus or change a disabled composer", async () => {
  promptText = "existing"
  promptFocuses = 0
  const app = await testRender(() => <Harness composerDisabled />, { width: 180, height: 30, useMouse: true })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  const card = app.renderer.root.findDescendantById("engiware-launch-plc")
  expect(card).toBeDefined()
  await app.mockMouse.click(card!.screenX + 2, card!.screenY + 1)
  expect(promptText).toBe("existing")
  expect(promptFocuses).toBe(0)
  app.renderer.destroy()
})

test("opens a recent project from the launcher", async () => {
  let opened = ""
  const app = await testRender(
    () => (
      <Harness
        recentProjects={[{ id: "recent", name: "Recent Plant", directory: "/projects/recent-plant" }]}
        onOpenProject={(directory) => (opened = directory)}
      />
    ),
    { width: 180, height: 30, useMouse: true },
  )
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Recent Plant"))

  const project = app.renderer.root.findDescendantById("engiware-recent-recent")
  expect(project).toBeDefined()
  await app.mockMouse.click(project!.screenX + 1, project!.screenY)
  expect(opened).toBe("/projects/recent-plant")
  app.renderer.destroy()
})

test("routes PLC slash commands and collapses into OpenCode mode", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} />, { width: 180, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  commandList?.()
    .find((command) => command.id === "engiware.plc")
    ?.run("detail")
  await app.waitForFrame((frame) => frame.includes("VIEW mode:detail"))
  expect(fake.calls.modes).toEqual(["detail"])
  commandList?.()
    .find((command) => command.id === "engiware.plc")
    ?.run("../Imports/Mixed Case.L5X")
  await app.flush()
  expect(fake.calls.imports).toEqual(["/workspace/Imports/Mixed Case.L5X"])
  commandList?.()
    .find((command) => command.id === "engiware.plc")
    ?.run('"./Quoted Path.L5X"')
  await app.flush()
  expect(fake.calls.imports).toEqual(["/workspace/Imports/Mixed Case.L5X", "/workspace/plant/Quoted Path.L5X"])
  commandList?.()
    .find((command) => command.id === "engiware.opencode")
    ?.run()
  await app.waitForFrame((frame) => frame.includes("Engineering workspace collapsed"))
  app.renderer.destroy()
})

test("keeps the workstation and hides side panes below 64 columns", async () => {
  const app = await testRender(() => <Harness open />, { width: 60, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  const frame = app.captureCharFrame()
  expect(frame).not.toContain("Project Tree")
  expect(frame).toContain("Engineering Workstation")
  expect(frame).not.toContain("Context")
  expect(frame).toContain("PLC domain client unavailable")
  app.renderer.destroy()
})

test("uses available session width for responsive panes", async () => {
  const app = await testRender(() => <Harness open availableWidth={44} />, { width: 120, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Workstation"))

  const frame = app.captureCharFrame()
  expect(frame).not.toContain("Project Tree")
  expect(frame).not.toContain("Context")
  expect(frame).toContain("Engineering Workstation")
  app.renderer.destroy()
})
