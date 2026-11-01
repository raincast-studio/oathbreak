// Catálogo de decoración. cat: piso/pared se aplican a la sala entera; el resto va en grilla.
// size [w,h] · surface: admite un objeto chico encima · small: puede ir sobre una superficie
// faction: null = ambas · buyable:false = solo por drop/racha/hito/temporada/renombre · set: id de set temático
export const SETS = {
  rincon: { name: 'Rincón acogedor', faction: null },
  biblioteca: { name: 'Biblioteca secreta', faction: null },
  jardin: { name: 'Jardín interior', faction: null },
  paladin: { name: 'Sala de Trofeos del Paladín', faction: 'hero' },
  vigia: { name: 'Puesto del Vigía', faction: 'hero' },
  doctor: { name: 'Laboratorio del Doctor', faction: 'villain' },
  cripta: { name: 'Cripta del Usurpador', faction: 'villain' },
};

const I = (id, name, cat, rarity, o = {}) => ({ id, name, cat, rarity, size: [1, 1], faction: null, buyable: true, ...o });

// Variantes por material: mismo mueble, distinto acabado y rareza (granularidad estilo Pet Society).
const MATERIALS = [
  { key: 'pino', name: 'de pino', rarity: 'comun' },
  { key: 'roble', name: 'de roble', rarity: 'comun' },
  { key: 'ebano', name: 'de ébano', rarity: 'raro' },
  { key: 'marfil', name: 'de marfil', rarity: 'raro' },
  { key: 'obsidiana', name: 'de obsidiana', rarity: 'epico' },
  { key: 'oro', name: 'dorado', rarity: 'legendario' },
];
const BASES = [
  { key: 'mesa', name: 'Mesa', size: [2, 1], surface: true },
  { key: 'silla', name: 'Silla', size: [1, 1] },
  { key: 'banco', name: 'Banco', size: [2, 1] },
  { key: 'cama', name: 'Cama', size: [2, 2] },
  { key: 'ropero', name: 'Ropero', size: [1, 2] },
  { key: 'mesita', name: 'Mesita', size: [1, 1], surface: true },
  { key: 'biombo', name: 'Biombo', size: [2, 1] },
];
const VARIANTS = BASES.flatMap((b) => MATERIALS.map((m) => I(`${b.key}_${m.key}`, `${b.name} ${m.name}`, 'mueble', m.rarity, { size: b.size, surface: b.surface })));

const FLOORS = [
  ['piso_piedra', 'Piso de piedra', 'comun'], ['piso_madera', 'Piso de madera', 'comun'], ['piso_baldosa', 'Piso de baldosas', 'comun'],
  ['piso_marmol', 'Piso de mármol', 'raro'], ['piso_alfombra', 'Piso alfombrado', 'raro'], ['piso_mosaico', 'Piso de mosaico', 'epico'],
  ['piso_estrellas', 'Piso de cielo estrellado', 'legendario'],
].map(([id, name, r]) => I(id, name, 'piso', r));
const WALLS = [
  ['pared_ladrillo', 'Pared de ladrillo', 'comun'], ['pared_yeso', 'Pared de yeso', 'comun'], ['pared_madera', 'Pared de madera', 'comun'],
  ['pared_tapiz', 'Pared con tapices', 'raro'], ['pared_vitral', 'Pared con vitrales', 'epico'], ['pared_mural', 'Pared con mural épico', 'legendario'],
].map(([id, name, r]) => I(id, name, 'pared', r));

export const ITEMS = [
  ...FLOORS, ...WALLS, ...VARIANTS,
  // Set Rincón acogedor (ambas facciones)
  I('mesa', 'Mesa de la abuela', 'mueble', 'comun', { size: [2, 1], surface: true, set: 'rincon' }),
  I('sillon', 'Sillón gastado', 'mueble', 'comun', { size: [2, 1], set: 'rincon' }),
  I('lampara', 'Lámpara de aceite', 'iluminacion', 'comun', { small: true, set: 'rincon' }),
  I('gato', 'Gato guardián', 'companero', 'raro', { set: 'rincon' }),
  // Set Biblioteca secreta
  I('estanteria', 'Estantería de pergaminos', 'mueble', 'raro', { size: [2, 1], set: 'biblioteca' }),
  I('atril', 'Atril de lectura', 'mueble', 'comun', { set: 'biblioteca' }),
  I('globo', 'Globo terráqueo', 'mueble', 'raro', { small: true, set: 'biblioteca' }),
  I('buho', 'Búho sabio', 'companero', 'epico', { set: 'biblioteca' }),
  // Set Jardín interior
  I('maceta', 'Maceta con helechos', 'mueble', 'comun', { small: true, set: 'jardin' }),
  I('bonsai', 'Bonsái centenario', 'mueble', 'raro', { small: true, set: 'jardin' }),
  I('estanque', 'Estanque de carpas', 'mueble', 'epico', { size: [2, 2], set: 'jardin' }),
  I('tortuga', 'Tortuga del jardín', 'companero', 'raro', { set: 'jardin' }),
  // Sueltos
  I('cofre', 'Cofre de madera', 'mueble', 'comun'),
  I('alfombra', 'Alfombra tejida', 'mueble', 'comun', { size: [2, 2] }),
  I('reloj', 'Reloj de péndulo', 'mueble', 'raro', { size: [1, 2] }),
  I('candelabro', 'Candelabro de bronce', 'iluminacion', 'raro', { small: true }),
  I('farol', 'Farol de hierro', 'iluminacion', 'comun'),
  I('arana', 'Araña de cristal', 'iluminacion', 'epico'),
  I('perro', 'Perro fiel', 'companero', 'raro'),
  I('zorro', 'Zorro astuto', 'companero', 'epico'),
  I('chimenea', 'Chimenea de piedra', 'mueble', 'epico', { size: [3, 1] }),
  I('mapa_mundi', 'Mesa de mapas', 'mueble', 'epico', { size: [3, 2], surface: true }),
  I('armadura_vieja', 'Armadura oxidada', 'mueble', 'comun', { size: [1, 2] }),
  I('piano', 'Piano de cola', 'mueble', 'epico', { size: [3, 2] }),
  I('acuario', 'Acuario', 'mueble', 'raro', { size: [2, 1] }),
  I('dragon', 'Dragón bebé', 'companero', 'legendario', { size: [2, 2] }),
  I('trono', 'Trono antiguo', 'mueble', 'legendario', { size: [2, 2] }),
  I('fenix', 'Fénix doméstico', 'companero', 'legendario'),
  // Set Paladín (héroes)
  I('estandarte_alba', 'Estandarte del Alba', 'estandarte', 'raro', { faction: 'hero', set: 'paladin' }),
  I('armadura_cer', 'Armadura ceremonial', 'mueble', 'raro', { size: [1, 2], faction: 'hero', set: 'paladin' }),
  I('vitrina', 'Vitrina de reliquias', 'mueble', 'epico', { size: [2, 1], surface: true, faction: 'hero', set: 'paladin' }),
  I('caliz', 'Cáliz sagrado', 'trofeo', 'epico', { small: true, faction: 'hero', set: 'paladin' }),
  // Set Puesto del Vigía (héroes)
  I('catalejo', 'Catalejo de bronce', 'mueble', 'raro', { faction: 'hero', set: 'vigia' }),
  I('mapa_ciudad', 'Mapa de la ciudad', 'mueble', 'comun', { size: [2, 1], faction: 'hero', set: 'vigia' }),
  I('radio', 'Radio de emergencias', 'mueble', 'raro', { small: true, faction: 'hero', set: 'vigia' }),
  I('halcon', 'Halcón mensajero', 'companero', 'epico', { faction: 'hero', set: 'vigia' }),
  I('escudo_mural', 'Escudo mural', 'estandarte', 'comun', { faction: 'hero' }),
  // Set Doctor (villanos)
  I('estandarte_carmesi', 'Estandarte Carmesí', 'estandarte', 'raro', { faction: 'villain', set: 'doctor' }),
  I('tanque_clones', 'Tanque de clones', 'mueble', 'raro', { size: [1, 2], faction: 'villain', set: 'doctor' }),
  I('mesa_exp', 'Mesa de experimentos', 'mueble', 'epico', { size: [2, 1], surface: true, faction: 'villain', set: 'doctor' }),
  I('calavera', 'Calavera de cristal', 'trofeo', 'epico', { small: true, faction: 'villain', set: 'doctor' }),
  // Set Cripta del Usurpador (villanos)
  I('sarcofago', 'Sarcófago tallado', 'mueble', 'raro', { size: [1, 2], faction: 'villain', set: 'cripta' }),
  I('vela_negra', 'Velas negras', 'iluminacion', 'comun', { small: true, faction: 'villain', set: 'cripta' }),
  I('altar', 'Altar de obsidiana', 'mueble', 'epico', { size: [2, 1], surface: true, faction: 'villain', set: 'cripta' }),
  I('cuervo', 'Cuervo vigilante', 'companero', 'raro', { faction: 'villain', set: 'cripta' }),
  I('bandera_pirata', 'Bandera del saqueo', 'estandarte', 'comun', { faction: 'villain' }),
  // Exclusivos (hitos)
  I('farol_amistad', 'Farol de la amistad', 'iluminacion', 'raro', { small: true, buyable: false }), // v14: bono de invitación
  I('trofeo_racha', 'Llama de la constancia', 'trofeo', 'epico', { buyable: false }),
  I('trofeo_campeon', 'Trofeo de campeón', 'trofeo', 'epico', { buyable: false }),
  I('marco_honor', 'Marco de honor del escaparate', 'trofeo', 'legendario', { buyable: false }),
  I('estandarte_victoria', 'Estandarte de la facción victoriosa', 'estandarte', 'epico', { buyable: false }),
  // Temporada (pase de temporada)
  I('temp_aura', 'Aura de temporada', 'iluminacion', 'raro', { buyable: false, season: true }),
  I('temp_estatua', 'Estatua de temporada', 'mueble', 'epico', { size: [1, 2], buyable: false, season: true }),
  I('temp_portal', 'Portal de temporada', 'mueble', 'legendario', { size: [2, 2], buyable: false, season: true }),
  // Tienda de renombre (se paga con renombre ganado socializando)
  I('farol_aurora', 'Farol de aurora', 'iluminacion', 'raro', { small: true, buyable: false, renown: 25 }),
  I('busto', 'Busto del anfitrión', 'mueble', 'raro', { buyable: false, renown: 40 }),
  I('banco_plaza', 'Banco de plaza', 'mueble', 'raro', { size: [2, 1], buyable: false, renown: 60 }),
  I('fuente', 'Fuente de los deseos', 'mueble', 'epico', { size: [2, 2], buyable: false, renown: 120 }),
  I('alfombra_gala', 'Alfombra de gala', 'mueble', 'epico', { size: [3, 2], buyable: false, renown: 150 }),
  I('glorieta', 'Glorieta de jardín', 'mueble', 'legendario', { size: [3, 3], buyable: false, renown: 400 }),
  I('estatua_anfitrion', 'Estatua del gran anfitrión', 'mueble', 'legendario', { size: [2, 2], buyable: false, renown: 800 }),
];

// Siempre en la tienda: un piso, una pared, una superficie y algo chico para apilar (el resto rota cada día).
const BASIC = ['piso_madera', 'pared_yeso', 'mesa', 'lampara'];
for (const it of ITEMS) if (BASIC.includes(it.id)) it.basic = true;

export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const SET_PIECES = Object.fromEntries(Object.keys(SETS).map((k) => [k, ITEMS.filter((i) => i.set === k)]));
export const setPieces = (setId) => SET_PIECES[setId] ?? [];
export const DEFAULTS = { floor: 'piso_piedra', wall: 'pared_ladrillo' };
