#!/usr/bin/env bun

import { lstat, readdir, readlink } from "node:fs/promises"
import path from "node:path"

const ignoredDirectories = new Set([
  ".git",
  ".mypy_cache",
  ".nox",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".turbo",
  ".venv",
  "__pycache__",
  "dist",
  "node_modules",
])

const lockPath = path.join(import.meta.dir, "sources.lock.json")
const command = process.argv[2]
const workspaceFlag = process.argv.indexOf("--workspace-root")
const workspaceRoot = workspaceFlag === -1 ? undefined : process.argv[workspaceFlag + 1]

if ((command !== "check" && command !== "write") || !workspaceRoot) {
  console.error("usage: source-lock.ts <check|write> --workspace-root <path>")
  process.exit(64)
}

const root = path.resolve(workspaceRoot)
const lock = (await Bun.file(lockPath).json()) as {
  version: number
  sources: { path: string; sha256: string }[]
}
if (lock.version !== 1) throw new Error(`Unsupported source lock version: ${lock.version}`)

const resolved = [] as typeof lock.sources
for (const source of lock.sources) {
  const directory = path.resolve(root, source.path)
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Source escapes workspace root: ${source.path}`)
  }
  if (!(await Bun.file(path.join(directory, "pyproject.toml")).exists())) {
    throw new Error(`Python source is unavailable: ${source.path}`)
  }
  resolved.push({ path: source.path, sha256: await digest(directory) })
}

if (command === "write") {
  await Bun.write(lockPath, `${JSON.stringify({ version: 1, sources: resolved }, null, 2)}\n`)
  console.log(`Updated ${path.relative(process.cwd(), lockPath)}`)
  process.exit(0)
}

const mismatches = resolved.filter((source, index) => source.sha256 !== lock.sources[index]?.sha256)
if (mismatches.length) {
  for (const source of mismatches) {
    const expected = lock.sources.find((item) => item.path === source.path)?.sha256 || "<missing>"
    console.error(`${source.path}: expected ${expected}, received ${source.sha256}`)
  }
  console.error("Run source-lock.ts write after reviewing intentional source changes.")
  process.exit(1)
}

console.log(`Verified ${resolved.length} EngiCode source trees`)

async function digest(rootDirectory: string) {
  const hash = new Bun.CryptoHasher("sha256")

  async function visit(directory: string, prefix: string) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return false
        if (entry.isDirectory() && entry.name.endsWith(".egg-info")) return false
        if (entry.isFile() && entry.name.endsWith(".pyc")) return false
        return true
      })
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))

    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        hash.update(`directory\0${relative}\0`)
        await visit(absolute, relative)
        continue
      }
      if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relative}\0${await readlink(absolute)}\0`)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported source entry: ${absolute}`)
      const stat = await lstat(absolute)
      hash.update(`file\0${relative}\0${stat.mode & 0o111 ? "executable" : "regular"}\0${stat.size}\0`)
      hash.update(new Uint8Array(await Bun.file(absolute).arrayBuffer()))
      hash.update("\0")
    }
  }

  await visit(rootDirectory, "")
  return hash.digest("hex")
}
