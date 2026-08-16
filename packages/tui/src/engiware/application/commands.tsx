import { Keymap } from "../../context/keymap"
import path from "node:path"
import { homedir } from "node:os"
import { useEngiwareApplication } from "./provider"

export const ENGIWARE_APPLICATIONS = [
  { command: "engibook", name: "Engibook", detail: "Immutable cross-domain engineering review" },
  { command: "plc", name: "PLC", detail: "Recovery ladder and controller context" },
  { command: "ignition", name: "Ignition / SCADA", detail: "Designer tree, views, scripts, and named queries" },
  { command: "schematics", name: "Schematics", detail: "Electrical drawings and source context" },
  { command: "panels", name: "Panels", detail: "Panel layout and hardware context" },
  { command: "build", name: "Build", detail: "Engineering build and artifact workflows" },
  { command: "opencode", name: "OpenCode", detail: "Expand the general coding interface" },
] as const

export function EngiwareCommands(props: { baseDirectory: string }) {
  const controller = useEngiwareApplication()

  Keymap.createLayer(() => ({
    mode: "global",
    commands: [
      {
        id: "engiware.engibook",
        title: "Open Engibook workspace",
        description: "Use /engibook or /engibook <bundle>",
        group: "Engiware",
        palette: true,
        slash: { name: "engibook", aliases: ["book"], arguments: true },
        run: async (input) => {
          const argument = input?.trim()
          const action = argument?.toLowerCase()
          if (action === "menu") {
            controller.actions.showMenu()
            return
          }
          if (action === "opencode") {
            controller.actions.showOpenCode()
            return
          }
          if (argument) {
            await controller.actions.loadEngibook(resolveSource(argument, props.baseDirectory))
            return
          }
          await controller.actions.openEngibook()
        },
      },
      {
        id: "engiware.plc",
        title: "Open PLC workspace",
        description: "Use /plc, /plc summary, or /plc detail",
        group: "Engiware",
        palette: true,
        slash: { name: "plc", arguments: true },
        run: async (input) => {
          const argument = input?.trim()
          const action = argument?.toLowerCase()
          if (action === "menu") {
            controller.actions.showMenu()
            return
          }
          if (action === "opencode") {
            controller.actions.showOpenCode()
            return
          }
          if (argument && action !== "summary" && action !== "detail") {
            await controller.actions.importPlc(resolveSource(argument, props.baseDirectory))
            return
          }
          await controller.actions.openPlc()
          if (action === "summary" || action === "detail") await controller.actions.setMode(action)
        },
      },
      {
        id: "engiware.ignition",
        title: "Open Ignition workspace",
        description: "Use /ignition or /ignition <backup|export>",
        group: "Engiware",
        palette: true,
        slash: { name: "ignition", aliases: ["scada", "displays"], arguments: true },
        run: async (input) => {
          const argument = input?.trim()
          const action = argument?.toLowerCase()
          if (action === "menu") {
            controller.actions.showMenu()
            return
          }
          if (action === "opencode") {
            controller.actions.showOpenCode()
            return
          }
          if (argument && action !== "source" && action !== "structure") {
            await controller.actions.importIgnition(resolveSource(argument, props.baseDirectory))
            return
          }
          await controller.actions.openIgnition()
          if (action === "source" || action === "structure") await controller.actions.setIgnitionMode(action)
        },
      },
      {
        id: "engiware.menu",
        title: "Open engineering menu",
        group: "Engiware",
        palette: true,
        slash: { name: "engineering", arguments: true },
        run: () => controller.actions.showMenu(),
      },
      {
        id: "engiware.plc.summary",
        title: "Show PLC summary projection",
        group: "Engiware",
        palette: true,
        slash: { name: "summary", aliases: ["plc-summary"], arguments: true },
        run: async () => {
          await controller.actions.openPlc()
          await controller.actions.setMode("summary")
        },
      },
      {
        id: "engiware.plc.detail",
        title: "Show PLC detail projection",
        group: "Engiware",
        palette: true,
        slash: { name: "detail", aliases: ["plc-detail"], arguments: true },
        run: async () => {
          await controller.actions.openPlc()
          await controller.actions.setMode("detail")
        },
      },
      {
        id: "engiware.ignition.structure",
        title: "Show Ignition view structure",
        group: "Engiware",
        palette: true,
        slash: { name: "structure", aliases: ["ignition-structure"], arguments: true },
        run: async () => {
          await controller.actions.openIgnition()
          await controller.actions.setIgnitionMode("structure")
        },
      },
      {
        id: "engiware.ignition.source",
        title: "Show Ignition resource source",
        group: "Engiware",
        palette: true,
        slash: { name: "source", aliases: ["ignition-source"], arguments: true },
        run: async () => {
          await controller.actions.openIgnition()
          await controller.actions.setIgnitionMode("source")
        },
      },
      {
        id: "engiware.opencode",
        title: "Expand OpenCode workspace",
        group: "Engiware",
        palette: true,
        slash: { name: "opencode", arguments: true },
        run: () => controller.actions.showOpenCode(),
      },
      {
        id: "engiware.context",
        title: "Toggle Context pane",
        description: "Use /context, /context show, or /context hide",
        group: "Engiware",
        palette: true,
        slash: { name: "context", arguments: true },
        run: (input) => {
          const action = input?.trim().toLowerCase()
          if (action === "show" || action === "on") {
            controller.actions.setContextVisible(true)
            return
          }
          if (action === "hide" || action === "off") {
            controller.actions.setContextVisible(false)
            return
          }
          controller.actions.setContextVisible(!controller.model.contextVisible)
        },
      },
      ...ENGIWARE_APPLICATIONS.filter(
        (application) => !["engibook", "plc", "ignition", "opencode"].includes(application.command),
      ).map((application) => ({
        id: `engiware.${application.command}`,
        title: `Open ${application.name}`,
        group: "Engiware",
        palette: true as const,
        slash: { name: application.command, arguments: true as const },
        run: () => controller.actions.showUnavailable(application.name),
      })),
    ],
  }))

  return null
}

function resolveSource(input: string, baseDirectory: string) {
  const quote = input[0]
  const value = (quote === '"' || quote === "'") && input.at(-1) === quote ? input.slice(1, -1) : input
  const expanded = value === "~" ? homedir() : value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : value
  return path.resolve(baseDirectory, expanded)
}
