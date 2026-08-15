/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { EngiwareLogo } from "../../../src/component/engiware-logo"
import { ThemeProvider } from "../../../src/context/theme"
import { ConfigProvider } from "../../../src/config"
import { emptyThemeSource } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

function Harness() {
  return (
    <ConfigProvider config={createTuiResolvedConfig()}>
      <ThemeProvider mode="dark" source={emptyThemeSource}>
        <EngiwareLogo />
      </ThemeProvider>
    </ConfigProvider>
  )
}

test("renders the Engiware logo on the initial screen at normal terminal sizes", async () => {
  const app = await testRender(
    () => <Harness />,
    { width: 80, height: 24 },
  )
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("█▀▀▀ █▄  █ ▄▀▀▀ ▀█▀"))

  expect(app.captureCharFrame()).toContain("█▀▀▀ █▄  █ ▄▀▀▀ ▀█▀")
  expect(app.captureCharFrame()).toContain("█   █ ▄▀▀▄ █▀▀▄ █▀▀▀")
  expect(app.captureCharFrame()).toContain("Adapted from the amazing")
  app.renderer.destroy()
})

test("omits the Engiware logo when the terminal is too short", async () => {
  const app = await testRender(
    () => <Harness />,
    { width: 80, height: 23 },
  )
  app.renderer.start()
  await app.waitForVisualIdle()

  expect(app.captureCharFrame()).not.toContain("█▀▀▀ █▄  █ ▄▀▀▀ ▀█▀")
  expect(app.captureCharFrame()).not.toContain("Adapted from the amazing")
  app.renderer.destroy()
})
