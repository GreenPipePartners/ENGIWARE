import type { EngiwareWorkspaceModule } from "../../application/module"
import { useEngiwareApplication } from "../../application/provider"
import { ContextPane } from "../../context/context-pane"
import { useRecordEngiwareTarget } from "../../context/record-target"
import { NavigationPane } from "../../navigation/navigation-pane"
import { PlcDisplay } from "./plc-display"

export function usePlcWorkspaceModule(): EngiwareWorkspaceModule {
  const controller = useEngiwareApplication()
  const recordTarget = useRecordEngiwareTarget("plc")
  return {
    id: "plc",
    ProjectTree: (props) => (
      <NavigationPane onActivate={props.onActivate} onRecordContext={props.onRecordContext} />
    ),
    workstation: {
      Component: PlcDisplay,
      openTarget: controller.actions.openRoutine,
      tabs: () => [
        {
          id: "summary",
          label: "Summary",
          active: () => controller.model.display.kind === "ready" && controller.model.display.data.mode === "summary",
          activate: () => controller.actions.setMode("summary"),
        },
        {
          id: "detail",
          label: "Detail",
          active: () => controller.model.display.kind === "ready" && controller.model.display.data.mode === "detail",
          activate: () => controller.actions.setMode("detail"),
        },
      ],
    },
    recordTarget,
    Context: ContextPane,
  }
}
