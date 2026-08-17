import { engiwareLogo } from "../engiware/logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
const green = "\x1b[32m"

function wordmark(pad = "") {
  return engiwareLogo.map((line) => `${pad}${green}${line}${reset}`)
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}opencode2 -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
