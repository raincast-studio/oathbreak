// Onboarding: elegir facción → nombre → jurar lealtad. Después, "Primeros pasos" guía la primera sesión desde Base.
import { CFG } from '../src/game.js';
import { randomName } from '../src/moderation.js';
import { h, toast, sprite } from './kit.js';
import { errText } from './errors.js';
import { signInSheet, pending } from './account.js';
import * as cloud from './cloud.js';
import { legalLink, TERMS_VERSION } from './legal.js';

const SIDES = {
  hero: { name: 'Héroes', oath: 'Juro proteger la ciudad', blurb: 'Patrullás, escoltás y rescatás. Cazás villanos y tu guarida es un cuartel de trofeos.' },
  villain: { name: 'Villanos', oath: 'Juro gobernar las sombras', blurb: 'Extorsionás, asaltás y saqueás. Cazás héroes y tu guarida es un laboratorio secreto.' },
};
// v17: los nombres de "Al azar" viven en src/moderation.js (NAME_POOL): nunca sale uno bloqueado.

export function showOnboarding(game, onDone) {
  let faction = null;
  const notice = cloud.takeNotice(); // v17: p. ej. "Borramos tu cuenta…" (después de borrar, se vuelve acá)
  const root = h('div.onb');
  document.body.append(root);

  const pickStep = () => {
    root.replaceChildren(h('div.onb-inner',
      notice ? h('p.note', { role: 'status' }, notice) : null,
      h('p.eyebrow', 'Paso 1 de 2'),
      h('h1.display.onb-title', 'Elegí tu bando'),
      h('p.muted', 'Es para siempre: define tus misiones, tu guarida y a quién cazás.'),
      h('div.sides', Object.entries(SIDES).map(([k, s]) => h(`button.side.${k}`, { type: 'button', 'aria-pressed': String(faction === k), onclick: () => { faction = k; pickStep(); } },
        sprite(k, '.side-sprite'),
        h('strong.display', s.name),
        h('span', s.blurb)))),
      h('button.btn.gold.big', { type: 'button', disabled: !faction, onclick: nameStep }, faction ? (faction === 'hero' ? 'Seguir como héroe' : 'Seguir como villano') : 'Elegí un bando'),
      cloud.account().status === 'online' ? h('button.link-btn', { type: 'button', onclick: () => signInSheet({ fromGame: false, resume: pending()?.kind === 'signin' ? pending() : undefined }) }, 'Ya tengo un héroe') : null));
  };

  const nameStep = () => {
    const input = h('input#hero-name.name-input', { type: 'text', maxLength: 16, autocomplete: 'off', autocapitalize: 'words', spellcheck: false, 'aria-label': 'Tu nombre', 'aria-describedby': 'name-help', placeholder: 'Tu nombre' });
    const help = h('p#name-help.muted', 'Entre 3 y 16 letras. Así te ven en la caza y en el escaparate.');
    const roll = () => {
      input.value = randomName(faction);
      help.textContent = 'Entre 3 y 16 letras. Así te ven en la caza y en el escaparate.'; help.classList.remove('err-text');
      input.focus();
    };
    const submit = (e) => {
      e.preventDefault();
      const r = game.newCharacter(input.value, faction, { terms: TERMS_VERSION }); // v17: clickwrap (texto debajo del botón)
      if (!r.ok) { help.textContent = errText(r.error); help.classList.add('err-text'); input.focus(); return; }
      root.classList.add('out');
      setTimeout(() => { root.remove(); onDone(); toast(`¡Bienvenido, ${game.state().player?.name ?? input.value.trim()}!`, 'prize'); }, 250);
    };
    root.replaceChildren(h('form.onb-inner', { onsubmit: submit },
      h('p.eyebrow', 'Paso 2 de 2'),
      sprite(faction, '.solo-sprite'),
      h('h1.display.onb-title', '¿Cómo te van a llamar?'),
      h('div.name-row', input, h('button.btn.ghost', { type: 'button', 'aria-label': 'Nombre al azar', onclick: roll }, 'Al azar')),
      help,
      h('button.btn.big' + (faction === 'hero' ? '.gold' : '.crimson'), { type: 'submit' }, SIDES[faction].oath),
      h('p.terms-note', 'Al jurar lealtad aceptás los ', legalLink('terminos', 'Términos'), ' y la ', legalLink('privacidad', 'Política de privacidad'),
        ' y confirmás que tenés 13 años o más.'),
      h('button.link-btn', { type: 'button', onclick: pickStep }, 'Cambiar de bando')));
    input.focus();
  };

  pickStep();
}

/* ---------- Primeros pasos (estado de tutorial: solo de esta interfaz, en este navegador) ---------- */
const KEY = 'oathbreak.tutorial';
// v15: el estado vive en la partida (viaja con la nube); si hay uno viejo en este navegador, se migra una vez.
const local = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const load = (game) => {
  const u = game.uiState();
  if (u.ok && u.ui.tutorial) return u.ui.tutorial;
  const old = local();
  if (old) { game.setUi('tutorial', old); try { localStorage.removeItem(KEY); } catch { /* nada */ } }
  return old ?? {};
};
const save = (game, t) => game.setUi('tutorial', t);
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* nada */ } };

export function firstSteps(ctx) {
  const t = load(ctx.game);
  if (t.closed) return null;
  const p = ctx.S.player;
  const lr = ctx.game.lair();
  // Cada paso se marca al observar el resultado en la fachada y queda guardado (no se desmarca).
  const seen = {
    mission: !!p.mission,
    hunt: p.record.w + p.record.l > 0,
    stat: CFG.stats.reduce((a, k) => a + p.stats[k], 0) > CFG.stats.length * CFG.start.stat,
    visit: lr.ok && lr.visits.today > 0,
  };
  let changed = false;
  for (const [k, v] of Object.entries(seen)) if (v && !t[k]) { t[k] = true; changed = true; }
  if (changed) save(ctx.game, t);

  const steps = [
    ['hunt', 'Ganá tu primera pelea', 'En la Arena, elegí un rival de tu nivel o menor.', 'arena'],
    ['mission', 'Empezá una misión', 'Para cuando no estés: mientras corre no podés cazar.', 'misiones'],
    ['stat', 'Mejorá un atributo', 'Con el oro que ganes, subí Fuerza, Defensa, Agilidad o Resistencia.', 'personaje'],
    ['visit', 'Visitá una guarida', 'Te da oro y XP, y al dueño una propina.', 'social'],
  ];
  const done = steps.filter(([k]) => t[k]).length;
  const all = done === steps.length;
  return h('section.card.first-steps',
    h('div.sec-head', h('h2.display', all ? '¡Ya sabés jugar!' : 'Primeros pasos'), h('span.muted.tnum', `${done}/${steps.length}`)),
    all ? h('p', 'Volvé cada día: misiones largas mientras no estás, objetivos del día y la presa ★.') : null,
    all ? h('button.btn.gold.wide', { type: 'button', onclick: () => { save(ctx.game, { ...t, closed: true }); ctx.refresh(); } }, 'Cerrar') :
      h('ol.steps', steps.map(([k, name, desc, tab]) => h(`li.step${t[k] ? '.done' : ''}`,
        h('span.step-mark', { 'aria-hidden': 'true' }, t[k] ? '✓' : ''),
        h('div.g-info', h('strong', name), h('span.muted', desc)),
        t[k] ? null : h('button.btn.ghost.small', { type: 'button', onclick: () => ctx.go(tab) }, 'Ir')))));
}
