/* Voice-activated prediction notes app.
   Flow: secret tap -> wake word -> spectator's choice -> typed reveal. */
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Settings (persisted in localStorage) ---------- */
const DEF = { wake:'coco', aliases:'koko, coca, cocoa', corner:'bottom-right', size:90, taps:1, speed:85,
  lang:'en-US', timeout:12, settle:1300, vibrate:true, auto:true, numMode:'exact', caseMode:'title',
  humanize:true, typos:false, fuzzy:true, theme:'auto', startFull:true };
let S = { ...DEF };
try { Object.assign(S, JSON.parse(localStorage.getItem('sn_cfg_v1') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('sn_cfg_v1', JSON.stringify(S)); } catch {} };

const LANGS = [['en-US','English (US)'],['en-GB','English (UK)'],['en-IN','English (India)'],['hi-IN','Hindi'],
  ['es-ES','Spanish'],['fr-FR','French'],['de-DE','German'],['pt-BR','Portuguese (BR)'],['ja-JP','Japanese'],['ar-SA','Arabic']];
const FIELDS = [
  { k:'wake', l:'Wake word', t:'text' },
  { k:'aliases', l:'Alternate spellings', t:'text', h:'Comma separated. What the recognizer may hear instead.' },
  { k:'corner', l:'Hotspot corner', t:'select', o:[['top-left','Top left'],['top-right','Top right'],['bottom-left','Bottom left'],['bottom-right','Bottom right']] },
  { k:'size', l:'Hotspot size (px)', t:'range', min:40, max:200, step:10 },
  { k:'taps', l:'Taps required', t:'select', o:[[1,'1 tap'],[2,'2 taps'],[3,'3 taps']] },
  { k:'speed', l:'Typing speed (ms per character)', t:'range', min:20, max:250, step:5 },
  { k:'lang', l:'Recognition language', t:'select', o:LANGS },
  { k:'timeout', l:'Capture timeout (seconds)', t:'range', min:5, max:30, step:1 },
  { k:'settle', l:'Pause before reveal (ms)', t:'range', min:600, max:3000, step:100, h:'Silence after the choice before typing starts.' },
  { k:'caseMode', l:'Capitalization', t:'select', o:[['title','Title Case'],['first','First letter only'],['asheard','Exactly as heard']] },
  { k:'numMode', l:'Spoken numbers', t:'select', o:[['exact','Exactly as heard'],['digits','Convert words to digits']] },
  { k:'theme', l:'Theme', t:'select', o:[['auto','Match phone'],['light','Light'],['dark','Dark']] },
  { k:'auto', l:'Reveal automatically', t:'check', h:'Off: prediction waits until you tap the hotspot again.' },
  { k:'humanize', l:'Human typing rhythm', t:'check' },
  { k:'typos', l:'Occasional typo and correction', t:'check' },
  { k:'fuzzy', l:'Forgiving wake word match', t:'check' },
  { k:'startFull', l:'Full screen on Start performance', t:'check' },
  { k:'vibrate', l:'Vibration feedback', t:'check', h:'1 short = armed, 3 pulses = wake word heard, 1 long = done.' },
];

/* ---------- State machine ---------- */
const ALLOWED = {
  IDLE:['NOTE_OPEN'],
  NOTE_OPEN:['ARMED','TYPING','IDLE','ERROR'],
  ARMED:['CAPTURING','NOTE_OPEN','ERROR','IDLE'],
  CAPTURING:['ARMED','READY','TYPING','NOTE_OPEN','ERROR','IDLE'],
  READY:['TYPING','NOTE_OPEN','IDLE'],
  TYPING:['COMPLETED','NOTE_OPEN','IDLE'],
  COMPLETED:['NOTE_OPEN','IDLE'],
  ERROR:['ARMED','NOTE_OPEN','IDLE'],
};
let state = 'IDLE';
const logs = [];
const dbg = { heard:'-', error:'-', perm:'unknown', listening:false };
function log(m) { logs.push(m); if (logs.length > 8) logs.shift(); }
function go(s, force = false) {
  if (s === state) return true;
  if (!force && !ALLOWED[state].includes(s)) { log(`blocked ${state} > ${s}`); return false; }
  log(`${state} > ${s}`); state = s; return true;
}
const buzz = (p) => { if (S.vibrate && navigator.vibrate) navigator.vibrate(p); };

/* ---------- Text helpers ---------- */
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
function lev(a, b) { // Levenshtein distance for forgiving wake matching
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
/* Returns {toks,end} where toks are the original words and end is the index just after the wake word. */
function findWake(text) {
  const toks = text.split(/\s+/).filter(Boolean), nt = toks.map(norm);
  const phrases = [S.wake, ...S.aliases.split(',')].map(norm).filter(Boolean);
  for (const ph of phrases) {
    const n = ph.split(' ').length, flat = ph.replace(/ /g, '');
    for (let m = n; m <= n + 1; m++) // m = n+1 catches "co co" for "coco"
      for (let k = 0; k + m <= nt.length; k++) {
        const cand = nt.slice(k, k + m).join('');
        if (cand === flat || (S.fuzzy && flat.length >= 4 && lev(cand, flat) <= 1)) return { toks, end: k + m };
      }
  }
  return null;
}
const afterWake = (t) => {
  const w = findWake(t);
  if (!w) return t.trim();
  return w.toks.slice(w.end).join(' ').trim();
};

function stripWakePrefix(text) {
  if (!text || !S.wake) return text.trim();
  const cleaned = text.trim();
  const phrases = [S.wake, ...S.aliases.split(',')].map(norm).filter(Boolean);
  for (const ph of phrases) {
    if (!ph) continue;
    const match = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const re = new RegExp(`^\\s*${ph.replace(/\s+/g, '\\s+')}(?:\\s+|$)`, 'i');
    if (re.test(match)) return cleaned.replace(re, '').trim();
  }
  return cleaned;
}

const U = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,
  fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19 };
const T = { twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90 };
const SC = { thousand:1e3, million:1e6, billion:1e9 };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function wordsToDigits(text) { // "seven thousand four hundred twenty-five" -> "7425"
  const toks = text.replace(/-/g, ' ').split(' '), out = []; let run = [];
  const isN = (w) => { w = w.toLowerCase(); return has(U, w) || has(T, w) || w === 'hundred' || has(SC, w); };
  const flush = () => {
    if (!run.length) return;
    const lw = run.map((w) => w.toLowerCase());
    if (lw.length > 1 && lw.every((w) => has(U, w) && U[w] < 10)) out.push(lw.map((w) => U[w]).join('')); // "four two seven"
    else {
      let tot = 0, cur = 0;
      lw.forEach((w) => { if (has(U, w)) cur += U[w]; else if (has(T, w)) cur += T[w];
        else if (w === 'hundred') cur = (cur || 1) * 100; else { tot += (cur || 1) * SC[w]; cur = 0; } });
      out.push(String(tot + cur));
    }
    run = [];
  };
  toks.forEach((w, i) => {
    if (isN(w)) run.push(w);
    else if (w.toLowerCase() === 'and' && run.length && isN(toks[i + 1] || '')) { /* skip "and" inside a number */ }
    else { flush(); out.push(w); }
  });
  flush();
  return out.join(' ');
}
const SMALL = new Set(['a','an','the','of','in','on','at','to','for','and','but','or','nor','by','with','vs']);
function formatPrediction(t) {
  t = t.replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim();
  if (S.numMode === 'digits') t = wordsToDigits(t);
  if (S.caseMode === 'title')
    t = t.split(' ').map((w, i) => (w.length > 1 && w === w.toUpperCase()) ? w :
      (i > 0 && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  else if (S.caseMode === 'first') t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/* ---------- Speech recognition ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, wantListen = false, lastRes = null;
let capStart = 0, stripFirst = true, carry = '', capT = 0, settleT = 0, restartT = 0, pending = '';

function openRec() {
  try {
    rec = new SR();
    rec.lang = S.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onresult = onResult; rec.onerror = onRecError; rec.onend = onRecEnd;
    rec.onstart = () => { dbg.listening = true; };
    rec.start();
  } catch (e) { fail('start failed: ' + e.message); }
}
function startRec() {
  if (!SR) { fail('SpeechRecognition not supported in this browser'); return; }
  stopRec(); wantListen = true; lastRes = null; carry = ''; openRec();
}
function stopRec() { // detach handlers first so stale events can never fire
  wantListen = false; dbg.listening = false;
  clearTimeout(restartT); clearTimeout(capT); clearTimeout(settleT);
  if (rec) { rec.onresult = rec.onend = rec.onerror = rec.onstart = null; try { rec.abort(); } catch {} rec = null; }
}
function fail(msg) { dbg.error = msg; stopRec(); go('ERROR', true); buzz([200, 80, 200]); }
function onRecError(e) {
  dbg.error = e.error;
  if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fail('Microphone permission denied');
  else if (e.error === 'audio-capture') fail('No microphone available');
  else if (e.error === 'language-not-supported') fail('Language not supported');
  // no-speech / aborted / network blips: onend restarts the session
}
function onRecEnd() { // Chrome ends sessions on silence; restart while we still want to listen
  if (!wantListen) return;
  if (state === 'CAPTURING') { carry = buildCapture(); capStart = 0; stripFirst = false; }
  lastRes = null; rec = null; dbg.listening = false;
  restartT = setTimeout(() => { if (wantListen) openRec(); }, 200);
}
function buildCapture() { // everything said AFTER the wake word, with Android duplicate results collapsed
  const parts = [];
  if (lastRes) for (let j = capStart; j < lastRes.length; j++) {
    let t = lastRes[j][0].transcript.trim();
    if (j === capStart && stripFirst) t = afterWake(t);
    if (t) parts.push(t);
  }
  const out = parts.filter((p, i) => !(parts[i + 1] && norm(parts[i + 1]).startsWith(norm(p))));
  return (carry + ' ' + out.join(' ')).trim();
}
function onResult(e) {
  lastRes = e.results;
  if (state === 'ARMED') { // stage 1: listen only for the wake word
    for (let i = e.resultIndex; i < e.results.length; i++)
      for (let k = 0; k < e.results[i].length; k++) {
        const t = e.results[i][k].transcript; dbg.heard = t;
        if (findWake(t)) {
          capStart = i; stripFirst = true; carry = '';
          go('CAPTURING'); buzz([30, 60, 30, 60, 30]);
          capT = setTimeout(() => { if (state === 'CAPTURING' && !buildCapture()) go('ARMED'); }, S.timeout * 1000);
          return handleCapture();
        }
      }
  } else if (state === 'CAPTURING') handleCapture(); // stage 2: collect the spectator's choice
}
function handleCapture() {
  const txt = buildCapture(); dbg.heard = txt || dbg.heard;
  if (!txt) return;
  clearTimeout(capT); clearTimeout(settleT);
  const fin = lastRes && lastRes[lastRes.length - 1].isFinal;
  settleT = setTimeout(() => finish(buildCapture()), fin ? 550 : S.settle);
}
function finish(raw) {
  const cleaned = stripWakePrefix(raw || '');
  const text = formatPrediction(cleaned);
  if (!text) { go('ARMED'); return; }
  stopRec(); pending = text; // microphone off as soon as the choice is captured
  if (S.auto) reveal(text); else go('READY');
}

/* ---------- Typing animation ---------- */
let typeTok = 0;
async function reveal(text) {
  if (!editorOpen || !go('TYPING')) return;
  const tok = ++typeTok; stopRec();
  let sp = $('#typed');
  if (!sp) { sp = document.createElement('span'); sp.id = 'typed'; body.appendChild(sp); }
  sp.classList.add('caret');
  await sleep(450);
  for (const ch of text) {
    if (tok !== typeTok) return; // cancelled by reset
    if (S.typos && /[a-z]/i.test(ch) && sp.textContent.length > 2 && Math.random() < 0.05) {
      sp.textContent += 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(Math.random() * 26)];
      await sleep(S.speed * 2.2); if (tok !== typeTok) return;
      sp.textContent = sp.textContent.slice(0, -1); await sleep(S.speed * 1.5);
    }
    sp.textContent += ch; body.scrollTop = body.scrollHeight;
    let d = S.speed; if (S.humanize) d *= 0.55 + Math.random() * 0.9; if (ch === ' ') d *= 1.4;
    await sleep(d);
  }
  await sleep(900); if (tok !== typeTok) return;
  sp.classList.remove('caret'); buzz([60]); go('COMPLETED');
}

/* ---------- Notes data and navigation ---------- */
const ago = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-US', { month:'short', day:'numeric' });
let notes = [
  { t:'Grocery list', secret:true, b:'Oat milk\nEggs\nSpinach\nCoffee beans\nLemons', c:'c1', d:ago(0) },
  { t:'Meeting notes', b:'Q4 planning with design. Share roadmap draft by Friday and book the review room.', c:'c3', d:ago(1) },
  { t:'Birthday ideas', b:'Mini golf, board game cafe, picnic by the lake if the weather holds.', c:'c4', d:ago(2) },
  { t:'Books to read', b:'The Left Hand of Darkness\nPiranesi\nKlara and the Sun', c:'c2', d:ago(4) },
  { t:'Trip packing', b:'Passport, charger, rain jacket, sunscreen, headphones, notebook.', c:'c5', d:ago(6) },
  { t:'Gym plan', b:'Mon legs, Wed push, Fri pull. Stretch for 10 minutes after every session.', c:'', d:ago(9) },
  { t:'Wifi and codes', b:'Guest network: lakeview_guest\nParking gate opens at 7 am.', c:'c1', d:ago(12) },
];
const COLORS = ['c1','c2','c3','c4','c5'];
let current = null, editorOpen = false;
const app = $('#app'), editor = $('#editor'), body = $('#body'), title = $('#title');

function renderGrid() {
  const q = $('#search').value.trim().toLowerCase();
  const list = notes.filter((n) => !q || (n.t + ' ' + n.b).toLowerCase().includes(q));
  $('#grid').innerHTML = '';
  list.forEach((n) => {
    const el = document.createElement('article'); el.className = 'card ' + n.c;
    const h = document.createElement('h3'); h.textContent = n.t || 'Untitled';
    const p = document.createElement('p'); p.textContent = n.b;
    const d = document.createElement('time'); d.textContent = n.d;
    el.append(h, p, d); el.onclick = () => openNote(n); $('#grid').appendChild(el);
  });
  $('#count').textContent = notes.length + ' notes';
}
function openNote(n) { // n === null creates a brand new, completely blank note
  typeTok++; stopRec(); pending = '';
  current = n || { t:'', b:'', c:COLORS[Math.floor(Math.random() * 5)], d:ago(0), isNew:true };
  title.value = current.t; body.textContent = current.b;
  const now = new Date();
  $('#date').textContent = now.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + ', ' +
    now.toLocaleDateString('en-US', { weekday:'short' }) + ' ' + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  editorOpen = true; app.classList.add('in-editor'); editor.classList.add('open');
  state = 'IDLE'; go('NOTE_OPEN');
}
function closeNote() {
  typeTok++; stopRec(); pending = '';
  const t = title.value.trim(), b = body.innerText.replace(/\n$/, '');
  if (current && current.isNew) {
    // Do not save a freshly-created note. Keep the editor as a temporary draft only.
    current = null;
  } else if (current) {
    current.t = t; current.b = b;
  }
  editorOpen = false; app.classList.remove('in-editor'); editor.classList.remove('open');
  go('IDLE', true); renderGrid(); if (document.activeElement) document.activeElement.blur();
}
function resetTrick() {
  typeTok++; stopRec(); pending = '';
  const typed = $('#typed'); if (typed) typed.remove(); // only remove the revealed text, never the note's own text
  if (editorOpen) { if (current && current.isNew) { body.textContent = ''; title.value = ''; } go('NOTE_OPEN', true); }
  else go('IDLE', true);
}

/* ---------- Secret hotspot (coordinate check, no element, no interference) ---------- */
function hotRect() {
  const r = app.getBoundingClientRect(), s = S.size;
  return { x: S.corner.includes('left') ? r.left : r.right - s, y: S.corner.includes('top') ? r.top : r.bottom - s, s };
}
let taps = [];
document.addEventListener('pointerdown', (e) => {
  if (!editorOpen || sheetOpen || magicOpen) return;
  const h = hotRect();
  if (e.clientX < h.x || e.clientX > h.x + h.s || e.clientY < h.y || e.clientY > h.y + h.s) return;
  const now = Date.now(); taps = taps.filter((t) => now - t < 900); taps.push(now);
  if (taps.length < S.taps) return; taps = [];
  if (state === 'READY') reveal(pending);
  else if (state === 'NOTE_OPEN' || state === 'ERROR') arm();
}, { passive: true, capture: true });
function arm() { // first stage: this tap is the user gesture that lets the browser start the mic
  dbg.error = '-'; dbg.heard = '-';
  go('ARMED', true); buzz([25]); startRec();
}

/* ---------- Hidden settings sheet ---------- */
let sheetOpen = false, magicOpen = false, dbgTimer = 0;
const sheet = $('#sheet');
function buildFields(box = $('#fields')) {
  box.innerHTML = '';
  FIELDS.forEach((f) => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('div'); lab.innerHTML = `<span>${f.l}</span>` + (f.h ? `<small>${f.h}</small>` : '');
    let ctl;
    if (f.t === 'select') {
      ctl = document.createElement('select');
      f.o.forEach(([v, n]) => { const o = new Option(n, v); o.selected = String(S[f.k]) === String(v); ctl.add(o); });
    } else {
      ctl = document.createElement('input'); ctl.type = f.t === 'check' ? 'checkbox' : f.t;
      if (f.t === 'range') Object.assign(ctl, { min:f.min, max:f.max, step:f.step });
      if (f.t === 'check') ctl.checked = !!S[f.k]; else ctl.value = S[f.k];
    }
    const rv = document.createElement('span'); rv.className = 'rv'; if (f.t === 'range') rv.textContent = S[f.k];
    ctl.addEventListener('input', () => {
      let v = f.t === 'check' ? ctl.checked : ctl.value;
      if (typeof DEF[f.k] === 'number') v = Number(v);
      S[f.k] = v; rv.textContent = f.t === 'range' ? v : ''; save();
      if (f.k === 'theme') applyTheme();
      if (f.k === 'size' || f.k === 'corner') flash();
    });
    row.append(lab, f.t === 'range' ? Object.assign(document.createElement('div'), { style:'display:contents' }) : ctl);
    if (f.t === 'range') { row.lastChild.append(ctl, rv); }
    box.appendChild(row);
  });
}
function renderDebug() {
  const txt = [
    `state: ${state}`, `speech api: ${SR ? 'available' : 'NOT supported'}`, `mic permission: ${dbg.perm}`,
    `listening: ${dbg.listening}`, `heard: ${dbg.heard}`, `error: ${dbg.error}`, `log: ${logs.join(' | ')}`,
  ].join('\n');
  $('#debug').textContent = txt; $('#mDebug').textContent = txt;
  $('#mState').textContent = state; $('#mHeard').textContent = dbg.heard === '-' ? '' : 'Heard: ' + dbg.heard;
}
function queryPerm() {
  if (navigator.permissions) navigator.permissions.query({ name:'microphone' })
    .then((p) => { dbg.perm = p.state; p.onchange = () => { dbg.perm = p.state; }; }).catch(() => {});
}
function openSheet() {
  stopRec(); // opening settings always silences the microphone
  if (editorOpen && ['ARMED','CAPTURING','ERROR','READY'].includes(state)) go('NOTE_OPEN', true);
  sheetOpen = true; buildFields(); queryPerm(); renderDebug();
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
  dbgTimer = setInterval(renderDebug, 500);
}
function closeSheet() {
  sheetOpen = false; clearInterval(dbgTimer); $('#hsPreview').style.display = 'none';
  sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
}
function flash() { // show the hotspot outline briefly so it can be set up; never visible outside settings
  const h = hotRect(), el = $('#hsPreview');
  Object.assign(el.style, { display:'block', left:h.x + 'px', top:h.y + 'px', width:h.s + 'px', height:h.s + 'px' });
  clearTimeout(flash.t); flash.t = setTimeout(() => { el.style.display = 'none'; }, 1500);
}
$('#sheetClose').onclick = closeSheet;
$('#btnFlash').onclick = flash;
$('#btnReset').onclick = () => { resetTrick(); closeSheet(); };
$('#btnRetry').onclick = () => { closeSheet(); if (editorOpen) { go('NOTE_OPEN', true); arm(); } };
$('#btnMic').onclick = () => { // ask for permission ahead of time so no prompt appears on stage
  if (!navigator.mediaDevices) { dbg.error = 'MediaDevices unavailable (needs HTTPS)'; return; }
  navigator.mediaDevices.getUserMedia({ audio:true })
    .then((s) => { s.getTracks().forEach((t) => t.stop()); dbg.perm = 'granted'; dbg.error = '-'; })
    .catch((e) => { dbg.error = e.name; });
};
$('#manualGo').onclick = () => {
  const t = formatPrediction($('#manualText').value); if (!t) return;
  closeSheet(); $('#manualText').value = '';
  if (editorOpen) { stopRec(); go('NOTE_OPEN', true); pending = t; reveal(t); }
};
function longPress(el, ms, fn) {
  let t; el.addEventListener('pointerdown', () => { t = setTimeout(fn, ms); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
longPress($('#homeTitle'), 1200, openSheet);
const secretOpen = () => (current && current.secret ? openMagic() : openSheet());
longPress($('#date'), 1200, secretOpen);
longPress(title, 1200, () => { if (current && current.secret) openMagic(); });
document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's' && !magicOpen) { e.preventDefault(); openSheet(); } });

/* ---------- Magician page (hidden inside the "Grocery list" note) ---------- */
const magic = $('#magic');
function openMagic() {
  stopRec(); if (['ARMED','CAPTURING','ERROR','READY'].includes(state)) go('NOTE_OPEN', true);
  magicOpen = true; buildFields($('#mFields')); queryPerm(); renderDebug(); syncFull();
  magic.classList.add('open'); clearInterval(dbgTimer); dbgTimer = setInterval(renderDebug, 500);
}
function closeMagic() {
  magicOpen = false; clearInterval(dbgTimer); $('#hsPreview').style.display = 'none'; magic.classList.remove('open');
}
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function enterFull() { // must be called from a tap
  const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!f) { dbg.error = 'Fullscreen unsupported here (iPhone: Add to Home Screen)'; return; }
  try { const p = f.call(el); if (p && p.catch) p.catch(() => { dbg.error = 'Fullscreen blocked'; }); }
  catch { dbg.error = 'Fullscreen blocked'; }
}
function toggleFull() { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else enterFull(); }
function syncFull() { $('#btnFull').textContent = fsEl() ? 'Exit full screen' : 'Full screen'; }
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, syncFull));
function testWake() { // listens for 8 s and reports whether the wake word matched, without touching the trick state
  if (!SR) { dbg.error = 'SpeechRecognition not supported'; return; }
  stopRec(); dbg.heard = 'Say your wake word now...';
  const r = new SR(); r.lang = S.lang; r.interimResults = true; r.maxAlternatives = 3;
  r.onresult = (e) => { const t = e.results[e.results.length - 1][0].transcript; dbg.heard = t + (findWake(t) ? '  [wake word matched]' : '  [no match]'); };
  r.onerror = (e) => { dbg.error = e.error; };
  try { r.start(); setTimeout(() => { try { r.stop(); } catch {} }, 8000); } catch (e) { dbg.error = e.message; }
}
$('#magicBack').onclick = closeMagic;
$('#btnFull').onclick = toggleFull;
$('#btnStart').onclick = () => { if (S.startFull) enterFull(); closeMagic(); closeNote(); openNote(null); };
$('#mMic').onclick = $('#btnMic').onclick;
$('#mFlash').onclick = flash;
$('#mReset').onclick = () => { resetTrick(); dbg.heard = '-'; dbg.error = '-'; };
$('#mTest').onclick = testWake;
$('#mManualGo').onclick = () => {
  const t = formatPrediction($('#mManualText').value); if (!t) return;
  $('#mManualText').value = ''; closeMagic(); closeNote(); openNote(null); pending = t; reveal(t);
};

/* ---------- Theme and wiring ---------- */
function applyTheme() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]').content = dark ? '#000000' : '#f6f6f6';
}
$('#fab').onclick = () => openNote(null);
$('#backBtn').onclick = closeNote;
$('#saveBtn').onclick = closeNote;
$('#searchBtn').onclick = () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    enterFull();
  }
};
$('#search').addEventListener('input', renderGrid);
document.addEventListener('visibilitychange', () => { // never keep listening in the background
  if (document.hidden && ['ARMED','CAPTURING'].includes(state)) { stopRec(); go('NOTE_OPEN', true); }
});
applyTheme(); renderGrid(); queryPerm();
})();
