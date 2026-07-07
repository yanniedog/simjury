# AGENTS.md

## Cursor Cloud specific instructions

### Current repository state (READ FIRST)

This repository is **specification-only**. As of this writing it contains a single
file, `simjury-build-spec-v3.md`, and no application code.

There is intentionally **nothing to build, lint, test, or run yet**:

- No Gradle project (`settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml` do not exist).
- No Kotlin/Android sources, no `app/`, `case-model/`, or `deliberation-core/` modules.
- No dependency manifests of any kind, and no test suites.

Do not attempt to "run the application" or expect a dev server — none exists.
The standard install/build/run/test loop is not applicable until the project
described by the spec has actually been scaffolded and implemented.

### What this project is meant to become

`simjury-build-spec-v3.md` is a strict compliance specification for **SimJury**, a
single-player, fully offline **Android** game (Kotlin 2.x, Jetpack Compose /
Material 3, Gradle Kotlin DSL with a version catalog, `kotlinx.serialization`,
Jetpack DataStore, JUnit 5). Intended module layout (spec Section 4.1):

- `:case-model` — Kotlin JVM: schema types + validator.
- `:deliberation-core` — Kotlin JVM (depends only on `:case-model`): pure, deterministic engine.
- `:app` — the only Android module.

When implementation begins, the spec's Section 17 mandates the order of work and
Section 0.2 requires creating `CONFORMANCE.md` as the very first file.

### Toolchain available in this VM

- Java 21 (`java`) and Node 22 (`node`) are preinstalled.
- **Not** installed: Gradle, `kotlinc`, and the Android SDK. These (plus an
  Android emulator or device) will be needed once the Gradle/Android project
  exists. Install them at that point, not before.

### Blocked on human operator (per the spec itself)

The spec forbids inventing content (`F-1`) and lists irreducible external inputs
(Section 31). Before the app can be meaningfully authored/run:

- `EX-1`: a human must supply or confirm access to the historical source
  documents (spec Section 8.2) before case-content authoring (Gate G-5).
- `EX-2`/`EX-3`: signing keystore and a human clearance sign-off gate release (Gate G-6).

Treat these as hard prerequisites; do not work around them by improvising.
