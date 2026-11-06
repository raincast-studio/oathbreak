// Arte de la Guarida (v15, pulido en v15.1, volumen en v17): un dibujo vectorial propio por objeto, en vista frontal "chibi" con
// contorno grueso, que encaja en su huella de la grilla (100 unidades por casilla). Los muebles con variantes de material comparten
// dibujo y cambian de paleta y de adornos (gema, vetas, halo). Pisos y paredes son patrones CSS. Sin imágenes externas.
//
// LUZ DEL JUEGO (v17, igual que los sprites de personajes): una sola luz principal, cálida (#FFF4DC), desde ARRIBA A LA IZQUIERDA y
// un poco al frente; la sombra propia cae abajo a la derecha y se enfría hacia violeta (#2A1744, el tono de la noche del juego).
//  · Volumen por sistema, no a mano: cada forma con contorno se pinta con un degradado compartido por id según su color
//    (lineal de arriba hacia abajo en rectángulos, radial con brillo arriba a la izquierda en curvas). Los degradados viven una
//    sola vez en un <svg id="art-defs"> del documento (vol/flush), no en cada dibujo.
//  · Sombra de contacto: elipse con degradado radial (sin blur), corrida a la derecha; la oclusión contra la pared la pone el CSS
//    (.piece.wall). · Contorno: casi negro y frío como el de los sprites, 4 u. por fuera y 3 o menos por dentro; en miniatura se engrosa
//    para conservar ~1,6 px en pantalla, el mismo peso que el sprite del personaje en Base.
import { ITEM } from '../src/game.js';

const OL = '#160D22', LIT = '#FFF4DC', DUSK = '#2A1744';
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const B = hx(b); return '#' + hx(a).map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const made = new Set();
let pend = '', MIR = false; // MIR: se dibuja algo que después se espeja (la luz tiene que seguir viniendo de la izquierda)
// Degradado de volumen para un color (#rrggbb): 'l' lineal (rectángulos), 'r' radial (curvas). Otros rellenos quedan igual.
// Rendimiento: los detalles chicos (a < 400 u², perillas, gemas, patas finas) van planos: su volumen no se ve y cada forma
// con degradado cuesta al pintar. El radial es simple (sin foco corrido), más barato que el cónico de dos puntos.
function vol(f, k, a = 1e9) {
  if (f === OL || a < 400 || !/^#[0-9a-f]{6}$/i.test(f)) return f;
  if (MIR && k === 'r') k = 'q';
  const id = k + f.slice(1).toLowerCase();
  if (!made.has(id)) {
    made.add(id);
    const st = (o, c) => `<stop offset="${o}" stop-color="${c}"/>`;
    pend += k === 'l' ? `<linearGradient id="${id}" x2="0" y2="1">${st(0, mix(f, LIT, 0.34))}${st(0.4, f)}${st(1, mix(f, DUSK, 0.4))}</linearGradient>`
      : `<radialGradient id="${id}" cx="${k === 'q' ? 0.66 : 0.34}" cy=".27" r=".82">${st(0, mix(f, LIT, 0.45))}${st(0.45, f)}${st(1, mix(f, DUSK, 0.44))}</radialGradient>`;
  }
  return `url(#${id})`;
}
const S = `stroke="${OL}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
// x2 va antes de S: con atributos repetidos el parser HTML se queda con el primero (antes los "stroke-width" finos se perdían).
const R = (x, y, w, h, f, rx = 0, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${x2} fill="${vol(f, 'l', w * h)}" ${S}/>`;
const E = (cx, cy, rx, ry, f, x2 = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${x2} fill="${vol(f, 'r', rx * ry * 3.1)}" ${S}/>`;
const C = (cx, cy, r, f, x2 = '') => E(cx, cy, r, r, f, x2);
const P = (d, f, x2 = '') => `<path d="${d}" ${x2} fill="${vol(f, 'r')}" ${S}/>`;
const L = (d, c = OL, w = 3) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const HL = (d, w = 4) => L(d, 'rgba(255,250,235,.5)', w); // brillo (del lado de la luz)
const shadow = (cx, cy, rx) => `<ellipse cx="${+(cx + rx * (MIR ? -0.08 : 0.08)).toFixed(1)}" cy="${cy}" rx="${+(rx * 1.06).toFixed(1)}" ry="${+(rx * 0.2).toFixed(1)}" fill="url(#cs)"/>`;
const sparkle = (x, y, s = 6, c = '#FFF6C8') => `<path d="M${x} ${y - s}L${x + s * 0.3} ${y - s * 0.3}L${x + s} ${y}L${x + s * 0.3} ${y + s * 0.3}L${x} ${y + s}L${x - s * 0.3} ${y + s * 0.3}L${x - s} ${y}L${x - s * 0.3} ${y - s * 0.3}Z" fill="${c}"/>`;

// Materiales: [principal, sombra, detalle, tela]. v15.1: tonos más separados (pino miel claro, roble rojizo, ébano casi
// negro con plata, marfil crema con oro, obsidiana violeta con vetas que brillan, oro con gema) y una tela por material.
const MAT = {
  pino: ['#EBC48A', '#BE8E52', '#8A5E30', '#7FBF8E'], roble: ['#9E5A2E', '#6E3A1A', '#4A2410', '#C9586A'],
  ebano: ['#3E3038', '#241A22', '#D6DAE4', '#4E8C7A'], marfil: ['#F6EEDC', '#D3C5A4', '#D9A441', '#8E2D4A'],
  obsidiana: ['#3A2B5C', '#22183C', '#C59BFF', '#8E44F0'], oro: ['#F7C948', '#C08A22', '#FFF1B0', '#E2364B'],
  madera: ['#B87A45', '#86532B', '#5E3A1D', '#C9586A'],
};
const WOOD = MAT.madera;
const gem = (x, y, r, c) => C(x, y, r, c, 'stroke-width="3"') + `<circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff" opacity=".8"/>`;

/* ---------- Muebles base (con variantes de material) ---------- */
// Pata/tela de un panel de biombo (arco con tela y una rama pintada).
const screenPanel = (x, y, w, hh, m, d, fab, shade) => P(`M${x} ${y + hh}V${y + 18}Q${x + w / 2} ${y - 4} ${x + w} ${y + 18}V${y + hh}Z`, m)
  + P(`M${x + 7} ${y + hh - 7}V${y + 22}Q${x + w / 2} ${y + 6} ${x + w - 7} ${y + 22}V${y + hh - 7}Z`, fab, 'stroke-width="3"')
  + L(`M${x + w / 2} ${y + hh - 10}Q${x + w / 2 - 9} ${y + hh * 0.6} ${x + w / 2 + 2} ${y + hh * 0.42}Q${x + w / 2 + 10} ${y + hh * 0.3} ${x + w / 2} ${y + 20}`, 'rgba(255,255,255,.55)', 3)
  + `<circle cx="${x + w / 2 - 6}" cy="${y + hh * 0.55}" r="3.5" fill="rgba(255,255,255,.55)"/><circle cx="${x + w / 2 + 7}" cy="${y + hh * 0.36}" r="3" fill="rgba(255,255,255,.55)"/>`
  + (shade ? `<path d="M${x + 7} ${y + hh - 7}V${y + 22}Q${x + w / 2} ${y + 6} ${x + w - 7} ${y + 22}V${y + hh - 7}Z" fill="rgba(0,0,0,.18)"/>` : '')
  + R(x + 4, y + hh, 10, 5, d, 2, 'stroke-width="3"') + R(x + w - 14, y + hh, 10, 5, d, 2, 'stroke-width="3"');
const tufts = (xs, y) => xs.map((x) => `<circle cx="${x}" cy="${y}" r="2.6" fill="rgba(0,0,0,.28)"/>`).join('');
const BASE = {
  mesa: ([m, d, t]) => shadow(100, 94, 80) + R(28, 56, 12, 36, d, 3) + R(160, 56, 12, 36, d, 3) + R(20, 52, 160, 12, d, 3)
    + R(8, 36, 184, 18, m, 6) + HL('M20 42H180') + L(`M60 58H140`, t, 3),
  silla: ([m, d, t]) => shadow(50, 94, 34) + R(26, 62, 8, 30, d, 3) + R(66, 62, 8, 30, d, 3) + R(24, 8, 52, 50, m, 10)
    + L('M38 18V48M50 18V48M62 18V48', d, 4) + R(18, 50, 64, 14, m, 5) + HL('M28 56H72') + C(50, 12, 4, t),
  // Banco acolchado: más bajo que la mesa y con almohadón, para que no se confundan en miniatura.
  banco: ([m, d, , f]) => shadow(100, 94, 86) + R(24, 62, 12, 30, d, 3) + R(164, 62, 12, 30, d, 3) + R(90, 62, 20, 30, d, 3)
    + R(10, 50, 180, 16, m, 6) + R(16, 30, 168, 22, f, 11) + tufts([46, 82, 118, 154], 41) + HL('M30 36H170', 3) + HL('M22 58H178', 3),
  cama: ([m, d, t]) => shadow(100, 192, 90) + R(10, 14, 180, 74, m, 22) + C(100, 40, 10, t) + R(16, 74, 168, 112, '#F4EEFF', 14)
    + R(16, 120, 168, 66, d, 12) + L('M16 140H184', 'rgba(255,255,255,.35)', 4) + R(32, 82, 62, 30, '#FFFFFF', 12) + R(106, 82, 62, 30, '#FFFFFF', 12)
    + R(10, 176, 14, 16, d, 3) + R(176, 176, 14, 16, d, 3),
  ropero: ([m, d, t]) => shadow(50, 194, 44) + R(14, 182, 12, 12, d, 2) + R(74, 182, 12, 12, d, 2) + R(10, 20, 80, 166, m, 8)
    + R(4, 10, 92, 16, d, 5) + L('M50 30V176') + R(18, 34, 26, 64, 'rgba(0,0,0,.12)', 4) + R(56, 34, 26, 64, 'rgba(0,0,0,.12)', 4)
    + C(44, 110, 4, t) + C(56, 110, 4, t) + HL('M18 120V170'),
  mesita: ([m, d, t]) => shadow(50, 94, 38) + R(22, 70, 8, 22, d, 2) + R(70, 70, 8, 22, d, 2) + R(18, 46, 64, 30, m, 4)
    + L('M18 61H82', d, 3) + C(50, 54, 3, t) + C(50, 68, 3, t) + R(12, 36, 76, 12, d, 4) + HL('M22 41H78'),
  // Biombo plegable: tres hojas de tela con marco, plegadas en zigzag (la del medio en sombra), sobre patitas.
  biombo: ([m, d, , f]) => shadow(100, 96, 88) + [10, 70, 130].map((x, i) => screenPanel(x, 12, 60, 76, m, d, f, i === 1)).join(''),
};
// Vista lateral (rotación 1 y 3) de los muebles largos: la profundidad sube por la pantalla. Caja de 100×200.
const SIDE = {
  mesa: ([m, d, t]) => shadow(50, 194, 42) + R(12, 60, 76, 88, m, 8)
    + L('M24 72V134', 'rgba(255,255,255,.45)', 4) + L('M38 66V142M62 66V142', d, 2) + R(8, 140, 84, 16, d, 5) + L('M30 148H70', t, 3)
    + R(16, 154, 10, 40, d, 3) + R(74, 154, 10, 40, d, 3),
  banco: ([m, d, , f]) => shadow(50, 194, 42) + R(12, 92, 76, 60, m, 8) + R(18, 86, 64, 56, f, 12) + tufts([38, 62], 104) + tufts([38, 62], 126)
    + HL('M28 96V130', 3) + R(8, 146, 84, 16, d, 5) + R(16, 160, 10, 34, d, 3) + R(74, 160, 10, 34, d, 3),
  biombo: ([m, d, , f]) => shadow(50, 194, 36) + screenPanel(36, 14, 50, 70, m, d, f, true) + screenPanel(14, 64, 50, 70, m, d, f, false)
    + screenPanel(36, 114, 50, 70, m, d, f, true),
  // v17: cama de costado (2×2): cabecera alta a la izquierda, piecera baja, almohada y frazada vistas de lado.
  cama: ([m, d, t]) => shadow(100, 192, 92) + R(12, 30, 34, 162, m, 14) + C(29, 58, 8, t) + R(158, 102, 30, 90, m, 10)
    + R(40, 112, 124, 52, '#F4EEFF', 12) + R(84, 106, 82, 62, d, 12) + L('M100 112V164', 'rgba(255,255,255,.35)', 4) + R(46, 94, 46, 26, '#FFFFFF', 12)
    + R(40, 160, 124, 14, m, 5) + R(48, 172, 12, 20, d, 3) + R(146, 172, 12, 20, d, 3) + HL('M20 44V170') + HL('M50 102H84', 3),
  /* Objetos únicos largos, girados (la profundidad sube por la pantalla). 2×1 → 100×200, 3×1 → 100×300, 3×2 → 200×300, 1×2 → 200×100. */
  sillon: () => shadow(50, 194, 44) + R(14, 18, 72, 36, '#9A3A4C', 14) + R(58, 24, 32, 150, '#B0485A', 16) + R(14, 44, 52, 114, '#C9586A', 12)
    + L('M18 100H62', '#8E2D40', 3) + C(74, 70, 3, '#8E2D40', 'stroke-width="0"') + C(74, 130, 3, '#8E2D40', 'stroke-width="0"')
    + R(8, 138, 84, 42, '#9A3A4C', 14) + R(16, 178, 10, 14, WOOD[1], 2) + R(74, 178, 10, 14, WOOD[1], 2) + HL('M66 40V156') + HL('M20 150H80', 3),
  estanteria: () => shadow(50, 194, 44) + R(26, 6, 64, 100, WOOD[0], 6) + R(26, 100, 64, 92, WOOD[1], 6) + R(34, 112, 48, 68, WOOD[2], 4)
    + ['#B0485A', '#4FA3FF', '#3DDC97', '#FFC93C', '#8E44F0', '#E2364B', '#5CC8FF', '#F0A04B', '#B07CFF', '#3DDC97', '#E2364B', '#FFC93C', '#4FA3FF', '#B0485A']
      .map((c, i) => R(i % 2 ? 10 : 8, 8 + i * 13, i % 3 ? 18 : 20, 11, c, 2, 'stroke-width="2.5"')).join('') + E(58, 140, 12, 9, '#F1E8D4') + HL('M36 16V96', 3),
  vitrina: () => shadow(50, 194, 42) + R(12, 12, 76, 152, WOOD[2], 8) + R(20, 20, 60, 136, 'rgba(189,232,255,.35)', 4) + cupMini(50, 62, '#FFC93C')
    + R(40, 82, 20, 26, '#B07CFF', 3) + C(50, 80, 6, '#E8F7FF') + R(30, 124, 40, 14, '#E8E6F0', 3) + L('M34 124L50 112L66 124', '#C9A13B', 3)
    + R(8, 158, 84, 30, WOOD[0], 5) + R(14, 186, 10, 8, WOOD[1], 2) + R(76, 186, 10, 8, WOOD[1], 2) + HL('M28 28L36 146', 3),
  acuario: () => shadow(50, 194, 42) + R(14, 12, 72, 160, 'rgba(92,200,255,.5)', 6) + R(16, 112, 68, 58, 'rgba(58,143,208,.55)', 4, 'stroke-width="0"')
    + L('M28 168Q34 148 28 130M72 168Q66 150 74 138', '#3DDC97', 4) + P('M50 36Q58 48 50 60Q42 48 50 36ZM50 60L43 70H57Z', '#FF8F3C', 'stroke-width="3"')
    + P('M34 78Q41 88 34 98Q27 88 34 78ZM34 98L28 106H40Z', '#FFC93C', 'stroke-width="3"') + C(66, 50, 3, '#E8F7FF', 'stroke-width="1.5"') + C(62, 64, 2, '#E8F7FF', 'stroke-width="1.5"')
    + R(10, 6, 80, 10, '#5C5670', 3) + R(10, 166, 80, 26, WOOD[1], 4) + HL('M24 22V100'),
  altar: () => lampGlow(50, 66, 42, '#B07CFF') + shadow(50, 194, 44) + R(16, 140, 68, 52, '#2A2140', 6) + R(8, 22, 84, 124, '#3A2B5C', 6) + R(20, 34, 60, 100, '#22183C', 4)
    + P('M50 150L60 162L50 174L40 162Z', '#B07CFF', 'stroke-width="3"') + C(50, 70, 12, '#B07CFF') + '<circle cx="50" cy="70" r="5" fill="#F4EEFF"/>'
    + R(46, 106, 8, 14, '#F1E8D4', 2, 'stroke-width="3"') + flame(50, 102, 0.5, '#B07CFF', '#F4EEFF') + R(46, 30, 8, 12, '#F1E8D4', 2, 'stroke-width="3"') + flame(50, 26, 0.45, '#B07CFF', '#F4EEFF'),
  chimenea: () => shadow(50, 294, 46) + R(14, 10, 72, 276, '#A69EB3', 6) + R(8, 4, 84, 16, '#8A8296', 4)
    + [[24, 30], [52, 54], [24, 78], [52, 238], [24, 262]].map(([x, y]) => R(x, y, 26, 16, '#8A8296', 3, 'stroke-width="2.5"')).join('')
    + P('M14 108Q46 116 46 168Q46 222 14 232Z', '#22152F') + lampGlow(30, 170, 30, '#FF7A2E') + flame(24, 190, 1.1, '#FF7A2E', '#FFC93C') + flame(30, 164, 0.9, '#FFB23C', '#FFF1B0')
    + R(8, 102, 10, 136, '#8A8296', 4) + R(6, 236, 88, 14, '#8A8296', 4) + HL('M66 20V230'),
  piano: () => shadow(100, 294, 90) + R(38, 250, 14, 44, '#1A1426', 4) + R(148, 250, 14, 44, '#1A1426', 4) + R(94, 120, 12, 174, '#1A1426', 4)
    + P('M22 252V62Q22 12 76 12Q124 12 150 62Q166 92 172 136Q178 180 178 252Z', '#2A2140') + P('M40 228V72Q40 32 78 30Q114 30 134 70Q148 100 154 140Q160 180 160 228Z', '#3A2E58')
    + L('M62 214V60M82 214V44M102 214V46M122 214V64M142 214V108', '#C9A13B', 2) + R(62, 192, 76, 26, '#F1E8D4', 3) + L('M70 200H128M70 208H118', '#8E7FB8', 2)
    + R(18, 222, 164, 14, '#2A2140', 4) + R(20, 234, 160, 28, '#F4EEFF', 3)
    + Array.from({ length: 10 }, (_, i) => R(30 + i * 15, 234, 8, 15, '#1A1426', 1, 'stroke-width="2"')).join('') + HL('M34 70Q40 30 80 22'),
  mapa_mundi: () => shadow(100, 294, 90) + R(28, 240, 16, 54, WOOD[1], 4) + R(156, 240, 16, 54, WOOD[1], 4) + R(10, 14, 180, 230, WOOD[0], 10) + R(24, 28, 152, 198, '#F1E1B8', 6)
    + P('M60 44Q86 38 96 58Q98 82 76 88Q50 86 48 64Z', '#C9B07A', 'stroke-width="3"') + P('M110 104Q146 100 156 124Q160 154 128 160Q100 158 100 132Z', '#C9B07A', 'stroke-width="3"')
    + P('M46 168Q74 162 88 178Q84 202 58 206Q40 196 46 168Z', '#C9B07A', 'stroke-width="3"') + L('M84 86Q104 100 112 110', '#E2364B', 3)
    + '<path d="M138 176l4 8l9 1l-7 6l2 9l-8 -5l-8 5l2 -9l-7 -6l9 -1z" fill="#E2364B"/>' + R(8, 234, 184, 14, WOOD[1], 4),
  trono: () => shadow(100, 194, 86) + R(38, 140, 112, 46, '#6E2AB8', 4) + R(36, 110, 116, 32, '#C9586A', 10) + P('M116 186V38Q116 8 140 8Q166 8 166 38V186Z', '#8E44F0')
    + P('M126 122V44Q141 26 156 44V122Z', '#B07CFF') + P('M141 2L151 18H131Z', '#FFC93C') + C(141, 64, 10, '#FFC93C') + C(141, 64, 4, '#E2364B', 'stroke-width="0"')
    + R(28, 94, 96, 20, '#FFC93C', 8) + R(28, 112, 22, 62, '#FFC93C', 8) + HL('M124 40Q140 20 158 40') + HL('M44 120H110', 3) + sparkle(178, 30, 8),
  sarcofago: () => shadow(100, 96, 90) + R(22, 70, 156, 24, '#4A4560', 5) + P('M12 50L44 20H172L190 36V64L172 80H44Z', '#C9A13B') + P('M24 50L50 28H168L180 40V60L168 72H50Z', '#3A2B5C')
    + E(56, 50, 15, 17, '#E8C77A') + C(52, 44, 3, OL) + C(52, 56, 3, OL) + L('M64 46V54', OL, 3) + L('M38 36Q30 50 38 64', '#4FA3FF', 4)
    + L('M100 32V68M126 30V70M150 32V68', '#C9A13B', 4) + P('M76 44L86 50L76 56Z', '#E2364B', 'stroke-width="3"'),
  banco_plaza: () => shadow(50, 194, 44) + R(14, 26, 54, 140, '#4FB27F', 6) + L('M28 30V162M41 30V162M54 30V162', '#2F7A55', 2.5) + R(62, 18, 22, 154, '#3E9B6E', 6)
    + L('M73 24V166', '#2F7A55', 2.5) + R(10, 20, 80, 10, IRON, 4) + R(10, 150, 80, 12, IRON, 5) + R(14, 160, 10, 32, IRON, 3) + R(76, 160, 10, 32, IRON, 3)
    + C(19, 156, 6, '#5C5670', 'stroke-width="2.5"') + C(81, 156, 6, '#5C5670', 'stroke-width="2.5"') + pigeon(38, 84, 0.8) + HL('M20 36V150', 3),
  tanque_clones: () => shadow(100, 96, 90) + R(26, 24, 148, 62, 'rgba(61,220,151,.45)', 30) + '<ellipse cx="106" cy="56" rx="38" ry="13" fill="#2A8A5C" opacity=".8"/><circle cx="58" cy="56" r="12" fill="#2A8A5C" opacity=".85"/>'
    + C(140, 40, 3, '#E8FFF4', 'stroke-width="1.5"') + C(84, 74, 4, '#E8FFF4', 'stroke-width="1.5"') + HL('M42 36H160', 5)
    + R(8, 16, 26, 76, '#5C5670', 6) + R(166, 16, 26, 76, '#5C5670', 6) + C(21, 36, 4, '#3DDC97', 'stroke-width="2"') + C(179, 36, 4, '#E2364B', 'stroke-width="2"'),
};
// Dónde va cada adorno de material: gema, halo y vetas (vista frontal / lateral).
const ANCHOR = {
  mesa: { gem: [100, 58, 6], glow: [100, 50, 74], grain: 'M30 46H84M116 46H170' },
  silla: { gem: [50, 57, 5], glow: [50, 44, 40], grain: 'M32 14V24M68 14V24' },
  banco: { gem: [100, 57, 5], glow: [100, 56, 74], grain: 'M40 58H84M116 58H160' },
  cama: { gem: [100, 40, 8], glow: [100, 104, 96], grain: 'M28 28H82M118 28H172' },
  ropero: { gem: [50, 18, 6], glow: [50, 100, 58], grain: 'M22 128V170M78 128V170' },
  mesita: { gem: [50, 42, 5], glow: [50, 62, 42], grain: 'M26 66H74' },
  biombo: { gem: [100, 15, 6], glow: [100, 56, 84], grain: 'M16 84V34M184 84V34' },
  'side:mesa': { gem: [50, 148, 6], glow: [50, 120, 58], grain: 'M40 72V132M62 72V132' },
  'side:banco': { gem: [50, 154, 5], glow: [50, 136, 56], grain: '' },
  'side:biombo': { gem: [61, 116, 5], glow: [50, 104, 62], grain: '' },
  'side:cama': { gem: [29, 58, 7], glow: [100, 140, 96], grain: 'M22 96V178M168 120V180' },
};
// Adornos por material: atrás (halo) y adelante (vetas, gema, destellos). Devuelve [atrás, adelante].
function matDeco(key, mat, w) {
  const a = ANCHOR[key]; if (!a) return ['', ''];
  const [gx, gy, gr] = a.gem, [hx, hy, hr] = a.glow, halo = (c) => `<ellipse cx="${hx}" cy="${hy}" rx="${hr}" ry="${hr * 0.6}" fill="${c}" opacity=".28"/>`, grain = (c, o) => (a.grain ? L(a.grain, c, 2.5).replace('stroke="', `opacity="${o}" stroke="`) : '');
  switch (mat) {
    case 'pino': return ['', grain('#A87A40', '.7')];
    case 'roble': return ['', grain('#3E1E0A', '.6')];
    case 'ebano': return ['', gem(gx, gy, gr * 0.8, '#D6DAE4')];
    case 'marfil': return ['', gem(gx, gy, gr * 0.8, '#D9A441')];
    case 'obsidiana': return [halo('#8E44F0'), grain('#C59BFF', '.9') + gem(gx, gy, gr, '#B07CFF') + sparkle(w - 14, 14, 7, '#E8D9FF')];
    case 'oro': return [halo('#FFC93C'), gem(gx, gy, gr, '#E2364B') + sparkle(w - 14, 14, 8) + sparkle(16, 22, 5)];
    default: return ['', ''];
  }
}

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

const IRON = '#3A3550';
// Extremo de hierro fundido del banco de plaza: pata con voluta y apoyabrazos (x: borde de afuera; r: lado derecho).
const bend = (x, r = false) => { const k = r ? -1 : 1, X = (d) => x + d * k, d = `M${X(5)} 94Q${X(15)} 78 ${X(11)} 62Q${X(7)} 42 ${X(21)} 42Q${X(34)} 42 ${X(32)} 54Q${X(30)} 63 ${X(21)} 59`;
  return L(d, OL, 11) + L(d, IRON, 6) + L(d, 'rgba(255,255,255,.25)', 2) + L(`M${X(-1)} 94H${X(13)}`, OL, 6); };
// Paloma chica (posada en el banco de plaza).
const pigeon = (x, y, s = 1) => P(`M${x - 14 * s} ${y + 4 * s}L${x - 24 * s} ${y + 8 * s}L${x - 16 * s} ${y - 2 * s}Z`, '#7E7896', 'stroke-width="3"') + E(x, y + 2 * s, 14 * s, 10 * s, '#A69EB3')
  + C(x + 10 * s, y - 8 * s, 7 * s, '#A69EB3') + E(x + 7 * s, y - 1 * s, 5 * s, 4 * s, '#5CBFA0', 'stroke-width="0"') + C(x + 12 * s, y - 10 * s, 1.8 * s, OL, 'stroke-width="0"')
  + P(`M${x + 16 * s} ${y - 9 * s}L${x + 22 * s} ${y - 7 * s}L${x + 16 * s} ${y - 5 * s}Z`, '#F5B43C', 'stroke-width="2"') + L(`M${x - 4 * s} ${y + 2 * s}Q${x + 2 * s} ${y + 6 * s} ${x + 6 * s} ${y + 2 * s}`, '#7E7896', 2.5);

/* ---------- Objetos ---------- */
const ART = {
  // Rincón acogedor
  mesa: () => BASE.mesa(MAT.roble) + R(150, 18, 22, 20, '#F4EEFF', 4) + L('M156 24V32', '#8E44F0', 3) + E(46, 30, 18, 8, '#FFC93C'),
  sillon: () => shadow(100, 94, 88) + R(14, 14, 172, 50, '#B0485A', 22) + R(6, 40, 32, 46, '#9A3A4C', 12) + R(162, 40, 32, 46, '#9A3A4C', 12)
    + R(32, 52, 136, 30, '#C9586A', 10) + L('M100 54V80', '#8E2D40', 3) + R(30, 84, 12, 10, WOOD[1], 2) + R(158, 84, 12, 10, WOOD[1], 2)
    + HL('M40 24H160') + C(70, 34, 3, '#8E2D40', 'stroke-width="0"') + C(130, 34, 3, '#8E2D40', 'stroke-width="0"'),
  // Lámpara de aceite con tubo de vidrio y asa (antes se leía como campana).
  lampara: () => lampGlow(50, 40, 36, '#FFC93C') + shadow(50, 94, 26) + L('M72 78Q90 76 86 62Q83 54 74 60', OL, 5) + E(50, 86, 26, 7, '#C9A13B')
    + P('M26 84Q24 64 50 62Q76 64 74 84Z', '#E0AE48') + HL('M34 78Q34 70 42 67', 3) + R(38, 54, 24, 10, '#C9A13B', 3)
    + P('M40 54Q30 42 41 30V12H59V30Q70 42 60 54Z', 'rgba(255,236,190,.6)') + flame(50, 44, 1.05) + HL('M44 18V30', 3),
  gato: () => pet({ fur: '#F0A04B', belly: '#FFE1B8', ears: P('M22 34L26 8L44 24Z', '#F0A04B') + P('M78 34L74 8L56 24Z', '#F0A04B') + P('M28 28L29 16L38 24Z', '#FFB8C6', 'stroke-width="0"') + P('M72 28L71 16L62 24Z', '#FFB8C6', 'stroke-width="0"'),
    tail: L('M70 80Q94 76 88 52', OL, 13) + L('M70 80Q94 76 88 52', '#F0A04B', 7) }) + L('M40 34L42 40M60 34L58 40', '#C97B2A', 3),
  // Biblioteca secreta
  estanteria: () => shadow(100, 96, 90) + R(8, 6, 184, 88, WOOD[0], 6) + R(16, 14, 168, 32, WOOD[2], 3) + R(16, 52, 168, 34, WOOD[2], 3)
    + [['#B0485A', 20, 22], ['#4FA3FF', 32, 26], ['#3DDC97', 46, 20], ['#FFC93C', 60, 24], ['#8E44F0', 72, 22], ['#E2364B', 104, 26], ['#5CC8FF', 118, 20], ['#F0A04B', 150, 24], ['#B07CFF', 164, 22]]
      .map(([c, x, hh]) => R(x, 46 - hh, 11, hh, c, 2, 'stroke-width="3"')).join('')
    + [['#3DDC97', 22, 26], ['#E2364B', 36, 30], ['#FFC93C', 72, 24], ['#4FA3FF', 86, 28], ['#8E44F0', 132, 30], ['#F0A04B', 146, 26], ['#B0485A', 160, 30]]
      .map(([c, x, hh]) => R(x, 86 - hh, 12, hh, c, 2, 'stroke-width="3"')).join('') + E(112, 76, 14, 10, '#F1E8D4'),
  // Atril con libro abierto y cinta: más grande para que se lea a una casilla.
  atril: () => shadow(50, 94, 28) + R(26, 84, 48, 9, WOOD[1], 4) + R(44, 50, 12, 36, WOOD[1], 3) + P('M8 34H92L84 56H16Z', WOOD[0])
    + P('M14 34Q32 18 50 28Q68 18 86 34L82 44Q66 34 50 42Q34 34 18 44Z', '#F4EEFF', 'stroke-width="3"') + L('M50 28V42', OL, 2.5)
    + L('M26 32Q36 28 44 32M58 32Q66 28 76 32', '#8E7FB8', 2) + L('M56 40L60 62', '#E2364B', 4) + HL('M22 50H40', 3),
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
  farol: () => lampGlow(50, 54, 38, '#FFC93C') + shadow(50, 94, 24) + R(44, 4, 12, 10, '#4A4560', 3) + P('M24 26L50 12L76 26Z', '#4A4560')
    + R(28, 24, 44, 52, '#FFD66B') + `<rect x="34" y="30" width="32" height="40" fill="#FFF1B0" opacity=".6"/>` + L('M50 24V76M28 50H72', '#4A4560', 4)
    + flame(50, 58, 0.9) + R(22, 74, 56, 10, '#4A4560', 3) + R(38, 84, 24, 8, '#4A4560', 2) + HL('M30 28L30 46', 3),
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
  // v17: armadura oxidada con rodilleras, visera de rejilla, penacho raído, óxido corrido, telaraña y escudo abollado apoyado.
  armadura_vieja: () => shadow(50, 196, 36) + R(30, 172, 40, 20, '#5C5670', 4) + R(36, 122, 12, 52, '#7E7690', 3) + R(52, 122, 12, 52, '#7E7690', 3)
    + R(33, 144, 17, 9, '#6E6680', 3, 'stroke-width="3"') + R(50, 144, 17, 9, '#6E6680', 3, 'stroke-width="3"') + P('M26 64H74L70 124H30Z', '#8E86A0')
    + L('M30 94H70M50 68V120', '#6E6680', 2.5) + R(12, 62, 18, 50, '#7E7690', 8) + R(70, 62, 18, 50, '#7E7690', 8) + E(50, 40, 20, 24, '#8E86A0')
    + R(34, 35, 32, 8, OL, 3) + L('M38 48H62M38 54H62', '#6E6680', 2.5) + P('M50 17Q40 4 54 2Q50 8 61 6Q54 12 53 18Z', '#B0485A', 'stroke-width="3"')
    + '<path d="M66 72q7 7 2 15q-4 5 -1 13M36 102q-4 6 0 12" stroke="#B06A3A" stroke-width="5" stroke-linecap="round" opacity=".75" fill="none"/>'
    + '<circle cx="74" cy="92" r="4" fill="#B06A3A" opacity=".8"/><circle cx="56" cy="160" r="3.5" fill="#B06A3A" opacity=".7"/>'
    + E(82, 162, 15, 21, '#8A6A4A') + C(82, 162, 5, '#C9A13B', 'stroke-width="3"') + L('M74 150L80 156M88 172L84 168', '#5E3A1D', 2.5)
    + L('M6 8Q16 14 14 28M6 8Q22 10 28 4M6 8L22 22', 'rgba(255,255,255,.4)', 1.5) + HL('M36 72V110'),
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
  // Halcón: silueta de rapaz (estilizado, capucha oscura, pico ganchudo, mirada firme) posado en su percha.
  halcon: () => shadow(50, 94, 30) + P('M42 70L34 92H66L58 70Z', '#5E4230') + P('M50 22Q78 26 75 58Q72 82 50 86Q28 82 25 58Q22 26 50 22Z', '#9A7454')
    + P('M50 46Q64 50 62 68Q58 82 50 82Q42 82 38 68Q36 50 50 46Z', '#F4E6D0', 'stroke-width="0"') + L('M43 58L47 60M53 64L57 62M43 70L47 72M53 74L57 72', '#B08A62', 3)
    + P('M28 40Q14 66 36 88Q40 62 37 44Z', '#6E4E36') + P('M72 40Q86 66 64 88Q60 62 63 44Z', '#6E4E36') + R(10, 84, 80, 8, '#7A4824', 4)
    + R(38, 78, 8, 10, '#FFC93C', 3, 'stroke-width="3"') + R(54, 78, 8, 10, '#FFC93C', 3, 'stroke-width="3"')
    + E(50, 31, 21, 18, '#9A7454') + P('M30 30Q34 12 50 12Q66 12 70 30Q62 22 50 22Q38 22 30 30Z', '#4A3424', 'stroke-width="0"')
    + C(41, 31, 7, '#FFE08A', 'stroke-width="3"') + C(59, 31, 7, '#FFE08A', 'stroke-width="3"') + C(42, 32, 3.6, OL, 'stroke-width="0"') + C(58, 32, 3.6, OL, 'stroke-width="0"')
    + L('M32 23L46 27M68 23L54 27', OL, 4) + P('M44 38Q50 35 56 38Q57 46 50 52Q49 46 44 42Z', '#FFC93C', 'stroke-width="3"'),
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
  vela_negra: () => lampGlow(50, 32, 30, '#B07CFF') + shadow(50, 94, 26) + E(50, 88, 27, 7, '#5C5670') + R(25, 46, 17, 42, '#4A3B6E', 3)
    + R(43, 34, 17, 54, '#4A3B6E', 3) + R(61, 54, 15, 34, '#4A3B6E', 3) + L('M28 48V58M47 36V50M64 56V62', '#8A78C0', 4) + HL('M30 64V82M48 56V82', 2.5)
    + flame(34, 42, 0.7, '#B07CFF', '#F4EEFF') + flame(52, 30, 0.8, '#B07CFF', '#F4EEFF') + flame(69, 50, 0.6, '#B07CFF', '#F4EEFF'),
  altar: () => lampGlow(100, 40, 50, '#B07CFF') + shadow(100, 96, 90) + R(16, 44, 168, 48, '#2A2140', 6) + R(8, 32, 184, 16, '#3A2B5C', 5)
    + R(30, 56, 140, 26, '#22183C', 4) + P('M100 58L112 70L100 82L88 70Z', '#B07CFF', 'stroke-width="3"') + C(100, 16, 12, '#B07CFF') + `<circle cx="100" cy="16" r="5" fill="#F4EEFF"/>`
    + R(30, 20, 8, 14, '#F1E8D4', 2, 'stroke-width="3"') + flame(34, 16, 0.5, '#B07CFF', '#F4EEFF') + R(162, 20, 8, 14, '#F1E8D4', 2, 'stroke-width="3"') + flame(166, 16, 0.5, '#B07CFF', '#F4EEFF'),
  // Cuervo: pico largo y recto, brillo violeta en las plumas y un aura tenue para leerse sobre pisos oscuros.
  cuervo: () => lampGlow(50, 58, 38, '#8E44F0') + bird({ body: '#2E2A40', belly: '#47415E', wing: '#1E1A2E', beak: '#6A6488', eyeR: 5,
    crest: P('M40 16L46 6L50 16L56 8L58 18Z', '#2E2A40', 'stroke-width="3"') })
    + C(41, 35, 2.6, '#FF4B62', 'stroke-width="0"') + C(59, 35, 2.6, '#FF4B62', 'stroke-width="0"') + P('M44 41L50 56L56 41Z', '#6A6488', 'stroke-width="3"')
    + L('M30 28Q38 18 50 17', 'rgba(197,155,255,.8)', 3) + L('M28 62Q26 72 30 80M72 62Q74 72 70 80', 'rgba(197,155,255,.7)', 3),
  bandera_pirata: () => banner('#22152F', '#2E2A40', C(50, 40, 12, '#F4EEFF', 'stroke-width="3"') + E(45, 40, 3, 4, '#22152F', 'stroke-width="0"') + E(55, 40, 3, 4, '#22152F', 'stroke-width="0"')
    + L('M38 58L62 70M62 58L38 70', '#F4EEFF', 5), '#7A4824'),
  // Exclusivos
  farol_amistad: () => lampGlow(50, 50, 38, '#FF8FA8') + shadow(50, 94, 22) + R(44, 4, 12, 10, '#C9A13B', 3) + P('M28 24L50 12L72 24Z', '#C9A13B')
    + R(28, 24, 44, 52, 'rgba(255,143,168,.5)') + P('M50 66Q30 52 38 42Q46 36 50 46Q54 36 62 42Q70 52 50 66Z', '#E2364B', 'stroke-width="3"') + R(24, 74, 52, 10, '#C9A13B', 3),
  // v17: llama de la constancia más grande, en un pebetero con aro dorado y marcas de la racha.
  trofeo_racha: () => lampGlow(50, 34, 38, '#FF7A2E') + shadow(50, 94, 26) + R(24, 78, 52, 14, '#5C5670', 4) + P('M28 79L36 52H64L72 79Z', '#8A8296')
    + L('M40 60V72M46 60V72M52 60V72M58 60V72M62 58L37 74', '#FFC93C', 2.5) + E(50, 52, 22, 6, '#FFC93C') + flame(50, 44, 2.3, '#FF5A2E', '#FFC93C')
    + flame(50, 42, 1.1, '#FFB23C', '#FFF1B0') + R(36, 82, 28, 7, '#FFC93C', 2, 'stroke-width="2.5"') + sparkle(80, 18, 6) + sparkle(20, 30, 4),
  trofeo_campeon: () => cup('#FFC93C', '#8E44F0', `<path d="M50 28l4 8l9 1l-7 6l2 9l-8 -5l-8 5l2 -9l-7 -6l9 -1z" fill="#FFF1B0"/>` + sparkle(80, 12, 6) + sparkle(20, 20, 4)),
  marco_honor: () => lampGlow(50, 46, 40, '#FFE7A8') + R(8, 8, 84, 84, '#FFC93C', 8) + R(18, 18, 64, 64, '#3A2B5C', 4) + P('M50 26L56 42L72 42L60 52L64 68L50 58L36 68L40 52L28 42L44 42Z', '#FFC93C', 'stroke-width="3"')
    + [[8, 8], [92, 8], [8, 92], [92, 92]].map(([x, y]) => C(x, y, 7, '#E2364B', 'stroke-width="3"')).join('') + sparkle(80, 22, 6),
  estandarte_victoria: () => banner('#8E44F0', '#B07CFF', P('M36 50L44 34L50 44L56 34L64 50Z', '#FFC93C', 'stroke-width="3"') + R(36, 50, 28, 6, '#FFC93C', 2, 'stroke-width="3"'), '#FFC93C'),
  // Temporada
  // v17: cristal de aurora que flota sobre un pebetero dorado, con un anillo de luz que lo orbita (mitad atrás, mitad adelante).
  temp_aura: () => lampGlow(50, 40, 42, '#5CC8FF') + lampGlow(50, 36, 26, '#B07CFF') + shadow(50, 94, 24) + '<ellipse cx="50" cy="92" rx="30" ry="6" fill="#5CC8FF" opacity=".3"/>'
    + L('M17 40A33 11 0 0 1 83 40', 'rgba(255,241,176,.75)', 3) + R(32, 80, 36, 12, '#5C5670', 4) + P('M38 81L42 66H58L62 81Z', '#C9A13B')
    + E(50, 64, 21, 6, '#FFC93C') + E(50, 63, 13, 3, '#2A1744', 'stroke-width="0"') + `<path d="M50 8L64 31L50 56L36 31Z" fill="url(#au)" ${S}/>`
    + '<path d="M50 8L64 31L50 56L36 31Z" fill="#fff" opacity=".22"/>' + L('M36 31H64M50 8V56', 'rgba(255,255,255,.6)', 2)
    + '<path d="M50 12L59 30H50Z" fill="#fff" opacity=".7"/>' + L('M83 40A33 11 0 0 1 17 40', '#FFF1B0', 3.5) + C(21, 45, 3.5, '#FFF1B0', 'stroke-width="2"')
    + C(74, 49, 3, '#3DDC97', 'stroke-width="2"') + sparkle(80, 16, 6) + sparkle(18, 22, 5, '#BDE8FF') + sparkle(86, 68, 4),
  // v17: estatua de temporada con capa, laureles, antorcha de aurora y placa del pase.
  temp_estatua: () => lampGlow(84, 40, 26, '#5CC8FF') + shadow(50, 196, 38) + R(14, 158, 72, 34, '#5C5670', 5) + R(20, 148, 60, 14, '#8A8296', 4)
    + `<rect x="32" y="166" width="36" height="14" rx="3" fill="url(#au)" ${S}/>` + P('M28 150Q24 112 36 96H64Q76 112 72 150Z', '#A69EB3')
    + P('M37 150L40 98H60L63 150Z', '#D9D3E3') + P('M30 100Q50 86 70 100L66 110H34Z', '#C9C2D6') + P('M40 102L62 128L57 134L37 108Z', 'url(#au)', 'stroke-width="3"')
    + C(50, 72, 17, '#E4DEEE') + L('M36 66Q50 52 64 66', '#3E9B6E', 3) + [[36, 64], [42, 57], [58, 57], [64, 64]].map(([x, y]) => E(x, y, 4.5, 2.6, '#3DDC97', 'stroke-width="2"')).join('')
    + L('M68 104L86 46', OL, 9) + L('M68 104L86 46', '#C9A13B', 5) + R(80, 42, 12, 8, '#FFC93C', 2, 'stroke-width="2.5"') + flame(86, 38, 1.1, '#5CC8FF', '#E8FFF4')
    + HL('M43 106V144') + sparkle(18, 44, 6, '#BDE8FF') + sparkle(84, 118, 5),
  temp_portal: () => `<circle cx="100" cy="100" r="80" fill="#8E44F0" opacity=".2"/>` + shadow(100, 192, 80) + P('M30 190V90Q30 20 100 20Q170 20 170 90V190Z', '#5C5670')
    + P('M48 190V96Q48 40 100 40Q152 40 152 96V190Z', '#2A1458') + `<ellipse cx="100" cy="116" rx="44" ry="66" fill="url(#pt)"/>`
    + L('M100 70Q130 90 110 120Q86 140 100 160', '#E8D9FF', 4) + L('M80 90Q96 110 84 134', '#B07CFF', 3)
    + [[38, 60], [162, 60], [34, 130], [166, 130]].map(([x, y]) => C(x, y, 7, '#B07CFF', 'stroke-width="3"')).join('') + sparkle(100, 30, 9) + R(20, 180, 160, 12, '#8A8296', 4),
  // Tienda de renombre
  farol_aurora: () => lampGlow(50, 50, 40, '#3DDC97') + shadow(50, 94, 22) + R(44, 4, 12, 10, '#5C5670', 3) + P('M28 24L50 12L72 24Z', '#5C5670')
    + `<rect x="28" y="24" width="44" height="52" fill="url(#au)" ${S}/>` + sparkle(50, 50, 9, '#F4EEFF') + R(24, 74, 52, 10, '#5C5670', 3),
  // v17: busto de mármol con laureles, sobre pedestal oscuro con placa dorada.
  busto: () => shadow(50, 94, 28) + R(28, 74, 44, 20, '#3A2B5C', 4) + R(24, 68, 52, 9, '#4A3B6E', 3) + R(40, 80, 20, 7, '#FFC93C', 2, 'stroke-width="2"')
    + P('M20 70Q22 48 50 46Q78 48 80 70Z', '#E4DEEE') + L('M30 62Q40 56 46 64M70 62Q60 56 54 64', '#B8AFC8', 2.5) + C(50, 31, 18, '#EFEAF6')
    + P('M32 27Q36 9 50 11Q66 9 68 27Q60 19 50 21Q40 19 32 27Z', '#D9D3E3', 'stroke-width="3"') + L('M33 24Q50 12 67 24', '#3E9B6E', 2.5)
    + [[34, 22], [41, 16], [59, 16], [66, 22]].map(([x, y]) => E(x, y, 4.5, 2.6, '#3DDC97', 'stroke-width="2"')).join('')
    + L('M41 30H46M54 30H59', OL, 2.2) + L('M45 38Q50 41 55 38', OL, 2.2) + HL('M37 34Q38 26 44 22', 3) + sparkle(82, 22, 5),
  // v17: banco de plaza de listones verdes con hierro fundido en volutas, placa de renombre y una paloma de visita.
  banco_plaza: () => shadow(100, 95, 88) + R(30, 8, 8, 56, IRON, 3) + R(162, 8, 8, 56, IRON, 3)
    + R(24, 12, 152, 12, '#3E9B6E', 5) + R(24, 28, 152, 12, '#3E9B6E', 5) + R(24, 44, 152, 10, '#3E9B6E', 4) + R(88, 30, 24, 9, '#FFC93C', 2, 'stroke-width="2.5"')
    + R(16, 56, 168, 10, '#4FB27F', 4) + R(14, 64, 172, 12, '#3E9B6E', 5) + HL('M30 16H170', 3) + HL('M22 59H178', 2.5)
    + bend(14) + bend(186, true) + pigeon(148, 44, 1.2),
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

// Degradados fijos (agua, portal, aura, sombra de contacto): van una sola vez en el <svg id="art-defs"> con los de volumen.
const DEFS = `<linearGradient id="wv" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0E3A6A" stop-opacity=".25"/></linearGradient>
<radialGradient id="pt"><stop offset="0" stop-color="#F4EEFF"/><stop offset=".35" stop-color="#B07CFF"/><stop offset="1" stop-color="#3A1A7A"/></radialGradient>
<linearGradient id="au" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3DDC97" stop-opacity=".8"/><stop offset=".5" stop-color="#5CC8FF" stop-opacity=".7"/><stop offset="1" stop-color="#B07CFF" stop-opacity=".8"/></linearGradient>
<radialGradient id="cs"><stop offset="0" stop-color="#0E0618" stop-opacity=".62"/><stop offset=".5" stop-color="#0E0618" stop-opacity=".36"/><stop offset="1" stop-color="#0E0618" stop-opacity="0"/></radialGradient>`;
// Vuelca al documento los degradados nuevos (en Node no hay documento: solo se arma el texto).
function flush() {
  if (!pend || typeof document === 'undefined' || !document.body) return;
  let d = document.getElementById('art-defs');
  if (!d) {
    d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    d.id = 'art-defs'; d.setAttribute('aria-hidden', 'true'); d.setAttribute('focusable', 'false');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    d.innerHTML = `<defs>${DEFS}</defs>`;
    document.body.prepend(d);
  }
  d.firstChild.insertAdjacentHTML('beforeend', pend);
  pend = '';
}

// Objetos planos (se ven desde arriba): al rotar se giran de verdad.
const FLAT = new Set(['alfombra', 'alfombra_gala', 'estanque', 'mapa_ciudad']);
export const isFlat = (id) => FLAT.has(id);
// Únicos que se apoyan en una base con vista lateral propia: [base, material, extra lateral].
const SIDE_OF = { mesa: ['mesa', MAT.roble, R(30, 70, 40, 26, '#F4EEFF', 6) + E(50, 80, 14, 7, '#FFC93C')],
  mesa_exp: ['mesa', MAT.ebano, P('M28 92L32 68H44L48 92Z', 'rgba(61,220,151,.75)') + R(30, 60, 16, 8, '#B8AFC8', 2, 'stroke-width="3"') + C(66, 112, 10, 'rgba(176,124,255,.75)')] };
// Línea de apoyo (fracción de la casilla, desde arriba) donde se apoya lo apilado, por fila dentro de la superficie.
const SEAT = { mesa: [0.5], mesita: [0.46], mesa_exp: [0.5], altar: [0.44], vitrina: [0.18], mapa_mundi: [0.86, 0.3] };
const ROT_SEAT = { vitrina: [0.62, 0.36], altar: [0.72, 0.38], mapa_mundi: [0.8, 0.62, 0.36] };
export function surfaceTop(id, rot = 0, row = 0) {
  if (rot % 2 && (SIDE_OF[id] || id.startsWith('mesa_'))) return [0.86, 0.42][row] ?? 0.5;
  if (rot % 2 && ROT_SEAT[id]) return ROT_SEAT[id][row] ?? 0.5;
  const s = SEAT[id] ?? SEAT[id.split('_')[0]] ?? [0.5];
  return s[Math.min(row, s.length - 1)];
}

// ¿Tiene vista lateral propia? (únicos por id; variantes y bases que la heredan, por su mueble base).
const sideOf = (id) => (SIDE_OF[id] ? SIDE[SIDE_OF[id][0]] : ART[id] ? SIDE[id] : SIDE[id.split('_')[0]]);
// Dibujo crudo en coordenadas propias (w×h casillas de 100). side: vista lateral si existe.
function body(id, side = false) {
  if (ART[id] && !(side && SIDE_OF[id])) return side ? SIDE[id]?.() ?? null : ART[id]();
  const [base, mat] = SIDE_OF[id] ? [SIDE_OF[id][0], null] : id.split('_');
  const pal = SIDE_OF[id] ? SIDE_OF[id][1] : MAT[mat] ?? WOOD;
  const tbl = side ? SIDE : BASE;
  if (!tbl[base]) return null;
  const w = (side ? ITEM[id].size[1] : ITEM[id].size[0]) * 100;
  const [back, front] = mat ? matDeco(side ? `side:${base}` : base, mat, w) : ['', ''];
  return back + tbl[base](pal) + front + (SIDE_OF[id] && side ? SIDE_OF[id][2] : '');
}

// Markup SVG del objeto (o null para pisos/paredes, que son patrones). rot: 0..3.
// 1 y 3: los cuadrados se espejan; los largos usan su vista lateral (o una versión escorzada); los planos giran.
const cache = new Map();
export function artMarkup(id, rot = 0, thumb = false) {
  if (thumb) { // Miniatura: mismo dibujo con trazos más gruesos (a 32 px un objeto de 3 casillas perdía el contorno).
    const k = `t|${id}|${rot}`;
    if (!cache.has(k)) { const m = artMarkup(id, rot), f = TH[Math.max(...ITEM[id].size)] ?? 2.4; cache.set(k, m && m.replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${+(w * f).toFixed(1)}"`)); }
    return cache.get(k);
  }
  const def = ITEM[id];
  if (!def || def.cat === 'piso' || def.cat === 'pared') return null;
  const [w, hh] = def.size, odd = rot % 2 === 1, square = w === hh, flat = FLAT.has(id);
  // 0 frente · 1 lado · 2 frente espejado · 3 lado espejado (los cuadrados sin vista lateral alternan frente y espejo).
  const sv = !flat && !!sideOf(id), mir = !flat && (square && !sv ? odd : rot >= 2);
  const v = flat ? rot % 4 : `${odd && (sv || !square) ? 's' : 'f'}${mir ? 'm' : ''}`;
  const key = `${id}|${v}`;
  if (cache.has(key)) return cache.get(key);
  const W0 = w * 100, H0 = hh * 100, NW = odd ? H0 : W0, NH = odd ? W0 : H0;
  let inner = null;
  MIR = mir;
  if (flat) {
    const b = body(id);
    inner = b && (rot ? `<g transform="${rot === 1 ? `translate(${NW} 0) rotate(90)` : rot === 2 ? `translate(${NW} ${NH}) rotate(180)` : `translate(0 ${NH}) rotate(-90)`}">${b}</g>` : b);
  } else {
    let b;
    if (v[0] === 'f') b = body(id);
    else if (sv) b = body(id, true);
    else { // Sin vista propia (los altos de 1×2): el mismo dibujo a escala pareja (sin deformar), apoyado y centrado en la huella.
      const raw = body(id), k = Math.min(NW / W0, NH / H0);
      b = raw && shadow(NW / 2, NH - 6, NW * 0.36) + `<g transform="translate(${(NW - W0 * k) / 2} ${NH - H0 * k}) scale(${k})">${raw}</g>`;
    }
    inner = b && (mir ? `<g transform="translate(${NW} 0) scale(-1 1)">${b}</g>` : b);
  }
  MIR = false;
  const out = inner ? `<svg viewBox="-4 -4 ${NW + 8} ${NH + 8}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${inner}</svg>` : null;
  cache.set(key, out);
  flush();
  return out;
}
const TH = { 1: 1.3, 2: 1.9, 3: 2.4 };

// Elemento listo para insertar (contenedor con el SVG). Si no hay dibujo, devuelve null.
export function artEl(id, cls = 'art', rot = 0) {
  const m = artMarkup(id, rot, cls === 'sw-art');
  if (!m) return null;
  const el = document.createElement('span');
  el.className = cls;
  el.innerHTML = m;
  return el;
}

/* ---------- Pisos y paredes (patrones CSS) ---------- */
// v15.1: juntas alineadas a la grilla, menos contraste en los pisos ruidosos (mosaico, alfombra) y paredes con zócalo,
// friso o luz para que se lean como muro y no como una franja plana.
// v17: misma luz que los objetos. Una capa general (claridad cálida arriba a la izquierda, penumbra violeta abajo a la derecha)
// y biseles por pieza (filo claro arriba a la izquierda, sombra abajo a la derecha) en baldosas, piedras, tablas y ladrillos.
const FLIGHT = 'radial-gradient(130% 100% at 10% 0, rgba(255,244,220,.13), transparent 55%), linear-gradient(140deg, transparent 45%, rgba(42,23,68,.3)), ';
const bevel = (w, h, a = 1) => `linear-gradient(135deg, rgba(255,250,235,${0.1 * a}), transparent 35% 65%, rgba(20,8,36,${0.2 * a})) 0 0 / ${w} ${h}, `;
const WLIGHT = 'linear-gradient(90deg, rgba(255,244,220,.16), transparent 42%, rgba(42,23,68,.32)), ';
export const FLOOR_BG = {
  piso_piedra: FLIGHT + bevel('12.5%', '12.5%') + 'linear-gradient(#332E48 2px, transparent 2px) 0 0 / 25% 12.5%, linear-gradient(90deg, #332E48 2px, transparent 2px) 0 0 / 12.5% 25%, radial-gradient(60% 60% at 35% 30%, rgba(255,255,255,.06), transparent) 0 0 / 12.5% 12.5%, repeating-conic-gradient(#4E4866 0 25%, #47415E 0 50%) 0 0 / 25% 25%',
  piso_madera: FLIGHT + 'linear-gradient(rgba(255,250,235,.08), transparent 45%, rgba(20,8,36,.16)) 0 0 / 100% 12.5%, ' + 'repeating-linear-gradient(180deg, transparent 0 calc(12.5% - 2px), #4E3018 calc(12.5% - 2px) 12.5%), linear-gradient(90deg, transparent 0 calc(100% - 2px), rgba(78,48,24,.8) 0) 0 0 / 37.5% 25%, linear-gradient(90deg, transparent 0 calc(100% - 2px), rgba(78,48,24,.8) 0) 18.75% 12.5% / 37.5% 25%, repeating-linear-gradient(90deg, #8A5A34 0 30%, #80522F 30% 31%, #915F37 31% 62%, #80522F 62% 63%, #8A5A34 63% 100%)',
  piso_baldosa: FLIGHT + bevel('12.5%', '12.5%') + 'linear-gradient(#AFA8C0 2px, transparent 2px) 0 0 / 12.5% 12.5%, linear-gradient(90deg, #AFA8C0 2px, transparent 2px) 0 0 / 12.5% 12.5%, repeating-conic-gradient(#66768A 0 25%, #5B6879 0 50%) 0 0 / 25% 25%',
  piso_marmol: FLIGHT + bevel('25%', '25%', 0.6) + 'repeating-linear-gradient(35deg, transparent 0 22px, rgba(140,128,170,.3) 22px 24px, transparent 24px 60px), repeating-linear-gradient(-20deg, transparent 0 40px, rgba(140,128,170,.2) 40px 41px), linear-gradient(rgba(150,140,180,.35) 1px, transparent 1px) 0 0 / 25% 25%, linear-gradient(90deg, rgba(150,140,180,.35) 1px, transparent 1px) 0 0 / 25% 25%, linear-gradient(#E4DEEE, #CFC8DD)',
  piso_alfombra: FLIGHT + 'radial-gradient(circle at 50% 50%, #D9A441 0 3.5%, transparent 4.5%) 0 0 / 25% 25%, linear-gradient(45deg, transparent 46%, rgba(255,201,60,.18) 46% 54%, transparent 54%) 0 0 / 25% 25%, linear-gradient(-45deg, transparent 46%, rgba(255,201,60,.18) 46% 54%, transparent 54%) 0 0 / 25% 25%, repeating-conic-gradient(#86294A 0 25%, #7E2440 0 50%) 0 0 / 25% 25%',
  piso_mosaico: FLIGHT + bevel('12.5%', '12.5%', 0.7) + 'radial-gradient(circle at 0 0, #E0B848 0 3px, transparent 3.5px) 0 0 / 12.5% 12.5%, linear-gradient(rgba(201,161,59,.6) 1.5px, transparent 1.5px) 0 0 / 12.5% 12.5%, linear-gradient(90deg, rgba(201,161,59,.6) 1.5px, transparent 1.5px) 0 0 / 12.5% 12.5%, conic-gradient(from 45deg, #2F6A88 0 25%, #295F7B 0 50%, #2F6A88 0 75%, #367494 0) 0 0 / 12.5% 12.5%',
  piso_estrellas: FLIGHT + 'radial-gradient(circle at 20% 30%, #FFF 0 1.2px, transparent 2px) 0 0 / 17% 19%, radial-gradient(circle at 70% 60%, #FFE7A8 0 1.5px, transparent 2.5px) 0 0 / 23% 21%, radial-gradient(circle at 40% 80%, #BDE8FF 0 1px, transparent 2px) 0 0 / 13% 15%, radial-gradient(120% 90% at 50% 30%, #2B2170, #120C38)',
};
export const WALL_BG = {
  pared_ladrillo: WLIGHT + 'linear-gradient(rgba(255,240,220,.12), transparent 40%, rgba(0,0,0,.2)) 0 0 / 100% 50%, ' + 'linear-gradient(#4E2219 2px, transparent 2px) 0 0 / 100% 50%, linear-gradient(90deg, #4E2219 2px, transparent 2px) 0 0 / 28px 50% repeat-x, linear-gradient(90deg, #4E2219 2px, transparent 2px) 14px 100% / 28px 50% repeat-x, linear-gradient(rgba(255,255,255,.08), rgba(0,0,0,.12)), #8A4434',
  pared_yeso: WLIGHT + 'linear-gradient(transparent 60%, #8A7DA3 60% 64%, #A194B8 64%), radial-gradient(circle at 30% 30%, rgba(255,255,255,.22) 0 8px, transparent 22px) 0 0 / 50px 60%, #B9AFC8',
  pared_madera: WLIGHT + 'linear-gradient(transparent 46%, #3E2814 46% 52%, transparent 52%), repeating-linear-gradient(90deg, #6E4A2A 0 22px, #5C3D24 22px 24px)',
  pared_tapiz: WLIGHT + 'radial-gradient(circle, rgba(255,201,60,.7) 0 2px, transparent 2.5px) 10px 6px / 20px 14px, linear-gradient(transparent 82%, #C9A13B 82% 88%, #4A1A40 88%), repeating-linear-gradient(90deg, #6A2A5E 0 18px, #5E2454 18px 20px)',
  pared_vitral: WLIGHT + 'linear-gradient(rgba(255,255,255,.2), transparent 70%), linear-gradient(90deg, #1A1028 3px, transparent 3px) 0 0 / 26px 100%, linear-gradient(#1A1028 3px, transparent 3px) 0 0 / 100% 50%, repeating-linear-gradient(90deg, #35507C 0 26px, #5E3A9E 26px 52px, #2E7A64 52px 78px, #9A7E36 78px 104px, #8E2E44 104px 130px)',
  pared_mural: WLIGHT + 'radial-gradient(ellipse 34px 16px at 50% 100%, #2F8A62 0 97%, transparent 100%) 0 0 / 80px 100%, radial-gradient(ellipse 26px 12px at 50% 100%, #3E9B6E 0 97%, transparent 100%) 40px 0 / 80px 100%, radial-gradient(circle at 50% 120%, #FF8F3C 0 30%, transparent 31%) 20px 0 / 120px 100%, linear-gradient(#5CC8FF, #C9A13B)',
};
export const floorBg = (id) => FLOOR_BG[id] ?? FLOOR_BG.piso_piedra;
export const wallBg = (id) => WALL_BG[id] ?? WALL_BG.pared_ladrillo;
