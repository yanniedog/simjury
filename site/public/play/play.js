// SimJury browser player — client-side, no backend.
// Loads a case from /cases/<id>/ and runs summons -> reading -> verdict -> reveal.
// truth_file.json is fetched only after a verdict is locked (soft spoiler gate).

const CASE_ID = new URLSearchParams(location.search).get('case') || 'c_001';
const BASE = `/cases/${CASE_ID}/`;
const SAVE_KEY = `simjury:play:${CASE_ID}`;

// Presentation-only, case-specific framing for the reveal (kept out of the case schema).
const PRESENTATION = {
  c_001: { juryYear: '1896', juryVerdict: 'Guilty', recordInnocent: true },
};

const app = document.getElementById('app');
const KIND_LABEL = {
  examination: 'Examination', cross: 'Cross-examination', direct: 'Examination',
  real_decisive: 'Decisive contradiction',
  real_immaterial: 'Immaterial contradiction',
  illusory: 'Illusory contradiction',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null; // game state

async function boot() {
  try {
    const [meta, trial, pseudo, sources] = await Promise.all([
      fetchJSON('case.json'), fetchJSON('trial.json'),
      fetchJSON('pseudonyms.json'), fetchJSON('sources.json'),
    ]);

    const pseudonyms = new Map(pseudo.entries.map((e) => [e.id, e]));
    const blockIndex = new Map();
    for (const w of trial.witnesses) for (const b of w.blocks) blockIndex.set(b.id, { w, b });
    const exhibitIndex = new Map(trial.exhibits.map((x) => [x.id, x]));
    const directionIndex = new Map(trial.directions.map((d) => [d.id, d]));

    const steps = [];
    for (const ep of trial.episodes) {
      steps.push({ type: 'episode', ep });
      for (const id of ep.item_order) steps.push({ type: 'item', id, ep });
    }

    S = {
      meta, trial, pseudonyms, blockIndex, exhibitIndex, directionIndex, steps,
      phase: 'summons', pos: 0, notes: '', verdict: null,
      diary: { leaning: '', topReason: '', strongestDoubt: '' },
      ...loadSave(),
    };
    render();
  } catch (err) {
    app.innerHTML = `<p class="brand"><a href="/">SimJury</a></p>
      <h1>The court could not convene.</h1>
      <p class="play-note">${esc(err.message)}</p>
      <p><a class="btn ghost" href="/">Back to SimJury</a></p>`;
  }
}

const fetchJSON = async (file) => {
  const r = await fetch(BASE + file, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Failed to load ${file} (${r.status})`);
  return r.json();
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    return { phase: s.phase, pos: s.pos | 0, notes: s.notes || '', verdict: s.verdict || null, diary: s.diary || undefined };
  } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ phase: S.phase, pos: S.pos, notes: S.notes, verdict: S.verdict, diary: S.diary }));
  } catch { /* private mode / quota — ignore */ }
}
function go(phase) { S.phase = phase; save(); render(); window.scrollTo(0, 0); }

function render() {
  if (S.phase === 'reading') renderReading();
  else if (S.phase === 'verdict') renderVerdict();
  else if (S.phase === 'reveal') renderReveal();
  else renderSummons();
}

/* ---------- Summons ---------- */
function renderSummons() {
  const c = S.meta;
  const resume = (S.pos > 0 || S.verdict) ? `<button class="btn ghost" data-act="resume">Resume where you left off</button>` : '';
  app.innerHTML = `
    <p class="brand"><a href="/">SimJury</a></p>
    <p class="eyebrow">You are Juror #1</p>
    <h1>${esc(c.title_play)}</h1>
    <div class="charge">
      <strong>The charge:</strong> ${esc(c.charge.label)}.
      <ul>${c.charge.elements.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    </div>
    <p>Every word of testimony is drawn from the historical record; only the names are changed.
    Read the ${S.trial.episodes.length} episodes of evidence, then lock your verdict — it is permanent —
    and the record will show you what really happened. About 20–30 minutes.</p>
    <div class="btn-row">
      <button class="btn primary" data-act="begin">Take your seat</button>
      ${resume}
      <a class="btn ghost" href="/install/">Get the Android app</a>
    </div>`;
}

/* ---------- Reading ---------- */
function renderReading() {
  const step = S.steps[S.pos];
  const itemsTotal = S.steps.filter((s) => s.type === 'item').length;
  const itemsDone = S.steps.slice(0, S.pos + 1).filter((s) => s.type === 'item').length;
  const pct = Math.round((itemsDone / itemsTotal) * 100);
  const atEnd = S.pos >= S.steps.length - 1;

  const body = step.type === 'episode' ? renderEpisodeHead(step.ep) : renderItem(step.id);

  app.innerHTML = `
    <div class="reader-bar">
      <div class="progress"><span style="width:${pct}%"></span></div>
      <span class="progress-label">${itemsDone}/${itemsTotal}</span>
      <button class="btn ghost" data-act="toverdict">Deliver verdict</button>
    </div>
    ${body}
    <div class="nav-row">
      <button class="btn ghost" data-act="prev" ${S.pos === 0 ? 'disabled' : ''}>← Back</button>
      ${atEnd
        ? `<button class="btn primary" data-act="toverdict">Deliver your verdict →</button>`
        : `<button class="btn primary" data-act="next">Next →</button>`}
    </div>`;
}

function renderEpisodeHead(ep) {
  const n = S.trial.episodes.indexOf(ep) + 1;
  return `<div class="card episode-head">
    <p class="eyebrow">Episode ${n} of ${S.trial.episodes.length}</p>
    <h1>${esc(ep.title)}</h1>
    <p class="body">${esc(ep.intro_text)}</p>
  </div>`;
}

function renderItem(id) {
  if (S.blockIndex.has(id)) {
    const { w, b } = S.blockIndex.get(id);
    const p = S.pseudonyms.get(w.pseudonym_ref);
    const who = p ? p.play_name : w.pseudonym_ref;
    return `<div class="card">
      <p class="kind">${esc(KIND_LABEL[b.mode] || b.mode)}</p>
      <p class="speaker">${esc(who)} <small>· ${esc(w.role_label)}</small></p>
      <p class="body">${esc(b.text)}</p>
      ${b.source?.locator ? `<p class="locator">Source: ${esc(b.source.locator)}</p>` : ''}
    </div>`;
  }
  if (S.exhibitIndex.has(id)) {
    const x = S.exhibitIndex.get(id);
    const img = x.render_asset
      ? `<figure><img src="${esc(BASE + x.render_asset)}" alt="${esc(x.title)}" loading="lazy" />
         <figcaption>Exhibit ${esc(x.id)}</figcaption></figure>` : '';
    return `<div class="card">
      <p class="kind">Exhibit</p>
      <p class="speaker">${esc(x.title)}</p>
      <p class="body">${esc(x.text)}</p>
      ${img}
      <div class="claims">
        <div class="claim crown"><b>Crown:</b> ${esc(x.prosecution_claim)}</div>
        <div class="claim defence"><b>Defence:</b> ${esc(x.defence_claim)}</div>
      </div>
    </div>`;
  }
  if (S.directionIndex.has(id)) {
    const d = S.directionIndex.get(id);
    return `<div class="card">
      <p class="kind">Direction from the judge</p>
      <p class="speaker">${esc(d.title)}</p>
      <p class="body">${esc(d.text)}</p>
    </div>`;
  }
  return `<div class="card"><p class="body">Missing item ${esc(id)}.</p></div>`;
}

/* ---------- Verdict ---------- */
function renderVerdict() {
  const d = S.diary;
  app.innerHTML = `
    <p class="brand"><a href="/">SimJury</a></p>
    <p class="eyebrow">Your verdict</p>
    <h1>Are you sure, beyond reasonable doubt?</h1>
    <p>Note your reasoning while it is fresh — then choose. Your verdict cannot be changed.</p>
    <div class="field"><label for="reason">The reason that weighs most</label>
      <textarea id="reason" rows="2" data-diary="topReason">${esc(d.topReason)}</textarea></div>
    <div class="field"><label for="doubt">Your strongest doubt</label>
      <textarea id="doubt" rows="2" data-diary="strongestDoubt">${esc(d.strongestDoubt)}</textarea></div>
    <div class="verdict-choices">
      <button class="choice" data-verdict="guilty" aria-pressed="${S.verdict === 'guilty'}">Guilty</button>
      <button class="choice" data-verdict="not_guilty" aria-pressed="${S.verdict === 'not_guilty'}">Not guilty</button>
    </div>
    <p class="warn">Locking is permanent — this is the whole point of the game.</p>
    <div class="nav-row">
      <button class="btn ghost" data-act="backtoread">← Keep reading</button>
      <button class="btn primary" data-act="lock" ${S.verdict ? '' : 'disabled'}>Lock verdict &amp; see the truth</button>
    </div>`;
}

/* ---------- Reveal ---------- */
async function renderReveal() {
  app.innerHTML = `<p class="brand">SimJury</p><p class="play-loading">Opening the sealed record…</p>`;
  let truth;
  try { truth = await fetchJSON('truth_file.json'); }
  catch (e) { app.innerHTML = `<p class="play-note">${esc(e.message)}</p>`; return; }

  const pres = PRESENTATION[CASE_ID] || {};
  const guilty = S.verdict === 'guilty';
  const yourVerdict = guilty ? 'Guilty' : 'Not guilty';
  let compare = '';
  if (pres.recordInnocent) {
    compare = guilty
      ? `The jury in ${esc(pres.juryYear)} also returned <b>${esc(pres.juryVerdict)}</b>. The documented record is that the man in the dock was <b>innocent</b>.`
      : `The jury in ${esc(pres.juryYear)} returned <b>${esc(pres.juryVerdict)}</b> and convicted him. The documented record is that he was <b>innocent</b> — the verdict they did not reach.`;
  }

  const layers = truth.layers.map((l) =>
    `<div class="layer"><h2>${esc(l.heading)}</h2><p class="body">${esc(l.body)}</p></div>`).join('');

  const gt = (S.trial.ground_truth || []);
  const contradictions = gt.length ? `<h2>What the evidence actually turned on</h2>` + gt.map((k) =>
    `<div class="contradiction"><span class="tag">${esc(KIND_LABEL[k.kind] || k.kind)}</span>
     <p class="body">${esc(k.note)}</p></div>`).join('') : '';

  const reveal = truth.pseudonym_reveal.map((r) =>
    `<tr><td class="play-name">${esc(r.play_name)}</td><td class="real-name">${esc(r.real_name)}</td>
     <td>${esc(r.fate_note)}</td></tr>`).join('');

  const adaptations = (truth.adaptations || []).length
    ? `<details><summary>How this case was adapted for play</summary>
       <ul>${truth.adaptations.map((a) => `<li>${esc(a.note)}</li>`).join('')}</ul></details>` : '';

  app.innerHTML = `
    <p class="brand">${esc(S.meta.title_reveal)}</p>
    <div class="outcome">
      <p class="eyebrow">Your verdict</p>
      <p class="big">${yourVerdict}</p>
      ${compare ? `<p>${compare}</p>` : ''}
    </div>
    ${layers}
    ${contradictions}
    <h2>The names you knew were not their names</h2>
    <table class="reveal-table"><tbody>${reveal}</tbody></table>
    ${adaptations}
    <p class="footlinks">
      <a href="/install/">Install the Android app</a> ·
      <a href="/">Home</a> ·
      <a href="#" data-act="restart">Play again</a>
    </p>`;
}

/* ---------- Events ---------- */
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-verdict]');
  if (!t) return;
  const act = t.dataset.act;
  const v = t.dataset.verdict;

  if (v) { S.verdict = v; save(); renderVerdict(); return; }

  switch (act) {
    case 'begin': S.pos = 0; go('reading'); break;
    case 'resume': go(S.phase && S.phase !== 'summons' ? S.phase : 'reading'); break;
    case 'next': if (S.pos < S.steps.length - 1) { S.pos++; save(); renderReading(); window.scrollTo(0, 0); } break;
    case 'prev': if (S.pos > 0) { S.pos--; save(); renderReading(); window.scrollTo(0, 0); } break;
    case 'toverdict': go('verdict'); break;
    case 'backtoread': go('reading'); break;
    case 'lock': if (S.verdict) go('reveal'); break;
    case 'restart':
      e.preventDefault();
      localStorage.removeItem(SAVE_KEY);
      S.pos = 0; S.verdict = null; S.notes = '';
      S.diary = { leaning: '', topReason: '', strongestDoubt: '' };
      go('summons');
      break;
  }
});

app.addEventListener('input', (e) => {
  const key = e.target.dataset.diary;
  if (key) { S.diary[key] = e.target.value; save(); }
});

document.addEventListener('keydown', (e) => {
  if (S?.phase !== 'reading') return;
  if (e.key === 'ArrowRight' && S.pos < S.steps.length - 1) { S.pos++; save(); renderReading(); }
  if (e.key === 'ArrowLeft' && S.pos > 0) { S.pos--; save(); renderReading(); }
});

boot();
