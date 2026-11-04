// v17 · Confianza: moderación de textos del jugador (nombres y notas de reporte) y cola local de reportes.
// Sin dependencias ni DOM: corre igual en el navegador, en node (tests) y, en E6, en el servidor.
//
// Cómo decide un nombre:
// 1. Limpia: quita caracteres de control y de formato (ancho cero, RTL invisibles), une espacios, NFC, 16 letras.
// 2. Normaliza para comparar: sin tildes, minúsculas, homoglifos (cirílico/griego), leetspeak (0→o 1→i 3→e 4→a
//    5→s 7→t @→a $→s…), k/q→c. Los separadores y espacios intercalados se ignoran ("p.u.t.a", "p u t a").
// 3. Busca en la lista de bloqueo, con dos modos:
//    - SUB: raíz en cualquier parte del nombre (también cruzando espacios). Letras repetidas cuentan ("puuuta").
//    - WORD: palabra entera (términos cortos o ambiguos: "culo" está dentro de "vehículo").
// 4. Permitidos: si la coincidencia cae entera dentro de una palabra común, se perdona (problema "Scunthorpe":
//    comPUTAdora, VERGAra, BADMINton, GeORGIA, theRAPIST).
// Nunca devuelve la palabra encontrada (el mensaje al jugador no la repite): solo la categoría.

/* ---------- Normalización ---------- */
const MAP = {
  // leetspeak
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '¡': 'i', '€': 'e', '£': 'l', '¢': 'c',
  // homoglifos (cirílico y griego que se ven como latinos) y letras que NFKD no descompone
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i',
  // fonética: k y q suenan como c ("kulo", "qulo")
  k: 'c', q: 'c',
};
// Texto comparable: minúsculas a-z y espacios (todo lo demás es separador).
export function normalize(s) {
  const t = String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of t) out += MAP[ch] ?? ch;
  return out.replace(/[^a-z]+/g, ' ').trim();
}

/* ---------- Listas ----------
   Las raíces se escriben "en claro" (sin tildes); al compilar pasan por la misma normalización.
   Categorías: insulto · sexual · odio (discriminación y simbología nazi) · autolesion · drogas · reservado (suplantación). */
const SUB = {
  insulto: [
    'puta', 'puto', 'putit', 'mierda', 'pelotud', 'boludo', 'boluda', 'pendej', 'cabron', 'gilipoll', 'imbecil', 'idiota', 'estupid',
    'malparid', 'gonorrea', 'conchatumadre', 'conchasumadre', 'conchetumare', 'conchesumare', 'chingad', 'chingatumadre', 'culiao', 'culiado',
    'culiau', 'aweonao', 'mamaguevo', 'mamahuevo', 'pajer', 'subnormal', 'malcogid',
    // pt
    'caralh', 'foder', 'fodase', 'fodid', 'arrombad', 'cuzao', 'cuzinho', 'babaca',
    // en
    'fuck', 'fcc', 'bullshit', 'shithead', 'shitty', 'bitch', 'cunt', 'dickhead', 'asshole', 'motherf', 'whore', 'slut',
  ],
  sexual: [
    'verga', 'poronga', 'vagina', 'vulva', 'clitoris', 'tetona', 'culear', 'culiar', 'follar', 'follad', 'porn', 'sexo', 'sexy',
    'pedofil', 'pederast', 'pedophil', 'paedophil', 'violador', 'violacion', 'incest', 'zoofil', 'orgia', 'masturb', 'eyacul', 'orgasm',
    'chupala', 'chupalo', 'chupamela', 'mamada', 'buceta', 'xoxota', 'xereca', 'piroca', 'punheta', 'cocksuc', 'pussy', 'penis', 'dildo',
    'milf', 'hentai', 'onlyfans', 'rapist', 'blowjob', 'handjob', 'creampie', 'nudes',
  ],
  odio: [
    'marica', 'maricon', 'tortillera', 'bollera', 'travelo', 'traveco', 'viado', 'sapatao', 'sudaca', 'negrata', 'retrasad', 'mongolic', 'mogolic',
    'faggot', 'nigger', 'nigga', 'wetback', 'beaner', 'retard', 'tranny',
    'hitler', 'nazi', 'siegheil', 'fuhrer', 'holocaust', 'auschwitz', 'kukluxklan', 'whitepower', 'whitepride', 'matajudio', 'matanegro',
    'matagay', 'matatrolo', 'mataindio', 'alqaeda', 'alqaida', 'binladen',
  ],
  autolesion: ['suicid', 'autolesion', 'selfharm', 'killyourself', 'killurself', 'matate', 'ahorcate', 'cortate las venas', 'proana', 'thinspo'],
  drogas: ['cocain', 'metanfet', 'methamphet', 'crystalmeth', 'fentanil', 'fentanyl', 'ketamin', 'mdma', 'basuco', 'bazuco', 'pastabase', 'falopa', 'narco'],
  reservado: ['admin', 'moderador', 'moderator', 'moderacion', 'soporte', 'support', 'staff', 'oficial', 'official', 'oathbreak', 'raincast', 'gamemaster'],
};
const WORD = {
  insulto: ['huevon', 'weon', 'chinga', 'hdp', 'ctm', 'csm', 'ptm', 'lpm', 'hdlgp', 'lpqtp', 'vsf', 'pqp', 'tnc', 'fdp', 'foda', 'shit', 'fuk', 'ass'],
  sexual: ['culo', 'culito', 'culon', 'culona', 'orto', 'ojete', 'pija', 'pene', 'teta', 'anal', 'semen', 'xxx', 'sex', 'dick', 'cock', 'cum', 'tits',
    'boobs', 'horny', 'rape'],
  odio: ['trolo', 'trola', 'joto', 'bicha', 'fag', 'chink', 'spic', 'heil', 'kkk'],
  autolesion: ['kys'],
  drogas: ['heroin', 'meth', 'lsd'],
  reservado: ['gm', 'mod'],
};
// Palabras comunes que contienen una raíz bloqueada (se perdona la coincidencia que cae entera adentro).
const ALLOW = [
  'computa', 'computo', 'diputa', 'diputo', 'disputa', 'disputo', 'imputa', 'imputo', 'reputa', 'reputo', 'amputa', 'amputo', 'deputad',
  'caputo', 'esputo', 'vergara', 'maricarmen', 'georgia', 'borgia', 'gorgia', 'nazir', 'nazim', 'ignazi', 'badminton', 'scunthorpe', 'matatena',
  'narcolep', 'peculiar', 'enviado', 'desviado', 'extraviado', 'aviado', 'aviador', 'ataviado', 'agraviado', 'therapist',
];
// Símbolos que bloquean por sí solos (esvásticas, gesto obsceno) y numerología neonazi.
const SYMBOLS = /[卐卍࿕-࿘\u{1F595}]/u;
const NUMEROLOGY = /1\D{0,2}4\D{0,2}8\D{0,2}8/;

// "puta" → /p+u+t+a+/ (letras repetidas cuentan); "pussy" → /p+u+s{2,}y+/; en WORD, "kkk" es exacto ("kkkk" es risa en pt).
const norm1 = (w) => normalize(w).replace(/ /g, '');
function pattern(w, word = false) {
  return norm1(w).match(/(.)\1*/g).map((run) => (word && run.length > 2 ? `${run[0]}{${run.length}}` : run.length > 1 ? `${run[0]}{${run.length},}` : `${run}+`)).join('');
}
const SUB_RE = Object.entries(SUB).flatMap(([cat, ws]) => ws.map((w) => [cat, new RegExp(pattern(w), 'g')]));
const WORD_RE = Object.entries(WORD).flatMap(([cat, ws]) => ws.map((w) => [cat, new RegExp(`^(?:${pattern(w, true)})(?:e?s)?$`)]));
const ALLOW_N = ALLOW.map(norm1);

// Rangos (en el texto pegado) cubiertos por una palabra permitida. Solo cuentan DENTRO de una misma palabra:
// "Com Puta" o "Hijo de Puta" no se salvan por "computa" o "deputa".
function allowRanges(tokens) {
  const out = [];
  let off = 0;
  for (const t of tokens) {
    for (const a of ALLOW_N) for (let i = t.indexOf(a); i >= 0; i = t.indexOf(a, i + 1)) out.push([off + i, off + i + a.length]);
    off += t.length;
  }
  return out;
}

// { ok: true } o { ok: false, category } — category ∈ insulto · sexual · odio · autolesion · drogas · reservado.
export function checkText(text) {
  const raw = String(text ?? '');
  if (SYMBOLS.test(raw)) return { ok: false, category: 'odio' };
  if (NUMEROLOGY.test(raw.replace(/\s+/g, ''))) return { ok: false, category: 'odio' };
  const n = normalize(raw);
  if (!n) return { ok: true };
  const tokens = n.split(' ');
  const full = tokens.join('');
  // SUB: sobre todo el texto pegado (atrapa separadores intercalados y espacios: "mier da", "p.u.t.a").
  let allow = null;
  for (const [category, re] of SUB_RE) {
    re.lastIndex = 0;
    for (const m of full.matchAll(re)) {
      allow ??= allowRanges(tokens);
      const s = m.index, e = s + m[0].length;
      if (!allow.some(([a, b]) => a <= s && e <= b)) return { ok: false, category };
    }
  }
  // WORD: cada palabra, más las letras sueltas en fila ("c u l o", "h.d.p").
  const words = [...tokens];
  let run = '';
  for (const t of [...tokens, '']) {
    if (t.length === 1) { run += t; continue; }
    if (run.length > 1) words.push(run);
    run = '';
  }
  for (const w of words) for (const [category, re] of WORD_RE) if (re.test(w)) return { ok: false, category };
  return { ok: true };
}

/* ---------- Nombres ---------- */
export const NAME_MIN = 3, NAME_MAX = 16;
// Limpieza (también para lo que se muestra): sin control ni formato invisible, espacios simples, NFC, 16 caracteres.
export function cleanName(s) {
  const t = String(s ?? '').normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, NAME_MAX).join('').trim();
}
// { ok: true, name } o { ok: false, error: 'nombre_corto' | 'nombre_no_permitido' }.
export function validateName(s) {
  const name = cleanName(s);
  if (Array.from(name).length < NAME_MIN || !/\p{L}/u.test(name)) return { ok: false, error: 'nombre_corto' };
  const c = checkText(name);
  return c.ok ? { ok: true, name } : { ok: false, error: 'nombre_no_permitido', category: c.category };
}

// "Al azar": pozo de nombres por bando. Nunca devuelve un nombre bloqueado (se verifica en los tests y acá).
export const NAME_POOL = {
  hero: ['Aurora', 'Bastión', 'Centella', 'Égida', 'Faro', 'Halcón', 'Justa', 'Lumen', 'Paladín', 'Valor', 'Zafiro', 'Cometa'],
  villain: ['Abismo', 'Ceniza', 'Cuervo', 'Espina', 'Grieta', 'Mantis', 'Niebla', 'Óxido', 'Plaga', 'Ruina', 'Umbra', 'Vórtice'],
  suffix: ['', ' Rojo', ' Negro', ' de Acero', ' Nocturno', ' Veloz', ' de Fuego', ' Sombrío'],
};
export function randomName(faction, rnd = Math.random) {
  const pool = NAME_POOL[faction === 'villain' ? 'villain' : 'hero'];
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  for (let i = 0; i < 20; i++) {
    const n = pick(pool) + pick(NAME_POOL.suffix);
    if (validateName(n).ok) return n;
  }
  return pool[0];
}

/* ---------- Reportes ---------- */
export const REPORT_REASONS = ['nombre', 'trampa', 'otro'];
export const REPORT_WHERE = ['guarida', 'arena', 'combate', 'social', 'otro'];
export const NOTE_MAX = 100;
export const REPORT_KEY = 'oathbreak.reports';
export const QUEUE_MAX = 20, QUEUE_BYTES = 2048;

export const cleanNote = (s, max = NOTE_MAX) => Array.from(String(s ?? '').normalize('NFC').replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

// Arma el reporte (compacto: viaja en la cola local y después a la nube). target: entidad del mundo.
export function makeReport({ target, reason, note = '', where = 'otro', ref = null, now }) {
  if (!target || typeof target.id !== 'string') return { ok: false, error: 'jugador_invalido' };
  if (!REPORT_REASONS.includes(reason)) return { ok: false, error: 'motivo_invalido' };
  if (note != null && typeof note !== 'string') return { ok: false, error: 'nota_invalida' };
  const x = cleanNote(note);
  const report = { t: target.id, n: cleanName(target.name), r: reason, w: REPORT_WHERE.includes(where) ? where : 'otro', ts: now };
  if (x) report.x = x;
  if (typeof ref === 'string' && /^[\w:.-]{1,40}$/.test(ref)) report.ref = ref;
  return { ok: true, report };
}

const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
export function readReports(storage) {
  try { const q = JSON.parse(storage.getItem(REPORT_KEY)); return Array.isArray(q) ? q.filter((r) => r && typeof r.t === 'string') : []; } catch { return []; }
}
function writeReports(storage, q) {
  while (q.length && (q.length > QUEUE_MAX || bytes(q) > QUEUE_BYTES)) q.shift(); // se descarta lo más viejo
  try { if (q.length) storage.setItem(REPORT_KEY, JSON.stringify(q)); else storage.removeItem(REPORT_KEY); } catch { /* sin espacio: queda en memoria */ }
  return q;
}
// Encola (mismo jugador y motivo sin enviar: se reemplaza por el más nuevo). Devuelve el largo de la cola.
export function queueReport(storage, report) {
  const q = readReports(storage).filter((r) => !(r.t === report.t && r.r === report.r));
  q.push(report);
  return writeReports(storage, q).length;
}
// Envía la cola con send(lista) → { ok }. Si falla o no existe la función en la nube, queda todo en cola (sin errores).
export async function flushReports(storage, send) {
  const q = readReports(storage);
  if (!q.length) return { ok: true, sent: 0 };
  let r;
  try { r = await send(q); } catch { r = { ok: false }; }
  if (!r?.ok) return { ok: false, sent: 0, pending: q.length };
  const key = (x) => `${x.t}|${x.r}|${x.ts}`;
  const sent = new Set(q.map(key));
  const left = writeReports(storage, readReports(storage).filter((x) => !sent.has(key(x))));
  return { ok: true, sent: q.length, pending: left.length };
}

/* ---------- Silenciar ---------- */
export const MUTE_MAX = 50;
