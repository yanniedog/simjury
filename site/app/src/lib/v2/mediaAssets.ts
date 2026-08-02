/**
 * Where a case's authored media actually lives at runtime.
 *
 * Cases author every asset under `/today/…`, which is where the site Worker
 * serves the built app from. `vite dev` and `vite preview` serve from `/`
 * instead (see vite.config.ts), so the authored prefix has to be swapped for
 * whatever base this bundle was built with.
 *
 * This existed inline in CaseMedia and nowhere else, so SpeakerPortrait passed
 * `asset.src` through raw and every speaker and juror portrait was broken in
 * development — alt text where a face should be. Production only worked because
 * the base happened to equal the authored prefix.
 */
export function mediaAssetSrc(src: string): string {
  return src.replace(/^\/today\//, import.meta.env.BASE_URL)
}
