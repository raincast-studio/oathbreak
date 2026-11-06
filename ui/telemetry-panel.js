// Telemetría · piezas de interfaz: interruptor "Compartir datos de uso" (Personaje → Ajustes) y panel de diagnóstico
// de las herramientas de prueba (5 toques al nombre → Telemetría).
import { h, openSheet, closeSheet, toast } from './kit.js';
import { usageEnabled, setUsageEnabled, diag, flushNow, clearQueue } from './telemetry-sink.js';

// Misma forma que las filas de Ajustes (ui/tabs/personaje.js): .set-row + .switch.
export function usageRow() {
  return h('div.set-row',
    h('div.set-txt', h('strong', { id: 'set-usage' }, 'Compartir datos de uso'),
      h('span.muted', 'Datos anónimos del juego (qué hacés, errores y tiempos de carga) para mejorarlo. Nunca tu nombre ni tu email.')),
    h('button.switch', { type: 'button', role: 'switch', 'aria-labelledby': 'set-usage', 'aria-checked': String(usageEnabled()), onclick: (e) => {
      const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      setUsageEnabled(on);
      e.currentTarget.setAttribute('aria-checked', String(on));
    } }, h('span.knob')));
}

/* ---------- Panel de diagnóstico ---------- */
const ago = (ts) => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px', wordBreak: 'break-all', margin: '0 0 6px' };
const row = (e) => h('li', { style: mono }, h('strong', e.t), ` · ${e.scr} · hace ${ago(e.ts)} · #${e.q} `, h('span.muted', JSON.stringify(e.p)));

export function telemetryPanel() {
  const d = diag();
  if (!d) return toast('Telemetría no disponible en este navegador.', 'err');
  const status = d.lastStatus == null ? '—' : d.lastStatus === -1 ? 'sin sesión' : d.lastStatus === 0 ? 'sin red' : String(d.lastStatus);
  const wait = d.retryAt > Date.now() ? `${Math.ceil((d.retryAt - Date.now()) / 1000)} s` : 'no';
  const facts = [['Compartir datos', d.enabled ? 'Sí' : 'No (apagado en Ajustes)'], ['Destino', d.dest], ['Pendientes', `${d.queue.length} (${(d.bytes / 1024).toFixed(1)} KB)`],
    ['Enviados', String(d.sent)], ['Descartados', String(d.dropped)], ['Último envío', d.lastOk ? `hace ${ago(d.lastOk)}` : '—'], ['Última respuesta', status],
    ['Reintento en', wait], ['Instalación', d.tid], ['Sesión', d.sid]];
  openSheet({ title: 'Telemetría', body: h('div.stack',
    h('dl.facts', facts.flatMap(([a, b]) => [h('dt', a), h('dd', b)])),
    h('div.row',
      h('button.btn.ghost', { type: 'button', disabled: !d.queue.length || !d.enabled, onclick: async () => {
        const r = await flushNow(); closeSheet(true); telemetryPanel();
        toast(r?.ok ? `Enviados ${r.sent}` : `No se envió (${r?.reason ?? '—'})`, r?.ok ? 'ok' : 'err');
      } }, 'Enviar ahora'),
      h('button.btn.ghost', { type: 'button', disabled: !d.queue.length, onclick: () => { clearQueue(); closeSheet(true); telemetryPanel(); } }, 'Vaciar cola')),
    h('h3', `Últimos ${d.recent.length} eventos`),
    d.recent.length ? h('ol', [...d.recent].reverse().map(row)) : h('p.muted', 'Todavía no hay eventos.'),
    h('h3', `Cola pendiente (${d.queue.length})`),
    d.queue.length ? h('ol', d.queue.slice(-20).reverse().map(row)) : h('p.muted', 'Vacía.'),
    d.queue.length > 20 ? h('p.muted', `… y ${d.queue.length - 20} más antiguos.`) : null) });
}
