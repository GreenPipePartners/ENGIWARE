/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfigProvider } from "../../src/config"
import { ThemeProvider } from "../../src/context/theme"
import type { EngiwareWorkspaceModule } from "../../src/engiware/application/module"
import { EngiwareWorkspaceContainer } from "../../src/engiware/shell/workspace"
import { emptyThemeSource } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

test("wires project-tree activation to the workstation module", async () => {
  const activations: { readonly navigationID: string; readonly targetID: string }[] = []
  const commands: string[] = []
  const module: EngiwareWorkspaceModule = {
    id: "fixture",
    ProjectTree: (props) => (
      <box id="fixture-tree-target" onMouseUp={() => void props.onActivate("node-1", { id: "target-1" })}>
        <text>Fixture Project Tree</text>
      </box>
    ),
    workstation: {
      Component: () => <text>Fixture Workstation</text>,
      openTarget: async (navigationID, target) => {
        activations.push({ navigationID, targetID: target.id })
      },
      headerActions: () => [{ id: "inspect", label: "Inspect", command: "inspect", active: () => true }],
    },
    Context: () => <text>Fixture Context</text>,
  }
  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig()}>
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <EngiwareWorkspaceContainer
            id="fixture-workspace"
            module={module}
            showSidePanes={true}
            contextVisible={true}
            onHeaderCommand={(command) => commands.push(command)}
          />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 120, height: 20, useMouse: true },
  )
  app.renderer.start()
  const frame = await app.waitForFrame((value) => value.includes("Fixture Workstation"))

  expect(frame).toContain("Project Tree")
  expect(frame).toContain("Engineering Workstation")
  expect(frame).toContain("Context")
  expect(frame).toContain("Fixture Project Tree")
  expect(frame).toContain("Fixture Context")
  const target = app.renderer.root.findDescendantById("fixture-tree-target")
  expect(target).toBeDefined()
  await app.mockMouse.click(target!.screenX + 1, target!.screenY)
  expect(activations).toEqual([{ navigationID: "node-1", targetID: "target-1" }])

  const action = app.renderer.root.findDescendantById("engiware-inspect-label")
  expect(action).toBeDefined()
  await app.mockMouse.click(action!.screenX + 1, action!.screenY)
  const context = app.renderer.root.findDescendantById("engiware-context-label")
  expect(context).toBeDefined()
  await app.mockMouse.click(context!.screenX + 1, context!.screenY)
  expect(commands).toEqual(["inspect", "context"])
  app.renderer.destroy()
})

test("mounts the workstation independently when side panes are unavailable", async () => {
  const module: EngiwareWorkspaceModule = {
    id: "fixture",
    ProjectTree: () => <text>Hidden Tree</text>,
    workstation: {
      Component: () => <text>Standalone Workstation</text>,
      openTarget: () => Promise.resolve(),
    },
    Context: () => <text>Hidden Context</text>,
  }
  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig()}>
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <EngiwareWorkspaceContainer
            id="fixture-workspace"
            module={module}
            showSidePanes={false}
            contextVisible={true}
            onHeaderCommand={() => {}}
          />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 60, height: 12 },
  )
  app.renderer.start()
  const frame = await app.waitForFrame((value) => value.includes("Standalone Workstation"))

  expect(frame).not.toContain("Hidden Tree")
  expect(frame).not.toContain("Hidden Context")
  expect(app.renderer.root.findDescendantById("engiware-project-tree-container")).toBeUndefined()
  expect(app.renderer.root.findDescendantById("engiware-context-container")).toBeUndefined()
  expect(app.renderer.root.findDescendantById("engiware-workstation-container")).toBeDefined()
  app.renderer.destroy()
})
