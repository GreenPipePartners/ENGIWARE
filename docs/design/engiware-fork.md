# Engiware Fork Architecture and Change Summary

## Status

Engiware is a product fork of the OpenCode V2 beta branch. The fork keeps OpenCode as the authoritative agent and session platform while adding an engineering workspace to its terminal and web clients.

The initial fork is intentionally presentation-only. It does not yet integrate Flux Deep PLC, Flux Deep Schematics, Flux Panel, or Flux Build domain behavior.

## Source Lineage

- Upstream: `https://github.com/anomalyco/opencode.git`
- Upstream branch: `v2`
- Initial base commit: `66c29675202797b926d20c9c4cbe864e722c3c3a`
- Engiware branch: `engiware-wireframe`
- Intended fork repository: `https://github.com/GreenPipePartners/ENGIWARE`

OpenCode V1 compatibility packages are not the base for this work.

## Product Layout

The terminal session is divided into an upper engineering region and the existing OpenCode session region.

```text
+------------------------------------------------------------------+
| Navigation |              Engineering Display          | Context |
|            |                                           |         |
|            |                                           |         |
+------------------------------------------------------------------+
| Existing OpenCode transcript, tools, permissions, and composer   |
+------------------------------------------------------------------+
```

The upper engineering region receives approximately three quarters of the available session height. The native OpenCode session remains in the lower quarter. At narrow terminal widths, the side panes are hidden and the engineering display remains visible.

## EngiwareShell Boundary

`EngiwareShell` is the fork-owned boundary between OpenCode's session route and Engiware's engineering features.

```tsx
<EngiwareShell sessionID={route.sessionID} />
```

The OpenCode session route supplies only the active `sessionID`. It does not know which engineering application is active or how engineering data is rendered.

Current implementation:

- `packages/tui/src/engiware/shell/engiware-shell.tsx`
- Mounted by `packages/tui/src/routes/session/index.tsx`

### Navigation Pane

The left pane will own navigation within the active engineering application.

Examples include:

- PLC controllers, programs, routines, and rungs
- Schematic projects, sheets, and components
- Panel structures and devices
- Build projects and artifacts

The navigation UI should consume generic navigation nodes supplied by an application adapter. It should not embed PLC-specific or schematic-specific domain rules in the shell.

### Engineering Display

The middle pane is the active application view host.

Planned views include:

- PLC ladder and function-block display
- Schematic display
- Panel display
- Build and artifact display

Only one active application view is required initially. The shell will later select views through a small application-view registry rather than hard-coded conditionals in the OpenCode session route.

### Context Pane

The right pane will show and modify the context associated with the active engineering selection.

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
Application View Contract
        |
        +--> PLC Adapter --------> Flux Deep PLC authority
        +--> Schematics Adapter -> Flux Deep Schematics authority
        +--> Panel Adapter ------> Flux Panel authority
        +--> Build Adapter ------> Flux Build authority
```

Rules:

1. The OpenCode session route may import `EngiwareShell`, but it must not import application adapters.
2. `EngiwareShell` owns pane layout and responsive behavior, not engineering semantics.
3. Application adapters own application navigation, display projections, selections, and context generation.
4. OpenCode remains authoritative for sessions, messages, tools, permissions, questions, and forms.
5. Engiware must not duplicate OpenCode's transcript, composer, or session execution state.
6. Domain authority remains in each Flux application until a deliberate migration replaces it.

## Current Fork Changes

### Terminal Client

- Added a three-pane Engiware engineering shell above the native OpenCode session.
- Extracted that shell from the large OpenCode session route into `EngiwareShell`.
- Preserved the native OpenCode transcript, tools, permission/form prompts, queue behavior, and composer.
- Added responsive behavior that hides Navigation and Context below 64 columns.
- Added the Flux Deep PLC text logo above the OpenCode logo on the initial screen.
- Added OpenCode-inspired structural coloring to that logo.
- Added the attribution text `Adapted from the amazing` above the OpenCode logo.

### Web Client Prototype

- Added matching Projects, Engiware Workspace, and Context wireframes above the existing web session.
- Preserved the existing web session as a nested black-box view.
- Added a 256-pixel minimum session height for usability.
- Added desktop and narrow-width browser regression coverage.

The web layout is still a prototype and has not yet been extracted into the same application-view architecture as the terminal shell.

### Tests

- Added direct `EngiwareShell` wide and narrow layout tests.
- Added Engiware logo visibility and character-frame tests.
- Added session lifecycle assertions proving the Engiware regions render around a real session.
- Added web browser assertions for desktop and narrow responsive layouts.

## Deliberately Not Implemented

- Project or engineering navigation data
- PLC rendering
- Schematic rendering
- Panel or Build application views
- Python domain-host process management
- Selection or context state
- Context attachment to model prompts
- Editing or domain mutation
- New OpenCode server APIs

## Next Architecture Step

Define the smallest application-view contract before migrating a tree or viewer.

The first contract should describe only:

- Application identity and capabilities
- Generic navigation nodes
- Active view identity
- Read-only display projection
- Stable selection identity
- Context preview supplied by the application

The first implementation should then exercise that contract with one narrow PLC vertical slice without adding PLC concepts to `EngiwareShell`.
