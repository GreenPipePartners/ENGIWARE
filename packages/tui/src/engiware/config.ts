import { lstatSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type EngiwareConfig = {
  readonly keybinds: {
    readonly dividerUp: string
    readonly dividerDown: string
  }
  readonly layout: {
    readonly workspacePercent: number
    readonly dividerStep: number
  }
}

export const defaultEngiwareConfig: EngiwareConfig = {
  keybinds: {
    dividerUp: "ctrl+up",
    dividerDown: "ctrl+down",
  },
  layout: {
    workspacePercent: 75,
    dividerStep: 5,
  },
}

export function loadEngiwareConfig(baseDirectory: string): EngiwareConfig {
  const globalRoot = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config")
  const candidates = [
    path.join(globalRoot, "engiware", "config.json"),
    path.join(baseDirectory, ".engiware", "config.json"),
    process.env.ENGIWARE_CONFIG,
  ].filter((file): file is string => file !== undefined)
  let result = defaultEngiwareConfig
  for (const file of candidates) result = merge(result, read(file))
  return result
}

function read(file: string) {
  try {
    const info = lstatSync(file)
    if (!info.isFile() || info.size > 64 * 1024) return
    return JSON.parse(readFileSync(file, "utf8")) as unknown
  } catch {
    return undefined
  }
}

function merge(current: EngiwareConfig, input: unknown): EngiwareConfig {
  if (typeof input !== "object" || input === null) return current
  const value = input as Record<string, unknown>
  const keybinds = typeof value.keybinds === "object" && value.keybinds !== null ? value.keybinds : {}
  const layout = typeof value.layout === "object" && value.layout !== null ? value.layout : {}
  const dividerUp = binding(keybinds, "dividerUp") ?? current.keybinds.dividerUp
  const configuredDown = binding(keybinds, "dividerDown") ?? current.keybinds.dividerDown
  const dividerDown =
    configuredDown !== dividerUp
      ? configuredDown
      : dividerUp === defaultEngiwareConfig.keybinds.dividerDown
        ? defaultEngiwareConfig.keybinds.dividerUp
        : defaultEngiwareConfig.keybinds.dividerDown
  const workspacePercent = number(layout, "workspacePercent", 30, 80) ?? current.layout.workspacePercent
  const dividerStep = number(layout, "dividerStep", 1, 20) ?? current.layout.dividerStep
  return { keybinds: { dividerUp, dividerDown }, layout: { workspacePercent, dividerStep } }
}

function binding(value: object, key: string) {
  const binding = (value as Record<string, unknown>)[key]
  return typeof binding === "string" && binding.trim() ? binding.trim() : undefined
}

function number(value: object, key: string, minimum: number, maximum: number) {
  const number = (value as Record<string, unknown>)[key]
  return typeof number === "number" && Number.isInteger(number) && number >= minimum && number <= maximum
    ? number
    : undefined
}
