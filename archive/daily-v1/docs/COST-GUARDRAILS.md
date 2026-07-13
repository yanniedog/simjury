# Cost guardrails

The whole point of this funnel is to be **near-zero cash burn** until it proves
itself. Cash burn target: **under US$100/month**, and realistically ~$0 for
hosting. This document is the checklist that keeps it there.

## The architecture that stays free

SimJury Daily is a **static single-page app** — HTML/CSS/JS built to `dist/` and
served from a CDN. There is **no server, no database, no runtime backend**. The
daily case is chosen client-side by date math (`src/lib/daily.ts`), and streaks
live in the browser's `localStorage`. That is a deliberate cost decision: static
sites are free to host at essentially any scale.

## Cloudflare Pages — free tier

Cloudflare Pages' free plan covers this project completely:

- **Unlimited requests and bandwidth** for static assets.
- **500 builds/month** (we push far less than ~16/day).
- **Custom domain + SSL** included.

**Do NOT enable any of the following** without a written decision — each can
incur charges or move you off the free plan:

- Cloudflare **Workers** (paid tier), **Durable Objects**
- **Workers KV**, **D1**, **R2**, **Queues**
- **Cloudflare Images** / Image Resizing
- **Pages Functions** beyond the free allotment (we use none — keep it static)
- **Load Balancing**, **Argo**, **Stream**

If a future feature seems to need one of these, first ask whether it can be done
client-side or at build time instead. It almost always can, for this product.

## Belt-and-braces

- **Do not add a payment method** to the Cloudflare account. On the free tier
  none is required, and with no card on file there is no way to accidentally be
  billed — usage simply stops at free limits rather than overflowing into spend.
- Deployment uses Cloudflare's **native Git integration** (dashboard → connect
  repo), not API tokens in CI, so there are no credentials that could provision
  billable resources.
- Builds trigger only on **push to `main`**, not on every branch, keeping build
  count low.

## The other line items

- **Domain:** ~US$10–15/year.
- **Analytics:** use **Cloudflare Web Analytics** (free, cookieless) for M0–M4.
  Plausible (~$9/mo) is an optional upgrade only if richer funnel/event data is
  needed — decide at M4, not before.
- **LLM content pipeline (M3):** batch generation is expected to run ~$5–15/week
  in API calls. This is the one genuinely variable cost; cap it by generating in
  scheduled weekly batches, not continuously.
- **GitHub Actions:** free minutes are ample for this small build; keep CI to a
  single lint/typecheck/test/build job (as it is) rather than a matrix.

## Review trigger

Re-read this file before: adding any Cloudflare product, adding a backend or
database, adding server-side rendering, or wiring analytics/API keys into CI.
