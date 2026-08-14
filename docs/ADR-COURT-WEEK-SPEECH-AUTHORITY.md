# ADR: Court Week speech and procedural authority

**Status:** accepted for staged migration
**Roles:** Content Curator + Architect
**Scope:** reviewed, static Court Week content only
## Decision
Court Week content will model the legal event, the person speaking and the
source of quoted words separately. A cue remains the progress unit, but every
spoken contribution will ultimately use canonical actor ids and explicit turns.
No runtime inference or AI may decide who said legally material words.
Day 1 order is binding:

1. empanel the jury;
2. complete the player's oath or affirmation;
3. have the Clerk read the charge and ask for the plea;
4. have Mara Venn give the plea herself; and
5. deliver preliminary directions before evidence or an opening.
The actor/action boundary is also binding:

- the Clerk reads the charge and asks for the plea; the accused answers it;
- counsel question, object, submit and tender;
- witnesses answer and lay evidentiary foundations;
- the Judge rules, directs, limits use and admits evidence;
- the foreperson communicates jury notes and returns the verdict;
- the court officer administers logistics, not new law; and
- narrator, document and system text have no independent legal effect.
Evidence presentation must preserve separate `foundation`, `tender`,
`admission`, `limitation-direction` and `exhibit-playback` actions. Agreement or
compression may omit an objection, but may not silently turn witness foundation
or counsel narration into judicial admission.
Every turn declares one speech mode: live proceeding, reported testimony,
recording playback, advocacy, judicial direction, written-document reading,
narrator summary or reviewed system template. Reported words stay in the
reporting witness's voice; primary recordings identify each audible participant.
Operative pleas, rulings, admissions, directions and verdicts may not be
narrator summaries.
Majority eligibility requires this order: failed unanimity, more than eight
disclosed in-world hours, a non-coercive perseverance direction, further lawful
discussion, and a fresh unanimity ballot. Only after that fresh ballot fails may
the Judge authorise eleven-to-one and the jury take its final ballot.
## Staging and consequences
This ADR adds review infrastructure only. It does not rewrite the active corpus,
change the current pack schema, regenerate narration or alter pinned media.
Migration is day-sized, with exact-source legal, attribution and read-aloud
review before each content/media cutover. The compatibility alias parser is a
migration aid, never the future source of truth.

The first cut deliberately leaves the two runtime Sunday substitutions outside
the review digest. Before the new contract becomes release-blocking, move or
hash every `openCourtReturnTurns` verdict/agreement variant and every dynamic
`sun-analysis` wrapper in the reviewed surface. No dynamic legal wording may
remain reviewable only through application code.
