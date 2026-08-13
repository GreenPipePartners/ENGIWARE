/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ConfigProvider } from "../../src/config"
import { EngiwareShell } from "../../src/engiware/shell/engiware-shell"
import { ThemeProvider } from "../../src/context/theme"
import { emptyThemeSource } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

function Harness() {
  return (
    <ConfigProvider config={createTuiResolvedConfig()}>
      <ThemeProvider mode="dark" source={emptyThemeSource}>
        <EngiwareShell sessionID="session-test" />
      </ThemeProvider>
    </ConfigProvider>
  )
}

test("renders navigation, engineering display, and context panes", async () => {
  const app = await testRender(() => <Harness />, { width: 120, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Display"))

  const frame = app.captureCharFrame()
  expect(frame).toContain("Navigation")
  expect(frame).toContain("Engineering Display")
  expect(frame).toContain("Context")
  expect(frame).toContain("Future navigation")
  expect(frame).toContain("Future application view")
  expect(frame).toContain("Future context")
  app.renderer.destroy()
})

test("keeps the engineering display and hides side panes at narrow widths", async () => {
  const app = await testRender(() => <Harness />, { width: 60, height: 30 })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Engineering Display"))

  const frame = app.captureCharFrame()
  expect(frame).not.toContain("Navigation")
  expect(frame).toContain("Engineering Display")
  expect(frame).not.toContain("Context")
  app.renderer.destroy()
})
