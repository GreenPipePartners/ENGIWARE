import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const output = path.join(path.dirname(fileURLToPath(import.meta.url)), "site", "legal")
const policies = [
  {
    slug: "terms-of-service",
    component: "terms-of-service",
    title: "Terms of Service",
    description: "OpenCode terms of service mirrored for EngiWare",
  },
  {
    slug: "privacy-policy",
    component: "privacy-policy",
    title: "Privacy Policy",
    description: "OpenCode privacy policy mirrored for EngiWare",
  },
]

await Promise.all(
  policies.map(async (policy) => {
    const source = `https://opencode.ai/legal/${policy.slug}`
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Unable to fetch ${source}: ${response.status}`)
    const html = await response.text()
    const start = html.indexOf(`<article data-component="${policy.component}">`)
    const end = html.indexOf("</article>", start)
    if (start < 0 || end < 0) throw new Error(`Unable to locate the legal article at ${source}`)
    const article = html.slice(start, end + "</article>".length).replace(/href="\/(?!legal\/)/g, 'href="https://opencode.ai/')
    const directory = path.join(output, policy.slug)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "index.html"), page(policy, source, article))
  }),
)

function page(policy, source, article) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${policy.description}" />
    <meta name="theme-color" content="#07110e" />
    <link rel="icon" href="/logo.png" type="image/png" />
    <link rel="stylesheet" href="/legal/legal.css" />
    <title>EngiWare | ${policy.title}</title>
  </head>
  <body>
    <div class="page">
      <header class="site-header">
        <nav class="nav" aria-label="Primary navigation">
          <a class="brand" href="/" aria-label="EngiWare home"><img class="brand-logo" src="/logo.png" width="763" height="406" alt="EngiWare" /></a>
          <button class="menu-toggle" type="button" aria-label="Open navigation" aria-controls="site-menu" aria-expanded="false"><span></span><span></span><span></span></button>
          <div class="nav-links" id="site-menu">
            <a href="/">Home</a>
            <a href="https://github.com/GreenPipePartners/ENGIWARE">GitHub</a>
            <a href="/legal/privacy-policy">Privacy</a>
            <a href="/legal/terms-of-service">Terms</a>
          </div>
        </nav>
      </header>
      <main class="legal-shell">
        <aside class="mirror-notice">
          <strong>OpenCode legal policy</strong>
          <p>EngiWare integrates OpenCode. The policy below is mirrored from Anomaly Innovations, Inc. without changing its legal text. <a href="${source}">View the official OpenCode version.</a></p>
        </aside>
        ${article}
      </main>
      <footer class="footer">
        <p>EngiWare is built on OpenCode by Green Pipe Partners.</p>
        <div class="footer-links"><a href="https://github.com/GreenPipePartners/ENGIWARE">GitHub</a><a href="/legal/privacy-policy">Privacy</a><a href="/legal/terms-of-service">Terms</a></div>
      </footer>
    </div>
    <script src="/legal/legal.js" defer></script>
  </body>
</html>
`
}
