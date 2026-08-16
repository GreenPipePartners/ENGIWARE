import type { EngiwareWorkspaceModule } from "../../application/module"
import { useEngiwareApplication } from "../../application/provider"
import { ContextPane } from "../../context/context-pane"
import { useRecordEngiwareTarget } from "../../context/record-target"
import { NavigationPane } from "../../navigation/navigation-pane"
import { EngibookDisplay } from "./engibook-display"

export function useEngibookWorkspaceModule(): EngiwareWorkspaceModule {
  const controller = useEngiwareApplication()
  const recordTarget = useRecordEngiwareTarget(() => controller.model.activeModuleID ?? "engibook")
  return {
    id: "engibook",
    ProjectTree: (props) => <NavigationPane onActivate={props.onActivate} onRecordContext={props.onRecordContext} />,
    workstation: {
      Component: EngibookDisplay,
      openTarget: controller.actions.openEngibookTarget,
      tabs: () =>
        controller.model.reviewTabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          active: () => controller.model.activeReviewTabID === tab.id,
          activate: () => controller.actions.openEngibookTab(tab.id),
          comparisonRole: tab.comparisonRole,
        })),
    },
    recordTarget,
    Context: ContextPane,
  }
}
