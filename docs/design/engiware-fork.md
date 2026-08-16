# Engiware Fork Architecture and Change Summary

## Status

Engiware is a product fork of the OpenCode V2 beta branch. The fork keeps OpenCode as the authoritative agent and session platform while adding an engineering workspace to its terminal and web clients.

The terminal client includes a read-only PLC recovery-browser slice backed by an optional Engiware domain client. `/plc <file>` can build a temporary recovery index from any valid local L5X and replace the active PLC atomically. Flux Deep PLC remains the domain authority; Schematics, Panel, Build, editing, and context attachment are not integrated.

## Source Lineage

- Upstream: `https://github.com/anomalyco/opencode.git`
- Upstream branch: `v2`
- Initial base commit: `66c29675202797b926d20c9c4cbe864e722c3c3a`
- Engiware branch: `engiware-v2`
- Intended fork repository: `https://github.com/GreenPipePartners/ENGIWARE`

OpenCode V1 compatibility packages are not the base for this work.

## Product Layout

Home retains the centered Engiware/OpenCode logo and always-focused composer. It does not show the engineering menu unless an application such as PLC is explicitly requested.

When a generic prompt enters a terminal Session without selecting an engineering application, the engineering region shows a fallback menu inside the same Project Tree, Engineering Workstation, and Context panes used by every application. Project Tree shows recent projects, Engineering Workstation shows six command-backed options (PLC, Schematics, Displays, Panels, Build, and OpenCode), and Context explains the current selection or unavailable adapter. Clicking an option injects its slash command and returns focus to the composer rather than opening the application immediately.

After `/plc`, the terminal session is divided into an upper engineering region and the existing OpenCode session region.

```text
+------------------------------------------------------------------+
| Project Tree |          Engineering Workstation        | Context |
|            |                                           |         |
|            |                                           |         |
+------------------------------------------------------------------+
| Existing OpenCode transcript, tools, permissions, and composer   |
+------------------------------------------------------------------+
```

The expanded engineering region receives approximately three quarters of the available session height. The native OpenCode session remains in the lower quarter. At narrow terminal widths, the side panes are hidden and the engineering display remains visible. `/opencode` collapses engineering to a one-line restore header so native OpenCode receives the remaining space; `/engineering` restores the launcher.

## EngiwareShell Boundary

`EngiwareShell` is the fork-owned module selector between OpenCode routes and Engiware's engineering features. First-class pane containers and the workspace module contract sit below it.

```tsx
<EngiwareShell sessionID={route.sessionID} recentProjects={recentProjects()} />
```

OpenCode routes supply layout inputs such as the renderable ID, recent-project presentation, and available width. They do not know which engineering application is active or how engineering data is rendered.

Current implementation:

- `packages/tui/src/engiware/shell/engiware-shell.tsx`
- `packages/tui/src/engiware/shell/workspace.tsx`
- `packages/tui/src/engiware/application/module.ts`
- Mounted conditionally by `packages/tui/src/routes/home.tsx` after explicit PLC intent
- Mounted by `packages/tui/src/routes/session/index.tsx`

### Project Tree Pane

The left pane owns navigation within the active engineering application.

Examples include:

- PLC controllers, programs, routines, and rungs
- Schematic projects, sheets, and components
- Panel structures and devices
- Build projects and artifacts

The navigation UI should consume generic navigation nodes supplied by an application adapter. It should not embed PLC-specific or schematic-specific domain rules in the shell.

### Engineering Workstation

The middle pane is the active application view host. Its module interface owns target activation, display rendering, and header actions. The current PLC view renders domain-supplied terminal rows and segments and delegates selection and mode changes to the domain client.

Planned views include:

- PLC ladder and function-block display
- Schematic display
- Panel display
- Build and artifact display

The shell selects first-party menu, PLC, and Ignition workspace modules through the same `EngiwareWorkspaceModule` interface. Adding another first-party application requires a module adapter rather than new pane framing or route conditionals.

### Context Pane

The right pane currently shows read-only context and source/authority status associated with the active engineering projection.

Planned responsibilities include:

- Inspecting selected engineering objects
- Adding or removing objects from model context
- Showing application-provided context previews
- Displaying context resolution status

The context pane must not independently interpret engineering semantics. The active application adapter owns selection meaning and context generation.

## Dependency Rules

The intended direction is:

```text
OpenCode Session Route
        |
        v
EngiwareShell
        |
        v
First-Class Pane Containers
        |
        v
EngiwareWorkspaceModule
        |
        +--> PLC Adapter --------> Flux Deep PLC authority
        +--> Ignition Adapter ---> Flux Deep Ignition authority
        +--> Schematics Adapter -> Flux Deep Schematics authority
        +--> Panel Adapter ------> Flux Panel authority
        +--> Build Adapter ------> Flux Build authority
```

Rules:

1. OpenCode Home and Session routes may import `EngiwareShell`, but they must not import application adapters.
2. First-class pane containers own frame/header layout and responsive behavior, not engineering semantics.
3. Workspace modules own application navigation, workstation activation/display/actions, selections, and Context rendering.
4. OpenCode remains authoritative for sessions, messages, tools, permissions, questions, and forms.
5. Engiware must not duplicate OpenCode's transcript, composer, or session execution state.
6. Domain authority remains in each Flux application until a deliberate migration replaces it.

## Current Fork Changes

### Terminal Client

- Restored the centered logo/composer Home intro while keeping engineering slash commands available.
- Added a recent-project and six-context Session fallback menu using the standard three-pane frame.
- Added a lazy three-pane PLC shell that opens only through explicit prompt/slash intent.
- Added `/plc <file>` path resolution and atomic Flux Deep L5X import without requiring a startup recovery index.
- Extracted that shell from the large OpenCode session route into `EngiwareShell`.
- Preserved the native OpenCode transcript, tools, permission/form prompts, queue behavior, and composer.
- Kept engineering panes non-focusable and moved projection modes to local slash commands.
- Added clickable Summary/Detail workstation labels and a clickable `/context` header with toggleable Context visibility.
- Added a collapsed engineering header that lets native OpenCode reclaim the session height.
- Added responsive behavior that hides Project Tree and Context below 64 columns.
- Preserved the Flux Deep PLC and OpenCode logos in expanded OpenCode Home mode.
- Added OpenCode-inspired structural coloring to that logo.
- Added the attribution text `Adapted from the amazing` above the OpenCode logo.

### Web Client Prototype

- Added matching Projects, Engiware Workspace, and Context wireframes above the existing web session.
- Preserved the existing web session as a nested black-box view.
- Added a 256-pixel minimum session height for usability.
- Added desktop and narrow-width browser regression coverage.

The web layout is still a prototype and has not yet been extracted into the same application-view architecture as the terminal shell.

### Tests

- Added direct launcher, composer-focus, lazy-open, slash-command, mouse-interaction, and responsive shell tests.
- Added Engiware logo visibility and character-frame tests.
- Added session lifecycle assertions proving the Engiware regions render around a real session.
- Added web browser assertions for desktop and narrow responsive layouts.

## Deliberately Not Implemented

- PLC semantic inference in the TUI
- Schematic rendering
- Panel or Build application views
- Context attachment to model prompts
- Editing or domain mutation
- New OpenCode server APIs

## Implemented PLC Slice

The first application boundary is now exercised by the read-only PLC recovery browser. It keeps generic pane/controller state in Engiware, process lifecycle in the CLI, and PLC semantics in Flux Deep without adding PLC rules to `EngiwareShell` or the OpenCode session route.

The exact function, interface, protocol, ownership, and verification map is documented in:

- `docs/design/engiware-plc-recovery-browser.md`
- `docs/design/engiware-plc-recovery-browser.excalidraw`

Future application adapters should preserve this dependency direction while defining only the additional capabilities their vertical slice requires.
