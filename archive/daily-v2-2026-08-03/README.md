# Daily Docket v2 archive — 2026-08-03

This directory preserves the ten fictional sittings retired when SimJury moved
to one seven-day Court Week case. It is provenance only: application builds,
case importers, narration jobs, crawl guides and media publication must ignore
it.

## Contents

- `cases/`: the final source bundles for `dd-intro`, `dd-0006`, `dd-0017`,
  `dd-0032`, `dd-0037`, `dd-0038`, `dd-0039`, `dd-0040`, `dd-0041` and
  `dd-0042`, including every trial, legal sheet, deliberation pack and analysis.
- `media/`: the corresponding canonical checked-in artwork formerly copied into
  the shipped `/today/media/` build.
- `manifest.json`: machine-readable retirement and source-path provenance.
- `manifest.sha256`: a stable SHA-256 inventory of every archived case/media
  file, using repository-relative archive paths.
- `runtime-provenance.json`: the final revision-bound `caseStorageId` for every
  sitting and its exact Kokoro/Scylla Release shards. A tag is reconstructed as
  `<tag_prefix>-<release_shard>`; `"all"` means every integer from 0 through 31.
  The pinned pre-retirement source commit retains the retired clip-id and voice
  assignment code needed to reproduce those shard sets.

The narration assets already published under `narration-kokoro-0` through
`narration-kokoro-31` and `narration-scylla-0` through
`narration-scylla-31` remain in their existing GitHub Releases. Moving or
deleting source files must never clobber those releases.

## Known reasons this corpus is not the active simulation

The archive is retained faithfully, including known defects documented by the
2026-08-03 courtroom-realism audit: some cases placed final directions before
closings; two interrupted the Crown case with defence evidence; objection timing
and outcomes were overly uniform; re-examination, first ballot, jury note,
open-court verdict return and delayed majority procedure were absent; and bad
jury-room arguments carried no negative consequence. These are provenance notes,
not authority to rewrite archived content.

The active product contract is [`../../COURT-WEEK.md`](../../COURT-WEEK.md).
