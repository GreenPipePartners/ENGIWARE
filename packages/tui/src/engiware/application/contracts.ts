import type {
  EngiwareCatalogNode,
  EngiwareCatalogTarget,
  EngiwareContextSection,
  EngiwareEngibookOpenResult,
  EngiwareIgnitionProjectionMode,
  EngiwareProjection,
  EngiwarePlcProjectionMode,
  EngiwareProjectionPoint,
  EngiwareSelectionDirection,
  EngiwareStatus,
} from "../domain/client"

export type PaneState<Data> =
  | { readonly kind: "loading"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly data: Data }

export type EngiwareControllerModel = {
  readonly view: "menu" | "plc" | "ignition" | "engibook" | "opencode"
  readonly notice?: string
  readonly navigation: PaneState<readonly EngiwareCatalogNode[]>
  readonly display: PaneState<EngiwareProjection>
  readonly context: PaneState<readonly EngiwareContextSection[]>
  readonly source: PaneState<EngiwareStatus>
  readonly projectionPending: boolean
  readonly projectionError?: string
  readonly contextVisible: boolean
  readonly selectedNavigationID?: string
  readonly activeNavigationID?: string
  readonly expandedNavigationIDs: ReadonlySet<string>
  readonly reviewTabs: EngiwareEngibookOpenResult["tabs"]
  readonly activeReviewTabID?: string
  readonly activeModuleID?: string
}

export type EngiwareControllerActions = {
  readonly openPlc: () => Promise<void>
  readonly importPlc: (source: string) => Promise<void>
  readonly openIgnition: () => Promise<void>
  readonly importIgnition: (source: string) => Promise<void>
  readonly openEngibook: () => Promise<void>
  readonly loadEngibook: (path: string) => Promise<void>
  readonly showMenu: () => void
  readonly showOpenCode: () => void
  readonly showUnavailable: (name: string) => void
  readonly setContextVisible: (visible: boolean) => void
  readonly observePrompt: (input: string) => void
  readonly selectNavigation: (id: string) => void
  readonly setNavigationExpanded: (id: string, expanded: boolean) => void
  readonly openRoutine: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openIgnitionResource: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openEngibookTarget: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openEngibookTab: (tabID: string) => Promise<void>
  readonly moveSelection: (direction: EngiwareSelectionDirection) => Promise<void>
  readonly setMode: (mode: EngiwarePlcProjectionMode) => Promise<void>
  readonly setIgnitionMode: (mode: EngiwareIgnitionProjectionMode) => Promise<void>
  readonly selectPlcAt: (point: EngiwareProjectionPoint) => Promise<void>
  readonly selectIgnitionAt: (point: EngiwareProjectionPoint) => Promise<void>
}

export type EngiwareController = {
  readonly model: EngiwareControllerModel
  readonly actions: EngiwareControllerActions
}
