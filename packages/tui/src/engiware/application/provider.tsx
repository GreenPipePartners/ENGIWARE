import { batch, createContext, onCleanup, useContext, type ParentProps } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type {
  EngiwareCatalogNode,
  EngiwareDomainClient,
  EngiwareEngibookDomainClient,
  EngiwareEngibookOpenResult,
  EngiwareIgnitionDomainClient,
  EngiwareIgnitionOpenResult,
  EngiwarePlcOpenResult,
  EngiwareProjection,
} from "../domain/client"
import { EngiwareContextRecorderProvider } from "../context/recorder"
import type { EngiwareController, EngiwareControllerModel, PaneState } from "./contracts"

const unavailable = "Engiware domain client unavailable"
const Context = createContext<EngiwareController>()
type MutableControllerModel = { -readonly [Key in keyof EngiwareControllerModel]: EngiwareControllerModel[Key] }

export function EngiwareApplicationProvider(
  props: ParentProps<{
    client?: EngiwareDomainClient
    ignitionClient?: EngiwareIgnitionDomainClient
    engibookClient?: EngiwareEngibookDomainClient
  }>,
) {
  const available = () =>
    props.client !== undefined || props.ignitionClient !== undefined || props.engibookClient !== undefined
  const [model, setModel] = createStore<MutableControllerModel>({
    view: "menu",
    navigation: {
      kind: "empty",
      message: available() ? "Open an engineering workspace to load its catalog" : unavailable,
    },
    display: {
      kind: "empty",
      message: available() ? "Open an engineering workspace to load a projection" : unavailable,
    },
    context: { kind: "empty", message: available() ? "Open an engineering workspace to load context" : unavailable },
    source: { kind: "empty", message: available() ? "Engineering workspace is closed" : unavailable },
    projectionPending: false,
    contextVisible: true,
    expandedNavigationIDs: new Set<string>(),
    reviewTabs: [],
  })
  let generation = 0
  let contextRevision = 0
  let opened = false
  let opening: Promise<void> | undefined
  let importing: Promise<void> | undefined
  let ignitionOpened = false
  let ignitionOpening: Promise<void> | undefined
  let ignitionImporting: Promise<void> | undefined
  let engibookOpened = false
  let engibookOpening: Promise<void> | undefined
  let engibookLoading: Promise<void> | undefined
  let disposed = false

  const setProjection = (projection: EngiwareProjection, replaceContext = true) => {
    batch(() => {
      setModel("display", { kind: "ready", data: projection })
      setModel("activeNavigationID", projection.target.navigationId)
      setModel("projectionPending", false)
      setModel("projectionError", undefined)
      if (replaceContext) {
        setModel(
          "context",
          projection.context.length
            ? { kind: "ready", data: projection.context }
            : { kind: "empty", message: "No context available for the active routine" },
        )
      }
    })
  }

  const requestProjection = (
    request: () => Promise<EngiwareProjection>,
    enabled: boolean,
    application: "plc" | "ignition" | "engibook",
    onSuccess?: () => void,
  ): Promise<void> => {
    if (!enabled) return Promise.resolve()
    const current = ++generation
    const currentContext = contextRevision
    setModel("projectionPending", true)
    setModel("projectionError", undefined)
    return request().then(
      (projection) => {
        if (disposed || current !== generation || model.view !== application) return
        setProjection(projection, currentContext === contextRevision)
        onSuccess?.()
      },
      (cause) => {
        if (disposed || current !== generation || model.view !== application) return
        setModel("projectionPending", false)
        setModel("projectionError", errorMessage(cause))
      },
    )
  }

  const applyOpenResult = (
    result: EngiwarePlcOpenResult | EngiwareIgnitionOpenResult | EngiwareEngibookOpenResult,
    application: "plc" | "ignition" | "engibook",
  ) => {
    const ignition = application === "ignition"
    const engibook = application === "engibook"
    const active = result.activeTarget
      ? findCatalogNode(result.catalog, (node) => node.target?.id === result.activeTarget!.id)
      : undefined
    batch(() => {
      setModel(
        "navigation",
        result.catalog.length
          ? { kind: "ready", data: result.catalog }
          : {
              kind: "empty",
              message: engibook
                ? "No Engibook objects are available"
                : ignition
                  ? "No Ignition resources are available"
                  : "No PLC routines are available",
            },
      )
      setModel(
        "source",
        result.status.items.length
          ? { kind: "ready", data: result.status }
          : { kind: "empty", message: "Domain host connected without source status" },
      )
      setModel("activeNavigationID", active?.id)
      setModel("selectedNavigationID", active?.id ?? result.catalog[0]?.id)
      setModel("expandedNavigationIDs", initialExpanded(result.catalog, active?.id))
      if ("tabs" in result) {
        setModel("reviewTabs", result.tabs)
        setModel("activeReviewTabID", result.activeTabId)
        setModel("activeModuleID", result.module.moduleId)
      } else {
        setModel("reviewTabs", [])
        setModel("activeReviewTabID", undefined)
        setModel("activeModuleID", undefined)
      }
      if (result.projection) {
        setProjection(result.projection)
        return
      }
      setModel("projectionPending", false)
      setModel("display", {
        kind: "empty",
        message: engibook
          ? "Select a snapshot object to review it"
          : ignition
            ? "Select a resource to open it"
            : "Select a routine to open its projection",
      })
      setModel("context", {
        kind: "empty",
        message: engibook
          ? "No active snapshot object context"
          : ignition
            ? "No active resource context"
            : "No active routine context",
      })
    })
  }

  const setApplicationUnavailable = (application: "PLC" | "Ignition" | "Engibook") => {
    const state: PaneState<never> = { kind: "error", message: `${application} domain client unavailable` }
    batch(() => {
      setModel("navigation", reconcile(state))
      setModel("display", reconcile(state))
      setModel("context", reconcile(state))
      setModel("source", reconcile(state))
      setModel("projectionPending", false)
      setModel("projectionError", undefined)
      setModel("selectedNavigationID", undefined)
      setModel("activeNavigationID", undefined)
      setModel("expandedNavigationIDs", new Set<string>())
    })
  }

  const openPlc = (): Promise<void> => {
    const wasActive = model.view === "plc"
    if (!wasActive) generation++
    setModel("view", "plc")
    setModel("notice", undefined)
    if (importing) return importing.then(openPlc)
    if (!props.client) {
      setApplicationUnavailable("PLC")
      return Promise.resolve()
    }
    if (opened && wasActive) return Promise.resolve()
    if (opening) return opening.then(openPlc)
    const current = ++generation
    batch(() => {
      setModel("navigation", { kind: "loading", message: "Loading PLC catalog" })
      setModel("display", { kind: "loading", message: "Opening PLC recovery workspace" })
      setModel("context", { kind: "loading", message: "Loading engineering context" })
      setModel("source", { kind: "loading", message: "Connecting to Engiware domain host" })
    })
    const pending = props.client.host
      .hello()
      .then(() => props.client!.plc.open())
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "plc") return
          opened = true
          applyOpenResult(result, "plc")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "plc") return
          const state: PaneState<never> = { kind: "error", message: errorMessage(cause) }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
    opening = pending
    void pending.then(() => {
      if (opening === pending) opening = undefined
    })
    return pending
  }

  const performImport = (source: string) => {
    if (model.view !== "plc") generation++
    setModel("view", "plc")
    setModel("notice", undefined)
    if (!props.client) {
      setApplicationUnavailable("PLC")
      return Promise.resolve()
    }
    const hadOpenSession = opened
    const current = ++generation
    if (hadOpenSession) {
      setModel("projectionPending", true)
      setModel("projectionError", undefined)
    } else {
      batch(() => {
        setModel("navigation", { kind: "loading", message: "Importing L5X catalog" })
        setModel("display", { kind: "loading", message: "Building PLC recovery workspace" })
        setModel("context", { kind: "loading", message: "Loading engineering context" })
        setModel("source", { kind: "loading", message: `Importing ${source}` })
      })
    }
    return props.client.host
      .hello()
      .then(() => props.client!.plc.importL5x(source))
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "plc") return
          opened = true
          applyOpenResult(result, "plc")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "plc") return
          const message = errorMessage(cause)
          setModel("projectionPending", false)
          setModel("projectionError", message)
          if (hadOpenSession) return
          const state: PaneState<never> = { kind: "error", message }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
  }

  const importPlc = (source: string): Promise<void> => {
    if (opening) return opening.then(() => importPlc(source))
    if (importing) return importing.then(() => importPlc(source))
    const pending = performImport(source)
    importing = pending
    void pending.then(
      () => {
        if (importing === pending) importing = undefined
      },
      () => {
        if (importing === pending) importing = undefined
      },
    )
    return pending
  }

  const openIgnition = (): Promise<void> => {
    const wasActive = model.view === "ignition"
    if (!wasActive) generation++
    setModel("view", "ignition")
    setModel("notice", undefined)
    if (ignitionImporting) return ignitionImporting.then(openIgnition)
    if (!props.ignitionClient) {
      setApplicationUnavailable("Ignition")
      return Promise.resolve()
    }
    if (ignitionOpened && wasActive) return Promise.resolve()
    if (ignitionOpening) return ignitionOpening.then(openIgnition)
    const current = ++generation
    batch(() => {
      setModel("navigation", { kind: "loading", message: "Loading Ignition project tree" })
      setModel("display", { kind: "loading", message: "Opening Ignition engineering workspace" })
      setModel("context", { kind: "loading", message: "Loading Ignition resource context" })
      setModel("source", { kind: "loading", message: "Connecting to Ignition domain host" })
    })
    const pending = props.ignitionClient.host
      .hello()
      .then(() => props.ignitionClient!.ignition.open())
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "ignition") return
          ignitionOpened = true
          applyOpenResult(result, "ignition")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "ignition") return
          const state: PaneState<never> = { kind: "error", message: errorMessage(cause) }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
    ignitionOpening = pending
    void pending.then(() => {
      if (ignitionOpening === pending) ignitionOpening = undefined
    })
    return pending
  }

  const performIgnitionImport = (source: string) => {
    if (model.view !== "ignition") generation++
    setModel("view", "ignition")
    setModel("notice", undefined)
    if (!props.ignitionClient) {
      setApplicationUnavailable("Ignition")
      return Promise.resolve()
    }
    const hadOpenSession = ignitionOpened
    const current = ++generation
    if (hadOpenSession) {
      setModel("projectionPending", true)
      setModel("projectionError", undefined)
    } else {
      batch(() => {
        setModel("navigation", { kind: "loading", message: "Indexing Ignition resources" })
        setModel("display", { kind: "loading", message: "Building Ignition engineering workspace" })
        setModel("context", { kind: "loading", message: "Extracting scripts and configuration" })
        setModel("source", { kind: "loading", message: `Importing ${source}` })
      })
    }
    return props.ignitionClient.host
      .hello()
      .then(() => props.ignitionClient!.ignition.importProject(source))
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "ignition") return
          ignitionOpened = true
          applyOpenResult(result, "ignition")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "ignition") return
          const message = errorMessage(cause)
          setModel("projectionPending", false)
          setModel("projectionError", message)
          if (hadOpenSession) return
          const state: PaneState<never> = { kind: "error", message }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
  }

  const importIgnition = (source: string): Promise<void> => {
    if (ignitionOpening) return ignitionOpening.then(() => importIgnition(source))
    if (ignitionImporting) return ignitionImporting.then(() => importIgnition(source))
    const pending = performIgnitionImport(source)
    ignitionImporting = pending
    void pending.then(
      () => {
        if (ignitionImporting === pending) ignitionImporting = undefined
      },
      () => {
        if (ignitionImporting === pending) ignitionImporting = undefined
      },
    )
    return pending
  }

  const openEngibook = (): Promise<void> => {
    const wasActive = model.view === "engibook"
    if (!wasActive) generation++
    setModel("view", "engibook")
    setModel("notice", undefined)
    if (engibookLoading) return engibookLoading.then(openEngibook)
    if (!props.engibookClient) {
      setApplicationUnavailable("Engibook")
      return Promise.resolve()
    }
    if (engibookOpened && wasActive) return Promise.resolve()
    if (engibookOpening) return engibookOpening.then(openEngibook)
    const current = ++generation
    batch(() => {
      setModel("navigation", { kind: "loading", message: "Loading Engibook Project Tree" })
      setModel("display", { kind: "loading", message: "Regenerating review projection" })
      setModel("context", { kind: "loading", message: "Resolving snapshot context" })
      setModel("source", { kind: "loading", message: "Opening immutable Engibook snapshot" })
    })
    const pending = props.engibookClient.host
      .hello()
      .then(() => props.engibookClient!.engibook.open())
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "engibook") return
          engibookOpened = true
          applyOpenResult(result, "engibook")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "engibook") return
          const state: PaneState<never> = { kind: "error", message: errorMessage(cause) }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
    engibookOpening = pending
    void pending.then(() => {
      if (engibookOpening === pending) engibookOpening = undefined
    })
    return pending
  }

  const performEngibookLoad = (path: string): Promise<void> => {
    if (model.view !== "engibook") generation++
    setModel("view", "engibook")
    setModel("notice", undefined)
    if (!props.engibookClient) {
      setApplicationUnavailable("Engibook")
      return Promise.resolve()
    }
    const hadOpenSession = engibookOpened
    const current = ++generation
    if (hadOpenSession) {
      setModel("projectionPending", true)
      setModel("projectionError", undefined)
    } else {
      batch(() => {
        setModel("navigation", { kind: "loading", message: "Validating Engibook records" })
        setModel("display", { kind: "loading", message: "Loading module review surface" })
        setModel("context", { kind: "loading", message: "Resolving immutable snapshot context" })
        setModel("source", { kind: "loading", message: `Opening ${path}` })
      })
    }
    return props.engibookClient.host
      .hello()
      .then(() => props.engibookClient!.engibook.load(path))
      .then(
        (result) => {
          if (disposed || current !== generation || model.view !== "engibook") return
          engibookOpened = true
          applyOpenResult(result, "engibook")
        },
        (cause) => {
          if (disposed || current !== generation || model.view !== "engibook") return
          const message = errorMessage(cause)
          setModel("projectionPending", false)
          setModel("projectionError", message)
          if (hadOpenSession) return
          const state: PaneState<never> = { kind: "error", message }
          batch(() => {
            setModel("navigation", state)
            setModel("display", state)
            setModel("context", state)
            setModel("source", state)
          })
        },
      )
  }

  const loadEngibook = (path: string): Promise<void> => {
    if (engibookOpening) return engibookOpening.then(() => loadEngibook(path))
    if (engibookLoading) return engibookLoading.then(() => loadEngibook(path))
    const pending = performEngibookLoad(path)
    engibookLoading = pending
    void pending.then(
      () => {
        if (engibookLoading === pending) engibookLoading = undefined
      },
      () => {
        if (engibookLoading === pending) engibookLoading = undefined
      },
    )
    return pending
  }

  const controller: EngiwareController = {
    model,
    actions: {
      openPlc,
      importPlc,
      openIgnition,
      importIgnition,
      openEngibook,
      loadEngibook,
      showMenu() {
        generation++
        setModel("view", "menu")
        setModel("notice", undefined)
      },
      showOpenCode() {
        generation++
        setModel("view", "opencode")
        setModel("notice", undefined)
      },
      showUnavailable(name) {
        generation++
        setModel("view", "menu")
        setModel("notice", `${name} is not available in this read-only recovery slice`)
      },
      setContextVisible(visible) {
        setModel("contextVisible", visible)
      },
      observePrompt(input) {
        if (requestsPlcWorkspace(input)) void openPlc()
        if (requestsIgnitionWorkspace(input)) void openIgnition()
        if (requestsEngibookWorkspace(input)) void openEngibook()
      },
      selectNavigation(id) {
        contextRevision++
        setModel("selectedNavigationID", id)
        if (model.navigation.kind !== "ready") return
        const node = findCatalogNode(model.navigation.data, (item) => item.id === id)
        if (!node) return
        setModel("context", {
          kind: "ready",
          data: [
            {
              title: "Navigation Selection",
              entries: [
                { label: "Name", value: node.label },
                { label: "Kind", value: node.kind },
                ...(node.status?.items.map((item) => ({ label: item.label, value: item.value })) ?? []),
              ],
            },
          ],
        })
      },
      setNavigationExpanded(id, expanded) {
        const next = new Set(model.expandedNavigationIDs)
        if (expanded) next.add(id)
        if (!expanded) next.delete(id)
        setModel("expandedNavigationIDs", next)
      },
      openRoutine(_navigationID, target) {
        return requestProjection(
          () => props.client!.plc.openRoutine(target),
          Boolean(props.client && opened && !importing),
          "plc",
        )
      },
      openIgnitionResource(_navigationID, target) {
        return requestProjection(
          () => props.ignitionClient!.ignition.openResource(target),
          Boolean(props.ignitionClient && ignitionOpened && !ignitionImporting),
          "ignition",
        )
      },
      openEngibookTarget(_navigationID, target) {
        return requestProjection(
          () => props.engibookClient!.engibook.openTarget(target),
          Boolean(props.engibookClient && engibookOpened && !engibookLoading),
          "engibook",
        )
      },
      openEngibookTab(tabID) {
        return requestProjection(
          () => props.engibookClient!.engibook.openTab(tabID),
          Boolean(props.engibookClient && engibookOpened && !engibookLoading),
          "engibook",
          () => setModel("activeReviewTabID", tabID),
        )
      },
      moveSelection(direction) {
        return requestProjection(
          () => props.client!.plc.moveSelection(direction),
          Boolean(props.client && opened && !importing),
          "plc",
        )
      },
      setMode(mode) {
        return requestProjection(
          () => props.client!.plc.setMode(mode),
          Boolean(props.client && opened && !importing),
          "plc",
        )
      },
      setIgnitionMode(mode) {
        return requestProjection(
          () => props.ignitionClient!.ignition.setMode(mode),
          Boolean(props.ignitionClient && ignitionOpened && !ignitionImporting),
          "ignition",
        )
      },
      selectPlcAt(point) {
        return requestProjection(
          () => props.client!.plc.selectAt(point),
          Boolean(props.client && opened && !importing),
          "plc",
        )
      },
      selectIgnitionAt(point) {
        return requestProjection(
          () => props.ignitionClient!.ignition.selectAt(point),
          Boolean(props.ignitionClient && ignitionOpened && !ignitionImporting),
          "ignition",
        )
      },
    },
  }

  onCleanup(() => {
    disposed = true
    generation++
    if (props.client) void props.client.plc.close().catch(() => undefined)
    if (props.ignitionClient) void props.ignitionClient.ignition.close().catch(() => undefined)
    if (props.engibookClient) void props.engibookClient.engibook.close().catch(() => undefined)
  })

  return (
    <EngiwareContextRecorderProvider>
      <Context.Provider value={controller}>{props.children}</Context.Provider>
    </EngiwareContextRecorderProvider>
  )
}

export function useEngiwareApplication() {
  const value = useContext(Context)
  if (!value) throw new Error("EngiwareApplicationProvider is missing")
  return value
}

function findCatalogNode(
  nodes: readonly EngiwareCatalogNode[],
  predicate: (node: EngiwareCatalogNode) => boolean,
): EngiwareCatalogNode | undefined {
  return nodes.reduce<EngiwareCatalogNode | undefined>(
    (result, node) => result ?? (predicate(node) ? node : findCatalogNode(node.children ?? [], predicate)),
    undefined,
  )
}

function initialExpanded(nodes: readonly EngiwareCatalogNode[], activeID: string | undefined) {
  const expanded = new Set<string>()
  const visit = (node: EngiwareCatalogNode, ancestors: readonly string[]) => {
    if (
      node.children?.length &&
      (ancestors.length === 0 ||
        node.kind === "controller" ||
        node.kind === "group" ||
        node.kind === "project" ||
        node.kind === "gateway" ||
        (node.kind === "category" && ancestors.length <= 1))
    )
      expanded.add(node.id)
    if (node.id === activeID) ancestors.forEach((id) => expanded.add(id))
    node.children?.forEach((child) => visit(child, [...ancestors, node.id]))
  }
  nodes.forEach((node) => visit(node, []))
  return expanded
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

function requestsPlcWorkspace(input: string) {
  return /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:open|load|show|view|browse)\b.*\b(?:plc|l5x)\b/i.test(
    input.trim(),
  )
}

function requestsIgnitionWorkspace(input: string) {
  return /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:open|load|show|view|browse)\b.*\b(?:ignition|scada|gwbk)\b/i.test(
    input.trim(),
  )
}

function requestsEngibookWorkspace(input: string) {
  return /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:open|load|show|view|browse)\b.*\bengibook\b/i.test(
    input.trim(),
  )
}
