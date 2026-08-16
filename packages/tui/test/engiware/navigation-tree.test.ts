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
})
