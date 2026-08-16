import type { EngiwareWorkspaceModule } from "../../application/module"
import { useEngiwareApplication } from "../../application/provider"
import { ContextPane } from "../../context/context-pane"
import { useRecordEngiwareTarget } from "../../context/record-target"
import { NavigationPane } from "../../navigation/navigation-pane"
import { IgnitionDisplay } from "./ignition-display"

export function useIgnitionWorkspaceModule(): EngiwareWorkspaceModule {
  const controller = useEngiwareApplication()
  const recordTarget = useRecordEngiwareTarget("ignition")
  return {
    id: "ignition",
    ProjectTree: (props) => (
      <NavigationPane onActivate={props.onActivate} onRecordContext={props.onRecordContext} />
    ),
    workstation: {
      Component: IgnitionDisplay,
      openTarget: controller.actions.openIgnitionResource,
      tabs: () => [
        {
          id: "structure",
          label: "Structure",
          active: () => controller.model.display.kind === "ready" && controller.model.display.data.mode === "structure",
          activate: () => controller.actions.setIgnitionMode("structure"),
        },
        {
          id: "source",
          label: "Source",
          active: () => controller.model.display.kind === "ready" && controller.model.display.data.mode === "source",
          activate: () => controller.actions.setIgnitionMode("source"),
        },
      ],
    },
    recordTarget,
    Context: ContextPane,
  }
}
