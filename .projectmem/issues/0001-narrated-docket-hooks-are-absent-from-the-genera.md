# #0001 Narrated docket hooks are absent from the generated neural narration manifest, so every hook clip returns 404 and falls back to device speech

- 2026-07-23T10:43:20Z `issue`: Narrated docket hooks are absent from the generated neural narration manifest, so every hook clip returns 404 and falls back to device speech [site/scripts/generate-narration-manifest.mjs]
- 2026-07-23T10:45:00Z `attempt`: Added narrator hook lines to the generated neural corpus and a manifest regression test [site/scripts/generate-narration-manifest.mjs] (partial)
- 2026-07-23T10:45:19Z `attempt`: Ran Worker regression suite after adding hook manifest entry; generation was blocked by EPERM on narration-manifest.generated.js [site/src/narration-manifest.generated.js] (failed)
- 2026-07-23T10:45:40Z `attempt`: Regenerated the narration corpus and passed all 5 Worker tests; the expected dd-0000 hook id is present [site/scripts/generate-narration-manifest.mjs] (worked)
- 2026-07-23T10:45:40Z `fix`: Hook lines are now generated into the neural narration manifest and covered by a Worker regression test [site/scripts/generate-narration-manifest.mjs]
