# Court Week scene-art bible

This is the continuity authority for *Eleven Minutes*. A scene is rejected if
it contradicts this file, even when it passes the binary readiness audit.

## Fixed courtroom geography

The camera is always on the jury side of the bar, facing the bench. Judge Sel
Aven's bench is central and elevated. From that camera, the Crown lectern and
table are left, the defence table is right, and the witness box is to the
judge's right (viewer right). The clerk position is beside the bench. Doors,
windows, rails, microphones and fixed furniture do not migrate between scenes.

Portrait, tablet and desktop are separately composed lenses on this same room.
They may reveal different amounts of it, but may not mirror the room, swap the
parties, invent a second witness box or move fixed furniture. New focal points,
protected subject/evidence rectangles and permitted caption positions are
reviewed separately for each lens. Existing shared coordinates carry the
explicit `compatibility-migration` status until crop contact-sheet review;
they are not represented as crop-specific approval.

## Locked recurring cast

- Judge Sel Aven: middle-aged woman; short side-parted silver hair; plain black
  judicial robe; composed, neutral manner.
- Crown counsel Asha Renn: adult woman; fair complexion; blonde hair in a low
  neat bun; tailored plain navy suit; pale neutral blouse.
- Defence counsel Corin Dax: adult man; short brown hair; plain charcoal suit;
  restrained manner.
- Accused Mara Venn: adult woman; long straight dark-brown hair; understated
  dark civilian clothing; seated beside defence; no restraints or guilt cues.
- Nella Orr: woman in her late forties; dark curly hair; plain slate business
  suit; calm professional manner.
- Peli Dorn: young adult woman; medium-brown complexion; short close dark
  curls; plain charcoal blazer over a muted forest-green blouse; attentive,
  professional manner.
- Tovan Mir: man in his early fifties; medium olive complexion; short
  salt-and-pepper hair; clean-shaven; plain mid-grey business suit, muted blue
  shirt and dark tie; calm records-custodian manner.
- Dr Eren Vos: woman in her late fifties; warm-brown complexion; short
  salt-and-pepper natural curls; no glasses; plain charcoal civilian jacket
  over a muted burgundy blouse; composed clinical manner.
- Jaro Pell: man in his early forties; fair-to-tan complexion; short dark-blond
  hair; clean-shaven; plain dark-blue shirt under a muted grey civilian jacket;
  calm rescue-supervisor manner.
- Oren Vale: man in his early sixties; deep-brown complexion; close-cropped
  greying black hair; clean-shaven; plain dark-brown business suit, cream shirt
  and dark tie; careful compliance-director manner.
- Tali Rusk: non-binary adult; medium-brown complexion; short black textured
  hair; subtle round dark eyeglasses; plain muted olive-grey blazer over a
  black shirt; composed human-factors-expert manner.
- Sera Quill: woman in her early forties; warm light-medium East Asian
  complexion; straight dark hair secured in a low ponytail; no glasses; plain
  navy blazer over a pale-blue shirt; practical maintenance-engineer manner.

Wardrobe stays unchanged through a court day. No police, rescue or military
uniform appears in court unless the authored record expressly calls that person
as a witness in that scene.

## Shot continuity

Each production tranche uses three locked set plates: portrait 9:16, tablet
4:3 and desktop 16:9. A scene edit starts from its matching plate or the prior
accepted shot of the same witness. Prompts must explicitly freeze camera,
architecture, furniture, lighting direction and all people not involved in the
new action.

Before encoding, review a contact sheet in chronological rows and device
columns. Reject any changed face, hair, wardrobe, door, window, bench, witness
box, counsel table, rail, chair count or microphone position that is not caused
by the authored action. Reframing is allowed; teleporting the room is not.

## Legal neutrality and accessibility

Artwork establishes presence, role and procedural phase. It never supplies a
legal fact, resolves disputed evidence, signals guilt, or substitutes for an
exhibit viewer. Documents and screens remain unreadable in stage art. Every
scene keeps ambiguity-preserving alternative text and a clear caption zone.
When a crop contains a visible subject or evidence object, its protected region
must enclose the actual pixels. When none is visible, the corresponding value is
explicitly `null`; reviewers never draw a fictional evidence region merely to
satisfy a gate.
