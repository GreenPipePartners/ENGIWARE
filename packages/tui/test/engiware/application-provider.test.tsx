/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { EngiwareController } from "../../src/engiware/application/contracts"
import { EngiwareApplicationProvider, useEngiwareApplication } from "../../src/engiware/application/provider"
import {
  createFakeEngiwareClient,
  createFakeEngibookClient,
  createFakeIgnitionClient,
  ignitionOpenResult,
  ignitionProjection,
  openResult,
  projection,
} from "./fixture"

let observed: EngiwareController | undefined

function Probe() {
  observed = useEngiwareApplication()
  return <text>{displayMarker(observed.model.display) ?? "pending"}</text>
}

function displayMarker(display: EngiwareController["model"]["display"]) {
  if (display.kind !== "ready") return undefined
  if (display.data.coordinateSystem === "terminal-cell-v1") return display.data.rows[0]?.id
  if (display.data.coordinateSystem === "source-v1") return display.data.displayName
  return display.data.nodes[0]?.text
}

function firstRowID(display: EngiwareController["model"]["display"]) {
  return display.kind === "ready" && display.data.coordinateSystem === "terminal-cell-v1"
    ? display.data.rows[0]?.id
    : undefined
}

test("starts in the menu and opens PLC state only when requested", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  expect(current().model.view).toBe("menu")
  expect(fake.calls.order).toEqual([])
  await openPlc(app)

  expect(fake.calls.order).toEqual(["hello", "open"])
  expect(current().model.view).toBe("plc")
  expect(current().model.selectedNavigationID).toBe("routine:main")
  expect(current().model.activeNavigationID).toBe("routine:main")
  expect([...current().model.expandedNavigationIDs]).toEqual(["controller", "programs", "program"])
  app.renderer.destroy()
  await Bun.sleep(0)
  expect(fake.calls.close).toBe(1)
})

test("keeps a configured Engibook closed until requested", async () => {
  observed = undefined
  const fake = createFakeEngibookClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider engibookClient={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  expect(current().model.view).toBe("menu")
  expect(fake.calls.order).toEqual([])
  await current().actions.openEngibook()
  await app.waitForFrame((frame) => frame.includes("Overview"))

  expect(current().model.view).toBe("engibook")
  expect(fake.calls.order).toEqual(["hello", "open"])
  expect(current().model.activeModuleID).toBe("com.engiware.panel")
  expect(current().model.reviewTabs.map((item) => item.label)).toEqual(["Overview", "Front"])

  await current().actions.openEngibookTab("tab:front")
  await app.waitForFrame((frame) => frame.includes("PLC1"))
  expect(fake.calls.tabs).toEqual(["tab:front"])
  expect(current().model.activeReviewTabID).toBe("tab:front")
  app.renderer.destroy()
  await Bun.sleep(0)
  expect(fake.calls.close).toBe(1)
})

test("loads an explicit Engibook path and opens snapshot targets", async () => {
  observed = undefined
  const fake = createFakeEngibookClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider engibookClient={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  await current().actions.loadEngibook("/project/panel.engibook")
  await app.waitForFrame((frame) => frame.includes("Overview"))
  await current().actions.openEngibookTarget("node:component:plc", { id: "component:plc" })
  await app.waitForFrame((frame) => frame.includes("component:plc"))

  expect(fake.calls.loads).toEqual(["/project/panel.engibook"])
  expect(fake.calls.targets).toEqual(["component:plc"])
  expect(current().model.activeNavigationID).toBe("node:component:plc")
  app.renderer.destroy()
})

test("keeps the active Engibook tab when a replacement projection fails", async () => {
  observed = undefined
  const fake = createFakeEngibookClient({
    openTab: async () => Promise.reject(new Error("projection failed")),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider engibookClient={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  await current().actions.openEngibook()
  await app.waitForFrame((frame) => frame.includes("Overview"))

  await current().actions.openEngibookTab("tab:front")
  await app.flush()

  expect(current().model.activeReviewTabID).toBe("tab:overview")
  expect(current().model.projectionError).toBe("projection failed")
  expect(displayMarker(current().model.display)).toBe("Overview")
  app.renderer.destroy()
})

test("opens PLC for an explicit natural-language open request", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  current().actions.observePrompt("How does a PLC work?")
  await app.flush()
  expect(fake.calls.order).toEqual([])
  current().actions.observePrompt("Can you please open a PLC program based on this L5X file?")
  await app.waitForFrame((frame) => frame.includes("main"))
  expect(fake.calls.order).toEqual(["hello", "open"])
  expect(current().model.view).toBe("plc")
  app.renderer.destroy()
})

test("imports an absolute L5X path from a natural-language load request", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient({
    importL5x: async () => openResult({ projection: projection("imported") }),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  const source = "/home/bobby/Projects/99013-ME-Program_Recovery/converted/rockwell/plc/applicator/Applicator.L5X"
  current().actions.observePrompt(`I want to load ${source}`, "ses_applicator")
  await app.waitForFrame((frame) => frame.includes("imported"))
  expect(fake.calls.order).toEqual(["hello", "import"])
  expect(fake.calls.imports).toEqual([source])
  expect(current().model.view).toBe("plc")
  expect(current().model.promptJournalProjects.ses_applicator?.at(-1)?.source).toBe(source)
  app.renderer.destroy()
})

test("imports an L5X source into a new PLC session", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient({
    importL5x: async () => openResult({ projection: projection("imported") }),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  const source = "/project/Imported Controller.L5X"
  await current().actions.importPlc(source)
  await app.waitForFrame((frame) => frame.includes("imported"))
  expect(fake.calls.order).toEqual(["hello", "import"])
  expect(fake.calls.imports).toEqual([source])
  expect(current().model.view).toBe("plc")
  app.renderer.destroy()
})

test("opens a dated project prompt journal as Markdown source", async () => {
  observed = undefined
  const root = await mkdtemp(path.join(tmpdir(), "engiware-provider-journal-test-"))
  const source = path.join(root, "Applicator.L5X")
  const journal = path.join(root, "Logs", "Prompts", "2026-08-16.md")
  await mkdir(path.dirname(journal), { recursive: true })
  await writeFile(source, "fixture")
  await writeFile(journal, "# Prompt Journal\n\nApplicator response")
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  await current().actions.importPlc(source)
  const navigation = current().model.navigation
  expect(navigation.kind === "ready" ? JSON.stringify(navigation.data) : "").toContain("2026-08-16")
  await current().actions.openPromptJournal(
    "engiware:controller:logs:prompts:2026-08-16",
    "engiware:prompt-journal:2026-08-16",
  )
  expect(displayMarker(current().model.display)).toBe("2026-08-16.md")
  const display = current().model.display
  expect(display.kind === "ready" && display.data.coordinateSystem === "source-v1" ? display.data.text : "").toContain(
    "Applicator response",
  )
  app.renderer.destroy()
  await rm(root, { recursive: true, force: true })
})

test("does not let journal navigation invalidate a replacement import", async () => {
  observed = undefined
  const root = await mkdtemp(path.join(tmpdir(), "engiware-provider-journal-race-test-"))
  const sourceA = path.join(root, "A.L5X")
  const sourceB = path.join(root, "B.L5X")
  const journal = path.join(root, "Logs", "Prompts", "2026-08-16.md")
  await mkdir(path.dirname(journal), { recursive: true })
  await writeFile(sourceA, "fixture")
  await writeFile(sourceB, "fixture")
  await writeFile(journal, "# Prompt Journal")
  const imported = Promise.withResolvers<ReturnType<typeof openResult>>()
  const fake = createFakeEngiwareClient({
    importL5x: async (source) =>
      source === sourceA ? openResult({ projection: projection("source-a") }) : imported.promise,
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  await current().actions.importPlc(sourceA)

  const importing = current().actions.importPlc(sourceB)
  await app.flush()
  await current().actions.openPromptJournal(
    "engiware:controller:logs:prompts:2026-08-16",
    "engiware:prompt-journal:2026-08-16",
  )
  imported.resolve(openResult({ projection: projection("source-b") }))
  await importing
  await app.waitForFrame((frame) => frame.includes("source-b"))

  expect(firstRowID(current().model.display)).toBe("source-b")
  app.renderer.destroy()
  await rm(root, { recursive: true, force: true })
})

test("associates a Home project with its created session and clears ownership on an application switch", async () => {
  observed = undefined
  const plc = createFakeEngiwareClient()
  const ignition = createFakeIgnitionClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={plc.client} ignitionClient={ignition.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  const source = "/project/A.L5X"
  await current().actions.importPlc(source)
  current().actions.observePrompt("Explain the active project", "ses_home")
  expect(current().model.promptJournalProjects.ses_home?.at(-1)?.source).toBe(source)

  const replacement = "/project/B.L5X"
  await current().actions.importPlc(replacement, "ses_other")
  current().actions.observePrompt("Explain the now-visible project", "ses_home")
  expect(current().model.promptJournalProjects.ses_home?.at(-1)?.source).toBe(replacement)

  await current().actions.openIgnition("ses_home")
  expect(current().model.promptJournalProjects.ses_home?.at(-1)?.source).toBeUndefined()
  expect(current().model.projectSource).toBeUndefined()
  app.renderer.destroy()
})

test("disassociates the previous project before a natural-language replacement import", async () => {
  observed = undefined
  const replacement = Promise.withResolvers<ReturnType<typeof openResult>>()
  const sourceA = "/project/A.L5X"
  const sourceB = "/project/B.L5X"
  const fake = createFakeEngiwareClient({
    importL5x: (source) => (source === sourceA ? Promise.resolve(openResult()) : replacement.promise),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  await current().actions.importPlc(sourceA, "ses_home")
  const projectA = current().model.promptJournalProjects.ses_home?.at(-1)
  expect(projectA).toBeDefined()
  current().actions.observePromptAdmission("ses_home", "msg_queued_a", projectA!.since)

  current().actions.observePrompt(`Load ${sourceB}`, "ses_home")
  expect(current().model.promptJournalProjects.ses_home?.map((project) => project.source)).toEqual([sourceA, undefined])
  expect(current().model.promptJournalProjects.ses_home?.[0]?.until).toBe(
    current().model.promptJournalProjects.ses_home?.[1]?.since,
  )
  replacement.resolve(openResult({ projection: projection("source-b") }))
  await app.waitForFrame((frame) => frame.includes("source-b"))
  expect(current().model.promptJournalProjects.ses_home?.map((project) => project.source)).toEqual([sourceA, sourceB])
  expect(current().model.promptJournalAdmissions.ses_home?.msg_queued_a?.projectID).toBe(projectA!.id)
  app.renderer.destroy()
})

test("preserves the active projection when an L5X import fails", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient({ importL5x: async () => Promise.reject(new Error("invalid L5X")) })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  await current().actions.importPlc("/project/Invalid.L5X")
  await app.flush()
  const display = current().model.display
  expect(firstRowID(display)).toBe("main")
  expect(current().model.projectionError).toBe("invalid L5X")
  app.renderer.destroy()
})

test("retains the visible project when a session replacement import fails", async () => {
  observed = undefined
  const sourceA = "/project/A.L5X"
  const sourceB = "/project/Invalid.L5X"
  const fake = createFakeEngiwareClient({
    importL5x: (source) =>
      source === sourceA
        ? Promise.resolve(openResult({ projection: projection("source-a") }))
        : Promise.reject(new Error("invalid L5X")),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))
  await current().actions.importPlc(sourceA, "ses_failure")
  await current().actions.importPlc(sourceB, "ses_failure")

  expect(current().model.projectSource).toBe(sourceA)
  expect(current().model.promptJournalProjects.ses_failure?.map((project) => project.source)).toEqual([
    sourceA,
    undefined,
  ])
  app.renderer.destroy()
})

test("serializes imports and suppresses projection actions during replacement", async () => {
  observed = undefined
  const imported = Promise.withResolvers<ReturnType<typeof openResult>>()
  const fake = createFakeEngiwareClient({
    importL5x: (source) => (source.endsWith("B.L5X") ? imported.promise : Promise.reject(new Error("invalid C"))),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  const sourceB = "/project/B.L5X"
  const sourceC = "/project/C.L5X"
  const importingB = current().actions.importPlc(sourceB)
  await app.flush()
  await current().actions.setMode("detail")
  const importingC = current().actions.importPlc(sourceC)
  expect(fake.calls.imports).toEqual([sourceB])
  expect(fake.calls.modes).toEqual([])

  imported.resolve(
    openResult({
      projection: projection("source-b"),
      status: { items: [{ label: "Source", value: sourceB }] },
    }),
  )
  await Promise.all([importingB, importingC])
  await app.flush()

  expect(fake.calls.imports).toEqual([sourceB, sourceC])
  const display = current().model.display
  expect(firstRowID(display)).toBe("source-b")
  const source = current().model.source
  expect(source.kind === "ready" ? source.data.items[0]?.value : undefined).toBe(sourceB)
  expect(current().model.projectionError).toBe("invalid C")
  app.renderer.destroy()
})

test("waits for an initial open before importing a replacement source", async () => {
  observed = undefined
  const opened = Promise.withResolvers<ReturnType<typeof openResult>>()
  const fake = createFakeEngiwareClient({
    open: () => opened.promise,
    importL5x: async () => Promise.reject(new Error("invalid replacement")),
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  const opening = current().actions.openPlc()
  await app.flush()
  const importing = current().actions.importPlc("/project/Invalid.L5X")
  expect(fake.calls.imports).toEqual([])
  opened.resolve(
    openResult({
      projection: projection("default-source"),
      status: { items: [{ label: "Source", value: "default" }] },
    }),
  )
  await Promise.all([opening, importing])
  await app.flush()

  expect(fake.calls.imports).toEqual(["/project/Invalid.L5X"])
  const display = current().model.display
  expect(firstRowID(display)).toBe("default-source")
  const source = current().model.source
  expect(source.kind === "ready" ? source.data.items[0]?.value : undefined).toBe("default")
  expect(current().model.projectionError).toBe("invalid replacement")
  app.renderer.destroy()
})

test("suppresses stale routine and mode responses after a newer selection move", async () => {
  observed = undefined
  const routine = Promise.withResolvers<ReturnType<typeof projection>>()
  const mode = Promise.withResolvers<ReturnType<typeof projection>>()
  const move = Promise.withResolvers<ReturnType<typeof projection>>()
  const fake = createFakeEngiwareClient({
    openRoutine: () => routine.promise,
    setMode: () => mode.promise,
    moveSelection: () => move.promise,
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  const oldRoutine = current().actions.openRoutine("routine:backup", { id: "backup" })
  const oldMode = current().actions.setMode("detail")
  const newestMove = current().actions.moveSelection("down")
  move.resolve(projection("newest"))
  await newestMove
  await app.waitForFrame((frame) => frame.includes("newest"))
  mode.resolve(projection("stale-mode"))
  routine.resolve(projection("stale-routine"))
  await Promise.all([oldRoutine, oldMode])
  await app.flush()

  const display = current().model.display
  expect(display.kind).toBe("ready")
  expect(firstRowID(display)).toBe("newest")
  expect(current().model.activeNavigationID).toBe("routine:main")
  app.renderer.destroy()
})

test("updates context from navigation selection without changing the active display", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  current().actions.selectNavigation("program")
  const context = current().model.context
  expect(context.kind).toBe("ready")
  expect(context.kind === "ready" ? context.data[0]?.title : undefined).toBe("Navigation Selection")
  expect(context.kind === "ready" ? context.data[0]?.entries : undefined).toEqual([
    { label: "Name", value: "Safety Program" },
    { label: "Kind", value: "program" },
  ])
  expect(current().model.activeNavigationID).toBe("routine:main")
  const display = current().model.display
  expect(firstRowID(display)).toBe("main")
  app.renderer.destroy()
})

test("ignores projection actions until startup opens the PLC", async () => {
  observed = undefined
  const opened = Promise.withResolvers<ReturnType<typeof openResult>>()
  const fake = createFakeEngiwareClient({ open: () => opened.promise })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  const opening = current().actions.openPlc()
  await app.flush()
  await current().actions.moveSelection("down")
  expect(fake.calls.moves).toEqual([])
  opened.resolve(openResult())
  await opening
  await app.waitForFrame((frame) => frame.includes("main"))
  expect(current().model.navigation.kind).toBe("ready")
  expect(current().model.source.kind).toBe("ready")
  app.renderer.destroy()
})

test("preserves newer navigation context when a projection request completes", async () => {
  observed = undefined
  const mode = Promise.withResolvers<ReturnType<typeof projection>>()
  const fake = createFakeEngiwareClient({ setMode: () => mode.promise })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  const request = current().actions.setMode("detail")
  expect(current().model.display.kind).toBe("ready")
  expect(current().model.context.kind).toBe("ready")
  expect(current().model.projectionPending).toBe(true)
  current().actions.selectNavigation("program")
  mode.resolve(projection("detail", { mode: "detail" }))
  await request
  await app.waitForFrame((frame) => frame.includes("detail"))
  const context = current().model.context
  expect(context.kind === "ready" ? context.data[0]?.title : undefined).toBe("Navigation Selection")
  expect(current().model.projectionPending).toBe(false)
  app.renderer.destroy()
})

test("preserves newer navigation context when a projection request fails", async () => {
  observed = undefined
  const mode = Promise.withResolvers<ReturnType<typeof projection>>()
  const fake = createFakeEngiwareClient({ setMode: () => mode.promise })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  const request = current().actions.setMode("detail")
  current().actions.selectNavigation("program")
  mode.reject(new Error("projection failed"))
  await request
  await app.flush()
  const display = current().model.display
  expect(display.kind).toBe("ready")
  expect(firstRowID(display)).toBe("main")
  expect(current().model.projectionPending).toBe(false)
  expect(current().model.projectionError).toBe("projection failed")
  const context = current().model.context
  expect(context.kind === "ready" ? context.data[0]?.title : undefined).toBe("Navigation Selection")
  app.renderer.destroy()
})

test("reconciles the active routine from the newest projection", async () => {
  observed = undefined
  const routine = Promise.withResolvers<ReturnType<typeof projection>>()
  const move = Promise.withResolvers<ReturnType<typeof projection>>()
  const fake = createFakeEngiwareClient({
    openRoutine: () => routine.promise,
    moveSelection: () => move.promise,
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  const open = current().actions.openRoutine("routine:backup", { id: "backup" })
  const moved = current().actions.moveSelection("down")
  move.resolve(projection("backup-move", { target: { navigationId: "routine:backup" } }))
  await moved
  routine.resolve(projection("stale-open", { target: { navigationId: "routine:backup" } }))
  await open
  await app.waitForFrame((frame) => frame.includes("backup-move"))
  expect(current().model.activeNavigationID).toBe("routine:backup")
  app.renderer.destroy()
})

test("does not reuse PLC state when the Ignition client is unavailable", async () => {
  observed = undefined
  const fake = createFakeEngiwareClient()
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={fake.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await openPlc(app)

  await current().actions.openIgnition()
  await app.flush()
  expect(current().model.view).toBe("ignition")
  expect(current().model.navigation).toEqual({ kind: "error", message: "Ignition domain client unavailable" })
  expect(current().model.display).toEqual({ kind: "error", message: "Ignition domain client unavailable" })
  app.renderer.destroy()
})

test("keeps the newest application during cross-workspace open races", async () => {
  observed = undefined
  const firstIgnition = Promise.withResolvers<ReturnType<typeof ignitionOpenResult>>()
  const plcOpen = Promise.withResolvers<ReturnType<typeof openResult>>()
  let ignitionRequests = 0
  const plc = createFakeEngiwareClient({ open: () => plcOpen.promise })
  const ignition = createFakeIgnitionClient({
    open: () => {
      ignitionRequests++
      return ignitionRequests === 1
        ? firstIgnition.promise
        : Promise.resolve(ignitionOpenResult({ projection: ignitionProjection("newest-ignition") }))
    },
  })
  const app = await testRender(() => (
    <EngiwareApplicationProvider client={plc.client} ignitionClient={ignition.client}>
      <Probe />
    </EngiwareApplicationProvider>
  ))
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("pending"))

  const oldIgnition = current().actions.openIgnition()
  await app.flush()
  const oldPlc = current().actions.openPlc()
  await app.flush()
  const newestIgnition = current().actions.openIgnition()
  firstIgnition.resolve(ignitionOpenResult({ projection: ignitionProjection("stale-ignition") }))
  plcOpen.resolve(openResult({ projection: projection("stale-plc") }))
  await Promise.all([oldIgnition, oldPlc, newestIgnition])
  await app.waitForFrame((frame) => frame.includes("newest-ignition"))

  expect(current().model.view).toBe("ignition")
  const display = current().model.display
  expect(firstRowID(display)).toBe("newest-ignition")
  expect(ignitionRequests).toBe(2)
  app.renderer.destroy()
})

function current() {
  if (!observed) throw new Error("Controller probe did not mount")
  return observed
}

async function openPlc(app: Awaited<ReturnType<typeof testRender>>) {
  await current().actions.openPlc()
  await app.waitForFrame((frame) => frame.includes("main"))
}
