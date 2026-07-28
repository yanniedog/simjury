# Workflow — {PROJECT_NAME}

Generic ship bar for Cursor multi-agent projects. Copy to your repo root and replace placeholders.

**Agent efficiency:** act or park — never `--watch` poll loops. See step 5.

---

## Ship bar

### 1–3. Branch, commit, PR

Branch from fresh `main`, commit on topic branch, open one PR to `main`.

### 4. CI

Fix failing required checks. Agents: single-shot `gh pr checks <n>` — **not** `--watch`.

### 5. Act or park (replaces bot-wait babysitting)

```sh
npm run pr:arm-and-park -- --pr <n>
```

| Exit | Meaning |
|------|---------|
| 0 | Ready — auto-merge armed; finish remaining ownership |
| 2 | Waiting on bots/CI — keep ownership via self-wake (no handoff) |
| 3 | Actionable — fix threads/CI/conflicts, push, re-run |
| 1 | Error |

**Forbidden for agents:** `wait-for-bots --watch`, `pr:gates:check --watch`, sleep-until-bots loops.

CI workflows may still poll. Humans may use `--watch`. Exit 2 means wait with ownership, not dump work on the user.

When exit 3 includes unresolved threads: synthesize feedback → one push → in-thread replies → resolve threads → re-run arm-and-park.

### 6. Thread closure

```sh
npm run pr:bot-feedback-check -- --pr <n>
```

### 7. Merge

`pr:arm-and-park` enables squash auto-merge. Manual: `gh pr merge <n> --auto --squash --delete-branch`.

### 8–9. Deploy / verify

`{DEPLOY_COMMAND}` then `{VERIFY_COMMAND}`.

---

## Hard rules

Urgency never waives bot gates. Only an explicit written waiver for that PR waives bot closeout.

Do not claim "done" while arm-and-park exit **3** remains. Exit **2** (parked) is an allowed end-of-turn.
