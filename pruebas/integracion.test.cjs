// SQLite/WASM real, datos ficticios y lógica de la aplicación. Sin paquetes de npm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const initSqlJs = require('../vendor/sql.js/sql-wasm.js');
const ready = initSqlJs({ wasmBinary: fs.readFileSync(path.join(root, 'vendor/sql.js/sql-wasm.wasm')) });
const storage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
};
async function entorno() {
  const intervals = [];
  const context = vm.createContext({
    console, performance, TextEncoder, TextDecoder, crypto: webcrypto,
    window: { crypto: webcrypto, addEventListener() {} },
    document: { querySelector: () => null },
    location: { hash: '#/inicio' }, localStorage: storage(), sessionStorage: storage(),
    btoa, atob, Blob, setTimeout, clearTimeout, setInterval: fn => intervals.push(fn),
    initSqlJs: async () => ready, wasmBytes: () => new Uint8Array(),
    SCHEMA_SQL: fs.readFileSync(path.join(root, 'src/schema.sql'), 'utf8'),
    realSQL: await ready
  });
  const ejecutar = code => vm.runInContext(code, context);
  for (const name of ['util.js', 'core.js', 'seed.js', 'app.js']) {
    new vm.Script(fs.readFileSync(path.join(root, 'src', name), 'utf8'), { filename: name }).runInContext(context);
  }
  ejecutar('SQL = realSQL; db = new SQL.Database(); sembrarBase(); toast = () => {};');
  return { ejecutar, context, intervals };
}
const login = (e, user) => assert.equal(e.ejecutar(`iniciarSesion(${JSON.stringify(user)}, 'demo123').ok`), true);

test('Base inicial: 24 tablas, seis roles, siete usuarios y seis pacientes', async () => {
  const e = await entorno();
  assert.equal(e.ejecutar("q1(\"SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").n"), 24);
  for (const [table, n] of [['rol', 6], ['usuario', 7], ['paciente', 6], ['permiso', 19]])
    assert.equal(e.ejecutar(`q1('SELECT COUNT(*) n FROM ${table}').n`), n);
  assert.equal(e.ejecutar("q('PRAGMA foreign_key_check').length"), 0);
});

test('Ingresan los siete perfiles de demostración', async () => {
  const e = await entorno();
  for (const user of ['dra.rojas', 'dr.fuentes', 'enf.munoz', 'adm.perez', 'aud.lagos', 'ti.vera', 'tutor.ruiz']) login(e, user);
  assert.equal(e.ejecutar('verificarCadenaAuditoria().ok'), true);
});

test('Contraseña incorrecta y bloqueo al quinto intento', async () => {
  const e = await entorno();
  for (let i = 0; i < 5; i++) assert.equal(e.ejecutar("iniciarSesion('dr.fuentes', 'incorrecta').ok"), false);
  assert.equal(e.ejecutar("q1(\"SELECT activo FROM usuario WHERE username='dr.fuentes'\").activo"), 0);
  assert.equal(e.ejecutar("iniciarSesion('dr.fuentes','demo123').ok"), false);
});

test('Permisos por rol y auditoría de acceso denegado', async () => {
  const e = await entorno(); login(e, 'enf.munoz');
  assert.equal(e.ejecutar("puede('signos.registrar')"), true);
  assert.equal(e.ejecutar("exigir('auditoria.ver')"), false);
  assert.equal(e.ejecutar("q1(\"SELECT COUNT(*) n FROM auditoria WHERE accion='ACCESO_DENEGADO'\").n"), 1);
});

test('La sesión se restaura después de recargar y se elimina al salir', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  e.ejecutar('sesion = null; restaurarSesion()');
  assert.equal(e.ejecutar('sesion.username'), 'adm.perez');
  e.ejecutar('cerrarSesion(); restaurarSesion()');
  assert.equal(e.ejecutar('sesion'), null);
});

test('RUT normalizado y dígito verificador inválido', async () => {
  const e = await entorno();
  assert.equal(e.ejecutar("normalizarRut('26.455.701-1')"), '26455701-1');
  assert.equal(e.ejecutar("normalizarRut('12.345.678-0')"), null);
});

test('Validación simulada: FONASA, cédula bloqueada y RUT desconocido', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  for (const [rut, state] of [['26455701-1', 'VALIDADO'], ['26901144-0', 'ALERTA'], ['26777888-4', 'ALERTA']])
    assert.equal((await e.ejecutar(`validarIdentidadYPrevision('${rut}')`)).estado, state);
});

test('Contingencia: validación falla sin red y la cola se sincroniza al volver', async () => {
  const e = await entorno(); login(e, 'ti.vera');
  e.ejecutar('cambiarConexion(false)');
  assert.equal((await e.ejecutar("validarIdentidadYPrevision('26455701-1')")).estado, 'ERROR');
  assert.equal((await e.ejecutar('sincronizarPendientes()')).ok, 0);
  e.ejecutar('cambiarConexion(true)');
  assert.equal((await e.ejecutar('sincronizarPendientes()')).ok, 1);
  assert.equal(e.ejecutar('pendientes()'), 0);
  assert.equal(e.ejecutar('q1("SELECT estado_validacion FROM paciente WHERE id=5").estado_validacion'), 'VALIDADO');
});

test('Consulta a la Red Pública devuelve un Bundle simulado', async () => {
  const e = await entorno(); login(e, 'dra.rojas');
  const result = await e.ejecutar("consultarRedPublica('24611345-9')");
  assert.equal(result.ok, true);
  assert.equal(result.bundle.resourceType, 'Bundle');
  assert.equal(result.registros.length, 2);
});

test('Auditoría: cadena íntegra, UPDATE y DELETE bloqueados por SQLite', async () => {
  const e = await entorno(); login(e, 'aud.lagos');
  assert.equal(e.ejecutar('verificarCadenaAuditoria().ok'), true);
  assert.throws(() => e.ejecutar("db.run(\"UPDATE auditoria SET detalle='alterado'\")"), /inalterable/i);
  assert.throws(() => e.ejecutar("db.run('DELETE FROM auditoria')"), /no se pueden eliminar/i);
});

test('Una atención firmada no puede volver a borrador', async () => {
  const e = await entorno();
  assert.throws(() => e.ejecutar("db.run(\"UPDATE atencion SET estado='BORRADOR' WHERE id=1\")"), /firmada/i);
});

test('SQLite rechaza signos vitales fuera de rango y claves foráneas inválidas', async () => {
  const e = await entorno();
  assert.throws(() => e.ejecutar("db.run('UPDATE signo_vital SET peso_kg=500 WHERE id=1')"), /CHECK/);
  assert.throws(() => e.ejecutar("db.run('UPDATE cita SET paciente_id=9999 WHERE id=1')"), /FOREIGN KEY/);
});

test('Persistencia: cambios confirmados sobreviven al exportar y abrir SQLite', async () => {
  const e = await entorno();
  e.ejecutar("tx(() => run(\"UPDATE paciente SET antecedentes='Cambio de demostración' WHERE id=1\")); db.close(); db = new SQL.Database(loadPersisted()); db.run('PRAGMA foreign_keys=ON')");
  assert.equal(e.ejecutar('q1("SELECT antecedentes FROM paciente WHERE id=1").antecedentes'), 'Cambio de demostración');
  assert.equal(e.ejecutar('verificarCadenaAuditoria().ok'), true);
});

test('Una transacción fallida revierte memoria y respaldo local', async () => {
  const e = await entorno();
  assert.throws(() => e.ejecutar("tx(() => { run(\"UPDATE paciente SET nombres='No guardar' WHERE id=1\"); throw new Error('Fallo simulado'); })"), /Fallo simulado/);
  assert.equal(e.ejecutar('q1("SELECT nombres FROM paciente WHERE id=1").nombres'), 'Tomás Andrés');
  e.ejecutar("db = new SQL.Database(loadPersisted())");
  assert.equal(e.ejecutar('q1("SELECT nombres FROM paciente WHERE id=1").nombres'), 'Tomás Andrés');
});

test('Citas: cuatro recordatorios por cita y ningún solapamiento profesional', async () => {
  const e = await entorno();
  assert.equal(e.ejecutar('q1("SELECT COUNT(*) n FROM notificacion WHERE cita_id=1").n'), 4);
  assert.throws(() => e.ejecutar("run(\"INSERT INTO cita(paciente_id,profesional_id,especialidad,fecha_hora,creada_en) SELECT 2,profesional_id,especialidad,fecha_hora,creada_en FROM cita WHERE id=1\")"), /UNIQUE/);
});

test('Cancelar una cita libera la hora e invita a la lista de espera', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  assert.ok(e.ejecutar("tx(() => cancelarCita(4,'Imprevisto','prueba'))"));
  assert.equal(e.ejecutar('datosCita(4).estado'), 'CANCELADA');
  assert.equal(e.ejecutar("q1(\"SELECT COUNT(*) n FROM lista_espera WHERE estado='INVITADO'\").n"), 1);
});

test('Reprogramar una cita crea su sucesora y reemplaza los recordatorios', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  const id = e.ejecutar('tx(() => reprogramarCita(1, sumarHoras(datosCita(1).fecha_hora, 168)))');
  assert.equal(e.ejecutar('datosCita(1).estado'), 'REPROGRAMADA');
  assert.equal(e.ejecutar(`datosCita(${id}).cita_origen_id`), 1);
  assert.equal(e.ejecutar(`q1("SELECT COUNT(*) n FROM notificacion WHERE cita_id=${id}").n`), 5);
});

test('Reprogramar en un horario ocupado no modifica la cita original', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  assert.throws(() => e.ejecutar('tx(() => reprogramarCita(1,datosCita(2).fecha_hora))'), /UNIQUE/);
  assert.equal(e.ejecutar('datosCita(1).estado'), 'AGENDADA');
  assert.equal(e.ejecutar('q1("SELECT COUNT(*) n FROM notificacion WHERE cita_id=1").n'), 4);
});

test('Recordatorio con correo rebotado deriva a llamada tres horas después', async () => {
  const e = await entorno(); login(e, 'adm.perez');
  e.ejecutar("run(\"UPDATE tutor SET email='rebota@example.test' WHERE id=1\"); run(\"UPDATE notificacion SET programada_para=? WHERE cita_id=1\",[nowStr()]); procesarNotificaciones(true)");
  assert.ok(e.ejecutar("q1(\"SELECT COUNT(*) n FROM notificacion WHERE canal='LLAMADA'\").n") > 0);
  e.ejecutar("setParam('reloj_offset_h', 3); procesarNotificaciones(true)");
  assert.ok(e.ejecutar("q1(\"SELECT COUNT(*) n FROM notificacion WHERE canal='LLAMADA' AND estado='ENVIADA'\").n") > 0);
});

test('Generar informe de alta con identificación y diagnóstico del paciente', async () => {
  const e = await entorno(); login(e, 'dra.rojas');
  const html = e.ejecutar("construirReporte('INFORME_ALTA', 4, 4)");
  for (const text of ['Informe de alta', 'Agustina', 'A09', 'Indicaciones al alta']) assert.ok(html.includes(text), text);
});

test('Asistente: fiebre, dosis, citas y síntoma crítico de la guía', async () => {
  const e = await entorno(); login(e, 'tutor.ruiz');
  for (const [text, level] of [['Tiene fiebre', 'PRIORITARIO'], ['Qué dosis le doy', 'RESTRINGIDO'], ['No puede respirar', 'CRITICO'], ['Tiene cita mañana y no puede respirar', 'CRITICO']])
    assert.equal(e.ejecutar(`responderAsistente(${JSON.stringify(text)}).nivel`), level);
  assert.match(e.ejecutar("responderAsistente('¿Cuándo es mi próxima cita?').texto"), /próximas horas/);
});

test('Chat: AES-GCM cifra y recupera texto con tildes', async () => {
  const e = await entorno();
  const result = await e.ejecutar("cifrar('Mi hija tiene fiebre y tos, ¿qué hago?')");
  assert.ok(!result.texto_cifrado.includes('fiebre'));
  e.context.cipher = result;
  assert.equal(await e.ejecutar('descifrar(cipher.texto_cifrado, cipher.iv)'), 'Mi hija tiene fiebre y tos, ¿qué hago?');
});

test('La sincronización de fondo conserva el formulario abierto', async () => {
  const e = await entorno();
  e.ejecutar('let renders = 0; render = () => { renders++; };');
  await e.ejecutar('iniciarApp()');
  assert.equal(e.ejecutar('renders'), 1);
  await e.intervals[0]();
  assert.equal(e.ejecutar('renders'), 1);
  assert.equal(e.ejecutar('pendientes()'), 0);
});

// Simula solo los elementos del formulario para probar sus controladores reales.
async function formulario() {
  const e = await entorno(); login(e, 'adm.perez');
  e.ejecutar(`
    const campos = Object.fromEntries(['rut','nombres','apellidos','fecha_nacimiento','sexo','alergias','antecedentes','t_rut','t_nombres','t_apellidos','t_telefono','t_email','t_canal','parentesco'].map(k => [k, {value:''}]));
    Object.assign(campos.rut,{value:'26455701-1'});
    const caja = { innerHTML:'', textContent:'' };
    const errorPaciente = { textContent:'' };
    const validarBoton = {};
    const form = Object.assign({querySelector:s => campos.t_rut}, campos);
    const modal = {isConnected:true, querySelector:s => ({'#f-pac':form, '#res-val':caja, '#pac-err':errorPaciente, '#btn-validar':validarBoton}[s])};
    abrirModal = (titulo, html, montar) => montar(modal);
    modalNuevoPaciente();
  `);
  return e;
}

test('Cambiar el RUT descarta una validación anterior', async () => {
  const e = await formulario();
  await e.ejecutar('validarBoton.onclick()');
  assert.match(e.ejecutar('caja.innerHTML'), /validadas/);
  e.ejecutar("form.rut.value='26901144-0'; form.rut.oninput()");
  assert.equal(e.ejecutar('caja.textContent'), '');
  await e.ejecutar('validarBoton.onclick()');
  assert.match(e.ejecutar('caja.innerHTML'), /BLOQUEADO/);
});

test('Una respuesta tardía de otro RUT no autocompleta el paciente actual', async () => {
  const e = await formulario();
  e.ejecutar('let resolver; validarIdentidadYPrevision = () => new Promise(r => {resolver=r}); const consulta = validarBoton.onclick();');
  e.ejecutar("form.rut.value='26901144-0'; form.rut.oninput(); resolver({estado:'VALIDADO',ms:5,identidad:{nombres:'NO COPIAR'}})");
  await e.ejecutar('consulta');
  assert.equal(e.ejecutar('form.nombres.value'), '');
});
