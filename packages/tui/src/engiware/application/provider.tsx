import { batch, createContext, onCleanup, useContext, type ParentProps } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import type {
  EngiwareCatalogNode,
  EngiwareDomainClient,
  EngiwareEngibookDomainClient,
  EngiwareEngibookOpenResult,
  EngiwareIgnitionDomainClient,
  EngiwareIgnitionOpenResult,
  EngiwarePlcOpenResult,
  EngiwareProjection,
  EngiwareStatus,
} from "../domain/client"
import { EngiwareContextRecorderProvider } from "../context/recorder"
import { appendPromptJournals, promptJournalDate } from "../journal/project-tree"
import { promptJournalPath } from "../journal/prompt-journal"
import type {
  EngiwareController,
  EngiwareControllerModel,
  PaneState,
  PromptJournalAdmission,
  PromptJournalProject,
} from "./contracts"

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
    promptJournalProjects: {},
    promptJournalAdmissions: {},
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
  let domainNavigation: readonly EngiwareCatalogNode[] = []
  let domainStatus: EngiwareStatus | undefined
  let promptJournalDates: readonly string[] = []
  let promptJournalRevision = 0
  let disposed = false

  const beginPromptJournalProject = (sessionID: string | undefined, source?: string, force = false) => {
    if (!sessionID) return
    const projects = model.promptJournalProjects[sessionID] ?? []
    const active = projects.at(-1)
    if (!force && active && active.source === source) return active
    const since = Date.now()
    const closed =
      active && active.until === undefined ? [...projects.slice(0, -1), { ...active, until: since }] : projects
    const project: PromptJournalProject = { id: ++promptJournalRevision, source, since }
    setModel("promptJournalProjects", { ...model.promptJournalProjects, [sessionID]: [...closed, project] })
    return project
  }

  const confirmPromptJournalProject = (
    sessionID: string | undefined,
    projectID: number | undefined,
    source: string,
  ) => {
    if (!sessionID || projectID === undefined) return
    const projects = model.promptJournalProjects[sessionID]
    if (!projects) return
    setModel("promptJournalProjects", {
      ...model.promptJournalProjects,
      [sessionID]: projects.map((project) => (project.id === projectID ? { ...project, source } : project)),
    })
  }

  const associateCurrentPromptJournal = (
    sessionID: string | undefined,
    application?: "plc" | "ignition" | "engibook",
  ) => {
    if (application && model.projectApplication !== application) return
    if (!model.projectSource || model.promptJournalSince === undefined) return
    beginPromptJournalProject(sessionID, model.projectSource)
  }

  const prepareApplication = (application: "plc" | "ignition" | "engibook", sessionID?: string) => {
    if (!model.projectApplication || model.projectApplication === application) return
    promptJournalDates = []
    batch(() => {
      setModel("projectApplication", undefined)
      setModel("projectSource", undefined)
      setModel("promptJournalSince", undefined)
      beginPromptJournalProject(sessionID)
    })
  }

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
        if (domainStatus) setModel("source", { kind: "ready", data: domainStatus })
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
    domainNavigation = result.catalog
    domainStatus = result.status
    batch(() => {
      setModel(
        "navigation",
        result.catalog.length
          ? { kind: "ready", data: appendPromptJournals(result.catalog, promptJournalDates) }
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

  const openPlc = (sessionID?: string): Promise<void> => {
    const wasActive = model.view === "plc"
    if (!wasActive) generation++
    setModel("view", "plc")
    setModel("notice", undefined)
    prepareApplication("plc", sessionID)
    if (importing) return importing.then(() => openPlc(sessionID))
    if (!props.client) {
      setApplicationUnavailable("PLC")
      return Promise.resolve()
    }
    if (opened && wasActive) return Promise.resolve()
    if (opening) return opening.then(() => openPlc(sessionID))
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

  const performImport = (source: string, sessionID: string | undefined, project: PromptJournalProject | undefined) => {
    const promptJournalSince = project?.since ?? Date.now()
    if (model.view !== "plc") generation++
    setModel("view", "plc")
    setModel("notice", undefined)
    prepareApplication("plc", sessionID)
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
        async (result) => {
          if (disposed || current !== generation || model.view !== "plc") return
          opened = true
          setModel("projectApplication", "plc")
          setModel("projectSource", source)
          setModel("promptJournalSince", promptJournalSince)
          confirmPromptJournalProject(sessionID, project?.id, source)
          applyOpenResult(result, "plc")
          await refreshPromptJournals()
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

  const enqueuePlcImport = (
    source: string,
    sessionID: string | undefined,
    project: PromptJournalProject | undefined,
  ): Promise<void> => {
    if (opening) return opening.then(() => enqueuePlcImport(source, sessionID, project))
    if (importing) return importing.then(() => enqueuePlcImport(source, sessionID, project))
    const pending = performImport(source, sessionID, project)
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

  const importPlc = (source: string, sessionID?: string) =>
    enqueuePlcImport(source, sessionID, beginPromptJournalProject(sessionID, undefined, true))

  const refreshPromptJournals = async () => {
    const source = model.projectSource
    if (!source) return
    const directory = path.join(path.dirname(source), "Logs", "Prompts")
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const dates = entries
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name))
      .map((entry) => entry.name.slice(0, -3))
      .toSorted((left, right) => right.localeCompare(left))
    if (disposed || model.projectSource !== source) return
    promptJournalDates = dates
    if (domainNavigation.length)
      setModel("navigation", { kind: "ready", data: appendPromptJournals(domainNavigation, dates) })
  }

  const openPromptJournal = async (navigationID: string, targetID: string) => {
    if (importing || ignitionImporting || engibookLoading) return
    const day = promptJournalDate(targetID)
    const source = model.projectSource
    if (!day || !source) return
    const current = ++generation
    setModel("projectionPending", true)
    setModel("projectionError", undefined)
    const file = promptJournalPath(source, day)
    const document = await lstat(file)
      .then((info) => {
        if (!info.isFile()) throw new Error(`Prompt journal is not a regular file: ${file}`)
        return readFile(file, "utf8")
      })
      .then(
        (text) => ({ text }),
        (cause) => ({ error: errorMessage(cause) }),
      )
    if (disposed || current !== generation || model.projectSource !== source) return
    if ("error" in document) {
      setModel("projectionPending", false)
      setModel("projectionError", document.error)
      return
    }
    setProjection({
      coordinateSystem: "source-v1",
      mode: "source",
      target: { navigationId: navigationID },
      displayName: `${day}.md`,
      mediaType: "text/markdown",
      languageId: "markdown",
      text: document.text,
      context: [
        {
          title: "Project Prompt Journal",
          entries: [
            { label: "Date", value: day },
            { label: "Path", value: file },
          ],
        },
      ],
      status: { items: [{ label: "Artifact", value: file }] },
    })
    setModel("source", { kind: "ready", data: { items: [{ label: "Prompt Journal", value: file }] } })
  }

  const openIgnition = (sessionID?: string): Promise<void> => {
    const wasActive = model.view === "ignition"
    if (!wasActive) generation++
    setModel("view", "ignition")
    setModel("notice", undefined)
    prepareApplication("ignition", sessionID)
    if (ignitionImporting) return ignitionImporting.then(() => openIgnition(sessionID))
    if (!props.ignitionClient) {
      setApplicationUnavailable("Ignition")
      return Promise.resolve()
    }
    if (ignitionOpened && wasActive) return Promise.resolve()
    if (ignitionOpening) return ignitionOpening.then(() => openIgnition(sessionID))
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

  const performIgnitionImport = (
    source: string,
    sessionID: string | undefined,
    project: PromptJournalProject | undefined,
  ) => {
    const promptJournalSince = project?.since ?? Date.now()
    if (model.view !== "ignition") generation++
    setModel("view", "ignition")
    setModel("notice", undefined)
    prepareApplication("ignition", sessionID)
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
        async (result) => {
          if (disposed || current !== generation || model.view !== "ignition") return
          ignitionOpened = true
          setModel("projectApplication", "ignition")
          setModel("projectSource", source)
          setModel("promptJournalSince", promptJournalSince)
          confirmPromptJournalProject(sessionID, project?.id, source)
          applyOpenResult(result, "ignition")
          await refreshPromptJournals()
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

  const enqueueIgnitionImport = (
    source: string,
    sessionID: string | undefined,
    project: PromptJournalProject | undefined,
  ): Promise<void> => {
    if (ignitionOpening) return ignitionOpening.then(() => enqueueIgnitionImport(source, sessionID, project))
    if (ignitionImporting) return ignitionImporting.then(() => enqueueIgnitionImport(source, sessionID, project))
    const pending = performIgnitionImport(source, sessionID, project)
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

  const importIgnition = (source: string, sessionID?: string) =>
    enqueueIgnitionImport(source, sessionID, beginPromptJournalProject(sessionID, undefined, true))

  const openEngibook = (sessionID?: string): Promise<void> => {
    const wasActive = model.view === "engibook"
    if (!wasActive) generation++
    setModel("view", "engibook")
    setModel("notice", undefined)
    prepareApplication("engibook", sessionID)
    if (engibookLoading) return engibookLoading.then(() => openEngibook(sessionID))
    if (!props.engibookClient) {
      setApplicationUnavailable("Engibook")
      return Promise.resolve()
    }
    if (engibookOpened && wasActive) return Promise.resolve()
    if (engibookOpening) return engibookOpening.then(() => openEngibook(sessionID))
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

  const performEngibookLoad = (
    path: string,
    sessionID: string | undefined,
    project: PromptJournalProject | undefined,
  ): Promise<void> => {
    const promptJournalSince = project?.since ?? Date.now()
    if (model.view !== "engibook") generation++
    setModel("view", "engibook")
    setModel("notice", undefined)
    prepareApplication("engibook", sessionID)
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
        async (result) => {
          if (disposed || current !== generation || model.view !== "engibook") return
          engibookOpened = true
          setModel("projectApplication", "engibook")
          setModel("projectSource", path)
          setModel("promptJournalSince", promptJournalSince)
          confirmPromptJournalProject(sessionID, project?.id, path)
          applyOpenResult(result, "engibook")
          await refreshPromptJournals()
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

  const enqueueEngibookLoad = (
    path: string,
    sessionID: string | undefined,
    project: PromptJournalProject | undefined,
  ): Promise<void> => {
    if (engibookOpening) return engibookOpening.then(() => enqueueEngibookLoad(path, sessionID, project))
    if (engibookLoading) return engibookLoading.then(() => enqueueEngibookLoad(path, sessionID, project))
    const pending = performEngibookLoad(path, sessionID, project)
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

  const loadEngibook = (path: string, sessionID?: string) =>
    enqueueEngibookLoad(path, sessionID, beginPromptJournalProject(sessionID, undefined, true))

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
      observePromptAdmission(sessionID, promptID, created) {
        const current = model.promptJournalAdmissions[sessionID] ?? {}
        if (current[promptID]) return
        const project = model.promptJournalProjects[sessionID]?.find(
          (candidate) => created >= candidate.since && created < (candidate.until ?? Number.POSITIVE_INFINITY),
        )
        if (!project) return
        const admission: PromptJournalAdmission = { projectID: project.id, created }
        setModel("promptJournalAdmissions", {
          ...model.promptJournalAdmissions,
          [sessionID]: { ...current, [promptID]: admission },
        })
      },
      observePrompt(input, sessionID) {
        const source = requestedPlcImport(input)
        if (source) {
          void importPlc(source, sessionID)
          return
        }
        if (requestsPlcWorkspace(input)) {
          associateCurrentPromptJournal(sessionID, "plc")
          void openPlc(sessionID)
          return
        }
        if (requestsIgnitionWorkspace(input)) {
          associateCurrentPromptJournal(sessionID, "ignition")
          void openIgnition(sessionID)
          return
        }
        if (requestsEngibookWorkspace(input)) {
          associateCurrentPromptJournal(sessionID, "engibook")
          void openEngibook(sessionID)
          return
        }
        associateCurrentPromptJournal(sessionID)
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
      openPromptJournal,
      refreshPromptJournals,
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

function requestedPlcImport(input: string) {
  if (!/\b(?:open|load|show|view|browse|import)\b/i.test(input)) return
  const match = input.match(/(?:"([^"\n]+\.l5x)"|'([^'\n]+\.l5x)'|(\/[\w./~-]+\.l5x))\b/i)
  return match?.slice(1).find((source) => source !== undefined)
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
