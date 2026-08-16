export type NavigationTreeNode = {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly children?: readonly NavigationTreeNode[]
}

export type NavigationTreeRow = {
  readonly node: NavigationTreeNode
  readonly depth: number
  readonly parentID?: string
}

export function findNavigationTreeNode(nodes: readonly NavigationTreeNode[], id: string): NavigationTreeNode | undefined {
  return nodes.reduce<NavigationTreeNode | undefined>(
    (result, node) => result ?? (node.id === id ? node : findNavigationTreeNode(node.children ?? [], id)),
    undefined,
  )
}

export function flattenNavigationTree(
  nodes: readonly NavigationTreeNode[],
  expanded: ReadonlySet<string>,
): NavigationTreeRow[] {
  const rows: NavigationTreeRow[] = []
  const visit = (node: NavigationTreeNode, depth: number, parentID?: string) => {
    rows.push({ node, depth, parentID })
    if (!expanded.has(node.id)) return
    node.children?.forEach((child) => visit(child, depth + 1, node.id))
  }
  nodes.forEach((node) => visit(node, 0))
  return rows
}

export function moveNavigationTreeSelection(
  rows: readonly NavigationTreeRow[],
  selectedID: string | undefined,
  offset: number,
) {
  if (rows.length === 0) return undefined
  const index = selectedID === undefined ? -1 : rows.findIndex((row) => row.node.id === selectedID)
  if (index === -1) return rows[0]!.node.id
  return rows[Math.max(0, Math.min(rows.length - 1, index + offset))]!.node.id
}

export function firstNavigationTreeChild(rows: readonly NavigationTreeRow[], selectedID: string | undefined) {
  const index = selectedID === undefined ? -1 : rows.findIndex((row) => row.node.id === selectedID)
  const row = index === -1 ? undefined : rows[index]
  const child = row ? rows[index + 1] : undefined
  return child && child.depth > row!.depth ? child.node.id : selectedID
}

export function navigationTreeParent(rows: readonly NavigationTreeRow[], selectedID: string | undefined) {
  const row = rows.find((item) => item.node.id === selectedID)
  return row?.parentID ?? selectedID
}

export function toggleNavigationTreeNode(expanded: ReadonlySet<string>, node: NavigationTreeNode) {
  if (!node.children?.length) return expanded
  const next = new Set(expanded)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  return next
}
