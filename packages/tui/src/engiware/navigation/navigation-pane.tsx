import { createMemo, Match, Switch } from "solid-js"
import type { EngiwareTargetActivation } from "../application/module"
import { useEngiwareApplication } from "../application/provider"
import type { EngiwareCatalogNode } from "../domain/client"
import { flattenNavigationTree, type NavigationTreeRow } from "./tree"
import { NavigationTreeView } from "./tree-view"

export function NavigationPane(props: {
  readonly onActivate: EngiwareTargetActivation
  readonly onRecordContext?: EngiwareTargetActivation
}) {
  const controller = useEngiwareApplication()
  const nodes = () => (controller.model.navigation.kind === "ready" ? controller.model.navigation.data : ([] as const))
  const rows = createMemo(() => flattenNavigationTree(nodes(), controller.model.expandedNavigationIDs))
  const activate = (row: NavigationTreeRow) => {
    const node = findCatalogNode(nodes(), row.node.id)
    if (!node) return
    if (node.children?.length) {
      controller.actions.setNavigationExpanded(node.id, !controller.model.expandedNavigationIDs.has(node.id))
      if (node.target) void props.onActivate(node.id, node.target)
      return
    }
    if (node.target) void props.onActivate(node.id, node.target)
  }
  const record = (row: NavigationTreeRow) => {
    const node = findCatalogNode(nodes(), row.node.id)
    if (node?.target) void props.onRecordContext?.(node.id, node.target)
  }

  return (
    <box id="engiware-navigation-tree" flexGrow={1} minHeight={0}>
      <Switch>
        <Match when={controller.model.navigation.kind === "ready"}>
          <NavigationTreeView
            rows={rows()}
            expanded={controller.model.expandedNavigationIDs}
            selectedID={controller.model.selectedNavigationID}
            activeID={controller.model.activeNavigationID}
            focused={true}
            onSelect={(row) => controller.actions.selectNavigation(row.node.id)}
            onActivate={activate}
            onRecordContext={props.onRecordContext ? record : undefined}
          />
        </Match>
        <Match when={controller.model.navigation.kind !== "ready"}>
          <box flexGrow={1} alignItems="center" justifyContent="center" padding={1}>
            <text wrapMode="word">{paneMessage(controller.model.navigation)}</text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}

function paneMessage(state: ReturnType<typeof useEngiwareApplication>["model"]["navigation"]) {
  return state.kind === "ready" ? "" : state.message
}

function findCatalogNode(nodes: readonly EngiwareCatalogNode[], id: string): EngiwareCatalogNode | undefined {
  return nodes.reduce<EngiwareCatalogNode | undefined>(
    (result, node) => result ?? (node.id === id ? node : findCatalogNode(node.children ?? [], id)),
    undefined,
  )
}
