import type { EngiwareCatalogNode } from "../domain/client"

const targetPrefix = "engiware:prompt-journal:"

export function appendPromptJournals(
  nodes: readonly EngiwareCatalogNode[],
  dates: readonly string[],
): readonly EngiwareCatalogNode[] {
  return nodes.map((node) => {
    const children = node.children ?? []
    const root = `engiware:${node.id}:logs`
    return {
      ...node,
      children: [
        ...children,
        {
          id: root,
          label: "Logs",
          kind: "folder",
          children: [
            {
              id: `${root}:prompts`,
              label: "Prompts",
              kind: "folder",
              children: dates.map((date) => ({
                id: `${root}:prompts:${date}`,
                label: date,
                kind: "view",
                target: { id: `${targetPrefix}${date}` },
              })),
            },
          ],
        },
      ],
    } satisfies EngiwareCatalogNode
  })
}

export function promptJournalDate(targetID: string) {
  if (!targetID.startsWith(targetPrefix)) return
  const date = targetID.slice(targetPrefix.length)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}
