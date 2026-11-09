'use strict';
(() => {

// ---------- Constantes ----------
const API = 'https://api.tcgdex.net/v2';
const DATA_LANG = 'en';
const STORE_KEY = 'holo.data.v1';
const KEY_KEY = 'holo.anthropic-key';
const SETS_CACHE = 'holo.sets.v1';
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const CONDITIONS = [['MT', 'Mint'], ['NM', 'Near Mint'], ['EX', 'Excelente'], ['GD', 'Bien'], ['LP', 'Ligeramente jugada'], ['PL', 'Jugada'], ['PO', 'Pobre']];
const LANGS = [['es', 'Español'], ['en', 'Inglés'], ['fr', 'Francés'], ['de', 'Alemán'], ['it', 'Italiano'], ['pt', 'Portugués'], ['ja', 'Japonés']];
const VARIANTS = { normal: 'Normal', holo: 'Holo', reverse: 'Reverse holo', firstEdition: '1ª edición' };
const VAR_SHORT = { holo: 'Holo', reverse: 'Reverse', firstEdition: '1ª ed.' };
const VAR_PRICE = { normal: 'Versión normal', holo: 'Versión holo', reverse: 'Versión reverse holo', firstEdition: '1ª edición' };
// La etiqueta solo se muestra si la versión no es la de serie de esa carta
const variantTag = it => (it.variant === 'reverse' || it.variant === 'firstEdition' || (it.variant === 'holo' && it.variants && it.variants.normal)) ? VAR_SHORT[it.variant] : '';
const METRICS = [['trend', 'Tendencia'], ['avg30', 'Media de 30 días'], ['avg7', 'Media de 7 días'], ['avg', 'Precio medio de venta'], ['low', 'Precio más bajo']];
const MODELS = [['claude-haiku-5-5', 'Claude Haiku 5.5, más barato'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5, más preciso']];
const DEFAULT_SETTINGS = { metric: 'trend', model: 'claude-haiku-5-5', lang: 'es' };

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtEUR = v => (v == null || isNaN(v)) ? '—' : eur.format(v);
const pct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' });
const dfLong = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtDate = t => { const d = new Date(t); return isNaN(d) ? '' : dfLong.format(d); };
const fmtShort = t => { const d = new Date(t); return isNaN(d) ? '' : dfShort.format(d); };
const fmtDay = k => { const [y, m, d] = k.split('-').map(Number); return dfShort.format(new Date(y, m - 1, d)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const round2 = v => Math.round(v * 100) / 100;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const looseEq = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ')); };
const looseIncl = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
const digits = s => { const m = String(s ?? '').match(/\d+/); return m ? parseInt(m[0], 10) : null; };
const setIdOf = id => { const i = String(id).lastIndexOf('-'); return i > 0 ? id.slice(0, i) : id; };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function normNum(s) {
  if (s == null) return '';
  const t = String(s).toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([A-Z]*)0*(\d+)([A-Z]*)$/);
  return m ? m[1] + m[2] + m[3] : t;
}
function numCompare(a, b) {
  const da = digits(a), db = digits(b);
  if (da != null && db != null && da !== db) return da - db;
  return String(a).localeCompare(String(b));
}
function parseMoney(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s|€/g, '').replace(',', '.');
  if (!t) return null;
  const v = parseFloat(t);
  return isNaN(v) || v < 0 ? null : round2(v);
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function netMsg(e) {
  if (!navigator.onLine) return 'No hay conexión a internet.';
  if (e instanceof TypeError) return 'No se ha podido conectar con el servidor de cartas. Inténtalo de nuevo.';
  return e && e.message ? e.message : 'Ha fallado la conexión.';
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  try { if (t.showPopover && !t.matches(':popover-open')) t.showPopover(); } catch (e) { /* sin popover */ }
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { try { if (t.hidePopover && t.matches(':popover-open')) t.hidePopover(); } catch (e) { /* nada */ } }, 220);
  }, 2800);
}

// ---------- Datos ----------
function freshData() {
  return { v: 1, items: [], wishlist: [], history: [], settings: { ...DEFAULT_SETTINGS }, lastRefresh: 0 };
}
function normalizeData(d) {
  const out = freshData();
  if (!d || !Array.isArray(d.items)) return out;
  out.items = d.items.filter(i => i && i.cardId);
  out.wishlist = Array.isArray(d.wishlist) ? d.wishlist.filter(w => w && w.cardId) : [];
  out.history = Array.isArray(d.history) ? d.history.filter(h => h && h.d && typeof h.v === 'number') : [];
  out.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
  out.lastRefresh = d.lastRefresh || 0;
  return out;
}
function load() {
  try { return normalizeData(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); }
  catch (e) { return freshData(); }
}
let data = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch (e) { toast('No se ha podido guardar. Exporta una copia y libera espacio.'); }
}
const getKey = () => { try { return localStorage.getItem(KEY_KEY) || ''; } catch (e) { return ''; } };

// ---------- Precios ----------
function availableVariants(v) {
  const out = ['normal', 'holo', 'reverse', 'firstEdition'].filter(k => v && v[k]);
  return out.length ? out : ['normal'];
}
// En Cardmarket la versión reverse holo se vende como "foil" de la carta
function isFoil(variant, variants) {
  return variant === 'reverse' || (variant === 'holo' && !!(variants && variants.normal));
}
function pick(cm, metric, foil) {
  if (!cm) return null;
  const a = cm[metric], b = cm[metric + '-holo'];
  const v = foil ? (b ?? a) : (a ?? b);
  return typeof v === 'number' ? v : null;
}
function cmValue(cm, variant, variants) {
  const foil = isFoil(variant, variants);
  for (const m of [data.settings.metric, 'trend', 'avg30', 'avg', 'low']) {
    const v = pick(cm, m, foil);
    if (v != null && v > 0) return v;
  }
  return null;
}
function unitValue(it) {
  if (it.manualPrice != null && it.manualPrice > 0) return it.manualPrice;
  return cmValue(it.price, it.variant || 'normal', it.variants);
}
const metricLabel = () => (METRICS.find(m => m[0] === data.settings.metric) || METRICS[0])[1].toLowerCase();
const cmUrl = name => 'https://www.cardmarket.com/es/Pokemon/Products/Search?searchString=' + encodeURIComponent(name);

// ---------- TCGdex ----------
async function getJSON(url, timeout = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('El servidor de cartas ha respondido con un error (' + r.status + ').');
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servidor de cartas tarda demasiado en responder.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

let setsMem = null;
const isPocket = id => /^(A\d|B\d|P-A)/.test(id);
async function getSets() {
  if (setsMem) return setsMem;
  try {
    const c = JSON.parse(localStorage.getItem(SETS_CACHE) || 'null');
    if (c && Array.isArray(c.sets) && Date.now() - c.t < 3 * 864e5) { setsMem = c.sets; return setsMem; }
  } catch (e) { /* caché inválida */ }
  const sets = await getJSON(`${API}/${DATA_LANG}/sets`);
  setsMem = (Array.isArray(sets) ? sets : []).filter(s => s && s.id && !isPocket(s.id));
  try { localStorage.setItem(SETS_CACHE, JSON.stringify({ t: Date.now(), sets: setsMem })); } catch (e) { /* sin espacio */ }
  return setsMem;
}
const setById = id => (setsMem || []).find(s => s.id === id);

const setDetailMem = new Map();
function getSetDetail(id) {
  if (setDetailMem.has(id)) return setDetailMem.get(id);
  const p = getJSON(`${API}/${DATA_LANG}/sets/${encodeURIComponent(id)}`);
  setDetailMem.set(id, p);
  p.catch(() => setDetailMem.delete(id));
  return p;
}
async function getCard(id) {
  return getJSON(`${API}/${DATA_LANG}/cards/${encodeURIComponent(id)}`);
}
async function searchByName(name) {
  const tryName = async (n, lang) => {
    const l = await getJSON(`${API}/${lang}/cards?name=${encodeURIComponent(n)}`).catch(() => null);
    return Array.isArray(l) ? l : [];
  };
  let list = await tryName(name, DATA_LANG);
  if (!list.length) list = await tryName(name, 'es');
  if (!list.length) {
    const longest = name.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 4 && longest !== name) list = await tryName(longest, DATA_LANG);
  }
  return list;
}

// Busca cartas que encajen con nombre, número y total del set
async function findCandidates(q) {
  const sets = await getSets();
  const out = new Map();
  const add = (b, set, score) => {
    const prev = out.get(b.id);
    if (prev && prev.score >= score) return;
    const s = set || setById(setIdOf(b.id));
    out.set(b.id, { id: b.id, name: b.name, localId: b.localId, image: b.image, setName: s ? s.name : '', score });
  };
  const num = q.number ? normNum(q.number) : '';
  const tot = digits(q.total);
  const name = (q.name || '').trim();
  const tasks = [];

  if (num && tot) {
    let cands = sets.filter(s => s.cardCount && s.cardCount.official === tot);
    if (!cands.length) cands = sets.filter(s => s.cardCount && s.cardCount.total === tot);
    cands = cands.slice().reverse();
    if (q.setName) cands.sort((a, b) => looseIncl(b.name, q.setName) - looseIncl(a.name, q.setName));
    for (const s of cands.slice(0, 10)) {
      tasks.push(getSetDetail(s.id).then(d => {
        if (!d || !Array.isArray(d.cards)) return;
        for (const c of d.cards) {
          if (normNum(c.localId) !== num) continue;
          let sc = 50;
          if (name && (looseEq(c.name, name) || looseIncl(c.name, name))) sc += 40;
          if (q.setName && looseIncl(d.name, q.setName)) sc += 20;
          add(c, d, sc);
        }
      }).catch(() => {}));
    }
  }
  if (name) {
    tasks.push(searchByName(name).then(list => {
      const n = list.length;
      list.forEach((c, i) => {
        const s = setById(setIdOf(c.id));
        if (isPocket(setIdOf(c.id))) return;
        let sc = 10 + (n > 1 ? i / (n - 1) : 0);
        if (num && normNum(c.localId) === num) sc += 45;
        if (tot && s && s.cardCount && s.cardCount.official === tot) sc += 10;
        if (q.setName && s && looseIncl(s.name, q.setName)) sc += 15;
        add(c, s, sc);
      });
    }).catch(() => {}));
  }
  await Promise.all(tasks);
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 48);
}

// ---------- Reconocimiento con Claude ----------
const CLAUDE_SYSTEM = `You identify Pokémon Trading Card Game cards from photos.
Reply with ONLY one JSON object and nothing else:
{"name": "official English card name if you can tell it, e.g. \\"Charizard ex\\" or \\"Professor's Research\\"; otherwise the name as printed",
 "printedName": "the name exactly as printed on the card",
 "number": "collector number before the slash, exactly as printed, e.g. \\"025\\", \\"TG05\\", \\"GG12\\"; or null",
 "total": "the number after the slash as printed, e.g. \\"198\\"; or null",
 "setName": "English name of the expansion if you can identify it, otherwise null",
 "language": "two-letter code of the card's language, e.g. \\"es\\", \\"en\\", \\"ja\\"",
 "variant": "normal, holo, reverse or unknown (reverse = the whole card except the artwork is foil)",
 "confidence": a number from 0 to 1}
The collector number is usually printed in the bottom-left or bottom-right corner.
If the photo does not show a Pokémon card, reply {"error": "not_a_card"}.`;

async function recognizeWithClaude(canvas, key) {
  const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: data.settings.model || DEFAULT_SETTINGS.model,
        max_tokens: 400,
        system: CLAUDE_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'Identify this card.' }
          ]
        }]
      })
    });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    let msg = 'error ' + r.status;
    try { const e = await r.json(); if (e && e.error && e.error.message) msg = e.error.message; } catch (e) { /* sin cuerpo */ }
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  const j = await r.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('respuesta sin datos');
  const o = JSON.parse(m[0]);
  const s = v => (v == null || v === 'null' ? '' : String(v).trim());
  return {
    error: o.error || null,
    name: s(o.name), printedName: s(o.printedName), number: s(o.number), total: s(o.total),
    setName: s(o.setName), language: s(o.language).toLowerCase(), variant: s(o.variant).toLowerCase()
  };
}

// ---------- Reconocimiento con OCR gratuito ----------
let tessWorker = null;
let tessLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tessLoading) return tessLoading;
  tessLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = TESS_URL;
    sc.onload = () => res();
    sc.onerror = () => { tessLoading = null; rej(new Error('No se ha podido descargar el lector de texto.')); };
    document.head.appendChild(sc);
  });
  return tessLoading;
}
async function getWorker() {
  if (tessWorker) return tessWorker;
  await loadTesseract();
  tessWorker = await window.Tesseract.createWorker('eng');
  return tessWorker;
}
function prepCrop(src, x, y, w, h, scale) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    v = Math.max(0, Math.min(255, (v - 128) * 1.7 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const NUM_RE = /((?:TG|GG|SV|RC|SWSH|SM|XY|BW|SH|H)?\d{1,3})\s*[\/\\|]\s*((?:TG|GG|SV|RC|SH|H)?\d{2,3})/g;
function parseNumber(t) {
  const s = String(t || '').toUpperCase().replace(/[Oo](?=\d)/g, '0');
  NUM_RE.lastIndex = 0;
  let m;
  while ((m = NUM_RE.exec(s))) {
    const a = m[1], b = m[2];
    const tb = digits(b);
    if (tb && tb >= 10) return { number: a, total: b };
  }
  return { number: '', total: '' };
}
const STOP = new Set(['basic', 'basico', 'stage', 'fase', 'evolves', 'from', 'evoluciona', 'trainer', 'entrenador', 'item', 'objeto',
  'supporter', 'partidario', 'stadium', 'estadio', 'energy', 'energia', 'tool', 'herramienta', 'pokemon', 'tera', 'vmax', 'vstar',
  'put', 'this', 'card', 'the', 'ace', 'spec', 'regla', 'rule']);
function parseName(t) {
  const lines = String(t || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    const words = l.replace(/[^A-Za-zÀ-ÿ'’\- ]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && /^[A-ZÀ-Ý]/.test(w) && !STOP.has(norm(w)));
    if (words.length) return words[0];
  }
  return '';
}
async function recognizeWithOCR(canvas, framed) {
  const w = await getWorker();
  const W = canvas.width, H = canvas.height;
  let numText = '', nameText = '';
  if (framed) {
    await w.setParameters({ tessedit_pageseg_mode: '11' });
    numText = (await w.recognize(prepCrop(canvas, 0, H * 0.85, W, H * 0.15, 2))).data.text;
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    nameText = (await w.recognize(prepCrop(canvas, W * 0.04, H * 0.025, W * 0.72, H * 0.1, 2))).data.text;
  } else {
    await w.setParameters({ tessedit_pageseg_mode: '11' });
    const s = Math.min(1, 1600 / Math.max(W, H));
    const full = (await w.recognize(prepCrop(canvas, 0, 0, W, H, s))).data.text;
    numText = full;
    nameText = full.split('\n').slice(0, 8).join('\n');
  }
  return { ...parseNumber(numText), name: parseName(nameText) };
}

// ---------- Cámara ----------
let stream = null;
let torchOn = false;
const video = $('#video');
video.addEventListener('loadedmetadata', layoutFrame);

function camError(msg) {
  $('#cam-error-text').textContent = msg;
  $('#cam-error').hidden = false;
}
function layoutFrame() {
  const cam = $('#cam');
  const f = $('#cam-frame');
  const cw = cam.clientWidth, ch = cam.clientHeight;
  if (!cw || !ch) return;
  let h = ch * 0.84, w = h * 63 / 88;
  if (w > cw * 0.86) { w = cw * 0.86; h = w * 88 / 63; }
  f.style.width = w + 'px';
  f.style.height = h + 'px';
}
async function startCamera() {
  layoutFrame();
  if (stream) return;
  $('#cam-error').hidden = true;
  if (!window.isSecureContext) { camError('La cámara solo funciona si abres Holo desde una dirección https. Mientras tanto, usa «Subir foto».'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camError('Este navegador no deja usar la cámara aquí. Usa «Subir foto».'); return; }
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    if (currentView !== 'scan' || !$('#scan-result').hidden) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    video.srcObject = stream;
    await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    $('#btn-torch').hidden = !caps.torch;
    torchOn = false;
    $('#btn-torch').setAttribute('aria-pressed', 'false');
  } catch (e) {
    if (e.name === 'NotAllowedError') camError('Holo no tiene permiso para usar la cámara. Actívalo en los ajustes del navegador o usa «Subir foto».');
    else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') camError('No se ha encontrado ninguna cámara. Usa «Subir foto».');
    else camError('No se ha podido abrir la cámara. Usa «Subir foto».');
  }
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
}
function captureFrame() {
  if (!video.videoWidth) return null;
  const vr = video.getBoundingClientRect();
  const fr = $('#cam-frame').getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vr.width - vw * scale) / 2, offY = (vr.height - vh * scale) / 2;
  let sx = (fr.left - vr.left - offX) / scale, sy = (fr.top - vr.top - offY) / scale;
  let sw = fr.width / scale, sh = fr.height / scale;
  sx = Math.max(0, sx); sy = Math.max(0, sy);
  sw = Math.min(sw, vw - sx); sh = Math.min(sh, vh - sy);
  const c = document.createElement('canvas');
  c.width = 744; c.height = 1039;
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se ha podido abrir la imagen.'));
      i.src = url;
    });
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Flujo de escaneo ----------
let lastHint = null;
let scanToken = 0;

function setScanStatus(html) { $('#scan-status').innerHTML = html; }
function showScanResult() {
  stopCamera();
  $('#scan-live').hidden = true;
  $('#scan-result').hidden = false;
}
function resetScan() {
  scanToken++;
  lastHint = null;
  $('#scan-result').hidden = true;
  $('#scan-live').hidden = false;
  $('#scan-thumb').hidden = true;
  $('#scan-form').reset();
  clearCandidates('');
  if (currentView === 'scan') startCamera();
}
function clearCandidates(msg, busy) {
  $('#cand-grid').innerHTML = '';
  $('#cand-title').hidden = true;
  const m = $('#cand-msg');
  m.hidden = !msg;
  m.innerHTML = msg ? (busy ? '<span class="spin" aria-hidden="true"></span>' : '') + esc(msg) : '';
}
function renderScanMode() {
  const key = getKey();
  const model = (MODELS.find(m => m[0] === data.settings.model) || MODELS[0])[1].split(',')[0];
  $('#scan-mode').textContent = key ? 'Reconoce: ' + model : 'Reconoce: lector de texto gratuito';
}

async function handleCapture(canvas, framed) {
  const token = ++scanToken;
  showScanResult();
  const th = $('#scan-thumb');
  th.src = canvas.toDataURL('image/jpeg', 0.7);
  th.hidden = false;
  clearCandidates('');
  $('#scan-form').reset();

  let r = null;
  const key = getKey();
  if (key) {
    setScanStatus('<span class="spin" aria-hidden="true"></span>Claude está leyendo la carta…');
    try {
      r = await recognizeWithClaude(canvas, key);
      if (r) r.source = 'claude';
    } catch (e) {
      r = null;
      toast(e.status === 401 ? 'La clave de API no es válida. Se usa el lector gratuito.'
        : 'Claude ha dado un error (' + String(e.message || '').slice(0, 80) + '). Se usa el lector gratuito.');
    }
  }
  if (token !== scanToken) return;
  if (!r) {
    setScanStatus('<span class="spin" aria-hidden="true"></span>' + (tessWorker ? 'Leyendo el número de la carta…' : 'Preparando el lector de texto. La primera vez tarda unos segundos…'));
    try {
      r = await recognizeWithOCR(canvas, framed);
      r.source = 'ocr';
    } catch (e) {
      if (token !== scanToken) return;
      setScanStatus(esc(e.message || 'No se ha podido leer la carta.') + ' Escribe el nombre o el número abajo.');
      return;
    }
  }
  if (token !== scanToken) return;
  if (r.error === 'not_a_card') {
    setScanStatus('No parece una carta de Pokémon. Prueba con otra foto o búscala a mano.');
    return;
  }
  lastHint = { variant: r.variant, lang: r.language, setName: r.setName };
  const name = r.name || r.printedName || '';
  $('#q-name').value = name;
  $('#q-num').value = r.number || '';
  $('#q-total').value = r.total || '';
  const num = r.number ? r.number + (r.total ? '/' + r.total : '') : '';
  if (name || num) setScanStatus('Leído: ' + esc([name, num].filter(Boolean).join(', ')));
  else setScanStatus('No se ha podido leer la carta. Escribe el nombre o el número abajo.');
  if (name || num) await runSearch({ name, number: r.number, total: r.total, setName: r.setName }, true, token);
}

async function runSearch(q, auto, token) {
  if (!q.name && !q.number) { clearCandidates('Escribe al menos el nombre o el número de la carta.'); return; }
  if (q.number && !q.total && !q.name) { clearCandidates('Con solo el número no basta: añade el total del set (lo que va tras la barra) o el nombre.'); return; }
  clearCandidates('Buscando la carta…', true);
  let list;
  try { list = await findCandidates(q); }
  catch (e) { if (token == null || token === scanToken) clearCandidates(netMsg(e)); return; }
  if (token != null && token !== scanToken) return;
  if (!list.length) { clearCandidates('No hay ninguna carta con esos datos. Corrige el número o prueba solo con el nombre.'); return; }
  renderCandidates(list);
  const top = list[0], second = list[1];
  const confident = (list.length === 1 && top.score >= 50) || (top.score >= 85 && (!second || second.score < 60));
  if (auto && confident) openCard(top.id, { source: 'scan', hint: lastHint });
}
function renderCandidates(list) {
  $('#cand-msg').hidden = true;
  const t = $('#cand-title');
  t.hidden = false;
  t.textContent = list.length === 1 ? 'Esta es tu carta' : 'Elige tu carta (' + list.length + ' resultados)';
  $('#cand-grid').innerHTML = list.map(c => `
    <button class="tile" type="button" data-card="${esc(c.id)}">
      <span class="tile-img">${imgTag(c.image, 'low', c.name)}</span>
      <span class="tile-name">${esc(c.name)}</span>
      <span class="tile-meta">${esc(c.setName || setIdOf(c.id))}</span>
      <span class="tile-meta">Nº ${esc(c.localId)}</span>
    </button>`).join('');
}

// ---------- Imágenes ----------
function imgTag(base, q, alt, hero) {
  if (!base) return `<span class="noimg">${esc(alt || 'Sin imagen')}</span>`;
  return `<img src="${esc(base)}/${q}.webp" alt="${hero ? esc(alt || '') : ''}" data-fb="${esc(alt || '')}" loading="${hero ? 'eager' : 'lazy'}" decoding="async">`;
}
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.hasAttribute('data-fb')) {
    const s = document.createElement('span');
    s.className = 'noimg';
    s.textContent = t.getAttribute('data-fb') || 'Sin imagen';
    t.replaceWith(s);
  }
}, true);

// ---------- Hoja de la carta ----------
const sheet = $('#sheet');
let sheetCtx = null;
let sheetOnClose = null;

function openSheet() {
  if (sheet.open) return;
  sheet.showModal();
  try { history.pushState({ holoSheet: true }, ''); } catch (e) { /* nada */ }
}
function closeSheet(fromPop) {
  if (!sheet.open) return;
  sheet.close();
  if (!fromPop && history.state && history.state.holoSheet) history.back();
}
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
sheet.addEventListener('click', e => {
  if (e.target === sheet) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});
sheet.addEventListener('close', () => {
  sheetCtx = null;
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (cb) cb();
});
window.addEventListener('popstate', () => { if (sheet.open) closeSheet(true); });

function sheetShell(inner, crumb) {
  return `<div class="sheet-top"><p class="sheet-crumb">${esc(crumb || '')}</p><button class="btn btn-quiet" type="button" data-close>Cerrar</button></div>${inner}`;
}

async function openCard(cardId, ctx = {}) {
  const token = { ...ctx, cardId };
  sheetCtx = token;
  $('#sheet-body').innerHTML = sheetShell('<p class="loading"><span class="spin" aria-hidden="true"></span>Cargando la carta…</p>');
  openSheet();
  let card;
  try { card = await getCard(cardId); }
  catch (e) {
    if (sheetCtx !== token) return;
    $('#sheet-body').innerHTML = sheetShell(`<p class="error">${esc(netMsg(e))}</p><button class="btn" type="button" data-retry>Reintentar</button>`);
    $('[data-retry]', sheet).onclick = () => openCard(cardId, ctx);
    return;
  }
  if (sheetCtx !== token) return;
  if (!card) {
    $('#sheet-body').innerHTML = sheetShell('<p class="error">Esta carta ya no está en la base de datos de TCGdex.</p>');
    return;
  }
  syncPrice(card);
  renderCardSheet(card, ctx);
}

function syncPrice(card) {
  const p = (card.pricing && card.pricing.cardmarket) || null;
  let changed = false;
  for (const it of data.items) if (it.cardId === card.id) { it.price = p; it.priceAt = Date.now(); changed = true; }
  for (const w of data.wishlist) if (w.cardId === card.id) { w.price = p; w.priceAt = Date.now(); changed = true; }
  if (changed) save();
}

function pricePanelHTML(cm, variant, variants) {
  if (!cm) {
    return `<h3 class="h3">Precio en Cardmarket</h3><p class="help" style="margin-top:6px">Cardmarket no tiene precio para esta carta. Si sabes lo que vale, ponlo en «Valor manual».</p>`;
  }
  const foil = isFoil(variant, variants);
  const rows = [['trend', 'Tendencia'], ['avg30', 'Media 30 días'], ['avg7', 'Media 7 días'], ['avg1', 'Media 24 h'], ['avg', 'Media de venta'], ['low', 'Más bajo']]
    .map(([k, l]) => `<div class="prow${k === data.settings.metric ? ' is-ref' : ''}"><dt>${l}</dt><dd>${fmtEUR(pick(cm, k, foil))}</dd></div>`).join('');
  return `
    <div class="prices-head"><h3 class="h3">Precio en Cardmarket</h3><p class="prices-variant">${VAR_PRICE[variant] || ''}</p></div>
    <p class="price-big">${fmtEUR(cmValue(cm, variant, variants))}</p>
    <dl class="ptable">${rows}</dl>
    <p class="help">Actualizado el ${esc(fmtDate(cm.updated))}. Referencia: ${esc(metricLabel())}.${variant === 'firstEdition' ? ' La guía de Cardmarket no separa la 1ª edición: si vale más, pon un valor manual.' : ''}</p>`;
}

function itemFormHTML(st, vars, editing) {
  const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `
  <form class="item-form" id="item-form" novalidate>
    <h3 class="h3">${editing ? 'Tu copia' : 'Añadir a tu colección'}</h3>
    <fieldset class="seg"><legend>Versión</legend>
      ${vars.map(v => `<label><input type="radio" name="variant" value="${v}"${v === st.variant ? ' checked' : ''}><span>${VARIANTS[v]}</span></label>`).join('')}
    </fieldset>
    <div class="two">
      <label class="field">Estado<select name="condition">${opt(CONDITIONS, st.condition)}</select></label>
      <label class="field">Idioma<select name="lang">${opt(LANGS, st.lang)}</select></label>
    </div>
    <div class="two">
      <div class="field"><span id="qty-label">Cantidad</span>
        <div class="stepper" role="group" aria-labelledby="qty-label">
          <button type="button" data-step="-1" aria-label="Una menos">−</button>
          <input name="qty" type="text" inputmode="numeric" value="${st.qty}" aria-labelledby="qty-label">
          <button type="button" data-step="1" aria-label="Una más">+</button>
        </div>
      </div>
      <label class="field">Precio de compra (€)<input name="buyPrice" type="text" inputmode="decimal" placeholder="Opcional" value="${st.buyPrice}"></label>
    </div>
    <label class="field">Valor manual (€)
      <input name="manualPrice" type="text" inputmode="decimal" placeholder="Se usa el de Cardmarket" value="${st.manualPrice}">
      <span class="help">Para cartas gradeadas o sin precio. Sustituye al de Cardmarket.</span>
    </label>
    <div class="form-actions">
      ${editing
        ? '<button class="btn btn-primary" type="submit">Guardar cambios</button><button class="btn btn-danger-quiet" type="button" data-remove>Quitar de la colección</button>'
        : '<button class="btn btn-primary" type="submit">Añadir a la colección</button><button class="btn" type="button" data-wish>Añadir a deseos</button>'}
    </div>
  </form>`;
}

function wishFormHTML(w) {
  return `
  <form class="item-form" id="wish-form" novalidate>
    <h3 class="h3">En tu lista de deseos</h3>
    <label class="field">Precio objetivo (€)
      <input name="target" type="text" inputmode="decimal" placeholder="Opcional" value="${w.target != null ? String(w.target).replace('.', ',') : ''}">
      <span class="help">La verás marcada cuando su precio esté por debajo.</span>
    </label>
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">Guardar objetivo</button>
      <button class="btn" type="button" data-got>Ya la tengo</button>
      <button class="btn btn-danger-quiet" type="button" data-unwish>Quitar de deseos</button>
    </div>
  </form>`;
}

function readItemForm(f) {
  const fd = new FormData(f);
  let qty = parseInt(fd.get('qty'), 10);
  if (!(qty >= 1)) qty = 1;
  return {
    variant: fd.get('variant') || 'normal',
    condition: fd.get('condition') || 'NM',
    lang: fd.get('lang') || data.settings.lang,
    qty: Math.min(qty, 999),
    buyPrice: parseMoney(fd.get('buyPrice')),
    manualPrice: parseMoney(fd.get('manualPrice'))
  };
}

function cardBase(card) {
  return {
    cardId: card.id,
    name: card.name,
    setId: card.set ? card.set.id : setIdOf(card.id),
    setName: card.set ? card.set.name : '',
    setOfficial: card.set && card.set.cardCount ? card.set.cardCount.official : null,
    setLogo: card.set && card.set.logo ? card.set.logo : null,
    localId: String(card.localId),
    rarity: card.rarity || '',
    image: card.image || null,
    variants: card.variants || {},
    price: (card.pricing && card.pricing.cardmarket) || null,
    priceAt: Date.now()
  };
}

function addToCollection(card, f) {
  const same = data.items.find(i => i.cardId === card.id && i.variant === f.variant && i.condition === f.condition &&
    i.lang === f.lang && (i.buyPrice ?? null) === f.buyPrice && (i.manualPrice ?? null) === f.manualPrice);
  if (same) { same.qty = (same.qty || 1) + f.qty; save(); return same; }
  const it = { uid: uid(), ...cardBase(card), ...f, addedAt: Date.now() };
  data.items.push(it);
  save();
  return it;
}

function renderCardSheet(card, ctx) {
  const item = ctx.itemUid ? data.items.find(i => i.uid === ctx.itemUid) : null;
  const wish = ctx.wishUid ? data.wishlist.find(w => w.uid === ctx.wishUid) : null;
  const vars = availableVariants(card.variants);
  const hint = ctx.hint || {};
  const st = {
    variant: item ? item.variant : (vars.includes(hint.variant) ? hint.variant : vars[0]),
    condition: item ? item.condition : 'NM',
    lang: item ? item.lang : (LANGS.some(l => l[0] === hint.lang) ? hint.lang : data.settings.lang),
    qty: item ? item.qty : 1,
    buyPrice: item && item.buyPrice != null ? String(item.buyPrice).replace('.', ',') : '',
    manualPrice: item && item.manualPrice != null ? String(item.manualPrice).replace('.', ',') : ''
  };
  const cm = (card.pricing && card.pricing.cardmarket) || null;
  const ownedQty = data.items.filter(i => i.cardId === card.id).reduce((s, i) => s + (i.qty || 1), 0);
  const total = card.set && card.set.cardCount ? card.set.cardCount.official : null;
  const meta = [`Nº ${esc(card.localId)}${total ? '/' + total : ''}`];
  if (card.rarity) meta.push(esc(card.rarity));
  if (card.illustrator) meta.push('Ilustración de ' + esc(card.illustrator));

  $('#sheet-body').innerHTML = sheetShell(`
    <div class="card-hero">
      <div class="card-art">${imgTag(card.image, 'high', card.name, true)}</div>
      <div>
        <h2 class="card-name">${esc(card.name)}</h2>
        <p class="card-meta">${meta.join('<br>')}</p>
        ${ownedQty && !item ? `<p class="owned-note">Ya tienes ${ownedQty} ${ownedQty === 1 ? 'copia' : 'copias'}</p>` : ''}
        <a class="cm-link" href="${cmUrl(card.name)}" target="_blank" rel="noopener">Ver en Cardmarket</a>
      </div>
    </div>
    <div class="prices" id="price-panel">${pricePanelHTML(cm, st.variant, card.variants)}</div>
    ${wish ? wishFormHTML(wish) : itemFormHTML(st, vars, !!item)}
  `, card.set ? card.set.name : '');

  const body = $('#sheet-body');
  const itemForm = $('#item-form', body);
  if (itemForm) {
    itemForm.addEventListener('change', e => {
      if (e.target.name === 'variant') $('#price-panel').innerHTML = pricePanelHTML(cm, e.target.value, card.variants);
    });
    $$('[data-step]', itemForm).forEach(b => b.addEventListener('click', () => {
      const inp = itemForm.elements.qty;
      const v = Math.max(1, Math.min(999, (parseInt(inp.value, 10) || 1) + Number(b.dataset.step)));
      inp.value = v;
    }));
    itemForm.addEventListener('submit', e => {
      e.preventDefault();
      const f = readItemForm(itemForm);
      if (item) {
        Object.assign(item, f);
        save();
        toast('Cambios guardados');
        closeSheet();
      } else {
        addToCollection(card, f);
        toast('Añadida a tu colección: ' + card.name);
        if (ctx.source === 'scan') {
          sheetOnClose = () => resetScan();
        }
        closeSheet();
      }
      renderAll();
    });
    const rm = $('[data-remove]', itemForm);
    if (rm) rm.addEventListener('click', () => {
      if (!confirm('¿Quitar ' + card.name + ' de tu colección?')) return;
      data.items = data.items.filter(i => i !== item);
      save();
      toast('Carta quitada');
      closeSheet();
      renderAll();
    });
    const wb = $('[data-wish]', itemForm);
    if (wb) wb.addEventListener('click', () => {
      if (data.wishlist.some(w => w.cardId === card.id)) { toast('Ya está en tu lista de deseos'); return; }
      data.wishlist.push({ uid: uid(), ...cardBase(card), target: null, addedAt: Date.now() });
      save();
      toast('Añadida a deseos');
      renderAll();
    });
  }
  const wishForm = $('#wish-form', body);
  if (wishForm && wish) {
    wishForm.addEventListener('submit', e => {
      e.preventDefault();
      wish.target = parseMoney(wishForm.elements.target.value);
      save();
      toast('Objetivo guardado');
      closeSheet();
      renderAll();
    });
    $('[data-unwish]', wishForm).addEventListener('click', () => {
      data.wishlist = data.wishlist.filter(w => w !== wish);
      save();
      toast('Quitada de deseos');
      closeSheet();
      renderAll();
    });
    $('[data-got]', wishForm).addEventListener('click', () => {
      const it = addToCollection(card, { variant: vars[0], condition: 'NM', lang: data.settings.lang, qty: 1, buyPrice: null, manualPrice: null });
      data.wishlist = data.wishlist.filter(w => w !== wish);
      save();
      toast('Movida a tu colección. Revisa sus datos.');
      renderAll();
      sheetCtx = { itemUid: it.uid, cardId: card.id };
      renderCardSheet(card, { itemUid: it.uid });
    });
  }
}

// ---------- Colección ----------
function totals() {
  let value = 0, count = 0, missing = 0, paid = 0, paidValue = 0, paidCount = 0;
  const uniq = new Set();
  for (const it of data.items) {
    const q = it.qty || 1;
    const u = unitValue(it);
    count += q;
    uniq.add(it.cardId);
    if (u != null) value += u * q; else missing++;
    if (it.buyPrice != null) { paid += it.buyPrice * q; paidCount += q; if (u != null) paidValue += u * q; }
  }
  return { value: round2(value), count, uniq: uniq.size, missing, paid, paidValue, paidCount };
}
function recordSnapshot(total) {
  if (!data.items.length) return;
  const k = todayKey();
  const last = data.history[data.history.length - 1];
  if (last && last.d === k) {
    if (Math.abs(last.v - total) > 0.004) { last.v = total; save(); }
  } else {
    data.history.push({ d: k, v: total });
    if (data.history.length > 400) data.history.splice(0, data.history.length - 400);
    save();
  }
}
function renderChart() {
  const el = $('#chart');
  const h = data.history.slice(-90);
  if (h.length < 2) {
    el.innerHTML = `<p class="chart-empty">${data.items.length ? 'A partir de mañana verás aquí cómo cambia el valor de tu colección.' : 'Aquí verás cómo cambia el valor de tu colección.'}</p>`;
    return;
  }
  const W = 320, H = 72, p = 3;
  const vals = h.map(x => x.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 0.01) { max += 1; min = Math.max(0, min - 1); }
  const pts = h.map((x, i) => [p + (W - 2 * p) * i / (h.length - 1), p + (H - 2 * p) * (1 - (x.v - min) / (max - min))]);
  const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución del valor: de ${esc(fmtEUR(h[0].v))} a ${esc(fmtEUR(h[h.length - 1].v))}">
      <path class="chart-area" d="${d} L ${W - p} ${H} L ${p} ${H} Z"/>
      <path class="chart-line" d="${d}" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="chart-axis"><span>${esc(fmtDay(h[0].d))}</span><span>${esc(fmtDay(h[h.length - 1].d))}</span></div>`;
}
function renderDelta(t) {
  const el = $('#delta');
  const k = todayKey();
  const prev = [...data.history].reverse().find(x => x.d !== k);
  el.className = 'delta';
  if (!prev || !data.items.length) { el.textContent = ''; return; }
  const diff = round2(t.value - prev.v);
  if (Math.abs(diff) < 0.01) { el.textContent = 'Sin cambios desde el ' + fmtDay(prev.d); return; }
  el.classList.add(diff > 0 ? 'up' : 'down');
  const rel = prev.v > 0 ? ' (' + pct.format(diff / prev.v) + ')' : '';
  el.textContent = (diff > 0 ? '+' : '−') + fmtEUR(Math.abs(diff)) + rel + ' desde el ' + fmtDay(prev.d);
}
function tileHTML(it) {
  const v = unitValue(it);
  return `
    <button class="tile" type="button" data-uid="${esc(it.uid)}">
      <span class="tile-img">${imgTag(it.image, 'low', it.name)}${it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ''}${variantTag(it) ? `<span class="vtag">${variantTag(it)}</span>` : ''}</span>
      <span class="tile-name">${esc(it.name)}</span>
      <span class="tile-meta">${esc(it.setName)} ${esc(it.localId)}</span>
      <span class="tile-price${v == null ? ' none' : ''}">${v == null ? 'Sin precio' : fmtEUR(v)}</span>
    </button>`;
}
function renderCollection() {
  const t = totals();
  $('#total-value').textContent = fmtEUR(t.value);
  $('#seal-count').textContent = t.uniq;
  $('#total-sub').textContent = data.items.length
    ? `${t.count} ${t.count === 1 ? 'carta' : 'cartas'} en total${t.missing ? ', ' + t.missing + ' sin precio' : ''}`
    : 'Escanea una carta para empezar';
  recordSnapshot(t.value);
  renderDelta(t);
  renderChart();
  const pl = $('#slab-pl');
  if (t.paidCount) {
    const diff = round2(t.paidValue - t.paid);
    pl.hidden = false;
    pl.textContent = `Pagaste ${fmtEUR(t.paid)} por ${t.paidCount} ${t.paidCount === 1 ? 'carta' : 'cartas'}; hoy valen ${fmtEUR(t.paidValue)} (${diff >= 0 ? '+' : '−'}${fmtEUR(Math.abs(diff))}).`;
  } else pl.hidden = true;

  const q = norm($('#col-search').value);
  const sort = $('#col-sort').value;
  const list = data.items.filter(i => !q || norm(i.name + ' ' + i.setName + ' ' + i.localId).includes(q));
  const tv = i => (unitValue(i) ?? -1) * (i.qty || 1);
  const gain = i => i.buyPrice == null || unitValue(i) == null ? -Infinity : (unitValue(i) - i.buyPrice) * (i.qty || 1);
  const sorters = {
    value: (a, b) => tv(b) - tv(a),
    recent: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'es'),
    set: (a, b) => (a.setName || '').localeCompare(b.setName || '', 'es') || numCompare(a.localId, b.localId),
    gain: (a, b) => gain(b) - gain(a)
  };
  list.sort(sorters[sort] || sorters.value);
  $('#col-grid').innerHTML = list.map(tileHTML).join('');
  $('#col-empty').hidden = data.items.length > 0;
  $('#col-toolbar').hidden = !data.items.length;
  $('#btn-refresh').hidden = !data.items.length && !data.wishlist.length;
  $('#col-noresults').hidden = !(data.items.length && !list.length);
}

// ---------- Actualizar precios ----------
let refreshing = false, refreshDone = 0, refreshTotal = 0;
async function pool(arr, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, arr.length) }, async () => {
    while (i < arr.length) { const idx = i++; await fn(arr[idx], idx); }
  });
  await Promise.all(workers);
}
async function refreshPrices(silent) {
  if (refreshing) return;
  const ids = [...new Set([...data.items, ...data.wishlist].map(i => i.cardId))];
  if (!ids.length) { if (!silent) toast('Aún no tienes cartas que actualizar'); return; }
  if (!navigator.onLine) { if (!silent) toast('No hay conexión a internet'); return; }
  refreshing = true; refreshDone = 0; refreshTotal = ids.length;
  $('#btn-refresh').disabled = true;
  renderStatus();
  let fails = 0;
  await pool(ids, 4, async id => {
    try {
      const c = await getCard(id);
      if (c) {
        const p = (c.pricing && c.pricing.cardmarket) || null;
        for (const it of data.items) if (it.cardId === id) { it.price = p; it.priceAt = Date.now(); }
        for (const w of data.wishlist) if (w.cardId === id) { w.price = p; w.priceAt = Date.now(); }
      }
    } catch (e) { fails++; }
    refreshDone++;
    renderStatus();
  });
  refreshing = false;
  if (fails < ids.length) data.lastRefresh = Date.now();
  save();
  $('#btn-refresh').disabled = false;
  renderAll();
  if (!silent) toast(fails ? `Precios actualizados, salvo ${fails} ${fails === 1 ? 'carta' : 'cartas'}` : 'Precios actualizados');
}
function renderStatus() {
  const el = $('#top-status');
  if (refreshing) { el.innerHTML = `<span class="spin" aria-hidden="true"></span>Actualizando ${refreshDone} de ${refreshTotal}`; return; }
  el.textContent = data.lastRefresh ? 'Precios del ' + fmtShort(data.lastRefresh) : '';
}

// ---------- Deseos ----------
function renderWish() {
  const val = w => cmValue(w.price, 'normal', w.variants);
  const hit = w => { const v = val(w); return w.target != null && v != null && v <= w.target; };
  const list = data.wishlist.slice().sort((a, b) => (hit(b) - hit(a)) || ((b.addedAt || 0) - (a.addedAt || 0)));
  $('#wish-list').innerHTML = list.map(w => {
    const v = val(w), h = hit(w);
    return `
    <button class="wish-row${h ? ' is-hit' : ''}" type="button" data-wish="${esc(w.uid)}">
      <span class="tile-img">${imgTag(w.image, 'low', w.name)}</span>
      <span><span class="wish-name">${esc(w.name)}</span><span class="wish-meta">${esc(w.setName)}, nº ${esc(w.localId)}</span></span>
      <span class="wish-price">${fmtEUR(v)}
        ${w.target != null ? `<span class="wish-target">Objetivo ${fmtEUR(w.target)}</span>` : ''}
        ${h ? '<span class="hit">Por debajo</span>' : ''}
      </span>
    </button>`;
  }).join('');
  $('#wish-empty').hidden = data.wishlist.length > 0;
  $('#wish-lead').hidden = !data.wishlist.length;
}

// ---------- Sets ----------
let currentSet = null;
let setFilter = 'all';
let allSetsLimit = 20;

function progressHTML(have, official) {
  const p = official ? Math.min(100, Math.round(have / official * 100)) : 0;
  return `<span class="set-prog"><span class="bar"><span style="width:${p}%"></span></span><span class="set-count">${have}${official ? ' de ' + official : ''}</span></span>`;
}
function renderSets() {
  if (currentSet) return;
  const groups = new Map();
  for (const it of data.items) {
    let g = groups.get(it.setId);
    if (!g) { g = { id: it.setId, name: it.setName, official: it.setOfficial, logo: it.setLogo, owned: new Set(), value: 0, last: 0 }; groups.set(it.setId, g); }
    g.owned.add(normNum(it.localId));
    const u = unitValue(it);
    if (u) g.value += u * (it.qty || 1);
    g.last = Math.max(g.last, it.addedAt || 0);
  }
  const arr = [...groups.values()].sort((a, b) => b.last - a.last);
  $('#my-sets').innerHTML = arr.map(g => `
    <button class="set-row" type="button" data-set="${esc(g.id)}">
      <span class="set-logo">${g.logo ? `<img src="${esc(g.logo)}.webp" alt="" loading="lazy" data-fb="">` : ''}</span>
      <span><span class="set-name">${esc(g.name)}</span>${progressHTML(g.owned.size, g.official)}</span>
      <span class="set-value">${fmtEUR(round2(g.value))}</span>
    </button>`).join('');
  $('#sets-empty').hidden = arr.length > 0;
  renderAllSets();
}
async function renderAllSets() {
  const box = $('#all-sets');
  if (!setsMem) box.innerHTML = '<p class="loading"><span class="spin" aria-hidden="true"></span>Cargando sets…</p>';
  let sets;
  try { sets = await getSets(); }
  catch (e) { box.innerHTML = `<p class="error">${esc(netMsg(e))}</p>`; return; }
  const q = norm($('#set-search').value);
  let list = sets.slice().reverse();
  if (q) list = list.filter(s => norm(s.name + ' ' + s.id).includes(q));
  const shown = list.slice(0, q ? 60 : allSetsLimit);
  box.innerHTML = shown.map(s => `
    <button class="set-row" type="button" data-set="${esc(s.id)}">
      <span class="set-logo">${s.logo ? `<img src="${esc(s.logo)}.webp" alt="" loading="lazy" data-fb="">` : ''}</span>
      <span><span class="set-name">${esc(s.name)}</span><span class="set-sub">${s.cardCount ? s.cardCount.official + ' cartas' : ''}</span></span>
      <span></span>
    </button>`).join('') +
    (!q && list.length > shown.length ? '<button class="btn more" type="button" id="btn-more-sets">Mostrar más sets</button>' : '') +
    (q && !list.length ? '<p class="help">Ningún set se llama así.</p>' : '');
  const more = $('#btn-more-sets');
  if (more) more.addEventListener('click', () => { allSetsLimit += 40; renderAllSets(); });
}
async function openSet(id) {
  currentSet = id;
  setFilter = 'all';
  $('#sets-home').hidden = true;
  const box = $('#set-detail');
  box.hidden = false;
  box.innerHTML = '<button class="btn btn-quiet" type="button" data-back>Volver a sets</button><p class="loading"><span class="spin" aria-hidden="true"></span>Cargando el set…</p>';
  window.scrollTo(0, 0);
  try {
    const s = await getSetDetail(id);
    if (currentSet !== id) return;
    if (!s) { box.innerHTML = '<button class="btn btn-quiet" type="button" data-back>Volver a sets</button><p class="error">No se ha encontrado este set.</p>'; return; }
    renderSetDetail(s);
  } catch (e) {
    if (currentSet !== id) return;
    box.innerHTML = `<button class="btn btn-quiet" type="button" data-back>Volver a sets</button><p class="error">${esc(netMsg(e))}</p>`;
  }
}
function closeSet() {
  currentSet = null;
  $('#set-detail').hidden = true;
  $('#set-detail').innerHTML = '';
  $('#sets-home').hidden = false;
  renderSets();
}
function renderSetDetail(s) {
  const owned = new Map();
  for (const it of data.items) {
    if (it.setId !== s.id) continue;
    const k = normNum(it.localId);
    owned.set(k, (owned.get(k) || 0) + (it.qty || 1));
  }
  const cards = Array.isArray(s.cards) ? s.cards : [];
  const official = s.cardCount ? s.cardCount.official : cards.length;
  const have = cards.filter(c => owned.has(normNum(c.localId))).length;
  const shown = cards.filter(c => setFilter === 'all' || (setFilter === 'have') === owned.has(normNum(c.localId)));
  const chip = (k, l) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${setFilter === k}">${l}</button>`;
  const date = s.releaseDate ? fmtDate(s.releaseDate) : '';
  $('#set-detail').innerHTML = `
    <button class="btn btn-quiet" type="button" data-back>Volver a sets</button>
    <div class="set-head">
      ${s.logo ? `<img src="${esc(s.logo)}.webp" alt="${esc(s.name)}" data-fb="${esc(s.name)}">` : ''}
      <h1 class="h2" style="margin:0">${esc(s.name)}</h1>
      <p class="help">${date ? 'Salió el ' + esc(date) + '. ' : ''}${cards.length} cartas en total, ${official} en la numeración oficial.</p>
      ${progressHTML(have, cards.length)}
    </div>
    <div class="chips" role="group" aria-label="Mostrar">${chip('all', 'Todas')}${chip('have', 'Las que tengo')}${chip('miss', 'Me faltan')}</div>
    <div class="grid">${shown.map(c => {
      const q = owned.get(normNum(c.localId));
      return `
      <button class="tile ${q ? 'is-owned' : 'is-missing'}" type="button" data-card="${esc(c.id)}">
        <span class="tile-img">${imgTag(c.image, 'low', c.name)}${q > 1 ? `<span class="qty">×${q}</span>` : ''}</span>
        <span class="tile-name">${esc(c.name)}</span>
        <span class="tile-meta">Nº ${esc(c.localId)}${q ? ', la tienes' : ''}</span>
      </button>`;
    }).join('')}</div>
    ${!shown.length ? `<p class="help">${setFilter === 'have' ? 'Aún no tienes cartas de este set.' : '¡Lo tienes completo!'}</p>` : ''}`;
}

// ---------- Ajustes ----------
function renderSettings() {
  const opt = (sel, list, cur) => { sel.innerHTML = list.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join(''); };
  opt($('#set-model'), MODELS, data.settings.model);
  opt($('#set-metric'), METRICS, data.settings.metric);
  opt($('#set-lang'), LANGS, data.settings.lang);
  const key = getKey();
  $('#set-key').value = '';
  $('#set-key').placeholder = key ? 'Guardada (termina en ' + key.slice(-4) + ')' : 'sk-ant-...';
  $('#key-state').hidden = !key;
}

function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportJSON() {
  const out = { app: 'holo', v: 1, exportedAt: new Date().toISOString(), items: data.items, wishlist: data.wishlist, history: data.history, settings: data.settings, lastRefresh: data.lastRefresh };
  downloadFile('holo-coleccion-' + todayKey() + '.json', JSON.stringify(out), 'application/json');
}
function exportCSV() {
  const n = v => v == null ? '' : String(round2(v)).replace('.', ',');
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const head = ['Nombre', 'Set', 'Número', 'Versión', 'Estado', 'Idioma', 'Cantidad', 'Precio de compra', 'Valor unitario', 'Valor total'];
  const rows = data.items.map(it => {
    const u = unitValue(it);
    return [q(it.name), q(it.setName), q(it.localId), q(VARIANTS[it.variant] || it.variant), q(it.condition), q(it.lang), it.qty || 1, n(it.buyPrice), n(u), n(u == null ? null : u * (it.qty || 1))].join(';');
  });
  downloadFile('holo-coleccion-' + todayKey() + '.csv', '\uFEFF' + [head.map(q).join(';'), ...rows].join('\n'), 'text/csv');
}

// ---------- Navegación ----------
let currentView = 'collection';
function show(view) {
  currentView = view;
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.view === view ? 'page' : 'false'));
  document.body.classList.toggle('is-scan', view === 'scan');
  if (view === 'scan') {
    renderScanMode();
    if ($('#scan-result').hidden) requestAnimationFrame(startCamera);
  } else stopCamera();
  if (view === 'sets') renderSets();
  if (view === 'wish') renderWish();
  if (view === 'settings') renderSettings();
  if (view === 'collection') renderCollection();
  window.scrollTo(0, 0);
}
function showManual() {
  show('scan');
  scanToken++;
  showScanResult();
  $('#scan-thumb').hidden = true;
  $('#scan-form').reset();
  clearCandidates('');
  lastHint = null;
  setScanStatus('Escribe el nombre, el número o ambos.');
  setTimeout(() => $('#q-name').focus(), 50);
}
function renderAll() {
  renderCollection();
  renderStatus();
  if (currentView === 'wish') renderWish();
  if (currentView === 'sets') {
    if (currentSet) { const p = setDetailMem.get(currentSet); if (p) p.then(s => { if (s && currentSet === s.id) renderSetDetail(s); }).catch(() => {}); }
    else renderSets();
  }
}

// ---------- Eventos ----------
$$('.tab').forEach(t => t.addEventListener('click', () => {
  if (t.dataset.view === 'sets' && currentView === 'sets' && currentSet) { closeSet(); return; }
  if (t.dataset.view === 'scan' && currentView === 'scan' && !$('#scan-result').hidden) { resetScan(); return; }
  show(t.dataset.view);
}));
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { go.dataset.go === 'manual' ? showManual() : show(go.dataset.go); }
});
$('#col-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-uid]');
  if (!b) return;
  const it = data.items.find(i => i.uid === b.dataset.uid);
  if (it) openCard(it.cardId, { itemUid: it.uid });
});
$('#col-search').addEventListener('input', renderCollection);
$('#col-sort').addEventListener('change', renderCollection);
$('#btn-refresh').addEventListener('click', () => refreshPrices(false));

$('#cand-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-card]');
  if (b) openCard(b.dataset.card, { source: 'scan', hint: lastHint });
});
$('#btn-shutter').addEventListener('click', () => {
  const c = captureFrame();
  if (!c) { toast('La cámara aún no está lista'); return; }
  handleCapture(c, true);
});
$('#file-input').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const c = await fileToCanvas(f);
    const ratio = c.width / c.height;
    handleCapture(c, ratio > 0.66 && ratio < 0.78);
  } catch (err) { toast(err.message); }
});
$('#btn-torch').addEventListener('click', async () => {
  const track = stream && stream.getVideoTracks()[0];
  if (!track) return;
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    $('#btn-torch').setAttribute('aria-pressed', String(torchOn));
  } catch (e) { torchOn = false; toast('No se ha podido encender la linterna'); }
});
$('#btn-cam-retry').addEventListener('click', () => { stopCamera(); startCamera(); });
$('#btn-manual').addEventListener('click', showManual);
$('#btn-again').addEventListener('click', resetScan);
$('#scan-form').addEventListener('submit', e => {
  e.preventDefault();
  let number = $('#q-num').value.trim();
  let total = $('#q-total').value.trim();
  if (number.includes('/')) { const [a, b] = number.split('/'); number = a.trim(); if (!total) total = (b || '').trim(); }
  const name = $('#q-name').value.trim();
  document.activeElement && document.activeElement.blur();
  runSearch({ name, number, total, setName: lastHint && lastHint.setName }, false, scanToken);
});

$('#wish-list').addEventListener('click', e => {
  const b = e.target.closest('[data-wish]');
  if (!b) return;
  const w = data.wishlist.find(x => x.uid === b.dataset.wish);
  if (w) openCard(w.cardId, { wishUid: w.uid });
});

$('#view-sets').addEventListener('click', e => {
  if (e.target.closest('[data-back]')) { closeSet(); window.scrollTo(0, 0); return; }
  const f = e.target.closest('[data-filter]');
  if (f) {
    setFilter = f.dataset.filter;
    const p = currentSet && setDetailMem.get(currentSet);
    if (p) p.then(s => { if (s) renderSetDetail(s); });
    return;
  }
  const s = e.target.closest('[data-set]');
  if (s) { openSet(s.dataset.set); return; }
  const c = e.target.closest('[data-card]');
  if (c) {
    const it = data.items.find(i => i.cardId === c.dataset.card);
    openCard(c.dataset.card, it ? { itemUid: it.uid } : { source: 'set' });
  }
});
let setSearchTimer = null;
$('#set-search').addEventListener('input', () => { clearTimeout(setSearchTimer); setSearchTimer = setTimeout(renderAllSets, 150); });

$('#btn-key-save').addEventListener('click', () => {
  const v = $('#set-key').value.trim();
  if (!v) { toast(getKey() ? 'Escribe una clave nueva para cambiarla' : 'Pega primero tu clave de API'); return; }
  if (!v.startsWith('sk-ant-')) { toast('Esa clave no parece de Anthropic: empieza por sk-ant-'); return; }
  try { localStorage.setItem(KEY_KEY, v); } catch (e) { toast('No se ha podido guardar la clave'); return; }
  renderSettings();
  toast('Clave guardada');
});
$('#btn-key-clear').addEventListener('click', () => {
  try { localStorage.removeItem(KEY_KEY); } catch (e) { /* nada */ }
  renderSettings();
  toast('Clave borrada');
});
$('#set-model').addEventListener('change', e => { data.settings.model = e.target.value; save(); toast('Modelo cambiado'); });
$('#set-metric').addEventListener('change', e => { data.settings.metric = e.target.value; save(); renderCollection(); toast('Precio de referencia cambiado'); });
$('#set-lang').addEventListener('change', e => { data.settings.lang = e.target.value; save(); });
$('#btn-export').addEventListener('click', exportJSON);
$('#btn-csv').addEventListener('click', () => { if (!data.items.length) { toast('No hay cartas que exportar'); return; } exportCSV(); });
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.items)) throw new Error('formato');
    if (!confirm(`La copia tiene ${d.items.length} entradas. Sustituirá a tu colección actual. ¿Continuar?`)) return;
    data = normalizeData(d);
    save();
    renderAll();
    renderSettings();
    toast('Copia importada');
  } catch (err) { toast('Ese archivo no es una copia de Holo'); }
});
$('#btn-wipe').addEventListener('click', () => {
  if (!confirm('Se borrarán todas tus cartas, deseos e historial de este móvil. No se puede deshacer. ¿Continuar?')) return;
  const settings = data.settings;
  data = freshData();
  data.settings = settings;
  save();
  renderAll();
  toast('Colección borrada');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if (currentView === 'scan' && $('#scan-result').hidden) startCamera();
});
window.addEventListener('resize', () => { if (currentView === 'scan') layoutFrame(); });

// Brillo holográfico del sello: sigue el dedo o la inclinación del móvil
(() => {
  const slab = $('#slab');
  let raf = 0, fx = .5, fy = .5;
  const apply = () => { raf = 0; slab.style.setProperty('--fx', fx.toFixed(3)); slab.style.setProperty('--fy', fy.toFixed(3)); };
  const set = (x, y) => { fx = Math.min(1, Math.max(0, x)); fy = Math.min(1, Math.max(0, y)); if (!raf) raf = requestAnimationFrame(apply); };
  slab.addEventListener('pointermove', e => { const r = slab.getBoundingClientRect(); set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
  if (!reduceMotion) {
    window.addEventListener('deviceorientation', e => {
      if (e.gamma == null || currentView !== 'collection') return;
      set((e.gamma + 40) / 80, (e.beta - 10) / 70);
    }, { passive: true });
  }
})();

// ---------- Inicio ----------
renderAll();
show('collection');
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ((data.items.length || data.wishlist.length) && Date.now() - (data.lastRefresh || 0) > 20 * 3600e3) {
  setTimeout(() => refreshPrices(true), 800);
}
getSets().catch(() => {});

})();
