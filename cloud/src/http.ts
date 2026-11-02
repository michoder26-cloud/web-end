export const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
}

// Owner links hold a secret, so they must not leak to other sites or search engines.
export const privateHeaders = { ...securityHeaders, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }

export const html = (body: string, status = 200, headers: Record<string, string> = securityHeaders) =>
  new Response(body, {
    headers: { ...headers, 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
    status,
  })

export const notFound = () => html('<!doctype html><meta charset="utf-8"><title>Not found</title><h1>Page not found</h1>', 404)

export const see = (url: URL, path: string, cookie?: string) =>
  new Response(null, {
    headers: { 'Cache-Control': 'no-store', Location: `${url.origin}${path}`, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
    status: 303,
  })

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
