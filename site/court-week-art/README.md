# Reviewed Court Week art source

This tree is GitHub-reviewed production input. It is deliberately outside
`site/public/`, so unfinished future-day artwork cannot ship through Cloudflare
Static Assets or become a pre-unlock production URL.

Each commissioned scene owns portrait, tablet and desktop AVIF/WebP sources
under `cw-0001/scenes/<scene-id>/`. The trusted manual media workflow validates
these files, combines them into chronological two-scene strips and publishes
only opaque content-addressed strip assets. Do not add raw prompts, discarded
variants, contact sheets or generator working files here.

The existing Monday copies under `site/app/public/media/` remain only as a
temporary device-speech review fallback. They are removed when the complete
immutable media manifest is pinned; future-day sources must never be copied
into that public tree.
