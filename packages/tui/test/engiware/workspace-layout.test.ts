import { expect, test } from "bun:test"
import { workspaceSidePanesFit } from "../../src/engiware/shell/layout"

test("shows side panes at the exact workspace width boundary", () => {
  expect(workspaceSidePanesFit(63)).toBe(false)
  expect(workspaceSidePanesFit(64)).toBe(true)
})
