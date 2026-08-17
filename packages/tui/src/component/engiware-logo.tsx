import type { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { tint } from "../theme/color"
import { engiwareLogo, engiwareLogoRegion, type EngiwareLogoRegion } from "../engiware/logo"

export function EngiwareLogo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const colors = (): Record<EngiwareLogoRegion, RGBA> => ({
    blue: theme.text.subdued,
    white: theme.text.default,
    shadow: tint(theme.background.default, theme.text.subdued, 0.25),
    circuit: theme.hue.green[500],
  })

  return (
    <Show when={dimensions().width >= 44 && dimensions().height >= 24}>
      <box alignItems="center">
        <For each={engiwareLogo}>
          {(line, row) => (
            <box flexDirection="row">
              <For each={Array.from(line)}>
                {(character, column) => <text fg={colors()[engiwareLogoRegion(row(), column())]}>{character}</text>}
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
