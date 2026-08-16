# Engiware PLC Recovery Browser

## Status

Engiware now contains a live, read-only PLC recovery browser backed by Flux Deep. It replaces the static AMGT project-tree and display prototype in the production TUI.

The Home route retains the original centered Engiware/OpenCode logo and composer. After a generic prompt enters a Session without selecting an engineering application, the fallback menu appears inside the same Project Tree, Engineering Workstation, and Context panes used by PLC and future adapters.

The implemented slice provides:

- Live controller, Program, AOI, and routine catalog navigation
- Import of an arbitrary local L5X through `/plc <file>` without a prebuilt recovery index
- Read-only RLL terminal projections in summary and detail modes
- Domain-owned mouse component selection with composer-owned slash commands for projection modes
- Selected-component context and recovered source/authority status
- Optional startup with a stable degraded UI when the domain host is unavailable

Editing, execution, FBD display, model-prompt attachment, and context mutation are deliberately outside this slice.

The companion architecture diagram is `docs/design/engiware-plc-recovery-browser.excalidraw`.

## Ownership

The integration keeps four boundaries explicit:

| Owner                       | Responsibility                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OpenCode V2                 | Sessions, transcript, composer, tools, permissions, questions, and forms                                        |
| Engiware shell and provider | Launcher/layout state, generic navigation state, request orchestration, and rendering typed DTOs                |
| Engiware CLI                | Python child-process lifetime, NDJSON transport, request correlation, and graceful degradation                  |
| Flux Deep                   | Recovery-index interpretation, PLC meaning, stable IDs, ladder rendering, selection, context, and source status |

Engiware does not parse L5X, infer ladder semantics, calculate power flow, or invent context. Flux Deep does not own OpenCode session state or terminal pane layout.

## Runtime Flow

```text
OpenCode default CLI handler
  -> EngiwareDomainHost.start()
  -> flux-deep-domain-host --recovery-index <absolute path>
  -> readiness + host.hello
  -> TuiInput.engiware: EngiwareDomainClient | undefined
  -> EngiwareApplicationProvider defaults to no selected application
  -> Home renders centered logo + composer
  -> Session renders the three-pane fallback menu
  -> /plc, /plc <file>, or an explicit open-PLC/L5X prompt on either route
       -> host.hello -> plc.open or plc.importL5x
       -> NavigationPane / NavigationTreeView
       -> PlcDisplay
       -> ContextPane
  -> EngiwareShell above the unchanged OpenCode session region
```

The CLI changes to the requested working directory before resolving configuration. Relative recovery-index and Flux Deep project paths therefore resolve against the effective CLI directory.

### Configuration

| Variable                           | Purpose                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ENGIWARE_PLC_RECOVERY_INDEX`      | Optional default recovery index used by bare `/plc`.                                                    |
| `ENGIWARE_FLUX_DEEP_PROJECT`       | Uses `uv run --project <path> --extra mine flux-deep-domain-host` when no explicit command is supplied. |
| `ENGIWARE_PLC_DOMAIN_HOST_COMMAND` | Optional JSON array containing the executable and arguments. It is not shell-split.                     |

The sidecar starts when a recovery index, explicit command, or Flux Deep project is configured. A project/command alone creates an import-ready host with no default PLC source. Without a custom command or project, a configured recovery index uses `flux-deep-domain-host`; that installed command must come from a `flux-deep[mine]` environment. The CLI appends `--recovery-index <absolute-path>` only when an index is configured.

Host startup failure is logged as a warning and the TUI receives `undefined`. All four provider states then render `Engiware domain client unavailable`; OpenCode remains usable.

Readiness and the initial CLI-owned hello each have a 15-second deadline. The programmatic `Options.startupTimeoutMs` seam allows deterministic tests to use a shorter deadline without adding another environment variable.

## Function And Interface Map

### OpenCode Composition

| File                                                 | Symbol                     | Role                                                                                                               |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/commands/handlers/default.ts`      | default `Runtime.handler`  | Resolves the normal OpenCode server, starts the optional domain host, and injects `engiware` into `run(...)`.      |
| `packages/tui/src/app.tsx`                           | `TuiInput.engiware`, `run` | Accepts the optional client and mounts `EngiwareApplicationProvider` above the route subtree for the TUI lifetime. |
| `packages/tui/src/routes/home.tsx`                   | `Home`                     | Preserves the centered logo/composer intro, registers commands, and shows PLC only after explicit intent.          |
| `packages/tui/src/routes/session/index.tsx`          | `Session`                  | Mounts command registration and `EngiwareShell` above the existing OpenCode transcript/composer region.            |
| `packages/tui/src/engiware/application/commands.tsx` | `EngiwareCommands`         | Registers application and projection slash commands independently from visible shell layout.                       |
| `packages/tui/src/engiware/shell/engiware-shell.tsx` | `EngiwareShell`            | Selects the active workspace module or collapsed-OpenCode layout.                                                  |
| `packages/tui/src/engiware/shell/workspace.tsx`      | first-class containers     | Owns Project Tree, Engineering Workstation, Context frames, headers, and module-slot wiring.                       |
| `packages/tui/src/engiware/application/module.ts`    | workspace module contract  | Separates project-tree rendering, workstation target activation/display/actions, and Context rendering.            |

`EngiwareShell` receives a renderable ID, recent-project display data, and a project-open callback. Its Session fallback renders recents in Project Tree, command-injection options in Engineering Workstation, and guidance or unavailable-adapter status in Context. Domain calls and PLC state remain TUI-lifetime state and are not scoped to an OpenCode session.

### First-Class Workspace Containers

`ProjectTreeContainer`, `EngineeringWorkstationContainer`, and `ContextContainer` are exported independently from `packages/tui/src/engiware/shell/workspace.tsx`. `EngiwareWorkspaceContainer` composes them and owns only responsive side-pane visibility.

Each `EngiwareWorkspaceModule` supplies:

- A `ProjectTree` component that receives an explicit `onActivate(navigationID, target)` interface.
- A workstation component, optional header actions, and `openTarget`, which is wired directly to the Project Tree activation interface.
- A Context component.

This makes the dependency path explicit:

```text
ProjectTree module -> onActivate -> workstation.openTarget
Workstation module -> projection renderer + header actions
Context module -> application-supplied context projection
```

The fallback menu, PLC, and Ignition/SCADA are separate module adapters in `packages/tui/src/engiware/applications/*/workspace-module.tsx`. `EngiwareShell` does not import their display, tree, or Context components directly.

### CLI Process And Transport

`packages/cli/src/services/engiware-domain-host.ts` exports:

| Symbol                 | Contract                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `Options`              | Optional default `recoveryIndex`, command argument array, `fluxDeepProject`, and startup timeout.      |
| `decodeCommand(input)` | Decodes a JSON non-empty string array and rejects blank entries.                                       |
| `start(options?)`      | Resolves configuration, returns `undefined` when disabled, or creates a scoped `EngiwareDomainClient`. |

The internal client:

- Spawns the host with piped stdin, stdout, and stderr.
- Requires `{"ready":true,"protocolVersion":1}` as the first stdout line.
- Performs `host.hello` before returning the client.
- Assigns incrementing string request IDs and correlates concurrent responses with a pending map.
- Serializes complete queue writes and enforces 1 MiB request and 32 MiB response line limits.
- Requires exactly one result or error in every response and fails all pending calls on malformed protocol data, unknown IDs, stdout closure, or process exit.
- Decodes complete open/import/projection result DTOs before exposing them to the TUI provider.
- Sends `plc.close`, waits up to one second, closes stdin, sends `SIGTERM`, and permits a forced kill after three seconds.
- Registers shutdown as an Effect scope finalizer. Repeated close calls share one promise.

The provider performs a second `host.hello` before the first explicit `plc.open`. The first CLI handshake validates the spawned process; the second begins the lazily requested application session.

### Domain Client DTOs

`packages/tui/src/engiware/domain/client.ts` is the transport-neutral TypeScript boundary. `packages/tui/src/index.tsx` re-exports it for CLI consumption.

| Type                                            | Purpose                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `EngiwareDomainClient`                          | Typed methods for the eight host operations.                                                                    |
| `EngiwareCatalogNode` / `EngiwareCatalogTarget` | Generic recursive navigation and stable activation target.                                                      |
| `EngiwarePlcOpenResult`                         | Initial catalog, active target, optional projection, and source status.                                         |
| `EngiwarePlcProjection`                         | Authoritative target, terminal-cell rows, segments, hit regions, selected component, context, mode, and status. |
| `EngiwareContextSection`                        | Ordered read-only label/value context supplied by the domain.                                                   |
| `EngiwareStatus`                                | Ordered source or projection status items.                                                                      |

The TypeScript projection intentionally consumes only fields needed by this UI. Flux Deep may return additional producer metadata such as dimensions, routine details, errors, executable state, and editable state.

### Provider And Controller

`packages/tui/src/engiware/application/contracts.ts` defines:

- `PaneState<Data>` as explicit `loading`, `empty`, `error`, or `ready` state.
- `EngiwareControllerModel` for menu/PLC/OpenCode view state, Context visibility, navigation, display, context, source, projection activity, selected/active IDs, and expanded IDs.
- `EngiwareControllerActions` for application switching, Context visibility, submitted-prompt observation, local selection/expansion, and remote routine, movement, mode, and point-selection operations.

`EngiwareApplicationProvider` in `packages/tui/src/engiware/application/provider.tsx` owns this state once for the TUI lifetime. It starts in `menu` and makes no PLC protocol request. `/plc`, `/summary`, `/detail`, or a normal-mode submitted request such as “Can you please open this L5X?” runs this deduplicated open sequence. Shell-mode submissions do not change engineering context.

1. Call `host.hello`.
2. Call `plc.open`.
3. Store catalog and source status.
4. Match `activeTarget.id` against node target IDs.
5. Select the active routine, or the first top-level node when no active target matches.
6. Expand controller/group branches and every ancestor of the active routine.
7. Apply the initial projection and context when supplied.

`/plc <file>` preserves the raw argument's case and embedded spaces, removes one matching pair of outer quotes, expands `~`, and resolves a relative path against the active Home or Session directory. It then calls `plc.importL5x` even when another PLC is already active. A successful import atomically replaces catalog/projection state; a failed replacement retains the previous ready panes and exposes the error only in projection status.

Local navigation selection changes `selectedNavigationID` and shows a `Navigation Selection` context section. It does not open a routine, replace the active projection, or directly change `activeNavigationID`; accepted domain projections reconcile the active routine from their target.

Projection actions are ignored until `plc.open` succeeds. All later projection-changing actions share a monotonically increasing generation. The last dispatched routine, mode, movement, or point-selection request is the only response allowed to update display state. Stale successes and failures are discarded, and cleanup invalidates every outstanding callback. An in-flight projection sets only `projectionPending`; it does not replace ready display/context panes with loading placeholders. This prevents layout jitter during clicks.

Each projection carries `target.navigationId`, so the latest accepted response also reconciles `activeNavigationID` after overlapping routine and selection/mode calls. Navigation context has a separate revision: selecting a newer tree node prevents an older in-flight projection from replacing that node's context without preventing the projection itself from updating the workstation.

### Pane Components

| File                                                              | Symbol                      | Interface and responsibility                                                                                                 |
| ----------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/tui/src/engiware/shell/workspace.tsx`                   | three container components  | Standard frames and headers with independently supplied children and command callbacks.                                      |
| `packages/tui/src/engiware/applications/plc/workspace-module.tsx` | PLC workspace module        | Binds PLC Project Tree activation to `openRoutine`, `PlcDisplay`, mode actions, and `ContextPane`.                           |
| `packages/tui/src/engiware/navigation/navigation-pane.tsx`        | `NavigationPane`            | Converts mouse input into generic selection, expansion, and routine activation without taking composer focus.                |
| `packages/tui/src/engiware/navigation/tree.ts`                    | tree types and pure helpers | Finds, flattens, moves, parents, expands, and collapses generic nodes without PLC rules.                                     |
| `packages/tui/src/engiware/navigation/tree-view.tsx`              | `NavigationTreeView`        | Controlled mouse renderer for rows, selected/active IDs, expansion, and callbacks.                                           |
| `packages/tui/src/engiware/applications/plc/plc-display.tsx`      | `PlcDisplay`                | Renders stable domain rows/segments, maps styles, routes mouse selection, and reveals selection vertically and horizontally. |
| `packages/tui/src/engiware/context/context-pane.tsx`              | `ContextPane`               | Renders source/authority status independently from ordered read-only context sections; shell state can hide the pane.        |

Below 64 available content columns, Project Tree and Context are not mounted. Engineering Workstation remains visible. The shell receives the Session width after vertical tab/sidebar reservations rather than using the full terminal width.

## Domain Protocol

Flux Deep exposes a bounded synchronous NDJSON host in `src/flux_deep/domain_host.py`. Each request and response occupies one UTF-8 line.

```json
{"id":"1","method":"plc.open","params":{}}
{"id":"1","result":{"catalog":[],"status":{"items":[]}}}
```

Errors use `{"id":"1","error":{"code":"...","message":"..."}}`.

| Operation           | Parameters                                        | Result                                                         |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `host.hello`        | `{ protocolVersion: 1 }`                          | Host name, protocol version, and operations                    |
| `plc.open`          | `{}`                                              | Catalog, active target, initial projection, and source status  |
| `plc.importL5x`     | `{ source: "/absolute/controller.L5X" }`          | Imported catalog, active target, projection, and source status |
| `plc.openRoutine`   | `{ target: { id } }`                              | Updated projection                                             |
| `plc.setMode`       | `{ mode: "summary" or "detail" }`                 | Updated projection                                             |
| `plc.moveSelection` | `{ direction: "left", "right", "up", or "down" }` | Updated projection                                             |
| `plc.selectAt`      | `{ point: { row, cell } }`                        | Updated projection                                             |
| `plc.close`         | `{}`                                              | `null`                                                         |

The host rejects unknown fields and parameters, duplicate JSON keys, non-finite numbers, invalid UTF-8, escaped invalid Unicode scalar values, unsupported protocol versions, malformed or oversized lines, and operations requiring a session before `plc.open`. A missing terminal LF ends the service after an `unterminated-request` response. The host serially dispatches requests; the CLI client still correlates by ID and supports out-of-order implementations and test fixtures.

Requests are limited to 1 MiB. Responses are independently limited to 32 MiB so bounded recovery catalogs and terminal projections are not constrained by the much smaller command envelope. If even an error cannot fit the response budget, the host emits a small `response-line-too-large` envelope rather than terminating during error serialization.

Responses use compact native UTF-8 JSON rather than ASCII escape expansion, so the byte ceiling remains aligned with the recovery catalog's UTF-8 text bound.

## Flux Deep Function Map

### Domain Host

`src/flux_deep/domain_host.py` owns the process boundary:

| Symbol                          | Role                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `main(argv)`                    | Accepts an optional `--recovery-index` and connects binary stdio to `serve`.                       |
| `serve(...)`                    | Emits readiness, reads bounded request lines, dispatches operations, and writes bounded responses. |
| `_DomainHost.dispatch(request)` | Strictly validates envelopes and selects one of eight handlers.                                    |
| `_DomainHost._open()`           | Lazily creates one `RecoveryBrowserSession`; repeated opens reuse it.                              |
| `_DomainHost._import_l5x()`     | Builds and validates a candidate temporary recovery, then atomically swaps active sessions.        |
| `_DomainHost._close()`          | Discards the session and is valid even before open.                                                |

The `flux-deep-domain-host` console script is declared in `pyproject.toml`. The host emits readiness before loading any source. A configured recovery index loads at `plc.open`; an import-ready host instead requires `plc.importL5x` before bare `plc.open`.

L5X import uses Flux.mine through the existing lazy adapter. The host builds into a private temporary recovery directory, constructs the complete candidate `RecoveryBrowserSession` and response DTO, then swaps active state. Build, catalog-validation, or initial-projection failures remove the candidate and leave the previous source usable. The active temporary index remains available for lazy routine loads and is removed on replacement or host shutdown.

### Recovery Browser

`src/flux_deep/plc/recovery_browser.py` is a Textual-free state machine for one immutable recovery index.

Owner and routine navigation IDs contain full SHA-256 digests of their source names. They remain deterministic without repeating potentially long owner names into every descendant ID, keeping admitted catalog DTOs within the response budget.

| Symbol                                  | Role                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `RecoveryBrowserSession.__init__`       | Loads the catalog, builds stable navigation maps, selects the initial RLL routine, and activates it. |
| `catalog_dto()`                         | Produces controller/Program/AOI/routine navigation and recovered-source status.                      |
| `state_dto()`                           | Produces the active read-only projection, hits, context, status, and errors.                         |
| `open_routine(id)`                      | Validates and activates a routine while remembering selection per routine.                           |
| `set_mode(mode)`                        | Renders summary or detail from cached recovery evidence.                                             |
| `move_selection(direction)`             | Applies domain-owned spatial component movement.                                                     |
| `select_at(row, cell)`                  | Selects only an unambiguous component hit at a terminal-cell point.                                  |
| `_load_routine(...)`                    | Lazily loads routine inventory and source evidence once per routine.                                 |
| `_render_active()` / `_render_dto(...)` | Calls the ladder renderer and converts text spans into styled rows and hit regions.                  |
| `_context_dto()`                        | Builds selected-component source, power, authority, and editability context.                         |

Supporting domain authorities are:

- `src/flux_deep/plc/mine_recovery.py` for typed catalogs, routine inventories, evidence, and integrity checks.
- `src/flux_deep/plc/adapters/mine_recovery.py` for the lazy Flux.mine bridge.
- `src/flux_deep/ladder/render_terminal.py` for deterministic summary/detail ladder text, spans, placements, and recovered power styles.

## Projection And Selection Rules

The coordinate system is `terminal-cell-v1`:

- Rows and cells are zero-based.
- Hit regions are half-open: `[startCell, endCell)`.
- Accepted characters occupy exactly one terminal cell.
- Control, format, surrogate, combining, wide, and full-width characters are rejected.
- Every component ID is stable across projection mode changes and routine revisits.

Style precedence is `selected > energized > component > wire > plain`. Engiware maps selected segments to focused primary colors, energized segments to success, wire segments to subdued text, and all remaining segments to default text.

Flux Deep owns selection behavior:

- Initial selection is the first rendered component.
- Left/right moves among components on the same visual row in rendered horizontal-anchor order and does not wrap.
- Up/down moves to the nearest horizontal anchor on the previous or next occupied row and does not wrap.
- Mouse selection changes state only when a point maps to exactly one component.
- Selection is remembered per routine and retained across summary/detail rerenders when the component still exists.

`PlcDisplay` recomputes each rendered segment's start cell with terminal display width before calling `plc.selectAt`. It sizes horizontal content in the same cell coordinate system and scrolls the selected hit into view. It does not derive the selected component or inspect ladder instructions.

## Interaction Map

The OpenCode composer remains the focused editor. Engineering panes are not focusable and register no letter or arrow key layers.

| Input or action                                 | Behavior                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Session fallback-menu card click                | Inject `/{menu-option}` into the composer and refocus it; Enter executes the local command. |
| `/plc`                                          | Open the lazy PLC workspace.                                                                |
| `/plc <file>`                                   | Resolve the local path and import its L5X into a new active PLC workspace.                  |
| `/plc summary`, `/summary`, or `/plc-summary`   | Open PLC if needed, then call `plc.setMode("summary")`.                                     |
| `/plc detail`, `/detail`, or `/plc-detail`      | Open PLC if needed, then call `plc.setMode("detail")`.                                      |
| Workstation `Summary` or `Detail` header click  | Inject `/summary` or `/detail` into the composer without moving focus.                      |
| Context header click                            | Inject `/context` into the composer without moving focus.                                   |
| `/context`                                      | Toggle Context; `/context show` and `/context hide` set visibility explicitly.              |
| `/engineering`                                  | Restore the main engineering menu.                                                          |
| `/opencode`                                     | Collapse engineering to a one-line header and expand native OpenCode.                       |
| `/schematics`, `/displays`, `/panels`, `/build` | Keep the launcher visible and report that the deferred adapter is unavailable.              |
| Navigation row mouse click                      | Select and toggle a branch or activate a routine without taking composer focus.             |
| PLC segment mouse click                         | Call `plc.selectAt({ row, cell })` without taking composer focus.                           |

## Verification Map

Focused Engiware coverage:

| File                                                       | Coverage                                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/services/engiware-domain-host.test.ts`   | Disabled startup, command decoding, readiness/hello deadlines, concurrent ID correlation, malformed envelopes, child exit, scope cleanup, and idempotent close |
| `packages/tui/test/engiware/application-provider.test.tsx` | Lazy open/import, failed-import preservation, prompt intent, active-node reconciliation, stable panes, and stale-response suppression                          |
| `packages/tui/test/engiware/engiware-shell.test.tsx`       | Launcher/recents, slash routing, clickable header injection, Context toggle, live/degraded panes, mouse selection, and responsive layout                       |
| `packages/tui/test/engiware/plc-display.test.tsx`          | No typing-key capture, terminal-cell mouse selection, and horizontal selected-component reveal                                                                 |
| `packages/tui/test/engiware/navigation-tree.test.ts`       | Pure flattening, lookup, movement, parent/child, and expansion rules                                                                                           |
| `packages/tui/test/engiware/workspace-containers.test.tsx` | Independent container slots, header commands, responsive mounting, and Project Tree-to-workstation activation wiring                                           |
| `packages/tui/test/engiware/workspace-layout.test.ts`      | Exact 63/64-column side-pane boundary                                                                                                                          |
| `packages/tui/test/app-lifecycle.test.tsx`                 | Main-menu startup and real composer focus retention around the unchanged OpenCode lifecycle                                                                    |

Focused Flux Deep coverage:

| File                               | Coverage                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/test_recovery_browser.py`   | Catalog/IDs, serializable projection DTOs, styles, visual-order movement, mode/routine selection retention, hits, lazy cache, split protocol bounds, and complete host flow |
| `tests/test_ladder_terminal.py`    | Summary/detail rendering, exact spans, power propagation, topology, operand numbering, controls, and bounds                                                                 |
| `tests/test_package_boundaries.py` | Domain boundaries and lazy Flux.mine/Textual imports                                                                                                                        |

The implementation verification completed successfully with Flux Deep Ruff, the complete Flux Deep suite, Python source and wheel builds, TUI and CLI typechecks, focused TUI/session and CLI sidecar tests, a real AMGT recovery-index smoke test, and the Linux x64 Engiware build. Exact final counts are recorded with the verification run rather than treated as architecture constraints.

## Deferred Boundaries

The following require separate designs rather than extensions hidden inside this browser slice:

- PLC editing, write authority, validation, and persistence
- PLC runtime execution or online-controller state
- FBD, ST, or SFC rendering
- Attaching or removing engineering context from model prompts
- Schematic, Panel, or Build application adapters
- Host restart, reconnection, and capability negotiation
- A shared application-view registry for terminal and web clients
