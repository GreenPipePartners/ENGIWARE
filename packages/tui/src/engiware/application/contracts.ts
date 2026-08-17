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

export type PromptJournalProject = {
  readonly id: number
  readonly source?: string
  readonly since: number
  readonly until?: number
}

export type PromptJournalAdmission = {
  readonly projectID: number
  readonly created: number
}

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
  readonly projectSource?: string
  readonly projectApplication?: "plc" | "ignition" | "engibook"
  readonly promptJournalSince?: number
  readonly promptJournalProjects: Readonly<Record<string, readonly PromptJournalProject[] | undefined>>
  readonly promptJournalAdmissions: Readonly<
    Record<string, Readonly<Record<string, PromptJournalAdmission | undefined>> | undefined>
  >
}

export type EngiwareControllerActions = {
  readonly openPlc: (sessionID?: string) => Promise<void>
  readonly importPlc: (source: string, sessionID?: string) => Promise<void>
  readonly openIgnition: (sessionID?: string) => Promise<void>
  readonly importIgnition: (source: string, sessionID?: string) => Promise<void>
  readonly openEngibook: (sessionID?: string) => Promise<void>
  readonly loadEngibook: (path: string, sessionID?: string) => Promise<void>
  readonly showMenu: () => void
  readonly showOpenCode: () => void
  readonly showUnavailable: (name: string) => void
  readonly setContextVisible: (visible: boolean) => void
  readonly observePromptAdmission: (sessionID: string, promptID: string, created: number) => void
  readonly observePrompt: (input: string, sessionID?: string) => void
  readonly selectNavigation: (id: string) => void
  readonly setNavigationExpanded: (id: string, expanded: boolean) => void
  readonly openRoutine: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openIgnitionResource: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openEngibookTarget: (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>
  readonly openEngibookTab: (tabID: string) => Promise<void>
  readonly openPromptJournal: (navigationID: string, targetID: string) => Promise<void>
  readonly refreshPromptJournals: () => Promise<void>
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
