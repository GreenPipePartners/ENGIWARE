export type EngiwareDomainOperation =
  | "host.hello"
  | "plc.open"
  | "plc.importL5x"
  | "plc.openRoutine"
  | "plc.setMode"
  | "plc.moveSelection"
  | "plc.selectAt"
  | "plc.close"
  | "ignition.open"
  | "ignition.importProject"
  | "ignition.openResource"
  | "ignition.setMode"
  | "ignition.selectAt"
  | "ignition.close"
  | "engibook.open"
  | "engibook.load"
  | "engibook.openTarget"
  | "engibook.openTab"
  | "engibook.close"

export type EngiwareHostHello = {
  readonly protocolVersion: 1
  readonly operations?: readonly EngiwareDomainOperation[]
}

export type EngiwareStatusTone = "neutral" | "info" | "success" | "warning" | "error"

export type EngiwareStatusItem = {
  readonly label: string
  readonly value: string
  readonly tone?: EngiwareStatusTone
}

export type EngiwareStatus = {
  readonly items: readonly EngiwareStatusItem[]
}

export type EngiwareCatalogTarget = {
  readonly id: string
}

export type EngiwareObjectReference = {
  readonly snapshotId: string
  readonly objectId: string
}

export type EngiwareModuleIdentity = {
  readonly moduleId: string
  readonly moduleVersion: string
}

export type EngiwareReviewTab = {
  readonly id: string
  readonly label: string
  readonly comparisonRole?: "original" | "modified"
}

export type EngiwareCatalogKind =
  | "controller"
  | "group"
  | "program"
  | "aoi"
  | "routine"
  | "project"
  | "category"
  | "folder"
  | "view"
  | "component"
  | "script"
  | "named-query"
  | "configuration"
  | "vision-window"
  | "opaque"
  | "gateway"
  | "tag-script"
  | "tag"
  | "data-type"
  | "task"
  | "hardware"
  | "sheet"
  | "device"
  | "terminal"
  | "net"
  | "panel"
  | "side"
  | "surface"
  | "space"
  | (string & {})

export type EngiwareCatalogNode = {
  readonly id: string
  readonly label: string
  readonly kind: EngiwareCatalogKind
  readonly target?: EngiwareCatalogTarget
  readonly objectRef?: EngiwareObjectReference
  readonly status?: EngiwareStatus
  readonly children?: readonly EngiwareCatalogNode[]
}

export type EngiwareProjectionMode = "summary" | "detail" | "structure" | "source"
export type EngiwarePlcProjectionMode = Extract<EngiwareProjectionMode, "summary" | "detail">
export type EngiwareIgnitionProjectionMode = Extract<EngiwareProjectionMode, "structure" | "source">

export type EngiwareProjectionSegment = {
  readonly text: string
  readonly style?: string
  readonly componentID?: string
  readonly objectRef?: EngiwareObjectReference
}

export type EngiwareProjectionRow = {
  readonly id: string
  readonly segments: readonly EngiwareProjectionSegment[]
}

export type EngiwareProjectionHit = {
  readonly row: number
  readonly startCell: number
  readonly endCell: number
  readonly componentID: string
}

export type EngiwareProjectionPoint = {
  readonly row: number
  readonly cell: number
}

export type EngiwareContextEntry = {
  readonly label: string
  readonly value: string
}

export type EngiwareContextSection = {
  readonly title: string
  readonly entries: readonly EngiwareContextEntry[]
}

export type EngiwareProjectionBase = {
  readonly target: {
    readonly navigationId: string
  }
  readonly objectRefs?: readonly EngiwareObjectReference[]
  readonly selectionRef?: EngiwareObjectReference
  readonly context: readonly EngiwareContextSection[]
  readonly status: EngiwareStatus
}

export type EngiwareTerminalProjection = EngiwareProjectionBase & {
  readonly coordinateSystem: "terminal-cell-v1"
  readonly mode: EngiwareProjectionMode
  readonly rows: readonly EngiwareProjectionRow[]
  readonly hits: readonly EngiwareProjectionHit[]
  readonly selectedComponentID?: string
}

export type EngiwareSourceProjection = EngiwareProjectionBase & {
  readonly coordinateSystem: "source-v1"
  readonly mode: "source"
  readonly displayName: string
  readonly mediaType: string
  readonly languageId?: string
  readonly text: string
}

export type EngiwareSceneStyle = {
  readonly fill?: string
  readonly stroke?: string
  readonly textTone?: "default" | "subdued" | "info" | "success" | "warning" | "error"
  readonly opacity?: number
}

export type EngiwareSceneNode = {
  readonly nodeId: string
  readonly parentNodeId?: string | null
  readonly primitive: "group" | "rectangle" | "ellipse" | "text"
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
  readonly text?: string
  readonly objectRef?: EngiwareObjectReference
  readonly style?: EngiwareSceneStyle
}

export type EngiwareSceneConnector = {
  readonly connectorId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly label?: string
  readonly arrow: "none" | "end" | "both"
  readonly relationshipId?: string
  readonly style?: EngiwareSceneStyle
}

export type EngiwareSceneProjection = EngiwareProjectionBase & {
  readonly coordinateSystem: "scene-v1"
  readonly mode: "scene"
  readonly viewport: {
    readonly width: number
    readonly height: number
  }
  readonly nodes: readonly EngiwareSceneNode[]
  readonly connectors: readonly EngiwareSceneConnector[]
  readonly selectedObjectIDs?: readonly string[]
}

export type EngiwareProjection = EngiwareTerminalProjection | EngiwareSourceProjection | EngiwareSceneProjection

export type EngiwareEngibookOpenResult = {
  readonly catalog: readonly EngiwareCatalogNode[]
  readonly tabs: readonly EngiwareReviewTab[]
  readonly activeTabId: string
  readonly module: EngiwareModuleIdentity
  readonly activeTarget?: EngiwareCatalogTarget
  readonly projection?: EngiwareProjection
  readonly status: EngiwareStatus
}

export type EngiwarePlcProjection = EngiwareTerminalProjection & {
  readonly mode: EngiwarePlcProjectionMode
}

export type EngiwareIgnitionProjection = EngiwareTerminalProjection & {
  readonly mode: EngiwareIgnitionProjectionMode
}

export type EngiwarePlcOpenResult = {
  readonly catalog: readonly EngiwareCatalogNode[]
  readonly activeTarget?: EngiwareCatalogTarget
  readonly projection?: EngiwarePlcProjection
  readonly status: EngiwareStatus
}

export type EngiwareIgnitionOpenResult = {
  readonly catalog: readonly EngiwareCatalogNode[]
  readonly activeTarget?: EngiwareCatalogTarget
  readonly projection?: EngiwareIgnitionProjection
  readonly status: EngiwareStatus
}

export type EngiwareSelectionDirection = "up" | "down" | "left" | "right"

export interface EngiwareDomainClient {
  readonly host: {
    hello(): Promise<EngiwareHostHello>
  }
  readonly plc: {
    open(): Promise<EngiwarePlcOpenResult>
    importL5x(source: string): Promise<EngiwarePlcOpenResult>
    openRoutine(target: EngiwareCatalogTarget): Promise<EngiwarePlcProjection>
    setMode(mode: EngiwarePlcProjectionMode): Promise<EngiwarePlcProjection>
    moveSelection(direction: EngiwareSelectionDirection): Promise<EngiwarePlcProjection>
    selectAt(point: EngiwareProjectionPoint): Promise<EngiwarePlcProjection>
    close(): Promise<void>
  }
}

export interface EngiwareIgnitionDomainClient {
  readonly host: {
    hello(): Promise<EngiwareHostHello>
  }
  readonly ignition: {
    open(): Promise<EngiwareIgnitionOpenResult>
    importProject(source: string): Promise<EngiwareIgnitionOpenResult>
    openResource(target: EngiwareCatalogTarget): Promise<EngiwareIgnitionProjection>
    setMode(mode: EngiwareIgnitionProjectionMode): Promise<EngiwareIgnitionProjection>
    selectAt(point: EngiwareProjectionPoint): Promise<EngiwareIgnitionProjection>
    close(): Promise<void>
  }
}

export interface EngiwareEngibookDomainClient {
  readonly host: {
    hello(): Promise<EngiwareHostHello>
  }
  readonly engibook: {
    open(): Promise<EngiwareEngibookOpenResult>
    load(path: string): Promise<EngiwareEngibookOpenResult>
    openTarget(target: EngiwareCatalogTarget): Promise<EngiwareProjection>
    openTab(tabId: string): Promise<EngiwareProjection>
    close(): Promise<void>
  }
}
