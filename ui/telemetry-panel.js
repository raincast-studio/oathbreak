// Telemetría · piezas de interfaz: interruptor "Compartir datos de uso" (Personaje → Ajustes).
import { h } from './kit.js';
import { usageEnabled, setUsageEnabled } from './telemetry-sink.js';

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
