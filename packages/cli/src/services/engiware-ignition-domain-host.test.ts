import { expect, test } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { decodeCommand, start } from "./engiware-ignition-domain-host"

const fixture = path.join(import.meta.dir, "../../test/fixture/engiware-domain-host.ts")

test("does not launch Ignition without sidecar configuration", async () => {
  expect(await Effect.runPromise(Effect.scoped(start({})))).toBeUndefined()
})

test("starts an import-ready Ignition sidecar and validates projections", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "normal"] })
        if (!client) throw new Error("Expected Engiware Ignition domain client")
        const source = "/project/Example.gwbk"
        const imported = yield* Effect.promise(() => client.ignition.importProject(source))
        expect(imported.catalog[0]?.kind).toBe("project")
        expect(imported.status.items[0]?.value).toBe(source)

        const view = yield* Effect.promise(() => client.ignition.openResource({ id: "view:main" }))
        expect(view.mode).toBe("structure")
        const code = yield* Effect.promise(() => client.ignition.setMode("source"))
        expect(code.mode).toBe("source")
      }),
    ),
  )
})

test("passes a configured startup source and rejects malformed DTOs", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const source = "/project/Configured.gwbk"
        const client = yield* start({ source, command: [process.execPath, fixture, "normal"] })
        if (!client) throw new Error("Expected Engiware Ignition domain client")
        const result = yield* Effect.promise(() => client.ignition.importProject(source))
        expect(result.status.items[1]?.value).toContain("--source")
        expect(result.status.items[1]?.value).toContain(source)
      }),
    ),
  )

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "malformed-result"] })
        if (!client) throw new Error("Expected Engiware Ignition domain client")
        const error = yield* Effect.promise(() =>
          client.ignition.importProject("/project/Invalid.gwbk").catch((cause) => cause),
        )
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain("catalog")
      }),
    ),
  )
})

test("accepts only JSON command arrays for the Ignition host", () => {
  expect(decodeCommand('["uv", "run", "host"]')).toEqual(["uv", "run", "host"])
  expect(() => decodeCommand("uv run host")).toThrow()
})
