/**
 * SimJury site Worker — www → apex redirect, then static assets with security headers.
 * The Worker runs on every request (assets.run_worker_first), so setting headers here
 * guarantees they apply to every response. If the Worker is ever removed in favour of a
 * zone Redirect Rule + pure static assets, move these headers to a `public/_headers` file.
 * @param {Request} request
 * @param {{ ASSETS: { fetch: (request: Request) => Promise<Response> } }} env
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
  // Static marketing site: allow self + Google Fonts; deny framing; keep inline (no user input).
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' for styles only — required for inline style attributes (progress/seat widths).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'www.simjury.com') {
      url.hostname = 'simjury.com';
      return Response.redirect(url.toString(), 301);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  },
};
