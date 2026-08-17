export const engiwareLogo = [
  "╻                               ╻",
  "┃   ╻                       ╻   ┃",
  "┃   ┃  █▀▀▀ █▄  █ ▄▀▀▀ ▀█▀  ┃   ┃",
  "┣━━━┫  █▀▀  █ █ █ █ ▄▄  █   ┣━❮ ┃",
  "┃   ┃  █▄▄▄ █  ▀█ ▀▄▄█ ▄█▄  ┃   ┃",
  "┃   ╹                       ╹   ┃",
  "┃   ┏                       ┓   ┃",
  "┃   ┃  █   █ ▄▀▀▄ █▀▀▄ █▀▀▀ ┃   ┃",
  "┃ ❯━┫  █ ▄ █ █▄▄█ █▄▄▀ █▀▀  ┣━━━┫",
  "┃   ┃  ▀▄▀▄▀ █  █ █  █ █▄▄▄ ┃   ┃",
  "┃   ┗                       ┛   ┃",
  "╹                               ╹",
] as const

export type EngiwareLogoRegion = "blue" | "white" | "shadow" | "circuit"

export function engiwareLogoRegion(row: number, column: number): EngiwareLogoRegion {
  if (column === 0 || column === 32) return "shadow"
  if (row === 3 && ((column >= 1 && column <= 3) || (column >= 29 && column <= 30))) return "blue"
  if (row >= 1 && row <= 5 && (column === 4 || column === 28)) return "blue"
  if (row >= 2 && row <= 4 && column >= 7 && column <= 25) return "blue"
  if (row === 8 && ((column >= 2 && column <= 3) || (column >= 29 && column <= 31))) return "white"
  if (row >= 6 && row <= 10 && (column === 4 || column === 28)) return "white"
  if (row >= 7 && row <= 9 && column >= 7 && column <= 26) return "white"
  return "circuit"
}
