/**
 * Base URL for server-to-self API calls made during SSR (e.g. a page's data
 * fetch hitting `/api/scenes`). These must go over loopback, not the public
 * host: a server-side fetch sends no `Origin` header and would otherwise carry
 * the external host, tripping the scenes API's auth gate on an exposed instance.
 * Loopback is covered by that API's loopback exemption, so it needs no token.
 * Client-facing absolute URLs still use the request host — this is only for the
 * server talking to itself on the same box.
 */
export function internalApiBase(): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL
  }
  const port = process.env.PORT ?? '3000'
  return `http://127.0.0.1:${port}`
}
