// Only allow data:image base64 (png/jpg/gif/webp/svg) or http(s) URLs as <img>
// srcs — mirrors the original `safeDisplayImageSrc` (chatRenderer.js) so a
// malformed/javascript: screenshot or generated-image src can't render.
const SAFE_IMAGE_SRC_RE = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i

export function safeImageSrc(raw: unknown): string {
  const src = String(raw ?? "").trim()
  if (!src) return ""
  if (SAFE_IMAGE_SRC_RE.test(src)) return src
  try {
    const parsed = new URL(src, window.location.origin)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href
  } catch { /* not a url */ }
  return ""
}

// Allowed schemes for an anchor href (sources box, citations). Anchors DO
// execute javascript: / data:text/html on click, so unlike img src we must
// reject those. Allow http/https/mailto and same-origin relative paths.
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:"])
export function safeHref(raw: unknown): string {
  const href = String(raw ?? "").trim()
  if (!href) return ""
  try {
    const parsed = new URL(href, window.location.origin)
    return SAFE_HREF_PROTOCOLS.has(parsed.protocol) ? parsed.href : ""
  } catch { /* not a url */ }
  return ""
}