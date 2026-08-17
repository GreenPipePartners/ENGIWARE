import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadEngiwareConfig } from "../../src/engiware/config"

test("loads global, project, and explicit Engiware config in precedence order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "engiware-config-test-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  const previousExplicit = process.env.ENGIWARE_CONFIG
  try {
    const project = path.join(root, "project")
    const global = path.join(root, "config", "engiware")
    const explicit = path.join(root, "explicit.json")
    await mkdir(path.join(project, ".engiware"), { recursive: true })
    await mkdir(global, { recursive: true })
    await writeFile(
      path.join(global, "config.json"),
      JSON.stringify({ keybinds: { dividerUp: "alt+up" }, layout: { workspacePercent: 70 } }),
    )
    await writeFile(
      path.join(project, ".engiware", "config.json"),
      JSON.stringify({ keybinds: { dividerDown: "alt+down" }, layout: { dividerStep: 4 } }),
    )
    await writeFile(explicit, JSON.stringify({ keybinds: { dividerUp: "ctrl+k" } }))
    process.env.XDG_CONFIG_HOME = path.join(root, "config")
    process.env.ENGIWARE_CONFIG = explicit

    expect(await loadEngiwareConfig(project)).toEqual({
      keybinds: { dividerUp: "ctrl+k", dividerDown: "alt+down" },
      layout: { workspacePercent: 70, dividerStep: 4 },
    })
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    if (previousExplicit === undefined) delete process.env.ENGIWARE_CONFIG
    else process.env.ENGIWARE_CONFIG = previousExplicit
    await rm(root, { recursive: true, force: true })
  }
})

test("keeps divider bindings distinct when the up binding uses the down default", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "engiware-config-collision-test-"))
  const previousXdg = process.env.XDG_CONFIG_HOME
  const previousExplicit = process.env.ENGIWARE_CONFIG
  try {
    const project = path.join(root, "project")
    await mkdir(path.join(project, ".engiware"), { recursive: true })
    await writeFile(
      path.join(project, ".engiware", "config.json"),
      JSON.stringify({ keybinds: { dividerUp: "ctrl+down" } }),
    )
    process.env.XDG_CONFIG_HOME = path.join(root, "missing")
    delete process.env.ENGIWARE_CONFIG

    expect(loadEngiwareConfig(project).keybinds).toEqual({ dividerUp: "ctrl+down", dividerDown: "ctrl+up" })
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdg
    if (previousExplicit === undefined) delete process.env.ENGIWARE_CONFIG
    else process.env.ENGIWARE_CONFIG = previousExplicit
    await rm(root, { recursive: true, force: true })
  }
})
