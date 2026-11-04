// Textos de error para el jugador (código de la fachada → frase). Fuente: mapa ERR de la página de debug.
export const ERR = {
  oro_insuficiente: 'No te alcanza el oro.', mision_activa: 'Ya tenés una misión en curso.', en_curso: 'La misión todavía no terminó.',
  sin_energia: 'Sin energía. Se recupera con el tiempo (la Enfermería la acelera).', novato_protegido: 'Jugador novato: no se lo puede atacar hasta el nivel 5.',
  objetivos_incompletos: 'Completá los 3 objetivos primero.', objetivo_incompleto: 'Ese objetivo todavía no está completo.', ya_cobrado: 'Ya lo cobraste.',
  renombre_insuficiente: 'No te alcanza el renombre.', no_reciclable: 'Los objetos exclusivos no se reciclan.', posicion_invalida: 'Ese objeto no se puede poner ahí.',
  guardado_de_version_futura: 'Hay un guardado de una versión más nueva.', guardado_ilegible: 'Hay un guardado ilegible.', json_invalido: 'El texto no es un JSON válido.',
  guardado_invalido: 'Ese texto no es un guardado de Oathbreak.', cooldown_objetivo: 'Ya atacaste a ese objetivo hace menos de 1 h.', objetivo_protegido: 'Ese objetivo ya recibió 5 ataques hoy.',
  sin_objetivos: 'No hay objetivos disponibles en tu rango ahora.', nivel_insuficiente: 'Te falta nivel para eso.', ya_equipado: 'Ya tenés ese tier o uno mejor.',
  nombre_corto: 'El nombre necesita al menos 3 letras.', monto_invalido: 'Monto inválido.', fuera_de_rango: 'Fuera de tu rango de nivel.',
  nivel_maximo: 'Ese edificio ya está al máximo.', taller_vacio: 'El Taller todavía no produjo oro.', sin_taller: 'Primero construí el Taller.',
  casilla_ocupada: 'Esa casilla está ocupada.', fuera_de_sala: 'El objeto no entra ahí.', sin_espacio: 'No queda espacio libre.', salas_maximas: 'Ya tenés todas las salas.',
  no_disponible_hoy: 'Ese objeto no está en la tienda hoy.', sala_invalida: 'Esa sala no existe.',
  // Completados para la interfaz nueva
  sin_mision: 'No tenés ninguna misión en curso.', tope_de_regalos: 'Ya mandaste todos los regalos de hoy.', ya_le_regalaste_hoy: 'Hoy ya le regalaste a esa persona.',
  no_es_amigo: 'Primero agregalo como amigo.', ya_es_amigo: 'Ya es tu amigo.', lista_llena: 'Tu lista de amigos está llena.', sin_regalos: 'No tenés regalos para abrir.',
  escalon_bloqueado: 'Todavía no llegaste a ese escalón.', tu_propia_guarida: 'Esa es tu guarida.', item_no_en_inventario: 'Ese objeto no está en tu inventario.',
  item_no_colocado: 'Ese objeto no está colocado.', misma_faccion: 'Es de tu facción.', mismo_jugador: 'No podés atacarte a vos mismo.',
  en_mision: 'Estás en una misión: no podés cazar hasta terminarla o cancelarla.', solicitud_enviada: 'Ya le mandaste una solicitud.',
  demasiadas_solicitudes: 'Tenés demasiadas solicitudes sin respuesta.', sin_solicitud: 'Esa solicitud ya no está.',
  buzon_lleno_hoy: 'Ya recibió todos los regalos de hoy. Probá mañana.', variante_invalida: 'Esa pieza no tiene esa variante.',
  // Cuenta y guardado en la nube (1b)
  email_invalido: 'Revisá el email.', email_en_uso: 'Ese email ya tiene un héroe. Usá "Ya tengo un héroe" para entrar.',
  codigo_invalido: 'El código no es correcto o ya venció. Pedí uno nuevo.', demasiados_intentos: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  sin_cuenta: 'No hay ningún héroe con ese email.', sin_conexion: 'Sin conexión con el servidor. Tu partida sigue guardada en este dispositivo.',
  error_nube: 'El servidor no respondió. Probá de nuevo en un rato.', sin_guardar: 'Todavía hay cambios sin subir. Esperá unos segundos.',
  // v17 · Confianza (moderación, reportes, cuenta). Los textos nunca repiten la palabra bloqueada.
  nombre_no_permitido: 'Ese nombre no se puede usar en OATHBREAK. Probá con otro o tocá "Al azar".',
  jugador_invalido: 'No encontramos a ese jugador.', motivo_invalido: 'Elegí un motivo.', nota_invalida: 'Revisá la nota.',
  confirmar_borrado: 'Para confirmar, escribí BORRAR.',
};
// Cualquier código sin texto propio cae en un mensaje genérico (nunca se muestra el código crudo).
export const errText = (code) => ERR[code] ?? 'No se pudo hacer. Probá de nuevo.';
