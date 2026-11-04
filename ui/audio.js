// v17: sonido procedural (WebAudio) y vibración, sin archivos ni dependencias. En Node o sin WebAudio: no-op.
// Paleta: Héroe = metal brillante, mayor; Villano = cuerda oscura, menor y más grave (oro y UI, igual).
// Mezcla: voces → bus SFX/Música → compresor → limitador. Cada voz varía ±4 % de tono y volumen, y baja si se repite.
// Cero CPU en reposo: las voces se detienen solas y el contexto se suspende 1,5 s después del último sonido (salvo
// música) y al ocultar la pestaña. Preferencias del dispositivo (no de la partida): localStorage 'oathbreak.device'.
const G = typeof window === 'undefined' ? null : window;
const AC = G && (G.AudioContext || G.webkitAudioContext);
const KEY = 'oathbreak.device';
const P = { sound: true, music: false, vibe: true };
try { Object.assign(P, JSON.parse(G?.localStorage?.getItem(KEY) || '{}')); } catch {}

export const prefs = () => ({ ...P });
export const supported = () => !!AC;
export const canVibrate = () => typeof G?.navigator?.vibrate === 'function';
export function setPref(k, v) {
  if (!(k in P)) return;
  P[k] = !!v;
  try { G?.localStorage?.setItem(KEY, JSON.stringify(P)); } catch {}
  if (k === 'music') { if (v) { boot(); wake(); musStart(); } else musStop(); }
}

let ctx = null, sfxBus, comp, noise, idleT = 0, lastAny = 0;
const mus = { on: false, bus: null, t: 0, i: 0, timer: 0, n: [] };
const params = (n, o) => { for (const k in o) n[k].value = o[k]; return n; };
function boot() {
  if (ctx || !AC) return ctx;
  try { ctx = new AC(); } catch { return null; }
  comp = params(ctx.createDynamicsCompressor(), { threshold: -20, knee: 10, ratio: 4, attack: 0.004, release: 0.2 });
  const lim = params(ctx.createDynamicsCompressor(), { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  const out = ctx.createGain(); out.gain.value = 0.9;
  comp.connect(lim).connect(out).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(comp);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 s de ruido blanco
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const hidden = () => !!G?.document?.hidden;
function wake() { if (ctx && ctx.state !== 'running' && !hidden()) ctx.resume?.().catch(() => {}); }
function sleep() { if (ctx && !mus.on && ctx.state === 'running') ctx.suspend?.().catch(() => {}); }
function rest(sec = 0) { clearTimeout(idleT); idleT = setTimeout(sleep, sec * 1000 + 1500); }

if (G) {
  // Desbloqueo con cualquier gesto (en táctil, pointerdown no es activación).
  const unlock = () => {
    if (!P.sound && !P.music) return;
    const fresh = !ctx;
    if (!boot() || (!fresh && ctx.state === 'running')) return;
    wake(); if (P.music && !mus.on) musStart(); else if (!mus.on) rest();
  };
  for (const e of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) G.addEventListener(e, unlock, { capture: true, passive: true });
  G.document?.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (hidden()) { musStop(true); ctx.suspend?.().catch(() => {}); } else if (P.music) { wake(); musStart(); }
  });
  // Toque de UI delegado: si el botón ya sonó (comando, hoja), no suma el toque.
  G.document?.addEventListener('click', (e) => {
    const b = e.target?.closest?.('button, [role="tab"], a[href]');
    if (!b) return;
    sfx(b.matches('[data-tab], .seg-btn, [role="tab"]') ? 'tab' : 'tap', { soft: true });
  });
}

const m = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI → Hz
function env(p, t, d, g, a) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(g, t + a);
  p.exponentialRampToValueAtTime(0.0001, t + d);
}
function osc(t, f, d, { type = 'sine', g = 0.1, a = 0.004, to, det = 0, lp, bus = sfxBus } = {}) {
  const o = ctx.createOscillator(), v = ctx.createGain();
  o.type = type; o.detune.value = det;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d * 0.9);
  env(v.gain, t, d, g, a);
  let n = o;
  if (lp) { n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = lp; o.connect(n); }
  n.connect(v).connect(bus);
  o.start(t); o.stop(t + d + 0.03);
  return o;
}
function hiss(t, d, { g = 0.1, f = 1000, to, q = 1, type = 'bandpass', a = 0.003 } = {}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain();
  s.buffer = noise;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d);
  env(v.gain, t, d, g, a);
  s.connect(fl).connect(v).connect(sfxBus);
  s.start(t, Math.random() * 0.4); s.stop(t + d + 0.03);
}
// Campanita (parciales inarmónicos): monedas, regalos, chispas.
function clink(t, f, g, d = 0.26) {
  osc(t, f, d, { g });
  osc(t, f * 2.76, d * 0.45, { g: g * 0.35 });
  osc(t, f * 5.4, d * 0.2, { g: g * 0.12 });
}
function brass(t, f, d, g, V) {
  osc(t, f, d, { type: 'sawtooth', g: g * 0.55, a: 0.02, lp: V ? 1100 : 2600 });
  osc(t, f, d, { type: V ? 'sawtooth' : 'triangle', g: g * 0.5, a: 0.015, det: V ? -9 : 7, lp: V ? 900 : 5000 });
}
const arp = (t, notes, step, fn) => notes.forEach((n, i) => fn(t + i * step, n, i));

/* ---------- Catálogo: (t, k tono, v volumen, V villano, o) → duración ---------- */
const SFX = {
  tap: (t, k, v, V) => { osc(t, (V ? 980 : 1250) * k, 0.045, { g: 0.045 * v, to: (V ? 720 : 900) * k, a: 0.002 }); return 0.05; },
  tab: (t, k, v, V) => { osc(t, (V ? 520 : 700) * k, 0.08, { type: 'triangle', g: 0.055 * v, to: (V ? 760 : 1040) * k }); return 0.08; },
  open: (t, k, v) => { hiss(t, 0.2, { g: 0.05 * v, f: 500, to: 2200, q: 0.8 }); osc(t, 330 * k, 0.16, { g: 0.03 * v, to: 520 * k }); return 0.2; },
  close: (t, k, v) => { hiss(t, 0.16, { g: 0.04 * v, f: 1900, to: 450, q: 0.8 }); osc(t, 480 * k, 0.12, { g: 0.025 * v, to: 300 * k }); return 0.16; },
  coin: (t, k, v) => { clink(t, 1568 * k, 0.11 * v); clink(t + 0.07, 2093 * k, 0.1 * v, 0.34); return 0.42; },
  // o.ms = duración del count-up que acompaña.
  coins: (t, k, v, V, o) => {
    const ms = Math.max(250, Math.min(1200, o.ms ?? 500)) / 1000, n = Math.max(3, Math.min(12, Math.round(ms * 11)));
    const PENTA = [1568, 1760, 2093, 2349, 2637];
    for (let i = 0; i < n; i++) clink(t + (i / n) * ms * (0.9 + Math.random() * 0.2), PENTA[(Math.random() * 5) | 0] * k, 0.065 * v * (1 - (i / n) * 0.35), 0.18);
    clink(t + ms, 2637 * k, 0.085 * v, 0.4);
    return ms + 0.4;
  },
  hit: (t, k, v) => { osc(t, 190 * k, 0.14, { g: 0.32 * v, to: 55 }); hiss(t, 0.07, { g: 0.2 * v, f: 1800, to: 500, q: 0.7, type: 'lowpass' }); osc(t, 900 * k, 0.03, { type: 'triangle', g: 0.05 * v }); return 0.15; },
  hurt: (t, k, v) => { osc(t, 140 * k, 0.2, { g: 0.36 * v, to: 42 }); hiss(t, 0.1, { g: 0.22 * v, f: 1200, to: 280, q: 0.7, type: 'lowpass' }); return 0.2; },
  crit: (t, k, v, V) => {
    osc(t, 230 * k, 0.24, { g: 0.4 * v, to: 48 });
    hiss(t, 0.14, { g: 0.28 * v, f: 3200, to: 600, q: 0.6, type: 'lowpass' });
    const f = (V ? 1320 : 1760) * k;
    osc(t + 0.01, f, 0.4, { type: 'triangle', g: 0.07 * v });
    osc(t + 0.01, f * 1.5, 0.28, { g: 0.04 * v });
    return 0.42;
  },
  dodge: (t, k, v) => { hiss(t, 0.18, { g: 0.13 * v, f: 2600 * k, to: 700, q: 1.6 }); osc(t, 900 * k, 0.12, { g: 0.025 * v, to: 1500 * k }); return 0.18; },
  hunt: (t, k, v) => { osc(t, 110 * k, 0.28, { g: 0.24 * v, to: 58 }); hiss(t, 0.4, { g: 0.06 * v, f: 380, to: 2600, q: 0.7, a: 0.3 }); return 0.4; },
  go: (t, k, v) => { hiss(t, 0.26, { g: 0.06 * v, f: 600, to: 2000, q: 0.8 }); osc(t, 98 * k, 0.22, { g: 0.18 * v, to: 70 }); return 0.26; },
  win: (t, k, v, V) => {
    const b = V ? 62 : 67, N = V ? [0, 3, 7, 12] : [0, 5, 9, 12];
    arp(t, N.slice(0, 3), 0.09, (tt, n) => brass(tt, m(b + n) * k, 0.16, 0.12 * v, V));
    for (const n of [N[1], N[2], N[3]]) brass(t + 0.27, m(b + n) * k, 0.75, 0.09 * v, V);
    if (V) osc(t + 0.27, m(b - 12) * k, 0.8, { type: 'sawtooth', g: 0.06 * v, lp: 400 });
    hiss(t + 0.27, 0.6, { g: 0.04 * v, f: 6000, type: 'highpass', q: 0.5 });
    return 1.05;
  },
  lose: (t, k, v, V) => {
    const b = V ? 62 : 67;
    arp(t, [0, -4, -7], 0.2, (tt, n, i) => osc(tt, m(b + n) * k, i === 2 ? 0.7 : 0.24, { type: 'triangle', g: 0.09 * v, lp: 1400, a: 0.02 }));
    osc(t + 0.4, m(b - 19) * k, 0.8, { type: V ? 'sawtooth' : 'sine', g: 0.07 * v, lp: 500 });
    return 1.1;
  },
  levelup: (t, k, v, V) => {
    const b = V ? 69 : 72, N = V ? [0, 3, 5, 7, 10, 12, 15, 19] : [0, 2, 4, 7, 9, 12, 16, 19];
    hiss(t, 0.45, { g: 0.035 * v, f: 800, to: 7000, q: 1, a: 0.35 });
    arp(t, N, 0.055, (tt, n) => clink(tt, m(b + n) * k, 0.06 * v, 0.2));
    for (const n of [0, V ? 3 : 4, 7, 12]) osc(t + 0.45, m(b + n) * k, 0.9, { type: 'triangle', g: 0.05 * v, a: 0.01 });
    clink(t + 0.47, m(b + 24) * k, 0.05 * v, 0.6);
    return 1.4;
  },
  // Subida mientras se apaga la etapa vieja (0–0,9 s), impacto al aparecer la nueva, brillo.
  evolve: (t, k, v, V) => {
    hiss(t, 0.95, { g: 0.09 * v, f: 300, to: 6000, q: 1.2, a: 0.85 });
    osc(t, 180 * k, 0.95, { type: 'triangle', g: 0.04 * v, to: 900 * k, a: 0.8 });
    const T = t + 0.92, b = V ? 50 : 55;
    osc(T, 120, 0.7, { g: 0.42 * v, to: 38 });
    hiss(T, 1.1, { g: 0.09 * v, f: 3500, type: 'highpass', q: 0.4 });
    for (const n of [0, 7, V ? 15 : 16, 19, 24]) brass(T, m(b + n) * k, 1.2, 0.07 * v, V);
    arp(T + 0.25, V ? [27, 31, 34, 39] : [28, 31, 36, 40], 0.09, (tt, n) => clink(tt, m(b + n) * k, 0.05 * v, 0.5));
    return 2.3;
  },
  quest: (t, k, v, V) => {
    const b = V ? 64 : 72; brass(t, m(b) * k, 0.12, 0.11 * v, V);
    for (const n of [7, V ? 15 : 16]) brass(t + 0.11, m(b + n) * k, 0.5, 0.08 * v, V);
    clink(t + 0.13, m(b + 24) * k, 0.05 * v, 0.4);
    return 0.65;
  },
  gift: (t, k, v, V) => { osc(t, 600 * k, 0.05, { type: 'triangle', g: 0.05 * v, to: 1400 * k });
    arp(t + 0.04, V ? [81, 84, 88, 93] : [84, 88, 91, 96], 0.075, (tt, n) => clink(tt, m(n) * k, 0.06 * v, 0.45));
    return 0.75;
  },
  notify: (t, k, v) => { clink(t, m(76) * k, 0.07 * v, 0.5); clink(t + 0.14, m(81) * k, 0.07 * v, 0.7); return 0.85; },
  error: (t, k, v) => { for (const [d, f, g] of [[0, 260, 0.09], [0.1, 196, 0.08]]) osc(t + d, f * k, 0.12 + d, { type: 'triangle', g: g * v, to: f * 0.78 * k, lp: 900 }); return 0.3; },
  buy: (t, k, v) => { hiss(t, 0.03, { g: 0.06 * v, f: 4000, q: 2 }); clink(t + 0.02, 2093 * k, 0.08 * v, 0.2); clink(t + 0.08, 1568 * k, 0.07 * v, 0.3); return 0.4; },
  place: (t, k, v) => { osc(t, 420 * k, 0.08, { g: 0.16 * v, to: 170 * k }); hiss(t, 0.04, { g: 0.08 * v, f: 1200 * k, q: 3 }); return 0.09; },
  build: (t, k, v, V) => { SFX.place(t, k, v); SFX.place(t + 0.13, k * 1.06, v * 0.9); clink(t + 0.3, m(V ? 81 : 84) * k, 0.06 * v, 0.5); return 0.8; },
};
// Vibración (Android), aunque el sonido esté apagado.
const HAPTIC = { hurt: 28, crit: [35, 30, 55], win: [40, 60, 90], levelup: [25, 40, 25, 40, 70], evolve: [30, 50, 120] };

const last = {};
const villain = () => G?.document?.body?.dataset.faction === 'villain';
// sfx('coin', { at: demora en s, ms: duración del conteo, soft: no suma si recién sonó otra cosa }).
export function sfx(name, o = {}) {
  if (!G || hidden()) return;
  const now = G.performance?.now?.() ?? Date.now();
  if (o.soft && now - lastAny < 150) return;
  const L = last[name] ?? (last[name] = { t: -1e9, n: 0 });
  if (now - L.t < 45) return; // anti-metralleta
  L.n = now - L.t < 1800 ? L.n + 1 : 0; L.t = now; lastAny = now;
  if (HAPTIC[name]) o.at ? setTimeout(() => vibe(HAPTIC[name]), o.at * 1000) : vibe(HAPTIC[name]);
  const fn = SFX[name];
  if (!fn || !P.sound || !boot()) return;
  wake();
  const k = 2 ** ((Math.random() * 2 - 1) * 0.04), v = (0.84 + Math.random() * 0.16) * Math.max(0.6, 1 - L.n * 0.06);
  const t = ctx.currentTime + 0.01 + (o.at ?? 0);
  try { rest(t - ctx.currentTime + fn(t, k, v, villain(), o)); } catch { /* nunca rompe el juego */ }
}
export function vibe(p) {
  if (!P.vibe || !canVibrate() || hidden()) return;
  try { G.navigator.vibrate(p); } catch {}
}
// Comando de la fachada → sonido (act() en ui/main.js). El oro cobrado suena con el count-up.
const CMD = {
  claimMission: 'quest', claimDaily: 'quest', claimSeasonTier: 'quest', welcomeBonus: 'quest', startMission: 'go', cancelMission: 'close',
  buyStat: 'buy', autoSpend: 'buy', buyGear: 'buy', buyItem: 'buy', buyRenownItem: 'buy', deposit: 'buy', upgradeBuilding: 'build', buyRoom: 'build',
  placeItem: 'place', autoPlace: 'place', removeItem: 'place', sendGift: 'gift', openGifts: 'gift', addFriend: 'notify', acceptFriend: 'notify',
  attack: 'hunt', hunt: 'hunt',
};
export const cmdSfx = (name, ok) => sfx(ok ? CMD[name] : 'error');

/* ---------- Música (opcional, apagada por defecto): pad de 4 acordes de 4,8 s + campanitas. Héroe: Re mayor
   (I–vi–IV–V); Villano: Re menor armónico (i–VI–iv–V). Un acorde por vez: al apagarla no queda nada vivo. */
const PROG = {
  hero: [[38, 62, 66, 69], [35, 62, 66, 71], [31, 62, 67, 71], [33, 61, 64, 69]],
  villain: [[38, 62, 65, 69], [34, 62, 65, 70], [31, 62, 67, 70], [33, 61, 64, 69]],
};
const BAR = 4.8;
function pad(t, f, d, g, V, bus) {
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator(), v = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = V ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = det;
    fl.type = 'lowpass'; fl.frequency.value = V ? 650 : 1500;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(g, t + 1.4);
    v.gain.setValueAtTime(g, t + d - 1.2);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
    o.connect(fl).connect(v).connect(bus);
    o.start(t); o.stop(t + d + 1); mus.n.push(o);
  }
}
function musTick() {
  if (!mus.on || !ctx) return;
  const V = villain(), ch = PROG[V ? 'villain' : 'hero'][mus.i++ % 4], t = Math.max(mus.t, ctx.currentTime + 0.05);
  pad(t, m(ch[0]), BAR, 0.05, V, mus.bus);
  for (const n of ch.slice(1)) pad(t, m(n), BAR, 0.018, V, mus.bus);
  for (let s = 0; s < 4; s++) if (Math.random() < 0.45) {
    const n = ch[1 + ((Math.random() * 3) | 0)] + 12, tt = t + s * 1.2 + Math.random() * 0.2;
    mus.n.push(osc(tt, m(n), 2.2, { g: 0.022, a: 0.01, bus: mus.bus }), osc(tt, m(n) * 2.76, 0.8, { g: 0.005, bus: mus.bus }));
  }
  mus.t = t + BAR; mus.n = mus.n.slice(-40);
  mus.timer = setTimeout(musTick, Math.max(50, (mus.t - ctx.currentTime - 0.6) * 1000));
}
function musStart() {
  if (mus.on || !P.music || !boot() || hidden()) return;
  clearTimeout(idleT);
  mus.on = true; mus.i = 0; mus.t = 0;
  mus.bus = ctx.createGain(); mus.bus.connect(comp);
  mus.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  mus.bus.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 2.5);
  musTick();
}
function musStop(now = false) {
  if (!mus.on) return;
  mus.on = false; clearTimeout(mus.timer);
  const b = mus.bus, t = ctx.currentTime;
  for (const o of mus.n.splice(0)) try { o.stop(t + 0.7); } catch {}
  b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value || 0.0001, t); b.gain.exponentialRampToValueAtTime(0.0001, t + (now ? 0.05 : 0.6));
  setTimeout(() => b.disconnect(), now ? 100 : 700);
  rest(0.7);
}
export const audioState = () => ({ ctx: ctx?.state ?? 'none', music: mus.on });
