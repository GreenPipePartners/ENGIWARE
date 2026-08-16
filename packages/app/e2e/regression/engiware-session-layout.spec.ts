import { expect, test, type Locator, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/EngiwareSessionLayout"
const sessionID = "ses_engiware_session_layout"
const title = "Engiware session layout"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test("shows the Engiware wireframes above the compact session", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 })
  await openSession(page)

  const layout = page.locator('[data-component="engiware-session-layout"]')
  const projects = layout.locator('[data-slot="projects"]')
  const workspace = layout.locator('[data-slot="workspace"]')
  const context = layout.locator('[data-slot="context"]')
  const session = layout.locator('[data-slot="session"]')

  await expect(projects).toBeVisible()
  await expect(projects).toContainText("Projects")
  await expect(workspace).toBeVisible()
  await expect(workspace).toContainText("Engiware")
  await expect(context).toBeVisible()
  await expect(context).toContainText("Context")
  await expect(session).toBeVisible()
  await expectSessionQuarter(layout, session)
})

test("keeps only the Engiware workspace wireframe at narrow widths", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 })
  await openSession(page)

  const layout = page.locator('[data-component="engiware-session-layout"]')
  await expect(layout.locator('[data-slot="projects"]')).toBeHidden()
  await expect(layout.locator('[data-slot="workspace"]')).toBeVisible()
  await expect(layout.locator('[data-slot="context"]')).toBeHidden()
  await expect
    .poll(async () => (await layout.locator('[data-slot="session"]').boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(256)
})

async function openSession(page: Page) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory,
    project: {
      id: "proj_engiware_session_layout",
      worktree: directory,
      vcs: "git",
      name: "engiware-session-layout",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: "engiware-session-layout",
        projectID: "proj_engiware_session_layout",
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
}

async function expectSessionQuarter(layout: Locator, session: Locator) {
  await expect
    .poll(async () => {
      const layoutBox = await layout.boundingBox()
      const sessionBox = await session.boundingBox()
      if (!layoutBox || !sessionBox) return false
      const ratio = sessionBox.height / layoutBox.height
      return ratio >= 0.24 && ratio <= 0.26
    })
    .toBe(true)
}
