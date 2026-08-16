const securityHeaders = {
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.hostname === "www.engiware.org") {
      url.hostname = "engiware.org"
      return Response.redirect(url, 308)
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { ...securityHeaders, allow: "GET, HEAD" },
      })
    }

    const key = objectKey(url.pathname)
    if (!key) return new Response("Invalid path\n", { status: 400, headers: securityHeaders })

    const options = {
      onlyIf: request.headers,
    }
    if (request.headers.has("range")) options.range = request.headers
    const object = await env.SITE.get(key, options)
    if (!object) return new Response("Not found\n", { status: 404, headers: securityHeaders })

    const headers = new Headers(securityHeaders)
    object.writeHttpMetadata(headers)
    headers.set("accept-ranges", "bytes")
    headers.set("cache-control", cacheControl(key))
    headers.set("etag", object.httpEtag)
    headers.set("content-type", headers.get("content-type") ?? contentType(key))

    if (!("body" in object)) return new Response(null, { status: 304, headers })
    const partial = request.headers.has("range") && object.range
    if (partial) {
      headers.set("content-length", String(object.range.length))
      headers.set(
        "content-range",
        `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`,
      )
    } else {
      headers.set("content-length", String(object.size))
    }
    if (key.endsWith(".html")) {
      headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action mailto:",
      )
    }

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: partial ? 206 : 200,
      headers,
    })
  },
}

function objectKey(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return
  }
  if (decoded.split("/").includes("..")) return
  const key = decoded.replace(/^\/+/, "")
  if (!key) return "index.html"
  if (key === "enterprise" || key === "legal/privacy-policy" || key === "legal/terms-of-service") {
    return `${key}/index.html`
  }
  return key.endsWith("/") ? `${key}index.html` : key
}

function cacheControl(key) {
  if (/^releases\/v[^/]+\//.test(key)) return "public, max-age=31536000, immutable"
  return "no-cache"
}

function contentType(key) {
  if (key.endsWith(".html")) return "text/html; charset=utf-8"
  if (key.endsWith(".ps1") || key === "install" || key.endsWith("/version") || key.endsWith("SHA256SUMS")) {
    return "text/plain; charset=utf-8"
  }
  if (key.endsWith(".tar.gz")) return "application/gzip"
  if (key.endsWith(".exe")) return "application/vnd.microsoft.portable-executable"
  if (key.endsWith(".png")) return "image/png"
  if (key.endsWith(".svg")) return "image/svg+xml"
  if (key.endsWith(".css")) return "text/css; charset=utf-8"
  if (key.endsWith(".js")) return "text/javascript; charset=utf-8"
  return "application/octet-stream"
}
