// SimJury browser player — client-side, no backend. Audio-first ("listenable").
// Flow: summons -> reading -> verdict -> jury room -> reveal.
// Narration uses the free browser Web Speech API (see site/DECISIONS.md D-WEB-1).
// The jury room is a scripted, fictional deliberation (D-WEB-2). truth_file.json is
// fetched only after the verdict is locked (soft spoiler gate).

const RAW_CASE = new URLSearchParams(location.search).get('case') || 'c_001';
// Whitelist the case id so it can never be used for path traversal in fetch() below.
const CASE_ID = /^c_\d{3}$/.test(RAW_CASE) ? RAW_CASE : 'c_001';
const BASE = `/cases/${CASE_ID}/`;
const SAVE_KEY = `simjury:play:${CASE_ID}`;
const AUDIO_KEY = 'simjury:narration';

const PRESENTATION = { c_001: { juryYear: '1896', juryVerdict: 'Guilty', recordInnocent: true } };
const KIND_LABEL = { examination: 'Examination', cross: 'Cross-examination', direct: 'Examination' };
const POS_LABEL = { G: 'Guilty', NG: 'Not guilty', U: 'Undecided' };

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================ Narration engine ============================ */
const synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
let VOICES = [];
function refreshVoices() {
  if (!synth) return;
  const all = synth.getVoices();
  VOICES = all.filter((v) => /^en/i.test(v.lang));
  if (!VOICES.length) VOICES = all;
}
if (synth) { refreshVoices(); synth.onvoiceschanged = refreshVoices; }

let narrationOn = localStorage.getItem(AUDIO_KEY) !== 'off';
let paused = false;
let onSpeechEnd = null; // callback when the current utterance finishes naturally

// Deterministic voice/pitch per speaker key, so each character sounds consistent
// even on devices that expose only one voice.
function voiceFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const voice = VOICES.length ? VOICES[h % VOICES.length] : null;
  const pitch = key === 'narrator' ? 1 : 0.8 + (h % 45) / 100; // 0.80–1.24
  const rate = 0.97 + ((h >> 3) % 8) / 100; // 0.97–1.04
  return { voice, pitch, rate };
}

function stopSpeech() { if (synth) { onSpeechEnd = null; synth.cancel(); } paused = false; }

// Speak text as `key`; call `done` when finished (naturally or skipped/disabled).
function speak(text, key, done) {
  if (!synth || !narrationOn || !text) { if (done) done(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const { voice, pitch, rate } = voiceFor(key || 'narrator');
  if (voice) u.voice = voice;
  u.pitch = pitch; u.rate = rate;
  onSpeechEnd = done || null;
  u.onend = () => { if (onSpeechEnd === done) { onSpeechEnd = null; if (done) done(); } };
  // On a genuine speech error, stop — do NOT run `done` (which would auto-advance and
  // could skip the entire trial if narration fails on every item).
  u.onerror = () => { if (onSpeechEnd === done) onSpeechEnd = null; };
  paused = false;
  synth.speak(u);
}

function togglePause() {
  if (!synth) return;
  if (paused) { synth.resume(); paused = false; } else { synth.pause(); paused = true; }
  syncControls();
}
function setNarration(on) {
  narrationOn = on;
  localStorage.setItem(AUDIO_KEY, on ? 'on' : 'off');
  if (!on) stopSpeech();
  render();
}
// iOS/Safari occasionally suspends long queues; nudge it back.
if (synth) setInterval(() => { if (narrationOn && !paused && synth.speaking) synth.resume(); }, 8000);

/* ================================ State ================================== */
let S = null;

async function boot() {
  try {
    const [meta, trial, pseudo, sources] = await Promise.all([
      j('case.json'), j('trial.json'), j('pseudonyms.json'), j('sources.json'),
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
      meta, trial, pseudonyms, blockIndex, exhibitIndex, directionIndex, steps, sources,
      phase: 'summons', pos: 0, verdict: null,
      diary: { topReason: '', strongestDoubt: '' },
      juryRoom: null, roomPos: 0, roomPositions: null,
      ...loadSave(),
    };
    render();
  } catch (err) {
    app.innerHTML = errorCard(err.message);
  }
}

const j = async (file) => {
  const r = await fetch(BASE + file, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Failed to load ${file} (${r.status})`);
  return r.json();
};
const errorCard = (m) => `<p class="brand"><a href="/">SimJury</a></p>
  <h1>The court could not convene.</h1><p class="play-note">${esc(m)}</p>
  <p><a class="btn ghost" href="/">Back to SimJury</a></p>`;

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    // Only include keys that are present — never spread `undefined` over the S defaults
    // (otherwise the default diary object gets clobbered and renderVerdict throws).
    const out = { phase: s.phase, pos: s.pos | 0, verdict: s.verdict || null };
    if (s.diary) out.diary = s.diary;
    return out;
  } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ phase: S.phase, pos: S.pos, verdict: S.verdict, diary: S.diary }));
  } catch { /* ignore */ }
}
function go(phase) { stopSpeech(); S.phase = phase; save(); render(); window.scrollTo(0, 0); }

/* ================================ Router ================================= */
function render() {
  if (S.phase === 'reading') renderReading();
  else if (S.phase === 'verdict') renderVerdict();
  else if (S.phase === 'juryroom') renderJuryRoom();
  else if (S.phase === 'reveal') renderReveal();
  else renderSummons();
}

function audioToggle() {
  if (!synth) return '';
  return `<button class="btn ghost mini" data-act="narr">${narrationOn ? '🔊 Narration on' : '🔇 Narration off'}</button>`;
}

/* ================================ Summons ================================ */
function renderSummons() {
  const c = S.meta;
  const resume = (S.pos > 0 || S.verdict) ? `<button class="btn ghost" data-act="resume">Resume</button>` : '';
  app.innerHTML = `
    <p class="brand"><a href="/">SimJury</a></p>
    <p class="eyebrow">You are Juror #1</p>
    <h1>${esc(c.title_play)}</h1>
    <div class="charge"><strong>The charge:</strong> ${esc(c.charge.label)}.</div>
    <p class="sub">A real trial, only the names changed. <strong>Listen</strong> to the evidence,
    lock your verdict, then hear the room decide — and learn what really happened. ~25 min.</p>
    <div class="btn-row">
      <button class="btn primary" data-act="begin">${synth ? '▶ Take your seat &amp; listen' : 'Take your seat'}</button>
      ${resume}
    </div>
    <p class="fine">${synth ? 'Narration uses your device voice — headphones recommended.' : 'Your browser has no speech support; you can read along.'}</p>`;
}

/* ================================ Reading ================================ */
function renderReading() {
  const step = S.steps[S.pos];
  const itemsTotal = S.steps.filter((s) => s.type === 'item').length;
  const itemsDone = S.steps.slice(0, S.pos + 1).filter((s) => s.type === 'item').length;
  const pct = Math.round((itemsDone / itemsTotal) * 100);
  const atEnd = S.pos >= S.steps.length - 1;

  const view = step.type === 'episode' ? episodeHead(step.ep) : itemView(step.id);
  app.innerHTML = `
    ${view.html}
    <div class="nav-row">
      <button class="btn ghost" data-act="verdict-jump">Skip to verdict</button>
      ${atEnd ? `<button class="btn primary" data-act="toverdict">Deliver your verdict →</button>`
              : `<button class="btn primary" data-act="next">Next →</button>`}
    </div>
    ${controlBar(pct, `${itemsDone}/${itemsTotal}`)}`;

  // Narrate, then auto-advance when it finishes (listen mode).
  speak(view.speech, view.voiceKey, () => {
    if (S.phase === 'reading' && narrationOn && !paused && S.pos < S.steps.length - 1) {
      S.pos++; save(); renderReading();
    }
  });
  syncControls();
}

function episodeHead(ep) {
  const n = S.trial.episodes.indexOf(ep) + 1;
  return {
    voiceKey: 'narrator',
    speech: `Episode ${n}. ${ep.title}. ${ep.intro_text}`,
    html: `<div class="card episode-head">
      <p class="eyebrow">Episode ${n} of ${S.trial.episodes.length}</p>
      <h1>${esc(ep.title)}</h1>
      <p class="body">${esc(ep.intro_text)}</p>
    </div>`,
  };
}

function itemView(id) {
  if (S.blockIndex.has(id)) {
    const { w, b } = S.blockIndex.get(id);
    const who = S.pseudonyms.get(w.pseudonym_ref)?.play_name || w.pseudonym_ref;
    return {
      voiceKey: w.pseudonym_ref,
      speech: b.text,
      html: `<div class="card">
        <p class="kind">${esc(KIND_LABEL[b.mode] || b.mode)}</p>
        <p class="speaker">${esc(who)} <small>· ${esc(w.role_label)}</small></p>
        <p class="body">${esc(b.text)}</p>
      </div>`,
    };
  }
  if (S.exhibitIndex.has(id)) {
    const x = S.exhibitIndex.get(id);
    const img = x.render_asset
      ? `<figure><img src="${esc(BASE + x.render_asset)}" alt="${esc(x.title)}" loading="lazy" /></figure>` : '';
    return {
      voiceKey: 'narrator',
      speech: `Exhibit. ${x.title}. ${x.text} The Crown says: ${x.prosecution_claim} The defence says: ${x.defence_claim}`,
      html: `<div class="card">
        <p class="kind">Exhibit</p>
        <p class="speaker">${esc(x.title)}</p>
        <p class="body">${esc(x.text)}</p>${img}
        <div class="claims">
          <div class="claim crown"><b>Crown:</b> ${esc(x.prosecution_claim)}</div>
          <div class="claim defence"><b>Defence:</b> ${esc(x.defence_claim)}</div>
        </div>
      </div>`,
    };
  }
  if (S.directionIndex.has(id)) {
    const d = S.directionIndex.get(id);
    return {
      voiceKey: 'judge',
      speech: `A direction from the judge. ${d.title}. ${d.text}`,
      html: `<div class="card direction">
        <p class="kind">Direction from the judge</p>
        <p class="speaker">${esc(d.title)}</p>
        <p class="body">${esc(d.text)}</p>
      </div>`,
    };
  }
  return { voiceKey: 'narrator', speech: '', html: `<div class="card"><p class="body">Missing ${esc(id)}.</p></div>` };
}

function controlBar(pct, label) {
  return `<div class="controls">
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="ctl-buttons">
      <button class="ctl" data-act="prev" title="Back">⏮</button>
      ${synth ? `<button class="ctl playpause" data-act="playpause" title="Play/pause">⏯</button>` : ''}
      <button class="ctl" data-act="next2" title="Next">⏭</button>
      <span class="progress-label">${label}</span>
      ${audioToggle()}
    </div>
  </div>`;
}
function syncControls() {
  const pp = document.querySelector('.playpause');
  if (pp) pp.textContent = paused ? '▶' : '⏸';
}

/* ================================ Verdict ================================ */
function renderVerdict() {
  stopSpeech();
  const d = S.diary;
  app.innerHTML = `
    <p class="brand"><a href="/">SimJury</a></p>
    <p class="eyebrow">Your verdict</p>
    <h1>Sure, beyond reasonable doubt?</h1>
    <div class="verdict-choices">
      <button class="choice" data-verdict="guilty" aria-pressed="${S.verdict === 'guilty'}">Guilty</button>
      <button class="choice" data-verdict="not_guilty" aria-pressed="${S.verdict === 'not_guilty'}">Not guilty</button>
    </div>
    <details class="diary"><summary>Add a private note (optional)</summary>
      <div class="field"><label>The reason that weighs most</label>
        <input type="text" data-diary="topReason" value="${esc(d.topReason)}" /></div>
      <div class="field"><label>Your strongest doubt</label>
        <input type="text" data-diary="strongestDoubt" value="${esc(d.strongestDoubt)}" /></div>
    </details>
    <p class="warn">Locking is permanent — that is the whole point.</p>
    <div class="nav-row">
      <button class="btn ghost" data-act="backtoread">← Keep listening</button>
      <button class="btn primary" data-act="lock" ${S.verdict ? '' : 'disabled'}>Lock verdict</button>
    </div>`;
}

/* =============================== Jury room =============================== */
async function renderJuryRoom() {
  if (!S.juryRoom) {
    app.innerHTML = `<p class="brand">SimJury</p><p class="play-loading">The jury retires…</p>`;
    try { S.juryRoom = await j('jury_room.json'); }
    catch (e) { app.innerHTML = errorCard(e.message); return; }
    S.roomPositions = {};
    for (const juror of S.juryRoom.jurors) S.roomPositions[juror.id] = juror.initial;
    S.roomPos = 0;
  }
  drawRoom();
}

function drawRoom() {
  const jr = S.juryRoom;
  const beats = jr.script;
  const done = S.roomPos >= beats.length;
  const beat = done ? null : beats[S.roomPos];
  const speaking = beat ? beat.speaker : null;

  const seats = jr.jurors.map((jz) => {
    const pos = S.roomPositions[jz.id];
    const active = jz.id === speaking ? ' active' : '';
    return `<div class="seat ${pos}${active}" title="${esc(jz.persona)}">
      <span class="seat-n">${jz.seat}</span><span class="seat-pos">${pos}</span></div>`;
  }).join('');

  const line = beat ? `<div class="room-line ${beat.change ? 'change' : ''}">
      <p class="who">${esc(labelFor(beat.speaker))}${beat.note ? ` <small>· ${esc(beat.note)}</small>` : ''}</p>
      <p class="body">${esc(beat.text)}</p>
    </div>` : renderRoomVerdict();

  app.innerHTML = `
    <p class="brand">The jury room</p>
    <p class="sub">Your verdict is sealed. The other eleven take the same evidence in.</p>
    <div class="bench">
      <div class="seat you" title="You"><span class="seat-n">1</span><span class="seat-pos">${S.verdict === 'guilty' ? 'G' : 'NG'}</span></div>
      ${seats}
    </div>
    ${line}
    <div class="nav-row">
      ${done
        ? `<button class="btn primary" data-act="toreveal">Hear the truth →</button>`
        : `<button class="btn ghost" data-act="room-skip">Skip to the vote</button>
           <button class="btn primary" data-act="room-next">Continue →</button>`}
      ${!done ? audioToggle() : ''}
    </div>`;

  if (beat) {
    const speech = `${labelFor(beat.speaker)}. ${beat.text}`;
    speak(speech, beat.speaker, () => {
      if (S.phase === 'juryroom' && narrationOn && !paused) roomAdvance();
    });
  }
}

function labelFor(jid) { return S.juryRoom.jurors.find((x) => x.id === jid)?.label || jid; }

function roomAdvance() {
  const beat = S.juryRoom.script[S.roomPos];
  if (beat && beat.change) S.roomPositions[beat.speaker] = beat.change;
  S.roomPos++;
  drawRoom();
}
function roomSkip() {
  // Apply all remaining position changes, jump to the verdict.
  for (let i = S.roomPos; i < S.juryRoom.script.length; i++) {
    const b = S.juryRoom.script[i];
    if (b.change) S.roomPositions[b.speaker] = b.change;
  }
  stopSpeech();
  S.roomPos = S.juryRoom.script.length;
  drawRoom();
}

function roomTally() {
  const t = { G: 0, NG: 0, U: 0 };
  for (const p of Object.values(S.roomPositions)) t[p] = (t[p] || 0) + 1;
  return t;
}
function renderRoomVerdict() {
  const t = roomTally();
  const g = t.G, ng = t.NG + t.U; // undecided abstentions fall to the defence side for display
  const verdict = g > ng ? 'Guilty' : (ng > g ? 'Not guilty' : 'Deadlocked');
  const split = `${Math.max(g, ng)}–${Math.min(g, ng)}`;
  return `<div class="outcome room">
    <p class="eyebrow">The room returns</p>
    <p class="big">${verdict}${verdict !== 'Deadlocked' ? ` · ${split}` : ''}</p>
    <p>${t.NG ? `${t.NG} would not convict.` : 'The room was of one mind.'}</p>
  </div>`;
}

/* ================================ Reveal ================================= */
async function renderReveal() {
  app.innerHTML = `<p class="brand">SimJury</p><p class="play-loading">Opening the sealed record…</p>`;
  let truth;
  try { truth = await j('truth_file.json'); }
  catch (e) { app.innerHTML = errorCard(e.message); return; }

  const pres = PRESENTATION[CASE_ID] || {};
  const guilty = S.verdict === 'guilty';
  const yours = guilty ? 'Guilty' : 'Not guilty';
  const t = S.roomPositions ? roomTally() : null;
  const roomVerdict = t ? (t.G > (t.NG + t.U) ? 'Guilty' : 'Not guilty') : null;

  let compare = '';
  if (pres.recordInnocent) {
    compare = guilty
      ? `The jury in ${esc(pres.juryYear)} also returned <b>${esc(pres.juryVerdict)}</b>. The record is that the man in the dock was <b>innocent</b>.`
      : `The jury in ${esc(pres.juryYear)} returned <b>${esc(pres.juryVerdict)}</b> and convicted him. The record is that he was <b>innocent</b> — the verdict they did not reach.`;
  }

  // Keep sources out of the prose: split the trailing "Source: …" off each layer and
  // gather all citations into one collapsed section (owner request: sources not prominent).
  const splitSource = (body) => {
    const k = body.indexOf('Source:');
    return k === -1 ? { text: body, cite: '' } : { text: body.slice(0, k).trim(), cite: body.slice(k).trim() };
  };
  const cites = [];
  const strippedLayers = truth.layers.map((l) => {
    const s = splitSource(l.body);
    if (s.cite) cites.push(s.cite);
    return { heading: l.heading, body: s.text };
  });
  const layers = strippedLayers.map((l, i) =>
    `<div class="layer" data-layer="${i}"><h2>${esc(l.heading)}</h2><p class="body">${esc(l.body)}</p></div>`).join('');
  const sourceItems = (S.sources?.sources || []).map((s) => `<li><b>${esc(s.id)}</b> — ${esc(s.citation)}</li>`).join('');
  const sourcesBlock = (sourceItems || cites.length)
    ? `<details class="sources"><summary>Sources &amp; citations</summary>
        ${sourceItems ? `<ul>${sourceItems}</ul>` : ''}
        ${cites.length ? `<p class="fine">${cites.map(esc).join('<br>')}</p>` : ''}
      </details>` : '';
  const gt = S.trial.ground_truth || [];
  const contradictions = gt.length ? `<h2>What the evidence turned on</h2>` + gt.map((k) =>
    `<div class="contradiction"><span class="tag">${esc(({ real_decisive: 'Decisive', real_immaterial: 'Immaterial', illusory: 'Illusory' })[k.kind] || k.kind)} contradiction</span>
     <p class="body">${esc(k.note)}</p></div>`).join('') : '';
  const reveal = truth.pseudonym_reveal.map((r) =>
    `<tr><td class="play-name">${esc(r.play_name)}</td><td class="real-name">${esc(r.real_name)}</td><td>${esc(r.fate_note)}</td></tr>`).join('');
  const adaptations = (truth.adaptations || []).length
    ? `<details><summary>How this case was adapted for play</summary><ul>${truth.adaptations.map((a) => `<li>${esc(a.note)}</li>`).join('')}</ul></details>` : '';

  app.innerHTML = `
    <p class="brand">${esc(S.meta.title_reveal)}</p>
    <div class="outcome">
      <p class="eyebrow">Your verdict</p>
      <p class="big">${yours}</p>
      ${roomVerdict ? `<p>Your room returned <b>${esc(roomVerdict)}</b>.</p>` : ''}
      ${compare ? `<p>${compare}</p>` : ''}
      ${synth ? `<button class="btn ghost mini" data-act="play-reveal">▶ Listen to the record</button>` : ''}
    </div>
    ${layers}
    ${contradictions}
    <h2>The names you knew were not their names</h2>
    <table class="reveal-table"><tbody>${reveal}</tbody></table>
    ${sourcesBlock}
    ${adaptations}
    <p class="footlinks"><a href="/">Home</a> · <a href="#" data-act="restart">Play again</a></p>`;

  S._revealLayers = strippedLayers;
  speak(compare ? compare.replace(/<[^>]+>/g, '') : `You returned ${yours}.`, 'narrator', null);
}

function playReveal() {
  const layers = S._revealLayers || [];
  let i = 0;
  const nextLayer = () => {
    if (S.phase !== 'reveal' || i >= layers.length || !narrationOn) return;
    const l = layers[i++];
    const el = document.querySelector(`[data-layer="${i - 1}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    speak(`${l.heading}. ${l.body}`, 'narrator', nextLayer);
  };
  nextLayer();
}

/* ================================ Events ================================= */
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-verdict]');
  if (!t) return;
  const act = t.dataset.act;
  if (t.dataset.verdict) { S.verdict = t.dataset.verdict; save(); renderVerdict(); return; }

  switch (act) {
    case 'begin': S.pos = 0; go('reading'); break;
    case 'resume': go(S.phase && S.phase !== 'summons' ? S.phase : 'reading'); break;
    case 'next': case 'next2':
      if (S.pos < S.steps.length - 1) { stopSpeech(); S.pos++; save(); renderReading(); window.scrollTo(0, 0); } break;
    case 'prev':
      if (S.pos > 0) { stopSpeech(); S.pos--; save(); renderReading(); window.scrollTo(0, 0); } break;
    case 'playpause': togglePause(); break;
    case 'narr': setNarration(!narrationOn); break;
    case 'toverdict': case 'verdict-jump': go('verdict'); break;
    case 'backtoread': go('reading'); break;
    case 'lock': if (S.verdict) go('juryroom'); break;
    case 'room-next': stopSpeech(); roomAdvance(); break;
    case 'room-skip': roomSkip(); break;
    case 'toreveal': go('reveal'); break;
    case 'play-reveal': playReveal(); break;
    case 'restart':
      e.preventDefault(); stopSpeech(); localStorage.removeItem(SAVE_KEY);
      S.pos = 0; S.verdict = null; S.diary = { topReason: '', strongestDoubt: '' };
      S.juryRoom = null; S.roomPos = 0; S.roomPositions = null;
      go('summons'); break;
  }
});
app.addEventListener('input', (e) => {
  const k = e.target.dataset.diary;
  if (k) { S.diary[k] = e.target.value; save(); }
});
document.addEventListener('keydown', (e) => {
  if (S?.phase === 'reading') {
    if (e.key === 'ArrowRight' && S.pos < S.steps.length - 1) { stopSpeech(); S.pos++; save(); renderReading(); }
    if (e.key === 'ArrowLeft' && S.pos > 0) { stopSpeech(); S.pos--; save(); renderReading(); }
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
  }
});
window.addEventListener('beforeunload', stopSpeech);

boot();
