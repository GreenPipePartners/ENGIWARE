import type {
  EngiwareCatalogNode,
  EngiwareDomainClient,
  EngiwareEngibookDomainClient,
  EngiwareEngibookOpenResult,
  EngiwareIgnitionDomainClient,
  EngiwareIgnitionOpenResult,
  EngiwareIgnitionProjection,
  EngiwareIgnitionProjectionMode,
  EngiwarePlcOpenResult,
  EngiwarePlcProjection,
  EngiwareProjectionMode,
  EngiwareSceneProjection,
  EngiwareSourceProjection,
} from "../../src/engiware/domain/client"

export const catalog: readonly EngiwareCatalogNode[] = [
  {
    id: "controller",
    label: "Recovered Controller",
    kind: "controller",
    children: [
      {
        id: "programs",
        label: "Programs",
        kind: "group",
        children: [
          {
            id: "program",
            label: "Safety Program",
            kind: "program",
            children: [
              { id: "routine:main", label: "Main Routine", kind: "routine", target: { id: "main" } },
              { id: "routine:backup", label: "Backup Routine", kind: "routine", target: { id: "backup" } },
            ],
          },
        ],
      },
    ],
  },
]

export function projection(label: string, overrides: Partial<EngiwarePlcProjection> = {}): EngiwarePlcProjection {
  return {
    coordinateSystem: "terminal-cell-v1",
    mode: "summary",
    target: { navigationId: "routine:main" },
    rows: [
      {
        id: label,
        segments: [
          { text: "----", style: "wire" },
          { text: `VIEW ${label}`, style: "component", componentID: `component:${label}` },
          { text: " ON", style: "energized" },
        ],
      },
    ],
    hits: [{ row: 0, startCell: 4, endCell: 9 + label.length, componentID: `component:${label}` }],
    selectedComponentID: `component:${label}`,
    context: [{ title: "Selection", entries: [{ label: "Name", value: label }] }],
    status: { items: [{ label: "Projection", value: label, tone: "success" }] },
    ...overrides,
  }
}

export function openResult(overrides: Partial<EngiwarePlcOpenResult> = {}): EngiwarePlcOpenResult {
  return {
    catalog,
    activeTarget: { id: "main" },
    projection: projection("main"),
    status: {
      items: [
        { label: "Source", value: "Recovery index" },
        { label: "Authority", value: "Flux Deep PLC" },
      ],
    },
    ...overrides,
  }
}

type Overrides = {
  readonly hello?: EngiwareDomainClient["host"]["hello"]
  readonly open?: EngiwareDomainClient["plc"]["open"]
  readonly importL5x?: EngiwareDomainClient["plc"]["importL5x"]
  readonly openRoutine?: EngiwareDomainClient["plc"]["openRoutine"]
  readonly setMode?: EngiwareDomainClient["plc"]["setMode"]
  readonly moveSelection?: EngiwareDomainClient["plc"]["moveSelection"]
  readonly selectAt?: EngiwareDomainClient["plc"]["selectAt"]
  readonly close?: EngiwareDomainClient["plc"]["close"]
}

export function createFakeEngiwareClient(overrides: Overrides = {}) {
  const calls = {
    order: [] as string[],
    routines: [] as string[],
    imports: [] as string[],
    modes: [] as EngiwareProjectionMode[],
    moves: [] as string[],
    points: [] as { readonly row: number; readonly cell: number }[],
    close: 0,
  }
  const client: EngiwareDomainClient = {
    host: {
      hello: async () => {
        calls.order.push("hello")
        return overrides.hello ? overrides.hello() : { protocolVersion: 1 }
      },
    },
    plc: {
      open: async () => {
        calls.order.push("open")
        return overrides.open ? overrides.open() : openResult()
      },
      importL5x: async (source) => {
        calls.order.push("import")
        calls.imports.push(source)
        return overrides.importL5x ? overrides.importL5x(source) : openResult()
      },
      openRoutine: async (target) => {
        calls.routines.push(target.id)
        return overrides.openRoutine
          ? overrides.openRoutine(target)
          : projection(`routine:${target.id}`, { target: { navigationId: `routine:${target.id}` } })
      },
      setMode: async (mode) => {
        calls.modes.push(mode)
        return overrides.setMode ? overrides.setMode(mode) : projection(`mode:${mode}`, { mode })
      },
      moveSelection: async (direction) => {
        calls.moves.push(direction)
        return overrides.moveSelection ? overrides.moveSelection(direction) : projection(`move:${direction}`)
      },
      selectAt: async (point) => {
        calls.points.push(point)
        return overrides.selectAt ? overrides.selectAt(point) : projection(`point:${point.row}:${point.cell}`)
      },
      close: async () => {
        calls.close++
        return overrides.close?.()
      },
    },
  }
  return { client, calls }
}

export const ignitionCatalog: readonly EngiwareCatalogNode[] = [
  {
    id: "ignition:project",
    label: "Example Ignition Project",
    kind: "project",
    children: [
      {
        id: "ignition:perspective",
        label: "Perspective",
        kind: "category",
        children: [
          {
            id: "ignition:views",
            label: "Views",
            kind: "category",
            children: [
              {
                id: "ignition:view:main",
                label: "Main",
                kind: "view",
                target: { id: "view:main" },
                children: [
                  {
                    id: "ignition:components",
                    label: "Components",
                    kind: "category",
                    children: [
                      {
                        id: "ignition:component:run",
                        label: "Run",
                        kind: "component",
                        target: { id: "component:run" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

export function ignitionProjection(
  label: string,
  overrides: Partial<EngiwareIgnitionProjection> = {},
): EngiwareIgnitionProjection {
  return {
    coordinateSystem: "terminal-cell-v1",
    mode: "structure",
    target: { navigationId: "ignition:view:main" },
    rows: [
      {
        id: label,
        segments: [
          { text: "+------", style: "component", componentID: `ignition:component:${label}` },
          { text: label, style: "component", componentID: `ignition:component:${label}` },
        ],
      },
    ],
    hits: [{ row: 0, startCell: 0, endCell: 7 + label.length, componentID: `ignition:component:${label}` }],
    context: [{ title: "Perspective View", entries: [{ label: "Path", value: label }] }],
    status: { items: [{ label: "Resource", value: label }] },
    ...overrides,
  }
}

export function ignitionOpenResult(overrides: Partial<EngiwareIgnitionOpenResult> = {}): EngiwareIgnitionOpenResult {
  return {
    catalog: ignitionCatalog,
    activeTarget: { id: "view:main" },
    projection: ignitionProjection("Main"),
    status: { items: [{ label: "Source", value: "example.gwbk" }] },
    ...overrides,
  }
}

type IgnitionOverrides = {
  readonly hello?: EngiwareIgnitionDomainClient["host"]["hello"]
  readonly open?: EngiwareIgnitionDomainClient["ignition"]["open"]
  readonly importProject?: EngiwareIgnitionDomainClient["ignition"]["importProject"]
  readonly openResource?: EngiwareIgnitionDomainClient["ignition"]["openResource"]
  readonly setMode?: EngiwareIgnitionDomainClient["ignition"]["setMode"]
  readonly selectAt?: EngiwareIgnitionDomainClient["ignition"]["selectAt"]
  readonly close?: EngiwareIgnitionDomainClient["ignition"]["close"]
}

export function createFakeIgnitionClient(overrides: IgnitionOverrides = {}) {
  const calls = {
    order: [] as string[],
    imports: [] as string[],
    resources: [] as string[],
    modes: [] as EngiwareIgnitionProjectionMode[],
    points: [] as { readonly row: number; readonly cell: number }[],
    close: 0,
  }
  const client: EngiwareIgnitionDomainClient = {
    host: {
      hello: async () => {
        calls.order.push("hello")
        return overrides.hello ? overrides.hello() : { protocolVersion: 1 }
      },
    },
    ignition: {
      open: async () => {
        calls.order.push("open")
        return overrides.open ? overrides.open() : ignitionOpenResult()
      },
      importProject: async (source) => {
        calls.order.push("import")
        calls.imports.push(source)
        return overrides.importProject ? overrides.importProject(source) : ignitionOpenResult()
      },
      openResource: async (target) => {
        calls.resources.push(target.id)
        return overrides.openResource ? overrides.openResource(target) : ignitionProjection(`resource:${target.id}`)
      },
      setMode: async (mode) => {
        calls.modes.push(mode)
        return overrides.setMode ? overrides.setMode(mode) : ignitionProjection(`mode:${mode}`, { mode })
      },
      selectAt: async (point) => {
        calls.points.push(point)
        return overrides.selectAt ? overrides.selectAt(point) : ignitionProjection(`point:${point.row}:${point.cell}`)
      },
      close: async () => {
        calls.close++
        return overrides.close?.()
      },
    },
  }
  return { client, calls }
}

export const engibookCatalog: readonly EngiwareCatalogNode[] = [
  {
    id: "node:panel:main",
    label: "Main Panel",
    kind: "panel",
    target: { id: "panel:main" },
    objectRef: { snapshotId: "snapshot:panel", objectId: "panel:main" },
    children: [
      {
        id: "node:component:plc",
        label: "PLC1",
        kind: "component",
        target: { id: "component:plc" },
        objectRef: { snapshotId: "snapshot:panel", objectId: "component:plc" },
      },
    ],
  },
]

export function engibookSourceProjection(label = "Overview"): EngiwareSourceProjection {
  return {
    coordinateSystem: "source-v1",
    mode: "source",
    target: { navigationId: "node:panel:main" },
    objectRefs: [{ snapshotId: "snapshot:panel", objectId: "panel:main" }],
    selectionRef: { snapshotId: "snapshot:panel", objectId: "panel:main" },
    context: [{ title: "Snapshot Object", entries: [{ label: "Name", value: "Main Panel" }] }],
    status: { items: [{ label: "Authority", value: "Immutable Engibook snapshot" }] },
    displayName: label,
    mediaType: "text/markdown",
    languageId: "markdown",
    text: `# ${label}\n\nRead-only snapshot review.`,
  }
}

export function engibookSceneProjection(label = "PLC1"): EngiwareSceneProjection {
  return {
    coordinateSystem: "scene-v1",
    mode: "scene",
    target: { navigationId: "node:component:plc" },
    objectRefs: [{ snapshotId: "snapshot:panel", objectId: "component:plc" }],
    selectionRef: { snapshotId: "snapshot:panel", objectId: "component:plc" },
    context: [{ title: "Snapshot Object", entries: [{ label: "Name", value: label }] }],
    status: { items: [{ label: "Authority", value: "Immutable Engibook snapshot" }] },
    viewport: { width: 800, height: 1000 },
    nodes: [
      {
        nodeId: "scene:component:plc",
        primitive: "rectangle",
        x: 100,
        y: 200,
        width: 200,
        height: 100,
        zIndex: 1,
        text: label,
        objectRef: { snapshotId: "snapshot:panel", objectId: "component:plc" },
      },
    ],
    connectors: [],
    selectedObjectIDs: ["component:plc"],
  }
}

export function engibookOpenResult(overrides: Partial<EngiwareEngibookOpenResult> = {}): EngiwareEngibookOpenResult {
  return {
    catalog: engibookCatalog,
    tabs: [
      { id: "tab:overview", label: "Overview" },
      { id: "tab:front", label: "Front" },
    ],
    activeTabId: "tab:overview",
    module: { moduleId: "com.engiware.panel", moduleVersion: "0.1.0" },
    activeTarget: { id: "panel:main" },
    projection: engibookSourceProjection(),
    status: { items: [{ label: "Bundle", value: "panel.engibook" }] },
    ...overrides,
  }
}

type EngibookOverrides = {
  readonly hello?: EngiwareEngibookDomainClient["host"]["hello"]
  readonly open?: EngiwareEngibookDomainClient["engibook"]["open"]
  readonly load?: EngiwareEngibookDomainClient["engibook"]["load"]
  readonly openTarget?: EngiwareEngibookDomainClient["engibook"]["openTarget"]
  readonly openTab?: EngiwareEngibookDomainClient["engibook"]["openTab"]
  readonly close?: EngiwareEngibookDomainClient["engibook"]["close"]
}

export function createFakeEngibookClient(overrides: EngibookOverrides = {}) {
  const calls = {
    order: [] as string[],
    loads: [] as string[],
    targets: [] as string[],
    tabs: [] as string[],
    close: 0,
  }
  const client: EngiwareEngibookDomainClient = {
    host: {
      hello: async () => {
        calls.order.push("hello")
        return overrides.hello ? overrides.hello() : { protocolVersion: 1 }
      },
    },
    engibook: {
      open: async () => {
        calls.order.push("open")
        return overrides.open ? overrides.open() : engibookOpenResult()
      },
      load: async (path) => {
        calls.order.push("load")
        calls.loads.push(path)
        return overrides.load ? overrides.load(path) : engibookOpenResult()
      },
      openTarget: async (target) => {
        calls.targets.push(target.id)
        return overrides.openTarget ? overrides.openTarget(target) : engibookSceneProjection(target.id)
      },
      openTab: async (tabId) => {
        calls.tabs.push(tabId)
        return overrides.openTab ? overrides.openTab(tabId) : engibookSceneProjection("PLC1")
      },
      close: async () => {
        calls.close++
        return overrides.close?.()
      },
    },
  }
  return { client, calls }
}
