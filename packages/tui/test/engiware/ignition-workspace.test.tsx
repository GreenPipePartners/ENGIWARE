/** @jsxImportSource @opentui/solid */
import type { EngiwareDomainClient, EngiwareIgnitionDomainClient } from "../../src/engiware/domain/client"
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ConfigProvider } from "../../src/config"
import { Keymap } from "../../src/context/keymap"
import { ThemeProvider } from "../../src/context/theme"
import { EngiwareApplicationProvider, useEngiwareApplication } from "../../src/engiware/application/provider"
import { useIgnitionWorkspaceModule } from "../../src/engiware/applications/ignition/workspace-module"
import { EngiwareWorkspaceContainer } from "../../src/engiware/shell/workspace"
import { emptyThemeSource } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFakeEngiwareClient, createFakeIgnitionClient, ignitionProjection } from "./fixture"

function OpenIgnition() {
  const controller = useEngiwareApplication()
  onMount(() => void controller.actions.openIgnition())
  return null
}

function IgnitionWorkspace(props: { commands?: string[] }) {
  const module = useIgnitionWorkspaceModule()
  return (
    <EngiwareWorkspaceContainer
      id="ignition-module-workspace"
      module={module}
      showSidePanes={true}
      contextVisible={true}
      onHeaderCommand={(command) => props.commands?.push(command)}
    />
  )
}

function Harness(props: {
  client: EngiwareIgnitionDomainClient
  plcClient?: EngiwareDomainClient
  commands?: string[]
}) {
  return (
    <ConfigProvider config={createTuiResolvedConfig()}>
      <Keymap.Provider>
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <EngiwareApplicationProvider client={props.plcClient} ignitionClient={props.client}>
            <OpenIgnition />
            <IgnitionWorkspace commands={props.commands} />
          </EngiwareApplicationProvider>
        </ThemeProvider>
      </Keymap.Provider>
    </ConfigProvider>
  )
}

test("opens Ignition without a PLC client and renders its structure", async () => {
  const fake = createFakeIgnitionClient()
  const commands: string[] = []
  const app = await testRender(() => <Harness client={fake.client} commands={commands} />, {
    width: 120,
    height: 16,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("+------Main"))

  expect(fake.calls.order).toEqual(["hello", "open"])
  expect(app.renderer.root.findDescendantById("engiware-ignition-display")?.focusable).toBe(false)
  expect(app.renderer.root.findDescendantById("engiware-structure-label")).toBeDefined()
  const source = app.renderer.root.findDescendantById("engiware-source-label")
  expect(source).toBeDefined()
  await app.mockMouse.click(source!.screenX + 1, source!.screenY)
  expect(commands).toEqual([])
  expect(fake.calls.modes).toEqual(["source"])
  app.renderer.destroy()
  await Bun.sleep(0)
  expect(fake.calls.close).toBe(1)
})

test("maps a view component click to source returned by the Ignition domain", async () => {
  const plc = createFakeEngiwareClient()
  const fake = createFakeIgnitionClient({
    selectAt: async () =>
      ignitionProjection("script", {
        mode: "source",
        rows: [
          {
            id: "source:1",
            segments: [
              { text: "1 | ", style: "line-number" },
              { text: "system.perspective.openPopup('detail')", style: "code" },
            ],
          },
        ],
        hits: [],
      }),
  })
  const app = await testRender(() => <Harness client={fake.client} plcClient={plc.client} />, {
    width: 120,
    height: 16,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("+------Main"))

  const segment = app.renderer.root.findDescendantById("engiware-ignition-segment-0-0")
  expect(segment).toBeDefined()
  await app.mockMouse.click(segment!.screenX, segment!.screenY)
  await app.waitForFrame((frame) => frame.includes("system.perspective.openPopup"))

  expect(fake.calls.points).toEqual([{ row: 0, cell: 0 }])
  expect(plc.calls.points).toEqual([])
  app.renderer.destroy()
})

test("activates a selectable view while expanding its component hierarchy", async () => {
  const fake = createFakeIgnitionClient()
  const app = await testRender(() => <Harness client={fake.client} />, {
    width: 120,
    height: 16,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Main"))

  const view = app.renderer.root.findDescendantById("engiware-navigation-row-ignition:view:main")
  expect(view).toBeDefined()
  await app.mockMouse.click(view!.screenX, view!.screenY)
  await app.waitForFrame((frame) => frame.includes("resource:view:main"))

  expect(fake.calls.resources).toEqual(["view:main"])
  expect(app.renderer.root.findDescendantById("engiware-navigation-row-ignition:components")).toBeDefined()
  app.renderer.destroy()
})
