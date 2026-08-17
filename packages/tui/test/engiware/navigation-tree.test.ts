import { describe, expect, test } from "bun:test"
import {
  firstNavigationTreeChild,
  findNavigationTreeNode,
  flattenNavigationTree,
  moveNavigationTreeSelection,
  navigationTreeParent,
  toggleNavigationTreeNode,
  type NavigationTreeNode,
} from "../../src/engiware/navigation/tree"
import { appendPromptJournals, promptJournalDate } from "../../src/engiware/journal/project-tree"
import type { EngiwareCatalogNode } from "../../src/engiware/domain/client"

const tree: readonly NavigationTreeNode[] = [
  {
    id: "controller",
    label: "Controller",
    children: [
      {
        id: "programs",
        label: "Programs",
        children: [{ id: "routine", label: "MainRoutine" }],
      },
      { id: "aois", label: "AOIs" },
    ],
  },
]

describe("Engiware navigation tree", () => {
  test("flattens only expanded descendants with stable parent identities", () => {
    expect(flattenNavigationTree(tree, new Set()).map((row) => [row.node.id, row.depth, row.parentID])).toEqual([
      ["controller", 0, undefined],
    ])
    expect(
      flattenNavigationTree(tree, new Set(["controller", "programs"])).map((row) => [
        row.node.id,
        row.depth,
        row.parentID,
      ]),
    ).toEqual([
      ["controller", 0, undefined],
      ["programs", 1, "controller"],
      ["routine", 2, "programs"],
      ["aois", 1, "controller"],
    ])
  })

  test("finds a stable node without exposing traversal to consumers", () => {
    expect(findNavigationTreeNode(tree, "routine")?.label).toBe("MainRoutine")
    expect(findNavigationTreeNode(tree, "missing")).toBeUndefined()
  })

  test("moves through visible rows and clamps at the boundaries", () => {
    const rows = flattenNavigationTree(tree, new Set(["controller", "programs"]))
    expect(moveNavigationTreeSelection(rows, undefined, 1)).toBe("controller")
    expect(moveNavigationTreeSelection(rows, "controller", 1)).toBe("programs")
    expect(moveNavigationTreeSelection(rows, "aois", 1)).toBe("aois")
    expect(moveNavigationTreeSelection(rows, "controller", -1)).toBe("controller")
  })

  test("moves between visible parent and child rows", () => {
    const rows = flattenNavigationTree(tree, new Set(["controller", "programs"]))
    expect(firstNavigationTreeChild(rows, "programs")).toBe("routine")
    expect(firstNavigationTreeChild(rows, "routine")).toBe("routine")
    expect(navigationTreeParent(rows, "routine")).toBe("programs")
    expect(navigationTreeParent(rows, "controller")).toBe("controller")
  })

  test("toggles branches without changing leaf expansion state", () => {
    const controller = tree[0]!
    const routine = controller.children![0]!.children![0]!
    const expanded = new Set([controller.id])
    expect(toggleNavigationTreeNode(expanded, controller).has(controller.id)).toBe(false)
    expect(toggleNavigationTreeNode(expanded, routine)).toBe(expanded)
  })

  test("appends dated prompt journals at the bottom of each project tree", () => {
    const catalog: readonly EngiwareCatalogNode[] = [
      {
        id: "controller",
        label: "Applicator",
        kind: "controller",
        children: [{ id: "programs", label: "Programs", kind: "group" }],
      },
    ]
    const augmented = appendPromptJournals(catalog, ["2026-08-17", "2026-08-16"])
    expect(augmented[0]?.children?.map((node) => node.label)).toEqual(["Programs", "Logs"])
    const dates = augmented[0]?.children?.at(-1)?.children?.[0]?.children
    expect(dates?.map((node) => node.label)).toEqual(["2026-08-17", "2026-08-16"])
    expect(promptJournalDate(dates?.[0]?.target?.id ?? "")).toBe("2026-08-17")
    expect(catalog[0]?.children?.map((node) => node.label)).toEqual(["Programs"])
  })

  test("adds one journal tree to module-specific roots without duplicating nested projects", () => {
    const catalog: readonly EngiwareCatalogNode[] = [
      {
        id: "panel",
        label: "Panel",
        kind: "panel",
        children: [{ id: "nested", label: "Nested Project", kind: "project" }],
      },
    ]
    const augmented = appendPromptJournals(catalog, ["2026-08-16"])
    expect(augmented[0]?.children?.map((node) => node.label)).toEqual(["Nested Project", "Logs"])
    expect(augmented[0]?.children?.[0]?.children).toBeUndefined()
  })
})
