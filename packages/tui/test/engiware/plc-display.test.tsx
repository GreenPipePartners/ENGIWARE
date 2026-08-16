/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfigProvider } from "../../src/config"
import { EngiwareApplicationProvider, useEngiwareApplication } from "../../src/engiware/application/provider"
import { PlcDisplay } from "../../src/engiware/applications/plc/plc-display"
import type { EngiwareDomainClient } from "../../src/engiware/domain/client"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Keymap } from "../../src/context/keymap"
import { ThemeProvider } from "../../src/context/theme"
import { emptyThemeSource } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFakeEngiwareClient, openResult, projection } from "./fixture"
import { onMount } from "solid-js"

function OpenPlc() {
  const controller = useEngiwareApplication()
  onMount(() => void controller.actions.openPlc())
  return null
}

function Harness(props: { client: EngiwareDomainClient }) {
  return (
    <ConfigProvider config={createTuiResolvedConfig()}>
      <Keymap.Provider>
        <ThemeProvider mode="dark" source={emptyThemeSource}>
          <EngiwareApplicationProvider client={props.client}>
            <OpenPlc />
            <PlcDisplay />
          </EngiwareApplicationProvider>
        </ThemeProvider>
      </Keymap.Provider>
    </ConfigProvider>
  )
}

test("does not capture arrow or typing keys", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} />, { width: 80, height: 16 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("VIEW main"))

  app.mockInput.pressArrow("down")
  app.mockInput.pressKey("s")
  app.mockInput.pressKey("d")
  await app.flush()

  expect(fake.calls.moves).toEqual([])
  expect(fake.calls.modes).toEqual([])
  expect(app.renderer.root.findDescendantById("engiware-plc-display")?.focusable).toBe(false)
  app.renderer.destroy()
})

test("maps a segment mouse hit to its row and starting terminal cell", async () => {
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => <Harness client={fake.client} />, {
    width: 80,
    height: 16,
    useMouse: true,
  })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("VIEW main"))

  const segment = app.renderer.root.findDescendantById("engiware-plc-segment-0-1")
  expect(segment).toBeDefined()
  await app.mockMouse.click(segment!.screenX, segment!.screenY)
  await app.waitForFrame((frame) => frame.includes("VIEW point:0:4"))

  expect(fake.calls.points).toEqual([{ row: 0, cell: 4 }])
  app.renderer.destroy()
})

test("reveals a horizontally distant selected component", async () => {
  const selected = "component:far"
  const fake = createFakeEngiwareClient({
    open: async () =>
      openResult({
        projection: projection("far", {
          rows: [
            {
              id: "far",
              segments: [{ text: " ".repeat(80) }, { text: "SELECTED", style: "selected", componentID: selected }],
            },
          ],
          hits: [{ row: 0, startCell: 80, endCell: 88, componentID: selected }],
          selectedComponentID: selected,
        }),
      }),
  })
  const app = await testRender(() => <Harness client={fake.client} />, { width: 30, height: 8 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("SELECTED"))

  const scroll = app.renderer.root.findDescendantById("engiware-plc-scroll") as ScrollBoxRenderable | undefined
  expect(scroll?.scrollLeft).toBeGreaterThan(0)
  app.renderer.destroy()
})
