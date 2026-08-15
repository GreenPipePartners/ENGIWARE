import type { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { tint } from "../theme/color"

const logo = [
  "╻                               ╻",
  "┃   ╻                       ╻   ┃",
  "┃   ┃  █▀▀▀ █▄  █ ▄▀▀▀ ▀█▀  ┃   ┃",
  "┣━━━┫  █▀▀  █ █ █ █ ▄▄  █   ┣━❮ ┃",
  "┃   ┃  █▄▄▄ █  ▀█ ▀▄▄█ ▄█▄  ┃   ┃",
  "┃   ╹                       ╹   ┃",
  "┃   ┏                       ┓   ┃",
  "┃   ┃  █   █ ▄▀▀▄ █▀▀▄ █▀▀▀ ┃   ┃",
  "┃ ❯━┫  █ ▄ █ █▄▄█ █▄▄▀ █▀▀  ┣━━━┫",
  "┃   ┃  ▀▄▀▄▀ █  █ █  █ █▄▄▄ ┃   ┃",
  "┃   ┗                       ┛   ┃",
  "╹                               ╹",
]

type Region = "blue" | "white" | "shadow" | "circuit"

function region(row: number, column: number): Region {
  if (column === 0 || column === 32) return "shadow"
  if (row === 3 && ((column >= 1 && column <= 3) || (column >= 29 && column <= 30))) return "blue"
  if (row >= 1 && row <= 5 && (column === 4 || column === 28)) return "blue"
  if (row >= 2 && row <= 4 && column >= 7 && column <= 25) return "blue"
  if (row === 8 && ((column >= 2 && column <= 3) || (column >= 29 && column <= 31))) return "white"
  if (row >= 6 && row <= 10 && (column === 4 || column === 28)) return "white"
  if (row >= 7 && row <= 9 && column >= 7 && column <= 26) return "white"
  return "circuit"
}

export function EngiwareLogo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const colors = (): Record<Region, RGBA> => ({
    blue: theme.text.subdued,
    white: theme.text.default,
    shadow: tint(theme.background.default, theme.text.subdued, 0.25),
    circuit: theme.hue.green[500],
  })

  return (
    <Show when={dimensions().width >= 44 && dimensions().height >= 24}>
      <box alignItems="center">
        <For each={logo}>
          {(line, row) => (
            <box flexDirection="row">
              <For each={Array.from(line)}>
                {(character, column) => <text fg={colors()[region(row(), column())]}>{character}</text>}
              </For>
            </box>
          )}
        </For>
        <text>
          <span style={{ fg: theme.text.default }}>Adapted</span>
          <span style={{ fg: theme.text.subdued }}> from the </span>
          <span style={{ fg: theme.text.default }}>amazing</span>
        </text>
      </box>
    </Show>
  )
}
