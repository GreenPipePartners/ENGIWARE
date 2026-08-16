import { expect, test } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { decodeCommand, start } from "./engiware-engibook-host"

const fixture = path.join(import.meta.dir, "../../test/fixture/engiware-domain-host.ts")

test("does not launch the Engibook host without configuration", async () => {
  expect(await Effect.runPromise(Effect.scoped(start({})))).toBeUndefined()
})

test("starts an Engibook host and validates source and scene projections", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const bundle = "/project/panel.engibook"
        const client = yield* start({ bundle, command: [process.execPath, fixture, "normal"] })
        if (!client) throw new Error("Expected Engiware Engibook client")

        const opened = yield* Effect.promise(() => client.engibook.open())
        expect(opened.module.moduleId).toBe("com.engiware.panel")
        expect(opened.projection?.coordinateSystem).toBe("source-v1")
        expect(opened.status.items[1]?.value).toContain("--engibook")
        expect(opened.status.items[1]?.value).toContain(bundle)

        const tab = yield* Effect.promise(() => client.engibook.openTab("tab:front"))
        expect(tab.coordinateSystem).toBe("scene-v1")
        const target = yield* Effect.promise(() => client.engibook.openTarget({ id: "component:plc" }))
        expect(target.selectionRef?.objectId).toBe("component:plc")
      }),
    ),
  )
})

test("loads another bundle and rejects malformed Engibook DTOs", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "normal"] })
        if (!client) throw new Error("Expected Engiware Engibook client")
        const loaded = yield* Effect.promise(() => client.engibook.load("/project/other.engibook"))
        expect(loaded.status.items[0]?.value).toBe("/project/other.engibook")
      }),
    ),
  )

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* start({ command: [process.execPath, fixture, "malformed-result"] })
        if (!client) throw new Error("Expected Engiware Engibook client")
        const error = yield* Effect.promise(() => client.engibook.open().catch((cause) => cause))
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain("catalog")
      }),
    ),
  )
})

test("accepts only JSON command arrays for the Engibook host", () => {
  expect(decodeCommand('["uv", "run", "host"]')).toEqual(["uv", "run", "host"])
  expect(() => decodeCommand("uv run host")).toThrow()
})
