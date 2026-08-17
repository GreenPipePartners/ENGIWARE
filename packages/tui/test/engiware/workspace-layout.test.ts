import { expect, test } from "bun:test"
import {
  MAX_WORKSPACE_PERCENT,
  MIN_WORKSPACE_PERCENT,
  moveWorkspaceDivider,
  workspaceSidePanesFit,
} from "../../src/engiware/shell/layout"

test("shows side panes at the exact workspace width boundary", () => {
  expect(workspaceSidePanesFit(63)).toBe(false)
  expect(workspaceSidePanesFit(64)).toBe(true)
})

test("moves and clamps the workspace divider", () => {
  expect(moveWorkspaceDivider(75, "up", 5)).toBe(70)
  expect(moveWorkspaceDivider(75, "down", 5)).toBe(80)
  expect(moveWorkspaceDivider(MIN_WORKSPACE_PERCENT, "up", 5)).toBe(MIN_WORKSPACE_PERCENT)
  expect(moveWorkspaceDivider(MAX_WORKSPACE_PERCENT, "down", 5)).toBe(MAX_WORKSPACE_PERCENT)
})
