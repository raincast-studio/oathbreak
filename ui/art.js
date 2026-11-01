// Arte de la Guarida (v15): un dibujo vectorial propio por objeto, en vista frontal "chibi" con contorno grueso, que
// encaja en su huella de la grilla (100 unidades por casilla). Los muebles con variantes de material comparten dibujo y
// cambian de paleta. Pisos y paredes son patrones CSS. Sin imágenes externas: todo pesa ~30 KB.
import { ITEM } from '../src/game.js';

const OL = '#22152F';
const S = `stroke="${OL}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const R = (x, y, w, h, f, rx = 0, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" ${S} ${x2}/>`;
const E = (cx, cy, rx, ry, f, x2 = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${S} ${x2}/>`;
const C = (cx, cy, r, f, x2 = '') => E(cx, cy, r, r, f, x2);
const P = (d, f, x2 = '') => `<path d="${d}" fill="${f}" ${S} ${x2}/>`;
const L = (d, c = OL, w = 4) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const HL = (d, w = 4) => L(d, 'rgba(255,255,255,.45)', w); // brillo
const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.16}" fill="rgba(0,0,0,.28)"/>`;
const sparkle = (x, y, s = 6, c = '#FFF6C8') => `<path d="M${x} ${y - s}L${x + s * 0.3} ${y - s * 0.3}L${x + s} ${y}L${x + s * 0.3} ${y + s * 0.3}L${x} ${y + s}L${x - s * 0.3} ${y + s * 0.3}L${x - s} ${y}L${x - s * 0.3} ${y - s * 0.3}Z" fill="${c}"/>`;

// Materiales: [principal, sombra, detalle]
const MAT = {
  pino: ['#E2B97F', '#B4844C', '#8A5E30'], roble: ['#A8693A', '#7A4824', '#5A3218'], ebano: ['#4A3434', '#2E2020', '#C9CCD6'],
  marfil: ['#F1E8D4', '#CFC2A3', '#B89A5A'], obsidiana: ['#3A2B5C', '#22183C', '#B07CFF'], oro: ['#F5C64B', '#C2902A', '#FFF1B0'],
  madera: ['#B87A45', '#86532B', '#5E3A1D'],
};
const WOOD = MAT.madera;

/* ---------- Muebles base (con variantes de material) ---------- */
const BASE = {
  mesa: ([m, d, t]) => shadow(100, 94, 80) + R(28, 56, 12, 36, d, 3) + R(160, 56, 12, 36, d, 3) + R(20, 52, 160, 12, d, 3)
    + R(8, 36, 184, 18, m, 6) + HL('M20 42H180') + L(`M60 58H140`, t, 3),
  silla: ([m, d, t]) => shadow(50, 94, 34) + R(26, 62, 8, 30, d, 3) + R(66, 62, 8, 30, d, 3) + R(24, 8, 52, 50, m, 10)
    + L('M38 18V48M50 18V48M62 18V48', d, 4) + R(18, 50, 64, 14, m, 5) + HL('M28 56H72') + C(50, 12, 4, t),
  banco: ([m, d]) => shadow(100, 94, 86) + R(24, 60, 12, 32, d, 3) + R(164, 60, 12, 32, d, 3) + R(90, 60, 20, 32, d, 3)
    + R(10, 44, 180, 18, m, 6) + HL('M22 50H178'),
  cama: ([m, d, t]) => shadow(100, 192, 90) + R(10, 14, 180, 74, m, 22) + C(100, 40, 10, t) + R(16, 74, 168, 112, '#F4EEFF', 14)
    + R(16, 120, 168, 66, d, 12) + L('M16 140H184', 'rgba(255,255,255,.35)', 4) + R(32, 82, 62, 30, '#FFFFFF', 12) + R(106, 82, 62, 30, '#FFFFFF', 12)
    + R(10, 176, 14, 16, d, 3) + R(176, 176, 14, 16, d, 3),
  ropero: ([m, d, t]) => shadow(50, 194, 44) + R(14, 182, 12, 12, d, 2) + R(74, 182, 12, 12, d, 2) + R(10, 20, 80, 166, m, 8)
    + R(4, 10, 92, 16, d, 5) + L('M50 30V176') + R(18, 34, 26, 64, 'rgba(0,0,0,.12)', 4) + R(56, 34, 26, 64, 'rgba(0,0,0,.12)', 4)
    + C(44, 110, 4, t) + C(56, 110, 4, t) + HL('M18 120V170'),
  mesita: ([m, d, t]) => shadow(50, 94, 38) + R(22, 70, 8, 22, d, 2) + R(70, 70, 8, 22, d, 2) + R(18, 46, 64, 30, m, 4)
    + L('M18 61H82', d, 3) + C(50, 54, 3, t) + C(50, 68, 3, t) + R(12, 36, 76, 12, d, 4) + HL('M22 41H78'),
  biombo: ([m, d, t]) => shadow(100, 94, 86) + [12, 72, 132].map((x) => P(`M${x} 92V30Q${x + 28} 4 ${x + 56} 30V92Z`, m)
    + P(`M${x + 10} 84V36Q${x + 28} 18 ${x + 46} 36V84Z`, d) + L(`M${x + 28} 34V80M${x + 16} 60H${x + 40}`, t, 3)).join(''),
};

/* ---------- Piezas reutilizables ---------- */
const banner = (bg, bg2, emblem, pole = '#C9A13B') => shadow(50, 94, 26) + R(46, 10, 8, 82, pole, 3) + C(50, 8, 6, pole)
  + R(18, 14, 64, 8, pole, 3) + P('M22 22H78V72L50 86L22 72Z', bg) + P('M30 22H70V66L50 76L30 66Z', bg2) + emblem;
const cup = (body, base, extra = '') => shadow(50, 94, 26) + R(30, 76, 40, 14, base, 4) + R(42, 62, 16, 16, body, 3)
  + P('M24 18H76V30Q76 62 50 64Q24 62 24 30Z', body) + L('M24 26Q8 26 12 40Q16 50 28 48M76 26Q92 26 88 40Q84 50 72 48', OL, 5)
  + HL('M34 26V44') + extra;
const lampGlow = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".35"/>`;
const flame = (x, y, s = 1, c = '#FFB23C', c2 = '#FFF1B0') => P(`M${x} ${y - 16 * s}Q${x + 9 * s} ${y - 4 * s} ${x + 5 * s} ${y + 3 * s}Q${x} ${y + 7 * s} ${x - 5 * s} ${y + 3 * s}Q${x - 9 * s} ${y - 4 * s} ${x} ${y - 16 * s}Z`, c)
  + `<path d="M${x} ${y - 8 * s}Q${x + 4 * s} ${y - 1 * s} ${x} ${y + 3 * s}Q${x - 4 * s} ${y - 1 * s} ${x} ${y - 8 * s}Z" fill="${c2}"/>`;
const eyes = (x1, x2, y, r = 5) => C(x1, y, r, OL, 'stroke-width="0"') + C(x2, y, r, OL, 'stroke-width="0"')
  + `<circle cx="${x1 + 1.6}" cy="${y - 1.8}" r="${r * 0.35}" fill="#fff"/><circle cx="${x2 + 1.6}" cy="${y - 1.8}" r="${r * 0.35}" fill="#fff"/>`;
const blush = (x1, x2, y) => `<ellipse cx="${x1}" cy="${y}" rx="6" ry="3.5" fill="#FF8FA8" opacity=".7"/><ellipse cx="${x2}" cy="${y}" rx="6" ry="3.5" fill="#FF8FA8" opacity=".7"/>`;
// Mascota de cuatro patas: cabeza grande, cuerpo chico (gato, perro, zorro).
const pet = ({ fur, belly, ears, tail, snout = belly, nose = '#3A2030' }) => shadow(50, 94, 32)
  + tail + E(50, 74, 24, 18, fur) + E(50, 78, 12, 10, belly, 'stroke-width="0"') + R(32, 82, 10, 12, fur, 5) + R(58, 82, 10, 12, fur, 5)
  + ears + E(50, 46, 32, 27, fur) + E(50, 56, 14, 9, snout, 'stroke-width="0"') + eyes(38, 62, 46) + C(50, 53, 3.5, nose, 'stroke-width="0"')
  + L('M44 59Q50 63 56 59', OL, 3) + blush(30, 70, 56);
// Ave sentada (búho, halcón, cuervo, fénix).
const bird = ({ body, belly, wing, beak = '#F5B43C', crest = '', eyeR = 5, eyeRing = null, tail = '' }) => shadow(50, 94, 26)
  + tail + E(50, 64, 28, 28, body) + E(50, 70, 16, 18, belly, 'stroke-width="0"') + P('M24 56Q14 76 30 86Q34 70 34 58Z', wing)
  + P('M76 56Q86 76 70 86Q66 70 66 58Z', wing) + crest + E(50, 36, 24, 21, body)
  + (eyeRing ? C(41, 35, 9, eyeRing) + C(59, 35, 9, eyeRing) : '') + eyes(41, 59, 35, eyeR) + P('M46 42L54 42L50 50Z', beak)
  + R(40, 88, 6, 6, beak, 2, 'stroke-width="3"') + R(54, 88, 6, 6, beak, 2, 'stroke-width="3"');

/* ---------- Objetos ---------- */
const ART = {
  // Rincón acogedor
  mesa: () => BASE.mesa(MAT.roble) + R(150, 18, 22, 20, '#F4EEFF', 4) + L('M156 24V32', '#8E44F0', 3) + E(46, 30, 18, 8, '#FFC93C'),
  sillon: () => shadow(100, 94, 88) + R(14, 14, 172, 50, '#B0485A', 22) + R(6, 40, 32, 46, '#9A3A4C', 12) + R(162, 40, 32, 46, '#9A3A4C', 12)
    + R(32, 52, 136, 30, '#C9586A', 10) + L('M100 54V80', '#8E2D40', 3) + R(30, 84, 12, 10, WOOD[1], 2) + R(158, 84, 12, 10, WOOD[1], 2)
    + HL('M40 24H160') + C(70, 34, 3, '#8E2D40', 'stroke-width="0"') + C(130, 34, 3, '#8E2D40', 'stroke-width="0"'),
  lampara: () => lampGlow(50, 44, 34, '#FFC93C') + shadow(50, 94, 24) + E(50, 84, 24, 8, '#C9A13B') + P('M30 80Q30 54 50 52Q70 54 70 80Z', '#D9A441')
    + R(44, 30, 12, 24, '#F4EEFF', 4) + flame(50, 26, 1.1) + HL('M38 74Q38 62 46 58'),
  gato: () => pet({ fur: '#F0A04B', belly: '#FFE1B8', ears: P('M22 34L26 8L44 24Z', '#F0A04B') + P('M78 34L74 8L56 24Z', '#F0A04B') + P('M28 28L29 16L38 24Z', '#FFB8C6', 'stroke-width="0"') + P('M72 28L71 16L62 24Z', '#FFB8C6', 'stroke-width="0"'),
    tail: L('M70 80Q94 76 88 52', OL, 13) + L('M70 80Q94 76 88 52', '#F0A04B', 7) }) + L('M40 34L42 40M60 34L58 40', '#C97B2A', 3),
  // Biblioteca secreta
  estanteria: () => shadow(100, 96, 90) + R(8, 6, 184, 88, WOOD[0], 6) + R(16, 14, 168, 32, WOOD[2], 3) + R(16, 52, 168, 34, WOOD[2], 3)
    + [['#B0485A', 20, 22], ['#4FA3FF', 32, 26], ['#3DDC97', 46, 20], ['#FFC93C', 60, 24], ['#8E44F0', 72, 22], ['#E2364B', 104, 26], ['#5CC8FF', 118, 20], ['#F0A04B', 150, 24], ['#B07CFF', 164, 22]]
      .map(([c, x, hh]) => R(x, 46 - hh, 11, hh, c, 2, 'stroke-width="3"')).join('')
    + [['#3DDC97', 22, 26], ['#E2364B', 36, 30], ['#FFC93C', 72, 24], ['#4FA3FF', 86, 28], ['#8E44F0', 132, 30], ['#F0A04B', 146, 26], ['#B0485A', 160, 30]]
      .map(([c, x, hh]) => R(x, 86 - hh, 12, hh, c, 2, 'stroke-width="3"')).join('') + E(112, 76, 14, 10, '#F1E8D4'),
  atril: () => shadow(50, 94, 26) + R(46, 50, 8, 40, WOOD[1], 2) + R(30, 86, 40, 8, WOOD[1], 3) + P('M14 20L86 32L80 56L20 44Z', WOOD[0])
    + P('M22 26L50 30L48 46L22 42Z', '#F4EEFF', 'stroke-width="3"') + P('M50 30L78 35L74 50L48 46Z', '#F4EEFF', 'stroke-width="3"')
    + L('M28 33L44 35M28 38L42 40M54 36L70 39M54 41L68 43', '#8E7FB8', 2),
  globo: () => shadow(50, 94, 22) + R(34, 84, 32, 8, '#C9A13B', 3) + R(46, 70, 8, 16, '#C9A13B', 2) + L('M22 40Q22 72 50 72', '#C9A13B', 6)
    + C(50, 40, 28, '#4FA3FF') + P('M34 28Q44 20 52 28Q48 36 40 36Q34 34 34 28Z', '#3DDC97', 'stroke-width="3"')
    + P('M54 44Q66 40 70 50Q62 60 54 54Z', '#3DDC97', 'stroke-width="3"') + HL('M34 22Q40 16 48 16'),
  buho: () => bird({ body: '#8A6A4A', belly: '#E8D3B0', wing: '#6E5236', eyeRing: '#FFE7A8', eyeR: 6,
    crest: P('M30 22L26 8L40 18Z', '#8A6A4A') + P('M70 22L74 8L60 18Z', '#8A6A4A') }) + L('M44 66L50 70L56 66M44 74L50 78L56 74', '#B89A6A', 3),
  // Jardín interior
  maceta: () => shadow(50, 94, 24) + P('M50 54Q20 30 30 12Q46 20 50 54Z', '#3DDC97') + P('M50 54Q80 30 70 12Q54 20 50 54Z', '#2FB57C')
    + P('M50 56Q40 26 50 6Q60 26 50 56Z', '#46E59F') + P('M26 56H74L68 90H32Z', '#D96A3C') + R(22, 52, 56, 10, '#E8855A', 4) + HL('M34 66L36 84'),
  bonsai: () => shadow(50, 94, 30) + R(18, 76, 64, 16, '#3A6E8E', 5) + L('M50 76Q44 60 52 48Q60 38 48 28', OL, 11) + L('M50 76Q44 60 52 48Q60 38 48 28', '#7A4824', 6)
    + E(34, 30, 20, 12, '#3DDC97') + E(64, 40, 18, 11, '#2FB57C') + E(50, 18, 18, 11, '#46E59F') + HL('M24 74H76', 3),
  estanque: () => shadow(100, 186, 90) + E(100, 110, 90, 70, '#8A8296') + E(100, 108, 76, 58, '#3A8FD0') + E(100, 108, 76, 58, 'url(#wv)', 'stroke-width="0"')
    + [[40, 60], [160, 70], [30, 150], [170, 150], [100, 172]].map(([x, y]) => E(x, y, 16, 11, '#A69EB3')).join('')
    + P('M70 96Q84 84 98 96Q84 106 70 96ZM98 96L108 88L106 104Z', '#F0884B', 'stroke-width="3"') + P('M118 128Q132 116 146 128Q132 138 118 128ZM146 128L156 120L154 136Z', '#FFFFFF', 'stroke-width="3"')
    + C(128, 127, 3, '#E2364B', 'stroke-width="0"') + E(70, 136, 16, 8, '#3DDC97') + HL('M60 80Q80 70 100 72'),
  tortuga: () => shadow(50, 94, 34) + C(20, 66, 10, '#7DD08A') + R(26, 76, 12, 14, '#7DD08A', 5) + R(62, 76, 12, 14, '#7DD08A', 5)
    + P('M24 76Q24 34 56 32Q86 34 86 76Z', '#3E9B6E') + P('M40 46L56 40L72 46L72 62L56 68L40 62Z', '#5FC08A', 'stroke-width="3"')
    + C(14, 58, 14, '#7DD08A') + eyes(10, 20, 55, 3.5) + L('M8 64Q13 67 18 64', OL, 2.5) + HL('M34 50Q44 40 56 38'),
  // Sueltos
  cofre: () => shadow(50, 94, 40) + R(10, 46, 80, 44, WOOD[0], 6) + P('M10 50Q10 18 50 18Q90 18 90 50Z', WOOD[1]) + R(10, 44, 80, 8, '#C9A13B', 2)
    + R(20, 20, 8, 70, '#C9A13B', 2) + R(72, 20, 8, 70, '#C9A13B', 2) + R(42, 46, 16, 18, '#FFC93C', 3) + C(50, 56, 3, OL, 'stroke-width="0"'),
  alfombra: () => R(8, 8, 184, 184, '#8E2D4A', 14) + R(22, 22, 156, 156, '#B0485A', 8) + R(40, 40, 120, 120, 'none', 4, 'stroke-dasharray="10 8"')
    + P('M100 52L148 100L100 148L52 100Z', '#FFC93C') + P('M100 74L126 100L100 126L74 100Z', '#8E2D4A') + C(100, 100, 8, '#FFC93C')
    + [[22, 22], [178, 22], [22, 178], [178, 178]].map(([x, y]) => C(x, y, 6, '#FFC93C', 'stroke-width="3"')).join(''),
  reloj: () => shadow(50, 196, 34) + R(18, 40, 64, 152, WOOD[1], 6) + P('M14 44Q14 4 50 4Q86 4 86 44Z', WOOD[0]) + C(50, 40, 22, '#F4EEFF')
    + L('M50 40V26M50 40L60 46', OL, 4) + C(50, 40, 3, OL) + R(30, 76, 40, 92, '#2A1A3A', 6) + L('M50 80V140', '#C9A13B', 4) + C(50, 146, 11, '#FFC93C')
    + R(10, 180, 80, 14, WOOD[0], 4) + HL('M26 82V160'),
  candelabro: () => lampGlow(50, 30, 34, '#FFC93C') + shadow(50, 94, 22) + E(50, 88, 20, 6, '#C9A13B') + R(46, 46, 8, 42, '#C9A13B', 3)
    + L('M24 52Q24 64 50 64Q76 64 76 52', OL, 9) + L('M24 52Q24 64 50 64Q76 64 76 52', '#D9A441', 5)
    + [24, 50, 76].map((x) => R(x - 5, x === 50 ? 26 : 36, 10, x === 50 ? 22 : 16, '#F4EEFF', 3) + flame(x, x === 50 ? 22 : 32, 0.7)).join(''),
  farol: () => lampGlow(50, 56, 36, '#FFC93C') + shadow(50, 94, 24) + R(44, 4, 12, 10, '#5C5670', 3) + P('M26 24L50 12L74 24Z', '#5C5670')
    + R(28, 24, 44, 52, 'rgba(255,214,107,.55)') + L('M50 24V76M28 50H72', '#5C5670', 4) + flame(50, 58, 0.9) + R(24, 74, 52, 10, '#5C5670', 3) + R(40, 84, 20, 8, '#5C5670', 2),
  arana: () => lampGlow(50, 50, 40, '#BDE8FF') + L('M50 0V22', OL, 4) + E(50, 46, 34, 14, '#C9A13B') + [18, 34, 50, 66, 82].map((x) => L(`M${x} 52L${x} 68`, '#BDE8FF', 3)
    + P(`M${x} 66L${x + 5} 74L${x} 84L${x - 5} 74Z`, '#E8F7FF', 'stroke-width="2.5"')).join('') + [24, 50, 76].map((x) => R(x - 4, 22, 8, 16, '#F4EEFF', 2, 'stroke-width="3"') + flame(x, 20, 0.6)).join(''),
  perro: () => pet({ fur: '#C98A55', belly: '#F4DDBB', snout: '#F4DDBB', ears: E(20, 46, 10, 20, '#8A5A34', 'transform="rotate(18 20 46)"') + E(80, 46, 10, 20, '#8A5A34', 'transform="rotate(-18 80 46)"'),
    tail: L('M72 74Q90 66 86 54', OL, 11) + L('M72 74Q90 66 86 54', '#C98A55', 6) }) + E(50, 70, 16, 4, '#E2364B', 'stroke-width="3"') + C(50, 74, 4, '#FFC93C', 'stroke-width="2.5"'),
  zorro: () => pet({ fur: '#E8742E', belly: '#FFF4E6', snout: '#FFF4E6', ears: P('M20 36L22 4L46 26Z', '#E8742E') + P('M80 36L78 4L54 26Z', '#E8742E') + P('M26 28L27 12L38 24Z', '#3A2030', 'stroke-width="0"') + P('M74 28L73 12L62 24Z', '#3A2030', 'stroke-width="0"'),
    tail: P('M66 80Q98 84 92 54Q90 40 80 46Q86 66 66 70Z', '#E8742E') + P('M92 54Q90 40 80 46Q84 52 86 58Z', '#FFF4E6', 'stroke-width="3"') }),
  chimenea: () => shadow(150, 96, 140) + R(10, 8, 280, 16, '#8A8296', 4) + R(20, 22, 260, 72, '#A69EB3', 4)
    + [[28, 30], [80, 30], [196, 30], [248, 30], [28, 56], [248, 56]].map(([x, y]) => R(x, y, 44, 20, '#8A8296', 3, 'stroke-width="2.5"')).join('')
    + P('M90 94V54Q150 26 210 54V94Z', '#22152F') + lampGlow(150, 76, 40, '#FF7A2E') + flame(130, 84, 1.3, '#FF7A2E', '#FFC93C') + flame(166, 82, 1.5, '#FFB23C', '#FFF1B0')
    + flame(148, 88, 1, '#FF7A2E', '#FFC93C') + R(110, 86, 80, 8, '#5A3218', 3),
  mapa_mundi: () => shadow(150, 196, 140) + R(30, 120, 16, 72, WOOD[1], 4) + R(254, 120, 16, 72, WOOD[1], 4) + R(10, 40, 280, 90, WOOD[0], 10)
    + R(26, 50, 248, 68, '#F1E1B8', 6) + P('M50 70Q70 56 90 66Q96 84 76 92Q56 94 50 80Z', '#C9B07A', 'stroke-width="3"')
    + P('M130 60Q170 54 186 70Q190 92 160 98Q130 96 128 80Z', '#C9B07A', 'stroke-width="3"') + P('M210 84Q236 74 252 86Q246 104 222 104Z', '#C9B07A', 'stroke-width="3"')
    + L('M96 80Q120 70 132 76', '#E2364B', 3) + `<path d="M234 64l4 8l9 1l-7 6l2 9l-8 -5l-8 5l2 -9l-7 -6l9 -1z" fill="#E2364B"/>` + R(8, 120, 284, 12, WOOD[1], 4),
  armadura_vieja: () => shadow(50, 196, 30) + R(30, 170, 40, 22, '#6E6680', 4) + R(36, 120, 12, 52, '#7E7690', 3) + R(52, 120, 12, 52, '#7E7690', 3)
    + P('M26 64H74L70 124H30Z', '#8E86A0') + R(14, 64, 16, 48, '#7E7690', 6) + R(70, 64, 16, 48, '#7E7690', 6) + E(50, 40, 20, 24, '#8E86A0')
    + R(36, 36, 28, 6, '#22152F', 2) + L('M50 16V6', '#E2364B', 6) + `<circle cx="70" cy="86" r="6" fill="#B06A3A" opacity=".8"/><circle cx="38" cy="100" r="5" fill="#B06A3A" opacity=".7"/>` + HL('M36 72V110'),
  piano: () => shadow(150, 196, 130) + R(40, 150, 14, 44, '#1A1426', 4) + R(246, 150, 14, 44, '#1A1426', 4) + P('M20 40Q20 12 120 18L280 40V150H20Z', '#2A2140')
    + R(20, 104, 260, 34, '#F4EEFF', 3) + Array.from({ length: 12 }, (_, i) => (i % 7 === 2 || i % 7 === 6) ? '' : R(38 + i * 20, 104, 10, 20, '#1A1426', 1, 'stroke-width="2"')).join('')
    + L('M40 104V138M60 104V138M80 104V138M100 104V138M120 104V138M140 104V138M160 104V138M180 104V138M200 104V138M220 104V138M240 104V138M260 104V138', '#B8AFC8', 1.5)
    + R(110, 56, 80, 30, '#F1E8D4', 3) + L('M120 66H180M120 74H170', '#8E7FB8', 2) + HL('M40 46Q100 30 160 40'),
  acuario: () => shadow(100, 96, 88) + R(12, 76, 176, 18, WOOD[1], 4) + R(14, 10, 172, 68, 'rgba(92,200,255,.55)', 6) + R(14, 48, 172, 30, 'rgba(58,143,208,.5)', 0, 'stroke-width="0"')
    + P('M30 78Q36 56 30 42M44 78Q38 60 46 50', '#3DDC97', 'stroke-width="4" fill="none"') + P('M150 78Q156 58 148 44', '#3DDC97', 'stroke-width="4" fill="none"')
    + P('M80 40Q92 30 104 40Q92 50 80 40ZM104 40L114 32L112 48Z', '#FF8F3C', 'stroke-width="3"') + P('M120 60Q130 52 140 60Q130 68 120 60ZM140 60L148 54L146 66Z', '#FFC93C', 'stroke-width="3"')
    + C(70, 30, 3, '#E8F7FF', 'stroke-width="1.5"') + C(66, 20, 2, '#E8F7FF', 'stroke-width="1.5"') + HL('M24 18H90') + R(10, 6, 180, 8, '#5C5670', 3),
  dragon: () => shadow(100, 190, 70) + P('M150 140Q196 150 186 100Q176 120 150 120Z', '#3DDC97') + P('M60 110Q10 70 30 40Q50 70 76 80Z', '#2FB57C') + P('M140 110Q190 70 170 40Q150 70 124 80Z', '#2FB57C')
    + E(100, 136, 50, 44, '#3DDC97') + E(100, 146, 30, 28, '#B8F5CF', 'stroke-width="0"') + L('M84 128H116M82 142H118M86 156H114', '#7FD9A4', 3) + R(66, 168, 22, 22, '#3DDC97', 9) + R(112, 168, 22, 22, '#3DDC97', 9)
    + P('M66 58L58 22L84 46Z', '#FFE7A8') + P('M134 58L142 22L116 46Z', '#FFE7A8') + E(100, 74, 50, 40, '#3DDC97') + E(100, 92, 22, 14, '#B8F5CF', 'stroke-width="0"')
    + eyes(80, 120, 70, 8) + C(92, 90, 3, OL, 'stroke-width="0"') + C(108, 90, 3, OL, 'stroke-width="0"') + blush(66, 134, 88) + flame(150, 40, 0.6) + sparkle(36, 120, 7),
  trono: () => shadow(100, 194, 86) + P('M30 186V40Q30 10 60 16L100 4L140 16Q170 10 170 40V186Z', '#8E44F0') + P('M50 120V44Q100 20 150 44V120Z', '#B07CFF')
    + P('M100 6L112 22H88Z', '#FFC93C') + C(100, 70, 12, '#FFC93C') + C(100, 70, 5, '#E2364B', 'stroke-width="0"') + R(20, 112, 160, 34, '#C9586A', 10)
    + R(14, 100, 26, 70, '#FFC93C', 8) + R(160, 100, 26, 70, '#FFC93C', 8) + R(30, 146, 140, 40, '#6E2AB8', 4) + HL('M48 50Q100 28 150 50') + sparkle(170, 26, 8),
  fenix: () => lampGlow(50, 56, 44, '#FF7A2E') + bird({ body: '#FF6B3C', belly: '#FFC93C', wing: '#E2364B', beak: '#FFE7A8', eyeR: 5,
    crest: flame(40, 18, 0.8, '#FFB23C', '#FFF1B0') + flame(50, 14, 1, '#FF7A2E', '#FFF1B0') + flame(60, 18, 0.8, '#FFB23C', '#FFF1B0'),
    tail: P('M36 84Q20 98 10 90Q26 86 30 76ZM64 84Q80 98 90 90Q74 86 70 76Z', '#FFB23C') }) + sparkle(14, 30, 6) + sparkle(86, 40, 5),
  // Paladín (héroes)
  estandarte_alba: () => banner('#F4EEFF', '#FFE7A8', sparkle(50, 44, 14, '#FFC93C') + C(50, 44, 6, '#FFC93C', 'stroke-width="3"')),
  armadura_cer: () => shadow(50, 196, 32) + R(28, 178, 44, 14, '#C9A13B', 4) + R(36, 120, 12, 58, '#E8E6F0', 3) + R(52, 120, 12, 58, '#E8E6F0', 3)
    + P('M24 62H76L72 124H28Z', '#F4F2FA') + P('M40 70L50 86L60 70Z', '#FFC93C', 'stroke-width="3"') + R(10, 62, 16, 50, '#E8E6F0', 6) + R(74, 62, 16, 50, '#E8E6F0', 6)
    + E(50, 38, 20, 24, '#F4F2FA') + P('M30 30Q50 8 70 30', '#FFC93C', 'fill="none"') + R(38, 36, 24, 5, '#22152F', 2) + P('M50 14Q60 4 72 8Q62 12 56 22Z', '#4FA3FF') + HL('M34 72V112'),
  vitrina: () => shadow(100, 96, 86) + R(10, 6, 180, 86, WOOD[2], 6) + R(18, 14, 164, 58, 'rgba(189,232,255,.35)', 4) + R(14, 72, 172, 20, WOOD[0], 4)
    + cupMini(52, 60, '#FFC93C') + R(90, 30, 22, 30, '#B07CFF', 3) + C(101, 26, 7, '#E8F7FF') + R(130, 46, 40, 14, '#E8E6F0', 3) + L('M136 46L150 30L164 46', '#C9A13B', 4) + HL('M24 20L40 64', 3),
  caliz: () => lampGlow(50, 34, 30, '#FFE7A8') + cup('#FFC93C', '#C9A13B', C(50, 36, 7, '#4FA3FF', 'stroke-width="3"') + sparkle(78, 12, 6)),
  catalejo: () => shadow(50, 94, 28) + L('M50 60L30 92M50 60L70 92M50 60L50 92', '#7A4824', 5) + R(14, 30, 72, 18, '#C9A13B', 8, 'transform="rotate(-24 50 39)"')
    + R(62, 18, 20, 22, '#A9852E', 6, 'transform="rotate(-24 72 29)"') + C(50, 60, 6, '#7A4824') + C(20, 54, 6, '#BDE8FF', 'stroke-width="3"'),
  mapa_ciudad: () => shadow(100, 96, 88) + R(8, 8, 184, 84, '#F1E1B8', 4) + L('M8 50H192M60 8V92M140 8V92M8 24H60M140 70H192', '#C9B07A', 6)
    + [[24, 32, '#4FA3FF'], [80, 20, '#B8AFC8'], [100, 60, '#B8AFC8'], [160, 24, '#3DDC97'], [24, 66, '#B8AFC8'], [160, 80, '#B8AFC8']].map(([x, y, c]) => R(x, y, 26, 14, c, 2, 'stroke-width="2.5"')).join('')
    + P('M112 26Q112 14 120 14Q128 14 128 26L120 38Z', '#E2364B', 'stroke-width="3"') + C(120, 24, 3, '#fff', 'stroke-width="0"') + R(4, 4, 192, 92, 'none', 4),
  radio: () => shadow(50, 94, 32) + L('M70 30L84 4', OL, 4) + C(84, 4, 4, '#E2364B') + R(14, 30, 72, 60, '#E2364B', 10) + C(36, 60, 14, '#5C5670')
    + L('M28 54H44M28 60H44M28 66H44', '#B8AFC8', 2.5) + R(58, 46, 20, 10, '#BDE8FF', 2, 'stroke-width="3"') + C(64, 72, 5, '#FFC93C') + C(76, 72, 5, '#FFC93C') + HL('M20 38H80', 3),
  halcon: () => bird({ body: '#8E6A4E', belly: '#F4E6D0', wing: '#6E4E36', beak: '#FFC93C', crest: R(38, 26, 24, 6, '#22152F', 2, 'stroke-width="0" opacity=".25"') })
    + L('M44 64L48 68M54 70L58 74M44 76L48 80', '#B08A62', 3) + R(30, 90, 40, 6, '#7A4824', 3),
  escudo_mural: () => shadow(50, 94, 22) + P('M50 6L86 18V48Q86 78 50 92Q14 78 14 48V18Z', '#4FA3FF') + P('M50 6V92Q14 78 14 48V18Z', '#3A8FD0')
    + P('M50 22L56 40L74 40L60 52L66 70L50 58L34 70L40 52L26 40L44 40Z', '#FFC93C', 'stroke-width="3"') + HL('M22 24V46'),
  // Doctor (villanos)
  estandarte_carmesi: () => banner('#E2364B', '#8E1A2A', P('M50 30L58 46L50 62L42 46Z', '#FFC93C', 'stroke-width="3"') + C(50, 46, 4, '#22152F', 'stroke-width="0"'), '#5C5670'),
  tanque_clones: () => shadow(50, 196, 40) + R(14, 170, 72, 24, '#5C5670', 6) + R(14, 6, 72, 20, '#5C5670', 6) + R(20, 26, 60, 144, 'rgba(61,220,151,.45)', 26)
    + `<ellipse cx="50" cy="96" rx="14" ry="30" fill="#2A8A5C" opacity=".8"/><circle cx="50" cy="66" r="12" fill="#2A8A5C" opacity=".85"/>`
    + C(36, 140, 4, '#E8FFF4', 'stroke-width="1.5"') + C(62, 120, 3, '#E8FFF4', 'stroke-width="1.5"') + C(44, 48, 3, '#E8FFF4', 'stroke-width="1.5"')
    + HL('M30 40V150', 5) + C(30, 184, 4, '#3DDC97', 'stroke-width="2"') + C(44, 184, 4, '#E2364B', 'stroke-width="2"'),
  mesa_exp: () => BASE.mesa(MAT.ebano) + P('M30 36L34 14H46L50 36Z', 'rgba(61,220,151,.7)') + R(30, 8, 20, 6, '#B8AFC8', 2, 'stroke-width="3"')
    + C(90, 26, 10, 'rgba(176,124,255,.7)') + R(86, 8, 8, 10, '#B8AFC8', 2, 'stroke-width="3"') + R(130, 14, 40, 22, '#F1E8D4', 3) + L('M136 22H164M136 28H158', '#8E7FB8', 2)
    + C(36, 6, 3, '#3DDC97', 'stroke-width="0"') + C(94, 0, 3, '#B07CFF', 'stroke-width="0"'),
  calavera: () => lampGlow(50, 44, 30, '#B07CFF') + shadow(50, 94, 22) + R(30, 82, 40, 10, '#5C5670', 3)
    + P('M20 44Q20 12 50 12Q80 12 80 44Q80 60 70 64V78H30V64Q20 60 20 44Z', 'rgba(232,247,255,.85)') + E(38, 44, 9, 10, '#22152F', 'stroke-width="0"')
    + E(62, 44, 9, 10, '#22152F', 'stroke-width="0"') + P('M50 54L45 62H55Z', '#22152F', 'stroke-width="0"') + L('M40 72V78M50 72V78M60 72V78', OL, 3)
    + C(38, 44, 3, '#B07CFF', 'stroke-width="0"') + C(62, 44, 3, '#B07CFF', 'stroke-width="0"') + HL('M30 28Q36 20 46 18'),
  // Cripta del Usurpador (villanos)
  sarcofago: () => shadow(50, 196, 40) + P('M24 10H76L88 60L78 190H22L12 60Z', '#C9A13B') + P('M32 18H68L78 60L70 182H30L22 60Z', '#3A2B5C')
    + E(50, 52, 16, 18, '#E8C77A') + eyes(43, 57, 50, 3.5) + L('M44 62H56', OL, 3) + P('M34 34Q50 22 66 34', '#4FA3FF', 'fill="none"')
    + L('M34 96H66M38 120H62M40 144H60', '#C9A13B', 4) + P('M44 74L50 86L56 74Z', '#E2364B', 'stroke-width="3"'),
  vela_negra: () => lampGlow(50, 30, 26, '#B07CFF') + shadow(50, 94, 26) + E(50, 88, 26, 7, '#5C5670') + R(26, 46, 16, 42, '#2A2140', 3)
    + R(44, 34, 16, 54, '#2A2140', 3) + R(62, 54, 14, 34, '#2A2140', 3) + P('M44 40Q48 48 46 54', 'none', 'stroke="#4A3B70"')
    + flame(34, 42, 0.7, '#B07CFF', '#F4EEFF') + flame(52, 30, 0.8, '#B07CFF', '#F4EEFF') + flame(69, 50, 0.6, '#B07CFF', '#F4EEFF'),
  altar: () => lampGlow(100, 40, 50, '#B07CFF') + shadow(100, 96, 90) + R(16, 44, 168, 48, '#2A2140', 6) + R(8, 32, 184, 16, '#3A2B5C', 5)
    + R(30, 56, 140, 26, '#22183C', 4) + P('M100 58L112 70L100 82L88 70Z', '#B07CFF', 'stroke-width="3"') + C(100, 16, 12, '#B07CFF') + `<circle cx="100" cy="16" r="5" fill="#F4EEFF"/>`
    + R(30, 20, 8, 14, '#F1E8D4', 2, 'stroke-width="3"') + flame(34, 16, 0.5, '#B07CFF', '#F4EEFF') + R(162, 20, 8, 14, '#F1E8D4', 2, 'stroke-width="3"') + flame(166, 16, 0.5, '#B07CFF', '#F4EEFF'),
  cuervo: () => bird({ body: '#2E2A40', belly: '#4A4560', wing: '#1E1A2E', beak: '#5C5670', eyeR: 5 }) + C(41, 35, 2.4, '#E2364B', 'stroke-width="0"') + C(59, 35, 2.4, '#E2364B', 'stroke-width="0"')
    + P('M44 12L50 20L56 12L52 18Z', '#2E2A40', 'stroke-width="3"'),
  bandera_pirata: () => banner('#22152F', '#2E2A40', C(50, 40, 12, '#F4EEFF', 'stroke-width="3"') + E(45, 40, 3, 4, '#22152F', 'stroke-width="0"') + E(55, 40, 3, 4, '#22152F', 'stroke-width="0"')
    + L('M38 58L62 70M62 58L38 70', '#F4EEFF', 5), '#7A4824'),
  // Exclusivos
  farol_amistad: () => lampGlow(50, 50, 38, '#FF8FA8') + shadow(50, 94, 22) + R(44, 4, 12, 10, '#C9A13B', 3) + P('M28 24L50 12L72 24Z', '#C9A13B')
    + R(28, 24, 44, 52, 'rgba(255,143,168,.5)') + P('M50 66Q30 52 38 42Q46 36 50 46Q54 36 62 42Q70 52 50 66Z', '#E2364B', 'stroke-width="3"') + R(24, 74, 52, 10, '#C9A13B', 3),
  trofeo_racha: () => lampGlow(50, 30, 32, '#FF7A2E') + shadow(50, 94, 24) + R(26, 76, 48, 16, '#5C5670', 4) + P('M32 76L38 48H62L68 76Z', '#8A8296')
    + flame(50, 40, 2, '#FF7A2E', '#FFC93C') + R(36, 80, 28, 8, '#FFC93C', 2, 'stroke-width="2.5"'),
  trofeo_campeon: () => cup('#FFC93C', '#8E44F0', `<path d="M50 28l4 8l9 1l-7 6l2 9l-8 -5l-8 5l2 -9l-7 -6l9 -1z" fill="#FFF1B0"/>` + sparkle(80, 12, 6) + sparkle(20, 20, 4)),
  marco_honor: () => lampGlow(50, 46, 40, '#FFE7A8') + R(8, 8, 84, 84, '#FFC93C', 8) + R(18, 18, 64, 64, '#3A2B5C', 4) + P('M50 26L56 42L72 42L60 52L64 68L50 58L36 68L40 52L28 42L44 42Z', '#FFC93C', 'stroke-width="3"')
    + [[8, 8], [92, 8], [8, 92], [92, 92]].map(([x, y]) => C(x, y, 7, '#E2364B', 'stroke-width="3"')).join('') + sparkle(80, 22, 6),
  estandarte_victoria: () => banner('#8E44F0', '#B07CFF', P('M36 50L44 34L50 44L56 34L64 50Z', '#FFC93C', 'stroke-width="3"') + R(36, 50, 28, 6, '#FFC93C', 2, 'stroke-width="3"'), '#FFC93C'),
  // Temporada
  temp_aura: () => `<circle cx="50" cy="56" r="40" fill="#8E44F0" opacity=".25"/><circle cx="50" cy="56" r="28" fill="#B07CFF" opacity=".35"/>` + shadow(50, 94, 24)
    + E(50, 84, 22, 7, '#5C5670') + P('M50 20Q66 46 50 76Q34 46 50 20Z', '#B07CFF') + P('M50 34Q58 50 50 66Q42 50 50 34Z', '#F4EEFF', 'stroke-width="0"') + sparkle(22, 30, 7) + sparkle(78, 44, 6) + sparkle(30, 70, 4),
  temp_estatua: () => shadow(50, 196, 36) + R(16, 160, 68, 32, '#8A8296', 4) + R(22, 150, 56, 14, '#A69EB3', 4) + P('M34 150L38 92H62L66 150Z', '#C9C2D6')
    + P('M30 96Q50 80 70 96L66 106H34Z', '#B8AFC8') + C(50, 64, 18, '#C9C2D6') + L('M70 92L88 40', OL, 8) + L('M70 92L88 40', '#D9D3E3', 4) + flame(88, 36, 0.8, '#B07CFF', '#F4EEFF')
    + L('M24 176H76', '#FFC93C', 4) + HL('M42 100V144'),
  temp_portal: () => `<circle cx="100" cy="100" r="80" fill="#8E44F0" opacity=".2"/>` + shadow(100, 192, 80) + P('M30 190V90Q30 20 100 20Q170 20 170 90V190Z', '#5C5670')
    + P('M48 190V96Q48 40 100 40Q152 40 152 96V190Z', '#2A1458') + `<ellipse cx="100" cy="116" rx="44" ry="66" fill="url(#pt)"/>`
    + L('M100 70Q130 90 110 120Q86 140 100 160', '#E8D9FF', 4) + L('M80 90Q96 110 84 134', '#B07CFF', 3)
    + [[38, 60], [162, 60], [34, 130], [166, 130]].map(([x, y]) => C(x, y, 7, '#B07CFF', 'stroke-width="3"')).join('') + sparkle(100, 30, 9) + R(20, 180, 160, 12, '#8A8296', 4),
  // Tienda de renombre
  farol_aurora: () => lampGlow(50, 50, 40, '#3DDC97') + shadow(50, 94, 22) + R(44, 4, 12, 10, '#5C5670', 3) + P('M28 24L50 12L72 24Z', '#5C5670')
    + `<rect x="28" y="24" width="44" height="52" fill="url(#au)" ${S}/>` + sparkle(50, 50, 9, '#F4EEFF') + R(24, 74, 52, 10, '#5C5670', 3),
  busto: () => shadow(50, 94, 26) + R(26, 78, 48, 14, '#8A8296', 4) + R(32, 70, 36, 10, '#A69EB3', 3) + P('M20 72Q24 48 50 48Q76 48 80 72Z', '#C9C2D6')
    + C(50, 32, 18, '#D9D3E3') + P('M32 26Q36 8 50 10Q66 8 68 26Q60 18 50 20Q40 18 32 26Z', '#B8AFC8', 'stroke-width="3"') + L('M44 36Q50 40 56 36', OL, 2.5) + HL('M38 24Q42 18 48 16'),
  banco_plaza: () => shadow(100, 96, 88) + R(14, 10, 172, 14, '#3E9B6E', 4) + R(14, 30, 172, 14, '#3E9B6E', 4) + R(10, 52, 180, 14, '#3E9B6E', 4)
    + P('M22 8V92M178 8V92', 'none', 'stroke="#22152F" stroke-width="10"') + P('M22 8V92M178 8V92', 'none', 'stroke="#4A4560" stroke-width="5"')
    + L('M16 92Q22 82 30 92M170 92Q178 82 184 92', '#4A4560', 5),
  fuente: () => shadow(100, 192, 90) + E(100, 160, 88, 30, '#A69EB3') + E(100, 154, 74, 20, '#3A8FD0') + R(86, 70, 28, 84, '#C9C2D6', 6) + E(100, 76, 40, 14, '#A69EB3')
    + E(100, 72, 30, 9, '#5CC8FF', 'stroke-width="3"') + R(92, 26, 16, 46, '#C9C2D6', 5) + C(100, 22, 10, '#C9C2D6')
    + L('M100 12Q76 20 70 64M100 12Q124 20 130 64', '#BDE8FF', 4) + L('M76 76Q52 92 48 146M124 76Q148 92 152 146', '#BDE8FF', 4) + C(60, 154, 3, '#FFC93C', 'stroke-width="0"') + C(136, 158, 3, '#FFC93C', 'stroke-width="0"'),
  alfombra_gala: () => R(8, 8, 284, 184, '#B0102E', 18) + R(22, 22, 256, 156, '#E2364B', 10) + R(36, 36, 228, 128, 'none', 6, 'stroke="#FFC93C" stroke-dasharray="14 8"')
    + P('M150 54L206 100L150 146L94 100Z', '#FFC93C') + P('M150 74L182 100L150 126L118 100Z', '#B0102E') + `<path d="M150 88l4 8l9 1l-7 6l2 9l-8 -5l-8 5l2 -9l-7 -6l9 -1z" fill="#FFC93C"/>`
    + [60, 240].map((x) => P(`M${x} 80L${x + 16} 100L${x} 120L${x - 16} 100Z`, '#FFC93C', 'stroke-width="3"')).join('')
    + Array.from({ length: 9 }, (_, i) => L(`M${36 + i * 28} 8V0M${36 + i * 28} 192V200`, '#FFC93C', 4)).join(''),
  glorieta: () => shadow(150, 292, 140) + R(20, 260, 260, 30, '#C9C2D6', 6) + [44, 106, 194, 256].map((x) => R(x - 9, 120, 18, 142, '#F4EEFF', 4)).join('')
    + P('M8 126L150 30L292 126Z', '#E2364B') + P('M40 126L150 52L260 126Z', '#F06B7D', 'stroke-width="0"') + R(8, 118, 284, 16, '#F4EEFF', 6)
    + C(150, 26, 10, '#FFC93C') + L('M58 150Q100 186 150 150Q200 186 242 150', '#3DDC97', 6) + [76, 124, 176, 224].map((x) => C(x, 166, 6, '#FF8FA8', 'stroke-width="2.5"')).join('')
    + L('M60 290V300M240 290V300', OL, 4) + E(70, 250, 26, 14, '#3DDC97') + E(232, 250, 26, 14, '#2FB57C') + sparkle(100, 90, 6) + sparkle(210, 96, 5),
  estatua_anfitrion: () => lampGlow(100, 100, 80, '#FFE7A8') + shadow(100, 194, 70) + R(40, 160, 120, 34, '#8A8296', 6) + R(50, 148, 100, 16, '#A69EB3', 4)
    + R(64, 168, 72, 16, '#FFC93C', 3, 'stroke-width="3"') + P('M70 148L74 92H126L130 148Z', '#FFE08A') + P('M60 96Q100 72 140 96L134 108H66Z', '#FFD25A')
    + L('M132 98L160 52', OL, 10) + L('M132 98L160 52', '#FFD25A', 5) + C(162, 46, 10, '#FFE08A') + C(100, 58, 24, '#FFE08A')
    + P('M76 52Q78 30 100 32Q122 30 124 52Q112 42 100 44Q88 42 76 52Z', '#F5C64B', 'stroke-width="3"') + L('M92 64Q100 70 108 64', OL, 3) + sparkle(46, 60, 8) + sparkle(160, 120, 6),
};
// Trofeo chico para la vitrina.
function cupMini(x, y, c) { return P(`M${x - 12} ${y - 28}H${x + 12}V${y - 22}Q${x + 12} ${y - 10} ${x} ${y - 8}Q${x - 12} ${y - 10} ${x - 12} ${y - 22}Z`, c, 'stroke-width="3"') + R(x - 3, y - 9, 6, 6, c, 1, 'stroke-width="2.5"') + R(x - 9, y - 4, 18, 6, c, 2, 'stroke-width="2.5"'); }

const DEFS = `<defs>
<linearGradient id="wv" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0E3A6A" stop-opacity=".25"/></linearGradient>
<radialGradient id="pt"><stop offset="0" stop-color="#F4EEFF"/><stop offset=".35" stop-color="#B07CFF"/><stop offset="1" stop-color="#3A1A7A"/></radialGradient>
<linearGradient id="au" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3DDC97" stop-opacity=".8"/><stop offset=".5" stop-color="#5CC8FF" stop-opacity=".7"/><stop offset="1" stop-color="#B07CFF" stop-opacity=".8"/></linearGradient>
</defs>`;

// Markup SVG del objeto (o null para pisos/paredes, que son patrones).
const cache = new Map();
export function artMarkup(id) {
  if (cache.has(id)) return cache.get(id);
  const def = ITEM[id];
  if (!def || def.cat === 'piso' || def.cat === 'pared') return null;
  const [w, hh] = def.size;
  let body;
  if (ART[id]) body = ART[id]();
  else {
    const [base, mat] = id.split('_');
    body = BASE[base] ? BASE[base](MAT[mat] ?? WOOD) + (mat === 'oro' || mat === 'obsidiana' ? sparkle(w * 100 - 14, 14, 7) : '') : null;
  }
  const out = body ? `<svg viewBox="-4 -4 ${w * 100 + 8} ${hh * 100 + 8}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${DEFS}${body}</svg>` : null;
  cache.set(id, out);
  return out;
}

// Elemento listo para insertar (contenedor con el SVG). Si no hay dibujo, devuelve null.
export function artEl(id, cls = 'art') {
  const m = artMarkup(id);
  if (!m) return null;
  const el = document.createElement('span');
  el.className = cls;
  el.innerHTML = m;
  return el;
}

/* ---------- Pisos y paredes (patrones CSS) ---------- */
export const FLOOR_BG = {
  piso_piedra: 'linear-gradient(#3A3550 2px, transparent 2px) 0 0 / 25% 12.5%, linear-gradient(90deg, #3A3550 2px, transparent 2px) 0 0 / 12.5% 25%, repeating-conic-gradient(#4E4866 0 25%, #45405C 0 50%) 0 0 / 25% 25%',
  piso_madera: 'repeating-linear-gradient(180deg, transparent 0 calc(12.5% - 2px), #5A3A1E calc(12.5% - 2px) 12.5%), repeating-linear-gradient(90deg, #8A5A34 0 30%, #7A4E2C 30% 31%, #946238 31% 62%, #7A4E2C 62% 63%, #8A5A34 63% 100%)',
  piso_baldosa: 'linear-gradient(#C9C2D6 2px, transparent 2px) 0 0 / 12.5% 12.5%, linear-gradient(90deg, #C9C2D6 2px, transparent 2px) 0 0 / 12.5% 12.5%, repeating-conic-gradient(#6E7E90 0 25%, #5E6B7A 0 50%) 0 0 / 25% 25%',
  piso_marmol: 'repeating-linear-gradient(35deg, transparent 0 22px, rgba(140,128,170,.35) 22px 24px, transparent 24px 60px), repeating-linear-gradient(-20deg, transparent 0 40px, rgba(140,128,170,.25) 40px 41px), linear-gradient(#E4DEEE, #CFC8DD)',
  piso_alfombra: 'radial-gradient(circle at 50% 50%, #FFC93C 0 6%, transparent 7%) 0 0 / 25% 25%, repeating-conic-gradient(#8E2D4A 0 25%, #7E2440 0 50%) 0 0 / 25% 25%',
  piso_mosaico: 'conic-gradient(from 45deg, #2E6E8E 0 25%, #C9A13B 0 50%, #2E6E8E 0 75%, #3A8FB0 0) 0 0 / 12.5% 12.5%',
  piso_estrellas: 'radial-gradient(circle at 20% 30%, #FFF 0 1.2px, transparent 2px) 0 0 / 17% 19%, radial-gradient(circle at 70% 60%, #FFE7A8 0 1.5px, transparent 2.5px) 0 0 / 23% 21%, radial-gradient(circle at 40% 80%, #BDE8FF 0 1px, transparent 2px) 0 0 / 13% 15%, radial-gradient(120% 90% at 50% 30%, #2B2170, #120C38)',
};
export const WALL_BG = {
  pared_ladrillo: 'linear-gradient(#5A2A20 2px, transparent 2px) 0 0 / 100% 50%, linear-gradient(90deg, #5A2A20 2px, transparent 2px) 0 0 / 28px 50%, #8A4434',
  pared_yeso: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,.25) 0 10px, transparent 30px) 0 0 / 60px 100%, #B9AFC8',
  pared_madera: 'repeating-linear-gradient(90deg, #6E4A2A 0 22px, #5C3D24 22px 24px)',
  pared_tapiz: 'repeating-linear-gradient(90deg, #6A2A5E 0 18px, #FFC93C 18px 20px, #7E3A70 20px 38px, #FFC93C 38px 40px)',
  pared_vitral: 'linear-gradient(90deg, #22152F 2px, transparent 2px) 0 0 / 26px 100%, linear-gradient(#22152F 2px, transparent 2px) 0 0 / 100% 50%, repeating-linear-gradient(90deg, #2F5C8F 0 26px, #8E44F0 26px 52px, #3DDC97 52px 78px, #FFC93C 78px 104px, #E2364B 104px 130px)',
  pared_mural: 'radial-gradient(circle at 50% 120%, #FF8F3C 0 30%, transparent 31%) 0 0 / 80px 100%, linear-gradient(#5CC8FF, #C9A13B)',
};
export const floorBg = (id) => FLOOR_BG[id] ?? FLOOR_BG.piso_piedra;
export const wallBg = (id) => WALL_BG[id] ?? WALL_BG.pared_ladrillo;
