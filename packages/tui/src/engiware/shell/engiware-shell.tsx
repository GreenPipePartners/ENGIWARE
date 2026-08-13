import { Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"

export function EngiwareShell(props: { sessionID: string }) {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <box
      id={`engiware-shell-${props.sessionID}`}
      flexDirection="row"
      flexGrow={3}
      flexBasis={0}
      minHeight={0}
      gap={1}
      padding={1}
    >
      <Show when={dimensions().width >= 64}>
        <box
          id="engiware-navigation"
          width="20%"
          minWidth={16}
          border
          borderStyle="rounded"
          borderColor={theme.border.default}
          title=" Navigation "
          titleColor={theme.text.subdued}
          alignItems="center"
          justifyContent="center"
        >
          <text fg={theme.text.subdued}>Future navigation</text>
        </box>
      </Show>
      <box
        id="engiware-display"
        flexGrow={1}
        minWidth={0}
        border
        borderStyle="rounded"
        borderColor={theme.border.default}
        title=" Engineering Display "
        titleColor={theme.text.default}
        alignItems="center"
        justifyContent="center"
      >
        <text fg={theme.text.subdued}>Future application view</text>
      </box>
      <Show when={dimensions().width >= 64}>
        <box
          id="engiware-context"
          width="20%"
          minWidth={16}
          border
          borderStyle="rounded"
          borderColor={theme.border.default}
          title=" Context "
          titleColor={theme.text.subdued}
          alignItems="center"
          justifyContent="center"
        >
          <text fg={theme.text.subdued}>Future context</text>
        </box>
      </Show>
    </box>
  )
}
