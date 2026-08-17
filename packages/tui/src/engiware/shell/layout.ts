export const MIN_WORKSPACE_PERCENT = 30
export const MAX_WORKSPACE_PERCENT = 80

export function workspaceSidePanesFit(availableWidth: number) {
  return availableWidth >= 64
}

export function moveWorkspaceDivider(workspacePercent: number, direction: "up" | "down", step: number) {
  const next = workspacePercent + (direction === "down" ? step : -step)
  return Math.min(MAX_WORKSPACE_PERCENT, Math.max(MIN_WORKSPACE_PERCENT, next))
}
