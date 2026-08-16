import { expect, test } from "bun:test"
import path from "node:path"
import { selfCommand } from "./process"

test("preserves Bun's runtime directory for managed child processes", () => {
  const runtime = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase()
  if (runtime !== "bun") return

  const command = selfCommand()
  expect(command.slice(1, 3)).toEqual(["--cwd", process.cwd()])
  expect(path.isAbsolute(command[3] ?? "")).toBe(true)
})
