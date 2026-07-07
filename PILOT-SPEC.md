# SimJury Pilot Specification

**Version:** pilot-1.0  
**Authority:** This document governs all pilot-phase work. The v3 spec in `archive/` is deferred until Phase 4.

## 1. Product (pilot scope)

SimJury puts the player on a jury. They read condensed trial evidence, record a private verdict diary, vote, then see a historical reveal.

**Pilot constraints (non-negotiable):**

| ID | Rule |
|----|------|
| P-1 | Fully offline — no network code, no `INTERNET` permission (future Android) |
| P-2 | No runtime AI — all player-facing text is pre-authored in JSON |
| P-3 | Case content lives in `pilot/src/main/resources/cases/` — not embedded in Kotlin |
| P-4 | Every content block has a `source` object citing a verifiable document |
| P-5 | Real names hidden during play; revealed only after verdict lock |
| P-6 | Verdict diary is mandatory, immutable after commit |
| P-7 | No hints during play — scoring/evaluation is post-verdict only |

## 2. Pilot case: C-000 "The Pocket Watch"

A **synthetic micro-case** for pipeline validation — not a historical case.

- **Charge:** petty larceny (one count)
- **Witnesses:** 2 (shopkeeper, constable)
- **Exhibits:** 2 (watch receipt, pawn ticket)
- **Episodes:** 1
- **Deliberation:** simplified — player diary → unanimous-style vote → reveal
- **Reading time:** ~5 minutes

Case 001 (R v. Adolf Beck) is **out of scope** until Phase 4. See `CASE_HARNESS.md` for how to graduate from C-000 to real cases.

## 3. Pilot app architecture

```
pilot/
├── build.gradle.kts          # CLI application
├── settings.gradle.kts
├── case-model/               # Phase 2 — pure Kotlin schema + V-rules
│   └── src/main/kotlin/simjury/casemodel/
│       ├── CaseModels.kt
│       └── CaseValidator.kt
├── deliberation-core/          # Phase 2 — pilot state machine stub
│   └── src/main/kotlin/simjury/deliberation/
│       ├── DeliberationModels.kt
│       └── PilotDeliberationEngine.kt
└── src/main/
    ├── kotlin/simjury/pilot/
    │   ├── Main.kt              # CLI entry
    │   ├── CaseLoader.kt
    │   ├── GameSession.kt
    │   └── RevealGate.kt
    └── resources/cases/c_000/
        ├── case.json
        ├── trial.json
        ├── pseudonyms.json
        ├── truth_file.json
        └── sources.json
```

**Modules (pilot):** `:case-model` + `:deliberation-core` (Phase 2) + CLI app. Next: `:app` (Android).

## 4. Case JSON schema (pilot minimum)

### `case.json`
`id`, `title_play`, `title_reveal`, `charge`, `episode_ids[]`, `schema_version` (`"pilot-1"`)

### `trial.json`
`episodes[]`, `witnesses[]` with `blocks[]` (`id`, `text`, `source`), `exhibits[]` (`id`, `title`, `text`, `source`)

### `pseudonyms.json`
`entries[]` — `{ id, play_name, real_name, role }`

### `truth_file.json`
`layers[]` — `{ heading, body }` plus `pseudonym_reveal[]` and optional `adaptations[]` — `{ note }` items listing deliberate differences from the historical record (Phase 4+)

### `source` object (required on every block)
`{ source_id, citation, locator }`

## 5. Pilot game flow

1. Summons (rules + disclaimer)
2. Episode hub → read all items
3. Verdict diary (leaning, reason, doubt) — commit is one-way
4. Vote (Guilty / Not Guilty)
5. Reveal (truth file + pseudonym table)
6. Optional replay

## 6. Definition of done (pilot)

- [ ] `./gradlew test` passes
- [ ] `./gradlew run` completes full loop on C-000
- [ ] Reveal gate test: truth unreadable before verdict lock
- [ ] Case validator rejects missing sources and banned real-name tokens pre-reveal
- [ ] `CASE_HARNESS.md` checklist passes for C-000

## 7. Explicitly deferred (do not build in pilot)

- Full deliberation engine with 11 AI jurors
- Notebook (six tabs)
- Process scoring formulas
- Share card PNG
- Accessibility certification
- Play Store release
- Case 001 historical content

Refer to `ROADMAP.md` for when each item enters scope.
