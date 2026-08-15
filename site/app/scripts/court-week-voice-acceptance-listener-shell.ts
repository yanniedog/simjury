import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, lstatSync, readFileSync, readdirSync,
  realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VoiceAcceptanceBundle } from './court-week-voice-acceptance-bundle'
import { VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA, type ListenerSubmission } from
  './court-week-voice-acceptance-export'
import type { ListenerDecision } from './court-week-voice-acceptance'
import { voiceReviewDigest } from './court-week-voice-distinctness'

export const VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA =
  'simjury.court-week-voice-acceptance-listener-package/v1' as const
const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'))
const digest = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const within = (root: string, target: string): boolean => {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
const overlaps = (left: string, right: string): boolean => within(left, right) || within(right, left)
const exactKeys = (value: object, expected: string[]): boolean =>
  Object.keys(value).sort().join('|') === [...expected].sort().join('|')
const sha = (value: unknown): value is string => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)

function privateDirectory(input: string, label: string, empty = false): string {
  const requested = resolve(input); let cursor = requested
  while (true) {
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} must not use a symlink or reparse point`)
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent
  }
  const directory = realpathSync(requested)
  if (!statSync(directory).isDirectory()) throw new Error(`${label} must be an existing directory`)
  for (cursor = directory; ; cursor = dirname(cursor)) {
    if (existsSync(join(cursor, '.git'))) throw new Error(`${label} must be outside every repository`)
    if (dirname(cursor) === cursor) break
  }
  if (within(repositoryRoot, directory)
    || directory.split(/[\\/]+/u).some((part) => part.toLowerCase() === 'public')) {
    throw new Error(`${label} must be outside every repository and public tree`)
  }
  if (empty && readdirSync(directory).length) throw new Error(`${label} must be empty`)
  return directory
}

function regularFile(root: string, name: string): string {
  const requested = resolve(root, name)
  if (!within(root, requested) || basename(requested) !== name || lstatSync(requested).isSymbolicLink()) {
    throw new Error(`${name} must be a regular file inside the private listener directory`)
  }
  const file = realpathSync(requested)
  if (!within(root, file) || !statSync(file).isFile()) throw new Error(`${name} escaped the private listener directory`)
  return file
}

const pendingDecision = (listener: VoiceAcceptanceBundle, listenerId: string): ListenerDecision => ({
  listenerId, blindingConfirmed: null, nativeAustralianEnglishSelfAttested: null, devices: [],
  clipRatings: listener.comparisons.flatMap(({ roleId, clips }) => clips.map(({ clipId }) => ({
    roleId, clipId, naturalness: null, australianAuthenticity: null, accentAssessment: null,
  }))),
  preferences: listener.comparisons.map(({ pairId }) => ({ pairId, preferredClipId: null })),
  recognitionAnswers: listener.recognitionTrials.map(({ trialId }) => ({ trialId, selectedChoiceId: null })),
  distinctnessDecisions: listener.distinctnessComparisons.map(({ pairId }) => ({ pairId, distinguishable: null })),
  defectReviewComplete: false, defects: [], reviewReference: '',
})

function safeInputs(listenerInput: unknown, templateInput: unknown, expectedBundleDigest: string) {
  const listener = listenerInput as VoiceAcceptanceBundle; const template = templateInput as ListenerSubmission
  const { bundleDigest, ...bundlePayload } = listener ?? {}
  const sourceKeys = ['candidateContentDigest', 'mediaManifestDigest', 'nameReviewDigest', 'performanceDigest', 'pronunciationDigest']
  if (!listener || !exactKeys(listener, ['assignmentDigest', 'blinded', 'bundleDigest', 'castingContractDigest',
    'comparisons', 'distinctnessApprovalDigest', 'distinctnessComparisons', 'recognitionTrials', 'schema', 'sourceDigests'])
    || !sha(expectedBundleDigest) || bundleDigest !== expectedBundleDigest
    || listener.schema !== 'simjury.court-week-voice-acceptance-bundle/v1' || listener.blinded !== true
    || !exactKeys(listener.sourceDigests, sourceKeys) || Object.values(listener.sourceDigests).some((value) => !sha(value))
    || ![bundleDigest, listener.assignmentDigest, listener.castingContractDigest,
      listener.distinctnessApprovalDigest].every(sha)
    || !Array.isArray(listener.comparisons) || listener.comparisons.length !== 28
    || listener.comparisons.some((entry) => !exactKeys(entry, ['canonicalTextDigest', 'clips', 'listenerLabel', 'pairId', 'roleId'])
      || !/^role-[0-9]{2}$/u.test(entry.roleId) || !/^ab-[0-9]{2}$/u.test(entry.pairId)
      || !sha(entry.canonicalTextDigest) || typeof entry.listenerLabel !== 'string' || !entry.listenerLabel.trim()
      || !Array.isArray(entry.clips) || entry.clips.length !== 2 || entry.clips.some((clip) =>
        !exactKeys(clip, ['audioSha256', 'clipId', 'exactSourceEvidenceSha256', 'integratedLufs', 'loudnessAnalysisEvidenceSha256'])
        || !Number.isFinite(clip.integratedLufs) || !sha(clip.audioSha256) || !sha(clip.exactSourceEvidenceSha256)
        || !sha(clip.loudnessAnalysisEvidenceSha256)))
    || !Array.isArray(listener.recognitionTrials) || listener.recognitionTrials.length !== 26
    || listener.recognitionTrials.some((entry) => !exactKeys(entry, ['canonicalTextDigest', 'exactSourceEvidenceSha256',
      'options', 'sampleAudioSha256', 'sampleClipId', 'trialId']) || !Array.isArray(entry.options)
      || !/^recognition-[0-9]{2}$/u.test(entry.trialId) || !sha(entry.sampleAudioSha256)
      || !sha(entry.canonicalTextDigest) || !sha(entry.exactSourceEvidenceSha256)
      || entry.options.length !== 4 || entry.options.some((option) => !exactKeys(option, ['choiceId', 'listenerLabel'])
        || !/^recognition-[0-9]{2}-choice-[1-4]$/u.test(option.choiceId)
        || typeof option.listenerLabel !== 'string' || !option.listenerLabel.trim()))
    || !Array.isArray(listener.distinctnessComparisons) || voiceReviewDigest(bundlePayload) !== bundleDigest
    || listener.distinctnessComparisons.some((entry) => !exactKeys(entry, ['clipIds', 'pairId'])
      || !Array.isArray(entry.clipIds) || entry.clipIds.length !== 2)
    || !template || !exactKeys(template, ['bundleDigest', 'listener', 'schema'])
    || template.schema !== VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA || template.bundleDigest !== bundleDigest
    || !/^listener-0[1-5]$/u.test(template.listener?.listenerId ?? '')
    || voiceReviewDigest(template.listener) !== voiceReviewDigest(pendingDecision(listener, template.listener.listenerId))) {
    throw new Error('Listener bundle and selected template must be exact, matched and completely unanswered')
  }
  const forbiddenKey = /(?:operator|provider|identity)/iu; const forbiddenValue = /\b(?:https?|wss?):\/\//iu
  const inspect = (value: unknown): void => {
    if (typeof value === 'string' && forbiddenValue.test(value)) throw new Error('Outbound URLs are forbidden')
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key) || key === 'candidateClipId' || key === 'kokoroClipId') {
        throw new Error(`Private routing field is forbidden: ${key}`)
      }
      inspect(entry)
    }
  }
  inspect(listener); inspect(template)
  const clips = [...listener.comparisons.flatMap(({ clips }) => clips.map(({ clipId, audioSha256 }) => (
    { clipId, audioSha256: String(audioSha256) }))),
    ...listener.recognitionTrials.map(({ sampleClipId: clipId, sampleAudioSha256: audioSha256 }) => ({ clipId, audioSha256 }))]
  if (clips.length !== 82 || new Set(clips.map(({ clipId }) => clipId)).size !== 82
    || new Set(clips.map(({ audioSha256 }) => audioSha256)).size !== 82
    || clips.some(({ clipId, audioSha256 }) => !/^(?:ab-[0-9]{2}-[ab]|recognition-[0-9]{2}-sample)$/u.test(clipId)
      || !/^sha256:[0-9a-f]{64}$/u.test(audioSha256))) throw new Error('The package requires exactly 82 unique opaque clips')
  return { listener, template, clips }
}

const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Private voice review</title><link rel="stylesheet" href="review.css"></head><body><a class="skip" href="#review-form">Skip to review form</a><main><header><p class="eyebrow">Private · offline · blinded</p><h1>Voice acceptance review</h1><p>This folder never connects to a network. All new candidate synthesis is Google Chirp 3 HD. Existing Kokoro audio appears only as a blinded rollback comparator; clip order never identifies either source.</p><dl><dt>Listener</dt><dd id="listener">Checking…</dd><dt>Audio clips</dt><dd id="clips">Checking…</dd></dl></header><nav aria-label="Review sections"><a href="#ratings">Clip ratings</a><a href="#preferences">A/B choices</a><a href="#recognition">Recognition</a><a href="#distinctness">Voice pairs</a><a href="#finish">Finish</a></nav><form id="review-form" aria-labelledby="review-title"><h2 id="review-title">Your private review</h2></form><p id="status" tabindex="-1" role="status" aria-live="polite">Opening the sealed review package…</p><noscript>JavaScript is required to complete this local review.</noscript></main><script src="review-data.js"></script><script src="review-shell.js"></script></body></html>\n`
const css = `:root{font:100%/1.55 system-ui,sans-serif;color:#17201c;background:#f4f1e9}*{box-sizing:border-box}body{margin:0}main{width:min(100%,58rem);margin:auto;padding:clamp(1rem,5vw,3rem);overflow-wrap:anywhere}h1,h2,h3{line-height:1.18}h1{font-size:clamp(1.7rem,7vw,2.7rem)}.eyebrow{letter-spacing:.08em;text-transform:uppercase;font-weight:700;font-size:.78rem}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.4rem 1rem;padding:1rem;background:#fff;border:1px solid #aaa}dd{margin:0}nav{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.5rem 0}nav a,.button{padding:.65rem .85rem;border:1px solid currentColor;border-radius:.25rem}section{margin-block:2.5rem;scroll-margin-top:1rem}.cards{display:grid;gap:1rem}fieldset{min-width:0;margin:0;padding:1rem;border:1px solid #aaa;background:#fff}legend{max-width:100%;padding:.2rem;font-weight:700}label{display:grid;grid-template-columns:minmax(0,1fr);gap:.25rem;margin:.75rem 0;min-width:0}.choices label{display:flex;align-items:center;gap:.55rem;min-width:0;min-height:44px;max-width:100%}.choices{display:flex;flex-wrap:wrap;gap:.25rem 1rem;min-width:0}input,select,button{font:inherit;min-height:44px;min-width:0;max-width:100%}input[type=checkbox],input[type=radio]{min-height:1.35rem;width:1.35rem;margin:0}input[type=text],select{width:100%;padding:.5rem}audio{display:block;width:100%;height:44px;max-width:100%;overflow:hidden;margin:.65rem 0}details{margin-top:1rem;padding:.6rem;border-left:3px solid #777}summary{min-height:44px;cursor:pointer;font-weight:650}.scale-note,.privacy{color:#4a534f}.button{cursor:pointer;color:#fff;background:#263f35;font-weight:700}.skip{position:absolute;left:-9999px}.skip:focus{left:.5rem;top:.5rem;z-index:2;padding:.6rem;background:#fff}a:focus-visible,input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #005fcc;outline-offset:3px}#status[data-kind=error]{color:#8b1a1a;font-weight:700}@media(max-width:20rem){dl{grid-template-columns:1fr}dt{font-weight:700}}@media(min-width:44rem){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(forced-colors:active){fieldset,dl,nav a,.button{border:2px solid CanvasText}}\n`
const shell = `'use strict';(()=>{
const data=globalThis.__SIMJURY_VOICE_REVIEW__;
if(!data||data.schema!==${JSON.stringify(VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA)}||!/^sha256:[0-9a-f]{64}$/.test(data.packageDigest))throw new Error('Private review package is invalid');
const form=document.querySelector('#review-form'),status=document.querySelector('#status');
const element=(tag,attributes,...children)=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(attributes||{})){if(key==='text')node.textContent=value;else if(key==='className')node.className=value;else if(typeof value==='boolean')node[key]=value;else node.setAttribute(key,value)}for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child);return node};
const heading=(id,title,copy)=>element('header',{},element('h2',{id,text:title}),element('p',{text:copy}));
const section=(id,title,copy,...children)=>element('section',{id,'aria-labelledby':id+'-title'},heading(id+'-title',title,copy),...children);
const fieldset=(title,...children)=>element('fieldset',{},element('legend',{text:title}),...children);
const option=(value,label)=>element('option',{value,text:label});
const select=(name,label,values)=>element('label',{},element('span',{text:label}),element('select',{name,required:true},option('','Choose'),...values.map(([value,text])=>option(value,text))));
const choice=(name,value,label,required=false)=>element('label',{},element('input',{type:'radio',name,value,required}),label);
const check=(name,value,label,required=false)=>element('label',{},element('input',{type:'checkbox',name,value,required}),label);
const audio=(clipId,label)=>element('audio',{controls:true,preload:'none',src:clipId+'.mp3','aria-label':label});
const scale=[1,2,3,4,5].map(value=>[String(value),String(value)]);
form.append(section('about','Before you listen','Confirm the review conditions and every device you actually use.',
  fieldset('Review conditions',check('blindingConfirmed','yes','I have not been shown which A/B clip is the new candidate.',true),
    element('div',{className:'choices'},choice('nativeAustralian','yes','I am a native Australian English listener.',true),choice('nativeAustralian','no','I am not a native Australian English listener.'))),
  fieldset('Listening devices',element('p',{text:'Choose at least one. Across the five listeners, headphones, laptop speakers and a representative phone must all be covered.'}),
    element('div',{className:'choices'},check('devices','reference-headphones','Reference headphones'),check('devices','laptop-speakers','Laptop speakers'),check('devices','representative-phone','Representative phone')))));
const ratingCards=data.listener.comparisons.flatMap(comparison=>comparison.clips.map((clip,index)=>fieldset(comparison.listenerLabel+' · Clip '+(index?'B':'A'),
  audio(clip.clipId,comparison.listenerLabel+' clip '+(index?'B':'A')),element('p',{className:'scale-note',text:'Rate 1 (poor) to 5 (excellent).'}),
  select('naturalness-'+clip.clipId,'Naturalness',scale),select('authenticity-'+clip.clipId,'Australian authenticity',scale),
  select('accent-'+clip.clipId,'Accent assessment',[['australian','Australian'],['not-australian','Not Australian']]),
  element('details',{},element('summary',{text:'Defect disposition'}),select('defect-kind-'+clip.clipId,'Defect type',[['clear','No defect'],['attribution','Attribution'],['pronunciation','Pronunciation'],['accent','Accent'],['intelligibility','Intelligibility'],['misleading-emotion','Misleading emotion']]),
    element('label',{},element('span',{text:'Resolution note (required for a defect)'}),element('input',{type:'text',name:'defect-note-'+clip.clipId})),check('defect-resolved-'+clip.clipId,'yes','The reported defect has been resolved.')))));
form.append(section('ratings','Clip ratings','Listen to every candidate and comparator clip. Defects remain in your local draft until resolved.',element('div',{className:'cards'},ratingCards)));
const preferenceCards=data.listener.comparisons.map(comparison=>fieldset(comparison.listenerLabel,
  audio(comparison.clips[0].clipId,comparison.listenerLabel+' A/B clip A'),audio(comparison.clips[1].clipId,comparison.listenerLabel+' A/B clip B'),
  element('div',{className:'choices'},choice('preference-'+comparison.pairId,comparison.clips[0].clipId,'Prefer A',true),choice('preference-'+comparison.pairId,comparison.clips[1].clipId,'Prefer B'),choice('preference-'+comparison.pairId,'tie','Tie'))));
form.append(section('preferences','A/B choices','Choose the more suitable performance without trying to identify its provider.',element('div',{className:'cards'},preferenceCards)));
const recognitionCards=data.listener.recognitionTrials.map(trial=>fieldset('Recurring voice '+trial.trialId.slice(-2),audio(trial.sampleClipId,'Recurring voice sample '+trial.trialId.slice(-2)),
  element('div',{className:'choices'},trial.options.map((entry,index)=>choice('recognition-'+trial.trialId,entry.choiceId,entry.listenerLabel,index===0)))));
form.append(section('recognition','Recurring-role recognition','Identify the same voice from four reviewed, perceptually comparable choices.',element('div',{className:'cards'},recognitionCards)));
const pairCards=data.listener.distinctnessComparisons.map((pair,index)=>fieldset('Required voice pair '+(index+1),audio(pair.clipIds[0],'Voice pair '+(index+1)+' clip A'),audio(pair.clipIds[1],'Voice pair '+(index+1)+' clip B'),
  element('div',{className:'choices'},choice('distinctness-'+pair.pairId,'yes','Clearly distinguishable',true),choice('distinctness-'+pair.pairId,'no','Not clearly distinguishable'))));
form.append(section('distinctness','Required voice pairs','Confirm every closest same-gender and adjacent-role pair remains distinguishable.',element('div',{className:'cards'},pairCards)));
form.append(section('finish','Finish the review','The downloaded JSON is private and bound to this exact bundle. Give it only to the review operator.',
  fieldset('Review completion',check('defectReviewComplete','yes','I reviewed every clip for attribution, pronunciation, accent, intelligibility and misleading emotion.',true),
    element('label',{},element('span',{text:'Review reference'}),element('input',{type:'text',name:'reviewReference',required:true,'aria-describedby':'reference-help'})),
    element('p',{id:'reference-help',className:'privacy',text:'Use the panel receipt or review-session reference. Do not enter your name or contact details.'}),
    element('button',{type:'submit',className:'button',text:'Download private submission'}))));
const draftKey='simjury:voice-acceptance:'+data.packageDigest+':'+data.template.listener.listenerId;
const notice=(message,error=false)=>{status.textContent=message;status.dataset.kind=error?'error':'ready';status.setAttribute('role',error?'alert':'status');if(error)status.focus()};
let storageWarningShown=false;const save=()=>{try{localStorage.setItem(draftKey,JSON.stringify([...new FormData(form).entries()]))}catch{if(!storageWarningShown){storageWarningShown=true;notice('Local draft storage is unavailable. Keep this page open until download.',true)}}};
try{const saved=JSON.parse(localStorage.getItem(draftKey)||'[]');const values=new Map();for(const [name,value] of saved)values.set(name,[...(values.get(name)||[]),value]);for(const control of form.elements){if(!control.name)continue;const entries=values.get(control.name)||[];if(control.type==='checkbox'||control.type==='radio')control.checked=entries.includes(control.value);else if(entries.length)control.value=entries[0]}}catch{try{localStorage.removeItem(draftKey)}catch{storageWarningShown=true}}
form.addEventListener('input',save);form.addEventListener('change',save);
let invalidFocusScheduled=false;form.addEventListener('invalid',event=>{const details=event.target.closest('details');if(details)details.open=true;if(!invalidFocusScheduled){invalidFocusScheduled=true;queueMicrotask(()=>{event.target.focus();invalidFocusScheduled=false})}status.textContent='Complete every required field before download.';status.dataset.kind='error'},true);
const decision=()=>{if(!form.reportValidity())return null;const values=new FormData(form),record=structuredClone(data.template.listener);record.blindingConfirmed=values.get('blindingConfirmed')==='yes';record.nativeAustralianEnglishSelfAttested=values.get('nativeAustralian')==='yes';record.devices=values.getAll('devices');
  if(!record.devices.length){notice('Choose at least one listening device.',true);return null}
  record.clipRatings=record.clipRatings.map(entry=>({...entry,naturalness:Number(values.get('naturalness-'+entry.clipId)),australianAuthenticity:Number(values.get('authenticity-'+entry.clipId)),accentAssessment:values.get('accent-'+entry.clipId)}));
  record.preferences=record.preferences.map(entry=>({...entry,preferredClipId:values.get('preference-'+entry.pairId)}));record.recognitionAnswers=record.recognitionAnswers.map(entry=>({...entry,selectedChoiceId:values.get('recognition-'+entry.trialId)}));record.distinctnessDecisions=record.distinctnessDecisions.map(entry=>({...entry,distinguishable:values.get('distinctness-'+entry.pairId)==='yes'}));
  record.defects=record.clipRatings.flatMap(entry=>{const kind=values.get('defect-kind-'+entry.clipId);if(!kind||kind==='clear')return[];const note=String(values.get('defect-note-'+entry.clipId)||'').trim(),resolved=values.get('defect-resolved-'+entry.clipId)==='yes';if(!note||!resolved)throw new Error(entry.clipId+': resolve the reported defect and record its disposition before download.');return[{clipId:entry.clipId,kind,resolved,note}]});record.defectReviewComplete=values.get('defectReviewComplete')==='yes';record.reviewReference=String(values.get('reviewReference')||'').trim();return record};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,entry])=>JSON.stringify(key)+':'+canonical(entry)).join(',')+'}':JSON.stringify(value);
form.addEventListener('submit',async event=>{event.preventDefault();try{const record=decision();if(!record)return;const submission={schema:'simjury.court-week-voice-acceptance-listener-submission/v1',bundleDigest:data.template.bundleDigest,listener:record};const json=canonical(submission)+'\\n',bytes=new TextEncoder().encode(json),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join(''),objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),link=element('a',{href:objectUrl,download:'voice-acceptance-'+record.listenerId+'-'+hash+'.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),0);notice('Submission downloaded. SHA-256: '+hash)}catch(error){notice(error instanceof Error?error.message:'Submission could not be built.',true)}});
document.querySelector('#listener').textContent=data.template.listener.listenerId;document.querySelector('#clips').textContent=String(data.clips.length);notice(storageWarningShown?'Package ready. Local draft storage is unavailable; keep this page open until download.':'Package ready. Your private draft is saved locally as you work.',storageWarningShown);globalThis.__SIMJURY_VOICE_REVIEW_READY__=data.packageDigest;
})();\n`
const readme = (bundle: string, reviewPackage: string) => `OFFLINE LAUNCH\n\nBundle: ${bundle}\nPackage: ${reviewPackage}\n\n1. Disconnect this computer from every network.\n2. Open review.html directly in a current browser. Do not run a web server.\n3. Confirm the page reports "Package ready" and 82 audio clips.\n4. Complete one listener slot and download the SHA-addressed private submission JSON.\n\nThe fail-closed Content Security Policy blocks connections, remote assets, fonts, frames and workers. Form drafts remain in this browser only. New candidate synthesis is Google Chirp 3 HD; existing Kokoro is a blinded rollback comparator only.\n`

export function createPrivateListenerReviewShell(
  sourceInput: string, outputInput: string, templateName: string, expectedBundleDigest: string,
) {
  const source = privateDirectory(sourceInput, 'Listener source'); const output = privateDirectory(outputInput, 'Review output', true)
  if (overlaps(source, output) || !/^submission-listener-0[1-5]\.json$/u.test(templateName)) {
    throw new Error('Listener source and review output must be separate, and one numbered template must be selected')
  }
  const listener = JSON.parse(readFileSync(regularFile(source, 'listener.json'), 'utf8')) as unknown
  const template = JSON.parse(readFileSync(regularFile(source, templateName), 'utf8')) as unknown
  const checked = safeInputs(listener, template, expectedBundleDigest)
  const expected = new Set(checked.clips.map(({ clipId }) => `${clipId}.mp3`))
  const audioEntries = readdirSync(source, { withFileTypes: true }).filter(({ name }) => name.endsWith('.mp3'))
  if (audioEntries.length !== 82 || audioEntries.some((entry) => !entry.isFile() || !expected.has(entry.name))) {
    throw new Error('Listener source must contain exactly the expected 82 opaque MP3 files')
  }
  const sources = checked.clips.map((clip) => {
    const sourceFile = regularFile(source, `${clip.clipId}.mp3`)
    if (digest(readFileSync(sourceFile)) !== clip.audioSha256) throw new Error(`${clip.clipId}: audio SHA-256 is stale`)
    return { ...clip, sourceFile }
  })
  for (const clip of sources) {
    const destination = join(output, `${clip.clipId}.mp3`)
    copyFileSync(clip.sourceFile, destination, constants.COPYFILE_EXCL)
    if (digest(readFileSync(destination)) !== clip.audioSha256) throw new Error(`${clip.clipId}: copied audio SHA-256 changed`)
  }
  const payload = { schema: VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA, bundleDigest: checked.listener.bundleDigest,
    templateDigest: voiceReviewDigest(checked.template), listener: checked.listener, template: checked.template,
    clips: checked.clips.map(({ clipId, audioSha256 }) => ({ clipId, audioSha256 })) }
  const packageDigest = voiceReviewDigest(payload)
  const data = `globalThis.__SIMJURY_VOICE_REVIEW__=${JSON.stringify({ ...payload, packageDigest })};\n`
    .replace(/[<\u2028\u2029]/gu, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`)
  for (const [name, bytes] of [['review.html', html], ['review.css', css], ['review-shell.js', shell],
    ['review-data.js', data], ['README.txt', readme(checked.listener.bundleDigest, packageDigest)]] as const) {
    writeFileSync(join(output, name), bytes, { flag: 'wx' })
  }
  return { packageDigest, bundleDigest: checked.listener.bundleDigest, listenerId: checked.template.listener.listenerId,
    clipCount: checked.clips.length, launchFile: join(output, 'review.html') }
}

const argument = (name: string): string => {
  const index = process.argv.indexOf(name); const value = index < 0 ? undefined : process.argv[index + 1]
  if (!value) throw new Error(`${name} is required`); return value
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) console.log(JSON.stringify(
  createPrivateListenerReviewShell(argument('--listener-directory'), argument('--output'), argument('--template'),
    argument('--expected-bundle-digest')), null, 2))
