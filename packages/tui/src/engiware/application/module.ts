import type { Component } from "solid-js"
import type { EngiwareCatalogTarget } from "../domain/client"

export type EngiwareTargetActivation = (navigationID: string, target: EngiwareCatalogTarget) => Promise<void>

export type EngiwareWorkstationHeaderAction = {
  readonly id: string
  readonly label: string
  readonly command: string
  readonly active?: () => boolean
}

export type EngiwareWorkstationTab = {
  readonly id: string
  readonly label: string
  readonly active: () => boolean
  readonly activate: () => void | Promise<void>
  readonly comparisonRole?: "original" | "modified"
}

export type EngiwareWorkspaceModule = {
  readonly id: string
  readonly ProjectTree: Component<{
    readonly onActivate: EngiwareTargetActivation
    readonly onRecordContext?: EngiwareTargetActivation
  }>
  readonly workstation: {
    readonly Component: Component
    readonly openTarget: EngiwareTargetActivation
    readonly tabs?: () => readonly EngiwareWorkstationTab[]
    readonly headerActions?: () => readonly EngiwareWorkstationHeaderAction[]
  }
  readonly recordTarget?: EngiwareTargetActivation
  readonly Context: Component
}
