import readline from "node:readline"

const mode = process.argv[2] ?? "normal"
const pidFile = process.argv[3]?.startsWith("--") ? undefined : process.argv[3]

if (pidFile) await Bun.write(pidFile, String(process.pid))

if (mode !== "silent-readiness") {
  process.stdout.write(
    JSON.stringify(
      mode === "malformed-readiness" ? { ready: true, protocolVersion: 2 } : { ready: true, protocolVersion: 1 },
    ) + "\n",
  )
}

process.on("SIGTERM", () => {
  void (async () => {
    if (pidFile) await Bun.write(pidFile + ".terminated", "SIGTERM")
    process.exit(0)
  })()
})

const projection = (label: string) => ({
  coordinateSystem: "terminal-cell-v1",
  mode: "summary",
  target: { navigationId: `routine:${label}` },
  rows: [{ id: label, segments: [{ text: label }] }],
  hits: [],
  context: [],
  status: { items: [] },
})

const ignitionProjection = (label: string, mode: "structure" | "source" = "structure") => ({
  coordinateSystem: "terminal-cell-v1",
  mode,
  target: { navigationId: `ignition:${label}` },
  rows: [{ id: label, segments: [{ text: label, style: mode === "source" ? "code" : "component" }] }],
  hits: [],
  context: [],
  status: { items: [] },
})

const engibookProjection = (label: string, scene = false) =>
  scene
    ? {
        coordinateSystem: "scene-v1",
        mode: "scene",
        target: { navigationId: "node:component:plc" },
        objectRefs: [{ snapshotId: "snapshot:panel", objectId: "component:plc" }],
        selectionRef: { snapshotId: "snapshot:panel", objectId: "component:plc" },
        context: [{ title: "Snapshot Object", entries: [{ label: "Name", value: label }] }],
        status: { items: [] },
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
    : {
        coordinateSystem: "source-v1",
        mode: "source",
        target: { navigationId: "node:panel:main" },
        objectRefs: [{ snapshotId: "snapshot:panel", objectId: "panel:main" }],
        selectionRef: { snapshotId: "snapshot:panel", objectId: "panel:main" },
        context: [{ title: "Snapshot Object", entries: [{ label: "Name", value: label }] }],
        status: { items: [] },
        displayName: label,
        mediaType: "text/markdown",
        languageId: "markdown",
        text: `# ${label}`,
      }

const engibookOpenResult = (label: string) => ({
  catalog: [
    {
      id: "node:panel:main",
      label: "Main Panel",
      kind: "panel",
      target: { id: "panel:main" },
      objectRef: { snapshotId: "snapshot:panel", objectId: "panel:main" },
    },
  ],
  tabs: [
    { id: "tab:overview", label: "Overview" },
    { id: "tab:front", label: "Front" },
  ],
  activeTabId: "tab:overview",
  module: { moduleId: "com.engiware.panel", moduleVersion: "0.1.0" },
  activeTarget: { id: "panel:main" },
  projection: engibookProjection(label),
  status: {
    items: [
      { label: "bundle", value: label },
      { label: "argv", value: JSON.stringify(process.argv.slice(3)) },
    ],
  },
})

const input = readline.createInterface({ input: process.stdin })
for await (const line of input) {
  const request = JSON.parse(line) as {
    id: string
    method: string
    params: Record<string, unknown>
  }
  if (request.method === "host.hello") {
    if (mode === "silent-hello") continue
    if (mode === "malformed-response") {
      process.stdout.write(JSON.stringify({ id: request.id }) + "\n")
      continue
    }
    process.stdout.write(JSON.stringify({ id: request.id, result: { protocolVersion: 1 } }) + "\n")
    continue
  }
  if (request.method === "plc.open") {
    process.stdout.write(
      JSON.stringify({
        id: request.id,
        result: { catalog: [], status: { items: [{ label: "host", value: "ready" }] } },
      }) + "\n",
    )
    continue
  }
  if (request.method === "plc.importL5x") {
    const source = String(request.params.source)
    if (mode === "malformed-result") {
      process.stdout.write(
        JSON.stringify({ id: request.id, result: { catalog: "invalid", status: { items: [] } } }) + "\n",
      )
      continue
    }
    process.stdout.write(
      JSON.stringify({
        id: request.id,
        result: {
          catalog: [{ id: "imported", label: source, kind: "controller" }],
          status: {
            items: [
              { label: "source", value: source },
              { label: "argv", value: JSON.stringify(process.argv.slice(3)) },
            ],
          },
        },
      }) + "\n",
    )
    continue
  }
  if (request.method === "plc.openRoutine") {
    const target = request.params.target as { id: string }
    setTimeout(
      () => process.stdout.write(JSON.stringify({ id: request.id, result: projection(target.id) }) + "\n"),
      target.id === "slow" ? 25 : 0,
    )
    continue
  }
  if (request.method === "plc.setMode") {
    if (mode === "exit-on-request") process.exit(7)
    process.stdout.write(JSON.stringify({ id: request.id, result: projection(String(request.params.mode)) }) + "\n")
    continue
  }
  if (request.method === "plc.close") {
    process.stdout.write(JSON.stringify({ id: request.id, result: null }) + "\n")
    setTimeout(() => process.exit(0), 10)
  }
  if (request.method === "ignition.open") {
    process.stdout.write(
      JSON.stringify({
        id: request.id,
        result: { catalog: [], status: { items: [{ label: "host", value: "ready" }] } },
      }) + "\n",
    )
    continue
  }
  if (request.method === "ignition.importProject") {
    const source = String(request.params.source)
    if (mode === "malformed-result") {
      process.stdout.write(
        JSON.stringify({ id: request.id, result: { catalog: "invalid", status: { items: [] } } }) + "\n",
      )
      continue
    }
    process.stdout.write(
      JSON.stringify({
        id: request.id,
        result: {
          catalog: [{ id: "project", label: source, kind: "project" }],
          status: {
            items: [
              { label: "source", value: source },
              { label: "argv", value: JSON.stringify(process.argv.slice(3)) },
            ],
          },
        },
      }) + "\n",
    )
    continue
  }
  if (request.method === "ignition.openResource") {
    const target = request.params.target as { id: string }
    process.stdout.write(JSON.stringify({ id: request.id, result: ignitionProjection(target.id) }) + "\n")
    continue
  }
  if (request.method === "ignition.setMode") {
    const projectionMode = request.params.mode as "structure" | "source"
    process.stdout.write(
      JSON.stringify({ id: request.id, result: ignitionProjection(projectionMode, projectionMode) }) + "\n",
    )
    continue
  }
  if (request.method === "ignition.selectAt") {
    process.stdout.write(JSON.stringify({ id: request.id, result: ignitionProjection("selection", "source") }) + "\n")
    continue
  }
  if (request.method === "ignition.close") {
    process.stdout.write(JSON.stringify({ id: request.id, result: null }) + "\n")
    setTimeout(() => process.exit(0), 10)
  }
  if (request.method === "engibook.open" || request.method === "engibook.load") {
    if (mode === "malformed-result") {
      process.stdout.write(
        JSON.stringify({ id: request.id, result: { catalog: "invalid", status: { items: [] } } }) + "\n",
      )
      continue
    }
    const label = request.method === "engibook.load" ? String(request.params.path) : "configured.engibook"
    process.stdout.write(JSON.stringify({ id: request.id, result: engibookOpenResult(label) }) + "\n")
    continue
  }
  if (request.method === "engibook.openTarget") {
    const target = request.params.target as { id: string }
    process.stdout.write(JSON.stringify({ id: request.id, result: engibookProjection(target.id, true) }) + "\n")
    continue
  }
  if (request.method === "engibook.openTab") {
    process.stdout.write(
      JSON.stringify({ id: request.id, result: engibookProjection(String(request.params.tabId), true) }) + "\n",
    )
    continue
  }
  if (request.method === "engibook.close") {
    process.stdout.write(JSON.stringify({ id: request.id, result: null }) + "\n")
    setTimeout(() => process.exit(0), 10)
  }
}
