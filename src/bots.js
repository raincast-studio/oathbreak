// v17: vida de los bots. Perfil humano estable (huso LATAM, sueño, franjas de actividad, ráfagas, días sin jugar,
// pausas), nicks de jugador, estilo de guarida, etapas de retiro y marca «Eco». Todo se deriva de (semilla del mundo,
// id del bot) con hashes: no ocupa lugar en el guardado y da lo mismo corra donde corra (E6).
// No importa sistemas (systems.js y lair.js lo usan a él): solo config, core y catálogo.
import { CFG, HOUR, DAY } from './config.js';
import { mulberry32 } from './core.js';
import { ITEMS } from './catalog.js';

const HB = () => CFG.bots.human;

// Hash de 32 bits (FNV-1a de la cadena + mezcla de dos enteros).
export function hash32(seed, str, a = 0, b = 0) {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (a | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const u = (seed, id, a, b) => hash32(seed, id, a, b) / 4294967296;
const pickW = (r, pairs) => { let x = r() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) if ((x -= w) < 0) return v; return pairs[0][0]; };

/* ---------- Transparencia y retiro ---------- */
export const isEco = (e) => !!e?.isBot && CFG.bots.label === 'eco';
// Etapa de retiro: 0 activo · 1 se está yendo (no es presa ni figura en escaparate/ranking, juega menos) · 2 ya no manda
// solicitudes ni regalos · 3 inactivo (no juega ni es objetivo; sigue en listas de amigos y libros de visitas).
export function retireStage(b, now) {
  if (!b?.ret) return 0;
  const d = (now - b.ret.at) / DAY, [s2, s3] = CFG.bots.retire.stageDays;
  return d >= s3 ? 3 : d >= s2 ? 2 : 1;
}
const ACT = [1, 0.5, 0.25, 0];
// Fuera de presa, escaparate, ranking y guerra: retirándose, o «Eco» con la bandera activa.
export const unlisted = (e, now) => !!e?.isBot && (isEco(e) || retireStage(e, now) > 0);
// Retirado del todo: no juega ni se lo puede atacar.
export const gone = (e, now) => !!e?.isBot && retireStage(e, now) >= 3;

/* ---------- Perfil humano ---------- */
const gauss = (t, mu, sd) => Math.exp(-((t - mu) ** 2) / (2 * sd * sd));
// Peso de cada hora local (0–23) de un día de la semana (0 = domingo); 0 mientras duerme. Suma 1.
function dayCurve(dow, f) {
  const wkEnd = dow === 0 || dow === 6;
  const bedOf = (d) => f.bed + (d === 5 || d === 6 ? f.late : 0); // viernes y sábado se acuesta más tarde
  const bedPrev = bedOf((dow + 6) % 7), bed = bedOf(dow);
  const wake = bedPrev + f.sleep + (wkEnd ? f.late * 0.6 : 0) - 24; // el fin de semana duerme un poco más
  const c = new Array(24).fill(0);
  let sum = 0;
  for (let lh = 0; lh < 24; lh++) {
    const t = lh + 0.5;
    const asleep = (bedPrev >= 24 ? t >= bedPrev - 24 && t < wake : t < wake) || (bed < 24 && t >= bed);
    if (asleep) continue;
    const tn = t < 6 ? t + 24 : t; // la noche cruza la medianoche
    let w = wkEnd
      ? 0.35 + 0.35 * gauss(t, 15, 3) + 0.7 * f.eveA * gauss(tn, f.eve + 0.5, 1.6) + f.nightA * gauss(tn, f.night + 0.7, 1.7)
      : (t < 12 ? f.morning : t < 14.5 ? f.morning + f.lunch : t < 17 ? f.morning * 1.4 : 0.3) + f.eveA * gauss(tn, f.eve, 1.2) + f.nightA * gauss(tn, f.night, 1.4);
    c[lh] = w; sum += w;
  }
  for (let lh = 0; lh < 24; lh++) c[lh] /= sum || 1;
  return c;
}

const PROF = new WeakMap();
export function profile(world, b) {
  const hit = PROF.get(b);
  if (hit && hit.seed === world.seed) return hit;
  const h = HB(), r = mulberry32(hash32(world.seed, b.id, 0x9f17));
  const tz = pickW(r, h.tz);
  const f = {
    sleep: r.range(h.sleepH[0], h.sleepH[1]), bed: r.range(h.bed[0], h.bed[1]), late: r.range(h.weekendLate[0], h.weekendLate[1]),
    morning: r.range(0.08, 0.45), lunch: r.range(0, 0.8), eve: r.range(17.5, 20), eveA: r.range(0.4, 1.2), night: r.range(21, 23.8), nightA: r.range(0.6, 1.5),
  };
  const sessions = r.range(h.sessions[0], h.sessions[1]), wkMul = r.range(h.weekend[0], h.weekend[1]);
  const skip = r.range(h.skipDay[0], h.skipDay[1]);
  const pause = r() < h.pausers ? r.range(h.pauseRate[0], h.pauseRate[1]) : 0;
  const reply = r.range(h.replySpeed[0], h.replySpeed[1]);
  const curves = Array.from({ length: 7 }, (_, d) => dayCurve(d, f));
  const pauseFrac = Math.min(0.5, pause * (h.pauseDays[0] + h.pauseDays[1]) / 2);
  // Horas en línea por día (promedio): reparte las tasas diarias de config en esas horas.
  const onlineH = (1 - skip) * (1 - pauseFrac) * sessions * ((5 + 2 * wkMul) / 7) * (1 + h.twoHourP);
  const p = { seed: world.seed, tz, sessions, wkMul, skip, pause, reply, curves, onlineH, days: new Map() };
  PROF.set(b, p);
  return p;
}

// Día local del bot: ¿juega? (días sin entrar y pausas de varios días), ánimo y racha de progreso.
function dayInfo(world, b, p, ld) {
  let d = p.days.get(ld);
  if (d) return d;
  if (p.days.size > 64) p.days.clear();
  const h = HB(), s = world.seed;
  let paused = false;
  if (p.pause) for (let st = ld - h.pauseDays[1]; st <= ld && !paused; st++)
    if (u(s, b.id, st, 11) < p.pause) paused = st + h.pauseDays[0] + Math.floor(u(s, b.id, st, 12) * (h.pauseDays[1] - h.pauseDays[0] + 1)) > ld;
  const skip = !paused && u(s, b.id, ld, 13) < p.skip;
  d = { play: !paused && !skip, paused, mood: 0.5 + u(s, b.id, ld, 14), drift: [-1, 0, 0, 1][Math.floor(u(s, b.id, Math.floor(ld / h.driftDays), 15) * 4)] };
  p.days.set(ld, d);
  return d;
}
const localDay = (p, s) => Math.floor((s + p.tz) / 24);
export const dayOf = (world, b, s) => { const p = profile(world, b); return dayInfo(world, b, p, localDay(p, s)); };

function startsAt(world, b, p, s, act) {
  const loc = s + p.tz, ld = Math.floor(loc / 24), lh = loc - ld * 24;
  const d = dayInfo(world, b, p, ld);
  if (!d.play) return false;
  const dow = (((ld + 4) % 7) + 7) % 7; // el día 0 de la época fue jueves
  const prob = Math.min(0.95, p.sessions * (dow === 0 || dow === 6 ? p.wkMul : 1) * d.mood * p.curves[dow][lh] * act);
  return u(world.seed, b.id, s, 21) < prob;
}

// Franja horaria s (de s·HOUR a (s+1)·HOUR, UTC): null si el bot no estuvo en línea; si estuvo, la ráfaga de acciones
// visibles (k) con sus minutos, en orden. act escala la actividad (retiro).
export function slot(world, b, s, act = 1) {
  if (act <= 0) return null;
  const p = profile(world, b), h = HB(), id = b.id, sd = world.seed;
  const start = startsAt(world, b, p, s, act);
  if (!start && !(startsAt(world, b, p, s - 1, act) && u(sd, id, s - 1, 22) < h.twoHourP)) return null;
  const [lo, hi] = start ? h.burst : h.burstCont;
  const k = lo + Math.floor(u(sd, id, s, 23) * (hi - lo + 1));
  const offs = [];
  for (let i = 0; i < k; i++) offs.push(Math.floor(u(sd, id, s, 30 + i) * 3600) * 1000);
  return { k, offs: offs.sort((x, y) => x - y), start };
}
export const activity = (b, ts) => ACT[retireStage(b, ts)];
export const onlineHours = (world, b) => profile(world, b).onlineH;

// Última vez activo: el último minuto con acción de su última franja en línea (coherente con las horas de sus visitas,
// ataques y regalos). Un bot inactivo queda congelado en el día en que se fue.
export function lastSeen(world, b, now) {
  let s = Math.floor(now / HOUR) - 1;
  if (b.ret) s = Math.min(s, Math.floor((b.ret.at + CFG.bots.retire.stageDays[1] * DAY) / HOUR) - 1);
  for (let n = 0; n < HB().seenScanH; n++, s--) {
    const x = slot(world, b, s, activity(b, s * HOUR));
    if (x) return s * HOUR + x.offs[x.offs.length - 1];
  }
  return null;
}

// Demora para contestar una solicitud, dentro de [lo, hi] h: los rápidos cerca de lo, los lentos cerca de hi.
export function replyDelay(world, b, r) {
  const [lo, hi] = CFG.social.botReplyH;
  const speed = world?.seed != null ? profile(world, b).reply : 1;
  return Math.round((lo + (hi - lo) * r() ** speed) * HOUR);
}

/* ---------- Nicks ---------- */
// Nombres y apodos de jugadores hispanos y brasileños (f = femenino), palabras de nick y etiquetas.
const NAMES = 'Nico Facu Tomi Agus Santi Mati Juanma Juampi Gonza Rodri Lucho Nacho Fede Seba Maxi Leo Lauti Benja Thiago Bauti Valen Joaco Fran Dani Javi Diego Pablo Kevin Brian Andy Camilo Mauro Ivan Emi Pato Chino Flaco Rulo Tano Uri Lean Beto Memo Lalo Chuy Pepe Joao Pedro Caio Davi Enzo Rafa Vini Gui Lipe Kaique Iago Arthur Breno Igor Murilo Yuri Luan Biel Toto Cris Alex Marce Hernan Charly Juanchi Nahue Fer'.split(' ')
  .map((n) => [n, 0]).concat('Cami Sofi Vale Flor Meli Pau Juli Caro Agos Mica Sol Lola Xime Majo Naty Male Gabi Bia Duda Lari Leti Nath Carol Luli Anto Pili Rocio Belu Abi Mari Tati Yami Dai'.split(' ').map((n) => [n, 1]));
const BR = new Set('Joao Pedro Caio Davi Enzo Rafa Vini Gui Lipe Kaique Iago Arthur Breno Igor Murilo Yuri Luan Biel Bia Duda Lari Leti Nath Carol Gabi'.split(' '));
const W = (s, fem = '') => s.split(' ').map((w) => [w, fem.split(' ').includes(w) ? 1 : 0]);
const WORDS = {
  any: W('Lobo Tigre Rayo Trueno Furia Toro Zorro Puma Lince Condor Cobra Jaguar Dragon Ninja Vikingo Pirata Samurai Capo Crack Bestia Fiera Pibe Titan Halcon Tiburon Oso Gato Cuervo Fera Brabo Monstro Lenda Mito Raio',
    'Furia Cobra Bestia Fiera Fera Lenda'),
  hero: W('Angel Leon Escudo Guardian Heroe Luz Estrella Capitan Paladin Aguila Sol Faro Valiente Centinela', 'Luz Estrella Aguila'),
  villain: W('Diablo Kaos Toxico Venom Calavera Veneno Demonio Sombra Villano Muerte Abismo Maldito Vudu Plaga Bruja', 'Calavera Sombra Muerte Plaga Bruja'),
};
const EN = 'Dark Pro King Boss Ghost Storm Shadow Hunter Nitro Turbo Blaze Venom Wolf Mr'.split(' ');
const ADJ = [['Negro', 'Negra'], ['Rojo', 'Roja'], ['Oscuro', 'Oscura'], ['Salvaje', 'Salvaje'], ['Letal', 'Letal'], ['Feroz', 'Feroz'],
  ['Loco', 'Loca'], ['Azul', 'Azul'], ['Dorado', 'Dorada'], ['Gris', 'Gris'], ['Blanco', 'Blanca'], ['Veloz', 'Veloz']];
const TAGS = ['xd', 'gg', 'ok', 'BR', 'AR', 'UY', 'MX', 'CL', 'PE', 'YT', 'TV', 'ttv', 'OP'];
const PLACES = ['DelSur', 'DelNorte', 'DelBarrio', 'DelOeste', 'DelRio', 'DelValle'];

let nameFilter = null;
// Gancho de moderación: la función recibe un nick y devuelve true si se puede usar (p. ej. el filtro de
// src/moderation.js). Sin filtro, los nicks salen de listas propias, sin palabras ofensivas.
export function setBotNameFilter(fn) { nameFilter = typeof fn === 'function' ? fn : null; }

function num(r) {
  const x = r();
  if (x < 0.45) return String(r.int(1, 99)).padStart(r() < 0.4 ? 2 : 1, '0');
  if (x < 0.75) return String(r.int(2004, 2013));
  if (x < 0.9) return String(r.int(90, 99));
  return r.pick(['777', '123', '100', '321', '999', '555']);
}
const mixCase = (s, r) => { const odd = r() < 0.5 ? 1 : 0; return [...s].map((c, i) => (i % 2 === odd ? c.toUpperCase() : c.toLowerCase())).join(''); };

// Un nick de jugador: patrones con pesos (nombre+palabra, palabra+número, el/la+nombre, palabra+adjetivo, minúsculas…).
function nick(r, faction) {
  const [name, fem] = r.pick(NAMES);
  const pool = WORDS.any.concat(WORDS[faction] ?? []);
  const [word, wf] = r.pick(pool);
  const sep = r() < 0.3 ? '_' : '';
  const x = r();
  if (x < 0.16) return `${name}${sep}${word}`;
  if (x < 0.28) return `${word}${sep}${num(r)}`;
  if (x < 0.4) return `${name}${sep}${num(r)}`;
  if (x < 0.48) return `${fem ? 'La' : 'El'}${r() < 0.5 ? name : r.pick(NAMES.filter((n) => n[1] === fem))[0]}${r() < 0.3 ? num(r) : ''}`;
  if (x < 0.56) return `${word}${r.pick(ADJ)[wf]}`;
  if (x < 0.64) { const n = name.toLowerCase(); return `${n}${r() < 0.5 ? n.at(-1) : ''}${r() < 0.6 ? `_${r.pick(TAGS).toLowerCase()}` : ''}`; }
  if (x < 0.7) return r() < 0.5 ? `xX${name}Xx` : mixCase(name + (r() < 0.5 ? word : ''), r);
  if (x < 0.78) return `${r.pick(EN)}${name}`;
  if (x < 0.84) return `${word}${r.pick(PLACES)}`;
  if (x < 0.9 && BR.has(name)) return `${name}${r.pick(['zika', 'BR', '_br', 'gamer', 'zin', '_ofc'])}`;
  if (x < 0.95) { const t = r.pick(TAGS); return `${name}${t === t.toLowerCase() ? '_' : sep}${t}`; }
  return `${word}${name}${r() < 0.4 ? num(r) : ''}`;
}

// Nick único (sin repetir con nadie del mundo, sin importar mayúsculas), de 3 a 16 caracteres.
export function botName(world, i, faction) {
  const r = mulberry32(hash32(world.seed, `name${i}`, 0x4e1c));
  const taken = new Set(Object.values(world.entities ?? {}).map((e) => e.name.toLowerCase()));
  for (let t = 0; t < 200; t++) {
    const n = nick(r, faction).replace(/[^A-Za-z0-9_]/g, '');
    if (n.length < 3 || n.length > 16 || taken.has(n.toLowerCase())) continue;
    if (nameFilter && !nameFilter(n)) continue;
    return n;
  }
  return `${faction === 'hero' ? 'Heroe' : 'Villano'}${i}${r.int(10, 99)}`;
}

/* ---------- Estilo de guarida ---------- */
const SETS_BY = {}; // facción → sets que puede usar
const FLOORS = ITEMS.filter((i) => i.cat === 'piso' && i.buyable), WALLS = ITEMS.filter((i) => i.cat === 'pared' && i.buyable);
// Estilo estable de cada bot (de su nick e id): 1–2 sets favoritos, un piso y una pared. Así no hay dos guaridas iguales.
export function lairStyle(e) {
  const r = mulberry32(hash32(0x5717, `${e.id}|${e.name}`));
  const sets = (SETS_BY[e.faction] ??= [...new Set(ITEMS.filter((i) => i.set && (!i.faction || i.faction === e.faction)).map((i) => i.set))]);
  const fav = [r.pick(sets)];
  if (r() < 0.5) fav.push(r.pick(sets));
  // Orden propio de pisos y paredes; usa el mejor que su nivel permite (los raros de verdad llegan más tarde): al subir
  // de nivel a veces cambia a uno mejor, nunca a uno peor.
  const W8 = { comun: 1, raro: 0.8, epico: 0.9, legendario: 0.8 };
  const ok = (i) => i.rarity === 'comun' || i.rarity === 'raro' || (i.rarity === 'epico' && e.level >= 12) || e.level >= 30;
  const best = (list) => list.map((i) => [i, r() * W8[i.rarity]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]).find(ok)?.id ?? null;
  const floor = best(FLOORS), wall = best(WALLS);
  return { sets: fav, floor: r() < 0.85 ? floor : null, wall: r() < 0.85 ? wall : null };
}
