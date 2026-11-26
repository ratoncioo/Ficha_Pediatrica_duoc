/* =====================================================================
 * core.js – Lógica de negocio: autenticación y autorización, auditoría,
 * adaptadores de integración (simulados), contingencia/sincronización,
 * motor de notificaciones, asistente virtual y cifrado de mensajes.
 * ===================================================================== */
'use strict';

const USUARIO_SISTEMA = { id: null, username: 'sistema', rol: 'SISTEMA' };
let sesion = null;   // { id, username, nombre, rol, rolNombre, tutor_id, especialidad, permisos:Set }

/* =========================== AUDITORÍA (HU8) =========================== */
/**
 * Inserta un registro de auditoría encadenado por hash.
 * hash = SHA-256(hash_anterior | fecha | usuario | acción | entidad | id | detalle)
 */
function registrarAuditoria(accion, entidad, entidadId, detalle, usuario = sesion || USUARIO_SISTEMA) {
  const ultimo = q1('SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1');
  const hashAnterior = ultimo ? ultimo.hash : 'GENESIS';
  const fecha = nowStr();
  const contenido = [hashAnterior, fecha, usuario.username, accion, entidad, entidadId ?? '', detalle ?? ''].join('|');
  run(`INSERT INTO auditoria(fecha_hora, usuario_id, username, rol, accion, entidad, entidad_id, detalle, hash_anterior, hash)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [fecha, usuario.id, usuario.username, usuario.rol, accion, entidad, entidadId == null ? null : String(entidadId), detalle ?? null, hashAnterior, sha256(contenido)]);
}
function auditar(accion, entidad, entidadId, detalle) { registrarAuditoria(accion, entidad, entidadId, detalle); persist(); }

/** Recalcula toda la cadena y detecta alteraciones. */
function verificarCadenaAuditoria() {
  const filas = q('SELECT * FROM auditoria ORDER BY id');
  let anterior = 'GENESIS';
  for (const f of filas) {
    const esperado = sha256([anterior, f.fecha_hora, f.username, f.accion, f.entidad, f.entidad_id ?? '', f.detalle ?? ''].join('|'));
    if (f.hash_anterior !== anterior || f.hash !== esperado) return { ok: false, id: f.id, total: filas.length };
    anterior = f.hash;
  }
  return { ok: true, total: filas.length };
}

/* ===================== AUTENTICACIÓN Y ROLES (HU7) ===================== */
const MAX_INTENTOS = 5;

function iniciarSesion(username, password) {
  const u = q1(`SELECT u.*, r.codigo AS rol, r.nombre AS rol_nombre FROM usuario u JOIN rol r ON r.id = u.rol_id
                WHERE u.username = ?`, [username.toLowerCase()]);
  if (!u) {
    registrarAuditoria('LOGIN_FALLIDO', 'usuario', null, `Usuario inexistente: ${username}`, { id: null, username: username || '(vacío)', rol: 'DESCONOCIDO' });
    persist();
    return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
  }
  const actor = { id: u.id, username: u.username, rol: u.rol };
  if (!u.activo) {
    registrarAuditoria('LOGIN_FALLIDO', 'usuario', u.id, 'Intento de acceso con cuenta bloqueada', actor); persist();
    return { ok: false, msg: 'Cuenta bloqueada por intentos fallidos. Solicite el desbloqueo a soporte TI.' };
  }
  if (sha256(u.sal + password) !== u.password_hash) {
    const intentos = u.intentos_fallidos + 1;
    run('UPDATE usuario SET intentos_fallidos = ?, activo = ? WHERE id = ?', [intentos, intentos >= MAX_INTENTOS ? 0 : 1, u.id]);
    registrarAuditoria('LOGIN_FALLIDO', 'usuario', u.id, `Contraseña incorrecta (intento ${intentos}/${MAX_INTENTOS})`, actor); persist();
    return { ok: false, msg: intentos >= MAX_INTENTOS ? 'Cuenta bloqueada por exceso de intentos.' : 'Usuario o contraseña incorrectos.' };
  }
  run('UPDATE usuario SET intentos_fallidos = 0 WHERE id = ?', [u.id]);
  const permisos = new Set(q(`SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?`, [u.rol_id]).map(r => r.codigo));
  sesion = { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol, rolNombre: u.rol_nombre, tutor_id: u.tutor_id, especialidad: u.especialidad, permisos };
  try { sessionStorage.setItem('fep_sesion', u.username); } catch (_) {}
  auditar('LOGIN', 'usuario', u.id, 'Inicio de sesión exitoso');
  return { ok: true };
}

function restaurarSesion() {
  let username = null;
  try { username = sessionStorage.getItem('fep_sesion'); } catch (_) {}
  if (!username) return;
  const u = q1(`SELECT u.*, r.codigo AS rol, r.nombre AS rol_nombre FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE username = ? AND activo = 1`, [username]);
  if (!u) return;
  const permisos = new Set(q(`SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?`, [u.rol_id]).map(r => r.codigo));
  sesion = { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol, rolNombre: u.rol_nombre, tutor_id: u.tutor_id, especialidad: u.especialidad, permisos };
}

function cerrarSesion() {
  if (sesion) auditar('LOGOUT', 'usuario', sesion.id, 'Cierre de sesión');
  sesion = null;
  try { sessionStorage.removeItem('fep_sesion'); } catch (_) {}
}

function puede(permiso) { return !!(sesion && sesion.permisos.has(permiso)); }
/** Verifica un permiso; si falta, registra ACCESO_DENEGADO y avisa. */
function exigir(permiso, entidad = 'sistema', entidadId = null) {
  if (puede(permiso)) return true;
  auditar('ACCESO_DENEGADO', entidad, entidadId, `Operación sin permiso: ${permiso}`);
  toast(`Acceso denegado: su rol (${sesion ? sesion.rolNombre : 'sin sesión'}) no tiene el permiso "${permiso}".`, 'error');
  return false;
}

/* ================= CONTINGENCIA Y SINCRONIZACIÓN (HU9) ================= */
function conexionExterna() { return param('conexion_externa', 'ON') === 'ON'; }
function pendientes() { return q1(`SELECT COUNT(*) AS n FROM operacion_pendiente WHERE estado = 'PENDIENTE'`).n; }

function encolar(tipo, referencia, payload) {
  return run(`INSERT INTO operacion_pendiente(tipo, referencia, payload, creada_en, usuario_id) VALUES (?,?,?,?,?)`,
    [tipo, String(referencia), JSON.stringify(payload || {}), nowStr(), sesion ? sesion.id : null]);
}

function cambiarConexion(on) {
  setParam('conexion_externa', on ? 'ON' : 'OFF');
  auditar('CONTINGENCIA', 'conexion_externa', null, on ? 'Conexión con servicios externos restablecida' : 'Se activa modo contingencia: servicios externos sin conexión');
}

let sincronizando = false;
/** Procesa la cola de operaciones pendientes. Devuelve {ok, error}. */
async function sincronizarPendientes(automatico = false) {
  if (sincronizando || !conexionExterna()) return { ok: 0, error: 0 };
  sincronizando = true;
  let ok = 0, error = 0;
  try {
    const ops = q(`SELECT * FROM operacion_pendiente WHERE estado = 'PENDIENTE' ORDER BY id`);
    for (const op of ops) {
      run('UPDATE operacion_pendiente SET intentos = intentos + 1 WHERE id = ?', [op.id]);
      let exito = false;
      try {
        if (op.tipo === 'VALIDACION_PREVISIONAL') {
          const r = await validarIdentidadYPrevision(op.referencia, true);
          aplicarValidacionAPaciente(op.referencia, r);
          exito = r.estado !== 'ERROR';
        } else if (op.tipo === 'ENVIO_RED_PUBLICA') {
          await dormir(150);
          run(`INSERT INTO validacion_externa(paciente_rut, servicio, resultado, detalle, tiempo_ms, fecha, usuario_id) VALUES (?,?,?,?,?,?,?)`,
            [JSON.parse(op.payload).rut || '', 'RED_PUBLICA', 'OK', `Atención #${op.referencia} enviada a la red (simulado)`, 150, nowStr(), op.usuario_id]);
          exito = true;
        } else if (op.tipo === 'ENVIO_NOTIFICACION') {
          run(`UPDATE notificacion SET estado = 'PROGRAMADA' WHERE id = ? AND estado = 'EN_COLA'`, [op.referencia]);
          procesarNotificaciones(true);
          exito = true;
        }
      } catch (e) { exito = false; }
      if (exito) { run(`UPDATE operacion_pendiente SET estado = 'SINCRONIZADA', sincronizada_en = ? WHERE id = ?`, [nowStr(), op.id]); ok++; }
      else if (op.intentos + 1 >= 5) { run(`UPDATE operacion_pendiente SET estado = 'ERROR' WHERE id = ?`, [op.id]); error++; }
    }
    if (ops.length) registrarAuditoria('SINCRONIZACION', 'operacion_pendiente', null,
      `${automatico ? 'Reintento automático' : 'Sincronización manual'}: ${ok} sincronizadas, ${error} con error`, automatico ? USUARIO_SISTEMA : sesion || USUARIO_SISTEMA);
    persist();
  } finally { sincronizando = false; }
  return { ok, error };
}

/* ============ INTEGRACIONES EXTERNAS (HU1, HU3) – SIMULADAS ============ */
/**
 * Adaptador SIMULADO de Registro Civil + FONASA/ISAPRE.
 * En producción se reemplaza por clientes de servicios web oficiales;
 * este prototipo NO se conecta a ningún servicio real.
 */
async function validarIdentidadYPrevision(rut, desdeSincronizacion = false) {
  const inicio = performance.now();
  const registrar = (servicio, resultado, detalle, ms) =>
    run(`INSERT INTO validacion_externa(paciente_rut, servicio, resultado, detalle, tiempo_ms, fecha, usuario_id) VALUES (?,?,?,?,?,?,?)`,
      [rut, servicio, resultado, detalle, Math.round(ms), nowStr(), sesion ? sesion.id : null]);

  await dormir(250 + Math.random() * 550);   // latencia simulada de red
  if (!conexionExterna()) {
    const ms = performance.now() - inicio;
    registrar('REGISTRO_CIVIL', 'ERROR_CONEXION', 'Servicio externo no disponible (modo contingencia)', ms);
    return { estado: 'ERROR', mensaje: 'Sin conexión con servicios externos.', ms };
  }
  const rc = MOCK_REGISTRO_CIVIL[rut];
  const pv = MOCK_PREVISION[rut];
  const msRc = performance.now() - inicio;
  if (!rc) {
    registrar('REGISTRO_CIVIL', 'NO_ENCONTRADO', 'RUT sin registro en Registro Civil (simulado)', msRc);
    return { estado: 'ALERTA', identidad: null, prevision: null, mensaje: 'El RUT no figura en el Registro Civil. Verifique el documento del paciente.', ms: msRc };
  }
  if (rc.estado !== 'VIGENTE') {
    registrar('REGISTRO_CIVIL', 'INCONSISTENCIA', `Cédula con estado ${rc.estado} (simulado)`, msRc);
  } else {
    registrar('REGISTRO_CIVIL', 'OK', 'Identidad verificada (simulado)', msRc);
  }
  await dormir(100 + Math.random() * 300);
  const ms = performance.now() - inicio;
  let resultadoPrev = 'OK', detallePrev = '';
  if (!pv || pv.tipo === 'SIN_PREVISION') { resultadoPrev = 'NO_AFILIADO'; detallePrev = 'Sin afiliación vigente en FONASA ni ISAPRE (simulado)'; }
  else detallePrev = pv.tipo === 'FONASA' ? `FONASA tramo ${pv.tramo} vigente (simulado)` : `${pv.nombre} vigente (simulado)`;
  registrar(pv && pv.tipo === 'ISAPRE' ? 'ISAPRE' : 'FONASA', resultadoPrev, detallePrev, ms);

  const alerta = rc.estado !== 'VIGENTE' || resultadoPrev !== 'OK';
  return {
    estado: alerta ? 'ALERTA' : 'VALIDADO', identidad: rc, prevision: pv || { tipo: 'SIN_PREVISION' }, ms,
    mensaje: rc.estado !== 'VIGENTE' ? `Registro Civil informa cédula ${rc.estado}. Se permite continuar la atención de urgencia.`
      : resultadoPrev !== 'OK' ? 'Paciente no afiliado: se muestra alerta al administrativo.' : 'Identidad y previsión validadas.'
  };
}

/** Actualiza el paciente con el resultado de una validación (usado por la sincronización). */
function aplicarValidacionAPaciente(rut, r) {
  const p = q1('SELECT id FROM paciente WHERE rut = ?', [rut]);
  if (!p || r.estado === 'ERROR') return;
  const prevId = previsionId(r.prevision);
  run(`UPDATE paciente SET estado_validacion = ?, prevision_id = COALESCE(?, prevision_id), tramo_fonasa = ?, actualizado_en = ? WHERE id = ?`,
    [r.estado, prevId, r.prevision && r.prevision.tramo ? r.prevision.tramo : null, nowStr(), p.id]);
  registrarAuditoria('VALIDACION', 'paciente', p.id, `Validación externa: ${r.estado} (${Math.round(r.ms)} ms)`);
}
function previsionId(prev) {
  if (!prev) return null;
  if (prev.tipo === 'FONASA') return 1;
  if (prev.tipo === 'SIN_PREVISION') return 4;
  const r = q1('SELECT id FROM institucion_prevision WHERE nombre = ?', [prev.nombre]);
  return r ? r.id : null;
}

/** Adaptador SIMULADO de la Red de Salud Pública (formato inspirado en HL7 FHIR). */
async function consultarRedPublica(rut) {
  const inicio = performance.now();
  await dormir(300 + Math.random() * 500);
  const ms = Math.round(performance.now() - inicio);
  if (!conexionExterna()) {
    run(`INSERT INTO validacion_externa(paciente_rut, servicio, resultado, detalle, tiempo_ms, fecha, usuario_id) VALUES (?,?,?,?,?,?,?)`,
      [rut, 'RED_PUBLICA', 'ERROR_CONEXION', 'Red pública no disponible', ms, nowStr(), sesion.id]);
    persist();
    return { ok: false, ms };
  }
  const registros = MOCK_RED_PUBLICA[rut] || [];
  run(`INSERT INTO validacion_externa(paciente_rut, servicio, resultado, detalle, tiempo_ms, fecha, usuario_id) VALUES (?,?,?,?,?,?,?)`,
    [rut, 'RED_PUBLICA', registros.length ? 'OK' : 'NO_ENCONTRADO', `${registros.length} antecedentes recibidos (simulado)`, ms, nowStr(), sesion.id]);
  persist();
  const bundle = {
    resourceType: 'Bundle', type: 'searchset', total: registros.length, _nota: 'Mensaje SIMULADO con estructura inspirada en HL7 FHIR R4',
    entry: registros.map((r, i) => ({ resource: { resourceType: r.tipo === 'OTRO' ? 'Encounter' : 'DiagnosticReport', id: `sim-${i + 1}`,
      subject: { identifier: { system: 'RUN', value: rut } }, effectiveDateTime: r.fecha, code: { text: r.descripcion },
      performer: [{ display: r.establecimiento }], conclusion: r.resultado } }))
  };
  return { ok: true, registros, ms, bundle };
}

/* ================== NOTIFICACIONES Y CITAS (HU5) ================== */
function tutorPrincipal(pacienteId) {
  return q1(`SELECT t.* FROM tutor t JOIN paciente_tutor pt ON pt.tutor_id = t.id WHERE pt.paciente_id = ? ORDER BY pt.es_principal DESC LIMIT 1`, [pacienteId]);
}
function textoCita(c) {
  return `${c.nombres.split(' ')[0]} tiene hora de ${c.especialidad} el ${fechaCorta(c.fecha_hora)} con ${c.profesional}. Hospital Dr. Luis Calvo Mackenna.`;
}
function datosCita(citaId) {
  return q1(`SELECT c.*, p.nombres, p.apellidos, u.nombre AS profesional FROM cita c JOIN paciente p ON p.id = c.paciente_id
             JOIN usuario u ON u.id = c.profesional_id WHERE c.id = ?`, [citaId]);
}
function crearNotificacion(citaId, tutorId, canal, tipo, mensaje, programadaPara) {
  return run(`INSERT INTO notificacion(cita_id, tutor_id, canal, tipo, mensaje, programada_para) VALUES (?,?,?,?,?,?)`,
    [citaId, tutorId, canal, tipo, mensaje, programadaPara]);
}
/** Criterio 5.1: recordatorios 48 h y 24 h antes, por SMS y correo electrónico. */
function programarRecordatorios(citaId) {
  const c = datosCita(citaId);
  const t = tutorPrincipal(c.paciente_id);
  if (!t) return;
  for (const [tipo, h] of [['RECORDATORIO_48H', 48], ['RECORDATORIO_24H', 24]]) {
    const cuando = sumarHoras(c.fecha_hora, -h);
    const msg = `Recordatorio: ${textoCita(c)} Responda CONFIRMAR o CANCELAR.`;
    crearNotificacion(citaId, t.id, 'SMS', tipo, msg, cuando);
    crearNotificacion(citaId, t.id, 'EMAIL', tipo, msg, cuando);
  }
}
function notificarInmediato(citaId, tipo, mensaje) {
  const c = datosCita(citaId);
  const t = tutorPrincipal(c.paciente_id);
  if (!t) return;
  crearNotificacion(citaId, t.id, t.canal_preferido === 'LLAMADA' ? 'SMS' : t.canal_preferido, tipo, mensaje, nowStr());
}
/** Anula recordatorios futuros de una cita que fue cancelada o reprogramada. */
function anularRecordatorios(citaId) {
  run(`DELETE FROM notificacion WHERE cita_id = ? AND estado IN ('PROGRAMADA','EN_COLA') AND tipo LIKE 'RECORDATORIO%'`, [citaId]);
}

/**
 * Procesa los envíos vencidos según el reloj (simulado).
 * Criterio 5.3: si el correo rebota o el SMS no se entrega, se deriva a llamada automática 3 h después.
 */
function procesarNotificaciones(silencioso = false) {
  const vencidas = q(`SELECT n.*, t.telefono, t.email FROM notificacion n JOIN tutor t ON t.id = n.tutor_id
                      WHERE n.estado = 'PROGRAMADA' AND n.programada_para <= ? ORDER BY n.programada_para`, [nowStr()]);
  let enviadas = 0, derivadas = 0, encoladas = 0;
  for (const n of vencidas) {
    if (!conexionExterna()) {
      run(`UPDATE notificacion SET estado = 'EN_COLA' WHERE id = ?`, [n.id]);
      encolar('ENVIO_NOTIFICACION', n.id, { canal: n.canal });
      encoladas++; continue;
    }
    const falla = (n.canal === 'SMS' && !n.telefono) || (n.canal === 'EMAIL' && (!n.email || n.email.startsWith('rebota')));
    if (falla) {
      run(`UPDATE notificacion SET estado = 'DERIVADA', enviada_en = ?, respuesta = ? WHERE id = ?`,
        [nowStr(), n.canal === 'EMAIL' ? 'Correo rebotado' : 'SMS no entregado', n.id]);
      const yaDerivada = q1(`SELECT id FROM notificacion WHERE cita_id IS ? AND tipo = ? AND canal = 'LLAMADA'`, [n.cita_id, n.tipo]);
      if (!yaDerivada) crearNotificacion(n.cita_id, n.tutor_id, 'LLAMADA', n.tipo, `Llamada automatizada: ${n.mensaje}`, sumarHoras(nowStr(), 3));
      derivadas++;
    } else {
      run(`UPDATE notificacion SET estado = 'ENVIADA', enviada_en = ? WHERE id = ?`, [nowStr(), n.id]);
      enviadas++;
    }
  }
  if (vencidas.length) registrarAuditoria('MODIFICACION', 'notificacion', null, `Procesamiento de envíos: ${enviadas} enviadas, ${derivadas} derivadas a llamada, ${encoladas} en cola`);
  persist();
  if (!silencioso && vencidas.length === 0) toast('No hay envíos vencidos a la hora actual del sistema.', 'info');
  return { enviadas, derivadas, encoladas };
}

/** Cancela una cita, libera la hora e invita al primer paciente en lista de espera (criterio 5.2). */
function cancelarCita(citaId, motivo, origen) {
  const c = datosCita(citaId);
  if (!c || !['AGENDADA', 'CONFIRMADA'].includes(c.estado)) throw new Error('La cita no está vigente.');
  run(`UPDATE cita SET estado = 'CANCELADA', motivo_cancelacion = ? WHERE id = ?`, [motivo || 'Sin motivo', citaId]);
  anularRecordatorios(citaId);
  notificarInmediato(citaId, 'CANCELACION', `Su hora de ${c.especialidad} del ${fechaCorta(c.fecha_hora)} fue cancelada.`);
  registrarAuditoria('MODIFICACION', 'cita', citaId, `Cita cancelada (${origen}). Motivo: ${motivo || '—'}`);
  const espera = q1(`SELECT le.*, p.nombres FROM lista_espera le JOIN paciente p ON p.id = le.paciente_id
                     WHERE le.especialidad = ? AND le.estado = 'EN_ESPERA' ORDER BY le.fecha_ingreso LIMIT 1`, [c.especialidad]);
  let invitado = null;
  if (espera) {
    run(`UPDATE lista_espera SET estado = 'INVITADO' WHERE id = ?`, [espera.id]);
    const t = tutorPrincipal(espera.paciente_id);
    if (t) crearNotificacion(null, t.id, 'SMS', 'INVITACION_LISTA_ESPERA',
      `Se liberó una hora de ${c.especialidad} el ${fechaCorta(c.fecha_hora)} para ${espera.nombres.split(' ')[0]}. Comuníquese con admisión para tomarla.`, nowStr());
    registrarAuditoria('MODIFICACION', 'lista_espera', espera.id, `Invitación automática por hora liberada (cita #${citaId})`);
    invitado = espera;
  }
  procesarNotificaciones(true);
  return invitado;
}

function reprogramarCita(citaId, nuevaFechaHora) {
  const c = datosCita(citaId);
  if (!c || !['AGENDADA', 'CONFIRMADA'].includes(c.estado)) throw new Error('La cita no está vigente.');
  if (nuevaFechaHora <= nowStr()) throw new Error('La nueva fecha debe ser futura.');
  run(`UPDATE cita SET estado = 'REPROGRAMADA' WHERE id = ?`, [citaId]);
  anularRecordatorios(citaId);
  const nueva = run(`INSERT INTO cita(paciente_id, profesional_id, especialidad, fecha_hora, estado, cita_origen_id, creada_por, creada_en)
                     VALUES (?,?,?,?, 'AGENDADA', ?, ?, ?)`, [c.paciente_id, c.profesional_id, c.especialidad, nuevaFechaHora, citaId, sesion.id, nowStr()]);
  programarRecordatorios(nueva);
  notificarInmediato(nueva, 'REPROGRAMACION', `Su hora fue reprogramada: ${textoCita(datosCita(nueva))}`);
  registrarAuditoria('MODIFICACION', 'cita', citaId, `Cita reprogramada a ${nuevaFechaHora} (nueva cita #${nueva})`);
  procesarNotificaciones(true);
  return nueva;
}

/* ===================== CIFRADO DE MENSAJES (criterio 6.3) ===================== */
let claveCifrado = null;
const ab2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b642ab = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
async function obtenerClave() {
  if (claveCifrado) return claveCifrado;
  if (!window.crypto || !crypto.subtle) return null;
  // PROPUESTA TÉCNICA: en producción la clave se administra en un KMS/HSM institucional.
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('clave-demo-HLCM-RQY1101'), 'PBKDF2', false, ['deriveKey']);
  claveCifrado = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('sal-fija-demo'), iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return claveCifrado;
}
async function cifrar(texto) {
  const k = await obtenerClave();
  if (!k) return { texto_cifrado: 'SIN_SOPORTE:' + btoa(unescape(encodeURIComponent(texto))), iv: '-' };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(texto));
  return { texto_cifrado: ab2b64(ct), iv: ab2b64(iv) };
}
async function descifrar(textoCifrado, iv) {
  if (textoCifrado.startsWith('SIN_SOPORTE:')) return decodeURIComponent(escape(atob(textoCifrado.slice(12))));
  const k = await obtenerClave();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b642ab(iv) }, k, b642ab(textoCifrado));
  return new TextDecoder().decode(pt);
}

/* ===================== ASISTENTE VIRTUAL (HU6) ===================== */
/*
 * Motor de reglas LOCAL (no envía datos a modelos de IA externos – criterio 6.3).
 * Textos de DEMOSTRACIÓN: deben ser validados por el equipo clínico del hospital.
 * Nunca entrega diagnósticos ni dosis (criterio 6.2).
 */
const normalizar = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const REGLAS_ASISTENTE = [
  { nivel: 'CRITICO', claves: ['no respira', 'no puede respirar', 'dificultad para respirar', 'le cuesta respirar', 'ahog', 'convulsion', 'convulsiona', 'inconsciente', 'no responde', 'desmay', 'labios morados', 'morado', 'sangrado abundante', 'sangra mucho', 'rigidez de nuca', 'manchas que no desaparecen', 'envenen', 'intoxic', 'trag' + 'o una pila', 'quemadura grave'],
    respuesta: 'Lo que describe puede ser un signo de alarma. Llame de inmediato al SAMU (131) o acuda al servicio de urgencia más cercano. No espere una respuesta de este chat.' },
  { nivel: 'RESTRINGIDO', claves: ['dosis', 'cuanto le doy', 'cuanta cantidad', 'que remedio', 'que medicamento', 'puedo darle', 'receta', 'recetar', 'diagnostic', 'que tiene mi hijo', 'que tiene mi hija', 'es grave lo que tiene', 'antibiotico', 'mg', 'gotas de'],
    respuesta: 'No puedo indicar diagnósticos, medicamentos ni dosis. Esa decisión corresponde exclusivamente a un profesional de salud que evalúe al paciente. Si tiene dudas sobre un tratamiento indicado, consulte al médico tratante o a la farmacia del hospital.' },
  { nivel: 'PRIORITARIO', claves: ['fiebre', 'temperatura', 'calentura', 'vomit', 'diarrea', 'no come', 'decaido', 'decaida', 'dolor de oido', 'dolor de guata', 'dolor abdominal'],
    respuesta: 'Para orientación general (texto de demostración): controle la temperatura y la hidratación, ofrezca líquidos con frecuencia y observe su estado general. Consulte en el día si el niño o niña es menor de 3 meses, si los síntomas duran más de 48 horas o si lo nota decaído. Si aparece dificultad para respirar, convulsiones o somnolencia excesiva, llame al 131.' },
  { nivel: 'INFORMATIVO', claves: ['vacuna', 'vacunacion', 'calendario'],
    respuesta: 'El calendario de vacunación vigente lo publica el Ministerio de Salud en su programa nacional de inmunizaciones. Lleve el carnet de control a cada atención; el equipo de enfermería le indicará qué vacunas corresponden según la edad.' },
  { nivel: 'INFORMATIVO', claves: ['examen', 'ayuno', 'preparacion', 'sangre', 'muestra'],
    respuesta: 'La preparación depende del examen (por ejemplo, algunos requieren ayuno). Revise la orden entregada por el médico o comuníquese con la unidad de toma de muestras. Si el examen fue solicitado en este hospital, la indicación aparece en el documento de solicitud.' },
  { nivel: 'NO_URGENTE', claves: ['tos', 'resfrio', 'mocos', 'congestion', 'estornud'],
    respuesta: 'Para síntomas respiratorios leves (texto de demostración): mantenga una buena hidratación, aseo nasal y reposo. Solicite una hora de control si los síntomas no mejoran en algunos días. Si nota que le cuesta respirar o los labios se ponen morados, llame al 131.' }
];

function responderAsistente(texto) {
  const t = normalizar(texto);
  const prioritaria = REGLAS_ASISTENTE.find(r => ['CRITICO', 'RESTRINGIDO'].includes(r.nivel) && r.claves.some(k => t.includes(k)));
  if (prioritaria) return { nivel: prioritaria.nivel, texto: prioritaria.respuesta };
  if (/(cita|hora medica|mi hora|cuando me toca|agenda)/.test(t)) {
    const citas = sesion && sesion.tutor_id ? q(`SELECT c.fecha_hora, c.especialidad, c.estado, p.nombres, u.nombre AS profesional
        FROM cita c JOIN paciente p ON p.id = c.paciente_id JOIN paciente_tutor pt ON pt.paciente_id = p.id JOIN usuario u ON u.id = c.profesional_id
        WHERE pt.tutor_id = ? AND c.estado IN ('AGENDADA','CONFIRMADA') AND c.fecha_hora >= ? ORDER BY c.fecha_hora`, [sesion.tutor_id, nowStr()]) : [];
    if (!citas.length) return { nivel: 'INFORMATIVO', texto: 'No encuentro horas vigentes para sus hijos o hijas. Puede solicitar una hora en admisión.' };
    return { nivel: 'INFORMATIVO', texto: 'Estas son las próximas horas registradas:\n' + citas.map(c => `• ${c.nombres.split(' ')[0]}: ${c.especialidad}, ${fechaCorta(c.fecha_hora)} con ${c.profesional} (${c.estado.toLowerCase()})`).join('\n') + '\nPuede confirmarlas o cancelarlas en "Mis citas".' };
  }
  for (const regla of REGLAS_ASISTENTE) {
    if (regla.claves.some(k => t.includes(k))) return { nivel: regla.nivel, texto: regla.respuesta };
  }
  if (/(hola|buenas|buenos)/.test(t)) return { nivel: 'INFORMATIVO', texto: 'Hola. Puedo orientarle sobre síntomas comunes, vacunas, preparación de exámenes y sus próximas citas. No entrego diagnósticos ni indico medicamentos.' };
  return { nivel: 'INFORMATIVO', texto: 'No tengo una orientación para esa consulta. Puede preguntarme por fiebre, tos, vacunas, preparación de exámenes o sus próximas citas. Si se trata de una urgencia, llame al 131.' };
}
