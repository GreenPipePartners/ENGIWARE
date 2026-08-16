import { useEngiwareApplication } from "../application/provider"
import type { EngiwareCatalogNode, EngiwareCatalogTarget } from "../domain/client"
import { useEngiwareContextRecorder } from "./recorder"

export function useRecordEngiwareTarget(moduleID: string | (() => string)) {
  const controller = useEngiwareApplication()
  const recorder = useEngiwareContextRecorder()
  return async (navigationID: string, target: EngiwareCatalogTarget) => {
    const nodes = controller.model.navigation.kind === "ready" ? controller.model.navigation.data : []
    const node = findNode(nodes, navigationID) ?? findTarget(nodes, target.id)
    const projection = controller.model.display.kind === "ready" ? controller.model.display.data : undefined
    const reference = node?.objectRef ?? projection?.selectionRef ?? projection?.objectRefs?.[0]
    if (!reference) return
    const sections = controller.model.context.kind === "ready" ? controller.model.context.data : []
    recorder.record({
      moduleID: typeof moduleID === "function" ? moduleID() : moduleID,
      label: node?.label ?? target.id,
      reference,
      sections,
    })
  }
}

function findNode(nodes: readonly EngiwareCatalogNode[], id: string): EngiwareCatalogNode | undefined {
  return nodes.reduce<EngiwareCatalogNode | undefined>(
    (result, node) => result ?? (node.id === id ? node : findNode(node.children ?? [], id)),
    undefined,
  )
}

function findTarget(nodes: readonly EngiwareCatalogNode[], targetID: string): EngiwareCatalogNode | undefined {
  return nodes.reduce<EngiwareCatalogNode | undefined>(
    (result, node) => result ?? (node.target?.id === targetID ? node : findTarget(node.children ?? [], targetID)),
    undefined,
  )
}
