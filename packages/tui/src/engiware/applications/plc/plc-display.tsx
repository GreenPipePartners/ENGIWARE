import { ProjectionDisplay } from "../projection-display"
import { useEngiwareApplication } from "../../application/provider"

export function PlcDisplay() {
  const controller = useEngiwareApplication()
  return <ProjectionDisplay application="plc" onSelect={controller.actions.selectPlcAt} />
}
