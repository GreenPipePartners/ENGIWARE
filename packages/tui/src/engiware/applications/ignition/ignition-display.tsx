import { ProjectionDisplay } from "../projection-display"
import { useEngiwareApplication } from "../../application/provider"

export function IgnitionDisplay() {
  const controller = useEngiwareApplication()
  return <ProjectionDisplay application="ignition" onSelect={controller.actions.selectIgnitionAt} />
}
