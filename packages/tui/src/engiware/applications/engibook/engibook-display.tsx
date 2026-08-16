import { Match, Switch } from "solid-js"
import { useTheme } from "../../../context/theme"
import { useEngiwareApplication } from "../../application/provider"
import { useEngiwareContextRecorder } from "../../context/recorder"
import type {
  EngiwareCatalogNode,
  EngiwareObjectReference,
  EngiwareSceneProjection,
  EngiwareSourceProjection,
} from "../../domain/client"
import { ProjectionDisplay } from "../projection-display"
import { SceneDisplay } from "../scene-display"
import { SourceDisplay } from "../source-display"

export function EngibookDisplay() {
  const controller = useEngiwareApplication()
  const recorder = useEngiwareContextRecorder()
  const theme = useTheme()
  const projection = () => (controller.model.display.kind === "ready" ? controller.model.display.data : undefined)
  const sourceProjection = (): EngiwareSourceProjection | undefined => {
    const current = projection()
    return current?.coordinateSystem === "source-v1" ? current : undefined
  }
  const sceneProjection = (): EngiwareSceneProjection | undefined => {
    const current = projection()
    return current?.coordinateSystem === "scene-v1" ? current : undefined
  }
  const open = (reference: EngiwareObjectReference) =>
    controller.actions.openEngibookTarget("", { id: reference.objectId })
  const record = async (reference: EngiwareObjectReference) => {
    await open(reference)
    const nodes = controller.model.navigation.kind === "ready" ? controller.model.navigation.data : []
    const node = findReference(nodes, reference)
    const sections = controller.model.context.kind === "ready" ? controller.model.context.data : []
    recorder.record({
      moduleID: controller.model.activeModuleID ?? "engibook",
      label: node?.label ?? reference.objectId,
      reference,
      sections,
    })
  }

  return (
    <box id="engiware-engibook-display" flexGrow={1} minHeight={0}>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} flexShrink={0}>
        <text fg={theme.text.subdued} wrapMode="none">
          {status(controller.model.projectionPending, controller.model.projectionError)}
        </text>
      </box>
      <Switch>
        <Match when={sourceProjection()}>
          {(current) => <SourceDisplay id="engiware-engibook-source" projection={current()} />}
        </Match>
        <Match when={sceneProjection()}>
          {(current) => (
            <SceneDisplay
              id="engiware-engibook-scene"
              projection={current()}
              onSelect={open}
              onRecordContext={record}
            />
          )}
        </Match>
        <Match when={projection()?.coordinateSystem === "terminal-cell-v1"}>
          <ProjectionDisplay application="engibook" onSelect={() => Promise.resolve()} />
        </Match>
        <Match when={!projection()}>
          <box flexGrow={1} alignItems="center" justifyContent="center" padding={1}>
            <text fg={theme.text.subdued} wrapMode="word">
              {controller.model.display.kind === "ready"
                ? "Unsupported Engibook projection"
                : controller.model.display.message}
            </text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}

function status(pending: boolean, error: string | undefined) {
  if (pending) return "Read-only Engibook | updating"
  if (error) return `Read-only Engibook | ${error}`
  return "Read-only Engibook | immutable snapshot"
}

function findReference(
  nodes: readonly EngiwareCatalogNode[],
  reference: EngiwareObjectReference,
): EngiwareCatalogNode | undefined {
  return nodes.reduce<EngiwareCatalogNode | undefined>(
    (result, node) =>
      result ??
      (node.objectRef?.snapshotId === reference.snapshotId && node.objectRef.objectId === reference.objectId
        ? node
        : findReference(node.children ?? [], reference)),
    undefined,
  )
}
