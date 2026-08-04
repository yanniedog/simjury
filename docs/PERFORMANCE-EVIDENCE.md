# Court Week performance evidence

The release gate measures the production build, not Vite development modules.
Run `npm run build && npm run test:performance` from `site/app`.

The deterministic gate covers a Pixel 7a-sized Chromium context with 4x CPU
throttling, 1.6 Mbps download throughput, 750 Kbps upload throughput and 150 ms
latency. It records evidence as a Playwright attachment and enforces:

- LCP at or below 2.5 seconds and CLS at or below 0.05 for the first screen;
- no more than 1 MB transferred before that screen settles;
- no more than 350 KB gzip-compressed JavaScript across the whole build;
- a playable first session within five seconds of `Take your seat`; and
- no more than the current and next scene identity transferred, with one live
  stage image element.

`PerformanceResourceTiming.transferSize` is used so the browser's actual wire
transfer is tested. A zero-sized cached response cannot mask a regression:
Playwright creates a fresh context and blocks service workers.

Browser APIs do not expose decoded-image memory or reliable production INP for
a synthetic one-interaction journey. The gate therefore proves the stricter
observable proxy (one live stage image and at most two scene identities on the
network). INP, audio startup, seven-session transfer, decoded-memory residency
and real-device behaviour remain physical/release-profile measurements rather
than claims made by this automated check.
