/* =====================================================================
 * app.js – Interfaz de usuario: enrutador, menú por rol y vistas
 * ===================================================================== */
'use strict';

/* ---------- Menú: cada opción declara el permiso que exige ---------- */
const MENU = [
  { ruta: 'inicio', texto: 'Inicio', icono: '⌂', permiso: null },
  { ruta: 'pacientes', texto: 'Pacientes', icono: '👤', permiso: 'paciente.ver' },
  { ruta: 'citas', texto: 'Agenda y citas', icono: '📅', permiso: 'cita.ver' },
  { ruta: 'notificaciones', texto: 'Recordatorios', icono: '✉', permiso: 'notificacion.gestionar' },
  { ruta: 'reportes', texto: 'Reportes', icono: '📄', permiso: 'reporte.generar' },
  { ruta: 'portal', texto: 'Mis citas', icono: '📅', permiso: 'portal.tutor' },
  { ruta: 'asistente', texto: 'Asistente virtual', icono: '💬', permiso: 'asistente.usar' },
  { ruta: 'auditoria', texto: 'Auditoría', icono: '🛡', permiso: 'auditoria.ver' },
  { ruta: 'seguridad', texto: 'Usuarios y roles', icono: '🔑', permiso: 'seguridad.ver' },
  { ruta: 'contingencia', texto: 'Contingencia', icono: '⚡', permiso: 'contingencia.gestionar' },
  { ruta: 'sql', texto: 'Consultas SQL', icono: '⌕', permiso: 'sql.consultar' }
];
const RUTAS_PERMISO = { pacientes: 'paciente.ver', paciente: 'paciente.ver', ficha: 'ficha.ver', citas: 'cita.ver', notificaciones: 'notificacion.gestionar',
  reportes: 'reporte.generar', portal: 'portal.tutor', asistente: 'asistente.usar', auditoria: 'auditoria.ver', seguridad: 'seguridad.ver',
  contingencia: 'contingencia.gestionar', sql: 'sql.consultar' };

function ir(ruta) { location.hash = '#/' + ruta; }

/* ---------- Arranque ---------- */
async function iniciarApp() {
  SQL = await initSqlJs({ wasmBinary: wasmBytes() });
  const guardada = loadPersisted();
  if (guardada) {
    try { db = new SQL.Database(guardada); db.run('PRAGMA foreign_keys = ON'); q1('SELECT COUNT(*) FROM auditoria'); }
    catch (e) { db = null; }
  }
  if (!db) { db = new SQL.Database(); db.run('PRAGMA foreign_keys = ON'); sembrarBase(); }
  restaurarSesion();
  window.addEventListener('hashchange', render);
  render();
  // Reintento automático en segundo plano de operaciones pendientes (criterio 1.3 / HU9)
  setInterval(async () => {
    if (db && conexionExterna() && pendientes() > 0) {
      const r = await sincronizarPendientes(true);
      if (r.ok) {
        toast(`Sincronización automática: ${r.ok} operación(es) recuperada(s).`, 'ok');
        const contador = $('#sync-pendientes');
        if (contador) {
          contador.textContent = `⟳ ${pendientes()} pendiente(s)`;
          contador.className = `chip ${pendientes() ? 'chip-warn' : 'chip-neutral'}`;
        }
        // No interrumpir formularios ni conversaciones abiertas.
        if (location.hash === '#/contingencia' && !$('#modal')) render();
      }
    }
  }, 8000);
}

function reiniciarBase() {
  try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem('fep_sesion'); } catch (_) {}
  db = new SQL.Database(); db.run('PRAGMA foreign_keys = ON'); sembrarBase();
  sesion = null;
  toast('Base de demostración restablecida.', 'ok');
  ir('login'); render();
}

/* ---------- Render principal ---------- */
function render() {
  cerrarModal();
  const [ruta, ...args] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  if (!sesion) return vistaLogin();
  if (ruta === 'login') return ir('inicio');
  const permiso = RUTAS_PERMISO[ruta];
  pintarLayout(ruta);
  const main = $('#main');
  if (permiso && !puede(permiso)) {
    auditar('ACCESO_DENEGADO', 'vista', ruta, `Intento de abrir la vista "${ruta}" sin permiso ${permiso}`);
    main.innerHTML = `<div class="card denied"><h2>Acceso denegado</h2><p>Su rol <b>${esc(sesion.rolNombre)}</b> no tiene el permiso <code>${permiso}</code>. El intento quedó registrado en la auditoría.</p>
      <button class="btn" onclick="ir('inicio')">Volver al inicio</button></div>`;
    return;
  }
  const vistas = { inicio: vistaInicio, pacientes: vistaPacientes, paciente: vistaPaciente, ficha: vistaFicha, citas: vistaCitas,
    notificaciones: vistaNotificaciones, reportes: vistaReportes, portal: vistaPortal, asistente: vistaAsistente,
    auditoria: vistaAuditoria, seguridad: vistaSeguridad, contingencia: vistaContingencia, sql: vistaSQL };
  (vistas[ruta] || vistaInicio)(main, ...args);
  main.focus({ preventScroll: true });
}

function pintarLayout(rutaActiva) {
  const online = conexionExterna();
  const pend = pendientes();
  const offset = relojOffsetHoras();
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand"><span class="logo">+</span><div><b>Ficha Electrónica Pediátrica</b><small>Hospital Dr. Luis Calvo Mackenna · Prototipo académico</small></div></div>
      <div class="top-r">
        ${offset ? `<span class="chip chip-warn" title="Reloj adelantado para la demostración">Reloj simulado: ${fechaCorta(nowStr())}</span>` : ''}
        <span class="chip ${online ? 'chip-ok' : 'chip-danger'}" title="Estado de los servicios externos">${online ? '● Servicios externos en línea' : '● Modo contingencia'}</span>
        <span id="sync-pendientes" class="chip ${pend ? 'chip-warn' : 'chip-neutral'}" title="Operaciones en cola de sincronización">⟳ ${pend} pendiente(s)</span>
        <div class="user"><b>${esc(sesion.nombre)}</b><small>${esc(sesion.rolNombre)}</small></div>
        <button class="btn btn-ghost" id="btn-salir">Cerrar sesión</button>
      </div>
    </header>
    ${online ? '' : `<div class="banner-cont" role="alert"><b>Modo contingencia activo.</b> Los servicios externos (FONASA, ISAPRE, Registro Civil, Red Pública y mensajería) no responden. La atención continúa: los datos se guardan localmente y las operaciones externas quedan en cola para sincronizarse al volver la conexión.</div>`}
    <div class="shell">
      <nav class="side" aria-label="Menú principal">
        ${MENU.filter(m => !m.permiso || puede(m.permiso)).map(m => `<a href="#/${m.ruta}" class="${m.ruta === rutaActiva || (rutaActiva === 'paciente' || rutaActiva === 'ficha') && m.ruta === 'pacientes' ? 'act' : ''}"><span>${m.icono}</span>${m.texto}</a>`).join('')}
        <div class="side-foot">Datos 100% ficticios.<br>Integraciones simuladas.</div>
      </nav>
      <main id="main" tabindex="-1"></main>
    </div>`;
  $('#btn-salir').onclick = () => { cerrarSesion(); ir('login'); render(); };
}

/* ============================ LOGIN ============================ */
function vistaLogin() {
  const demo = USUARIOS_DEMO.map(([u, n, rol]) => `<tr><td><button class="link" data-u="${u}">${u}</button></td><td>${esc(n)}</td><td>${ROLES.find(r => r[1] === rol)[2]}</td></tr>`).join('');
  $('#app').innerHTML = `
  <div class="login-wrap">
    <section class="login card">
      <div class="brand big"><span class="logo">+</span><div><b>Ficha Electrónica Pediátrica</b><small>Hospital Dr. Luis Calvo Mackenna</small></div></div>
      <form id="f-login" autocomplete="off">
        <label>Usuario<input name="username" required autocomplete="username"></label>
        <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
        <p class="err" id="login-err" role="alert"></p>
        <button class="btn btn-primary full">Ingresar</button>
      </form>
      <p class="muted small">Prototipo académico RQY1101 – Duoc UC. No contiene datos reales de pacientes. Las conexiones con FONASA, ISAPRE, Registro Civil y Red Pública son <b>simuladas</b>.</p>
    </section>
    <section class="card demo-users">
      <h3>Usuarios de demostración</h3>
      <p class="small">Contraseña para todos: <code>${PASSWORD_DEMO}</code>. Haga clic en un usuario para completar el formulario.</p>
      <div class="scroll"><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre (ficticio)</th><th>Rol</th></tr></thead><tbody>${demo}</tbody></table></div>
      <p class="muted small">Los cambios se guardan en este navegador. Cada equipo mantiene su propia demostración.</p>
      <button class="btn btn-ghost small" id="btn-reset">Restablecer base de demostración</button>
    </section>
  </div>`;
  $$('[data-u]').forEach(b => b.onclick = () => { $('[name=username]').value = b.dataset.u; $('[name=password]').value = PASSWORD_DEMO; $('[name=password]').focus(); });
  $('#btn-reset').onclick = () => abrirModal('Restablecer base de demostración', `<p>Se borrarán todos los cambios y se volverá a los datos iniciales. La auditoría también se reinicia.</p>
    <div class="foot"><button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-danger" id="btn-reset-ok">Restablecer</button></div>`, root => { $('#btn-reset-ok', root).onclick = reiniciarBase; });
  $('#f-login').onsubmit = e => {
    e.preventDefault();
    const d = datosForm(e.target);
    const r = iniciarSesion(d.username, d.password);
    if (!r.ok) { $('#login-err').textContent = r.msg; return; }
    location.hash = sesion.rol === 'TUTOR' ? '#/portal' : '#/inicio';
    render();
  };
}

/* ============================ INICIO ============================ */
const GUIA_DEMO = [
  ['HU7 Control de acceso', 'Ingrese como enf.munoz e intente abrir #/auditoria: se deniega y queda registrado.'],
  ['HU1 Validación externa', 'adm.perez → Pacientes → Registrar → RUT 26455701-1 (válido), 26901144-0 (cédula bloqueada) o 26777888-4 (no existe).'],
  ['HU2 Historial clínico', 'dra.rojas → Pacientes → Tomás González → Ficha → Nueva atención con constantes vitales → Firmar.'],
  ['HU3 Red pública', 'dra.rojas → Ficha de Tomás → "Consultar Red Pública" → importar antecedente.'],
  ['HU4 Reportes', 'dra.rojas → Reportes → Informe de alta de Agustina Morales → Imprimir/Guardar PDF.'],
  ['HU5 Citas', 'adm.perez → Agenda → cancelar una cita de Pediatría: se invita a la lista de espera. Recordatorios → Procesar envíos.'],
  ['HU6 Asistente', 'tutor.ruiz → Asistente: "tiene fiebre", "¿qué dosis le doy?", "no puede respirar".'],
  ['HU8 Auditoría', 'aud.lagos → Auditoría → Verificar integridad → Probar inmutabilidad.'],
  ['HU9 Contingencia', 'ti.vera → Contingencia → Simular caída → (adm.perez registra paciente: queda PROVISORIO) → ti.vera restablece y sincroniza.']
];
function vistaInicio(main) {
  const c = s => q1(s).n;
  const tarjetas = [];
  if (puede('paciente.ver')) tarjetas.push(['Pacientes registrados', c('SELECT COUNT(*) n FROM paciente'), 'pacientes'],
    ['Con validación pendiente o alerta', c(`SELECT COUNT(*) n FROM paciente WHERE estado_validacion <> 'VALIDADO'`), 'pacientes']);
  if (puede('cita.ver')) tarjetas.push(['Citas vigentes próximas', q1(`SELECT COUNT(*) n FROM cita WHERE estado IN ('AGENDADA','CONFIRMADA') AND fecha_hora >= ?`, [nowStr()]).n, 'citas']);
  if (puede('ficha.ver')) tarjetas.push(['Atenciones en borrador', c(`SELECT COUNT(*) n FROM atencion WHERE estado = 'BORRADOR'`), 'pacientes'],
    ['Exámenes sin resultado', c(`SELECT COUNT(*) n FROM examen WHERE estado = 'SOLICITADO'`), 'pacientes']);
  if (puede('auditoria.ver')) tarjetas.push(['Registros de auditoría', c('SELECT COUNT(*) n FROM auditoria'), 'auditoria'],
    ['Accesos denegados', c(`SELECT COUNT(*) n FROM auditoria WHERE accion = 'ACCESO_DENEGADO'`), 'auditoria']);
  if (puede('contingencia.gestionar')) tarjetas.push(['Operaciones pendientes', pendientes(), 'contingencia'],
    ['Operaciones con error', c(`SELECT COUNT(*) n FROM operacion_pendiente WHERE estado = 'ERROR'`), 'contingencia']);
  main.innerHTML = `
    <h1>Hola, ${esc(sesion.nombre.split(' ').slice(0, 2).join(' '))}</h1>
    <p class="muted">Rol: ${esc(sesion.rolNombre)} · Fecha del sistema: ${fechaCorta(nowStr())}</p>
    <div class="kpis">${tarjetas.map(([t, n, r]) => `<a class="kpi" href="#/${r}"><span>${n}</span>${t}</a>`).join('')}</div>
    <section class="card"><h2>Permisos de su rol</h2><div class="perm-list">${[...sesion.permisos].map(p => `<code>${p}</code>`).join(' ')}</div></section>
    <section class="card"><h2>Guía de demostración por historia de usuario</h2>
      <table class="tbl"><thead><tr><th>Historia</th><th>Secuencia para demostrar</th></tr></thead>
      <tbody>${GUIA_DEMO.map(([h, s]) => `<tr><td><b>${h}</b></td><td>${esc(s)}</td></tr>`).join('')}</tbody></table></section>`;
}

/* ============================ PACIENTES (HU1, HU2) ============================ */
function vistaPacientes(main) {
  main.innerHTML = `
    <div class="head-row"><h1>Pacientes</h1>${puede('paciente.crear') ? '<button class="btn btn-primary" id="btn-nuevo">+ Registrar paciente</button>' : ''}</div>
    <div class="card"><input id="buscar" class="search" placeholder="Buscar por RUT, nombre o apellido" aria-label="Buscar paciente"><div id="lista"></div></div>`;
  const pintar = () => {
    const f = '%' + $('#buscar').value.trim() + '%';
    const filas = q(`SELECT p.*, ip.nombre AS prevision, f.numero_ficha FROM paciente p LEFT JOIN institucion_prevision ip ON ip.id = p.prevision_id
                     LEFT JOIN ficha_clinica f ON f.paciente_id = p.id
                     WHERE p.rut LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ? ORDER BY p.apellidos`, [f, f, f]);
    $('#lista').innerHTML = filas.length ? `<table class="tbl"><thead><tr><th>RUT</th><th>Paciente</th><th>Edad</th><th>Previsión</th><th>Validación</th><th>N° ficha</th><th></th></tr></thead><tbody>
      ${filas.map(p => `<tr><td>${p.rut}</td><td>${esc(p.nombres)} ${esc(p.apellidos)}</td><td>${edad(p.fecha_nacimiento).texto}</td>
        <td>${esc(p.prevision || '—')}${p.tramo_fonasa ? ' ' + p.tramo_fonasa : ''}</td><td>${badgeEstado(p.estado_validacion)}</td><td>${p.numero_ficha || '—'}</td>
        <td class="acts"><a class="btn btn-sm" href="#/paciente/${p.id}">Datos</a>${puede('ficha.ver') ? `<a class="btn btn-sm btn-primary" href="#/ficha/${p.id}">Ficha</a>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Sin resultados.</p>';
  };
  $('#buscar').oninput = pintar;
  pintar();
  if ($('#btn-nuevo')) $('#btn-nuevo').onclick = modalNuevoPaciente;
}

function modalNuevoPaciente() {
  if (!exigir('paciente.crear', 'paciente')) return;
  let validacion = null;
  let intentoValidacion = 0;
  abrirModal('Registrar paciente pediátrico', `
    <form id="f-pac" novalidate>
      <fieldset><legend>1. Identificación y validación externa (HU1)</legend>
        <div class="row"><label>RUT del paciente<input name="rut" required placeholder="12345678-9"></label>
          <button type="button" class="btn" id="btn-validar">Validar con Registro Civil y previsión</button></div>
        <div id="res-val" aria-live="polite"></div>
        <p class="muted small">RUT de prueba: 26455701-1 (FONASA), 27650332-4 (ISAPRE), 26901144-0 (cédula bloqueada), 26777888-4 (no existe).</p>
      </fieldset>
      <fieldset><legend>2. Datos del paciente</legend>
        <div class="grid2"><label>Nombres<input name="nombres" required></label><label>Apellidos<input name="apellidos" required></label>
        <label>Fecha de nacimiento<input name="fecha_nacimiento" type="date" required></label>
        <label>Sexo<select name="sexo"><option value="F">Femenino</option><option value="M">Masculino</option><option value="I">Indeterminado</option></select></label>
        <label>Alergias<input name="alergias"></label><label>Antecedentes<input name="antecedentes"></label></div>
      </fieldset>
      <fieldset><legend>3. Tutor legal</legend>
        <div class="grid2"><label>RUT tutor<input name="t_rut" required></label><label>Parentesco<select name="parentesco"><option>Madre</option><option>Padre</option><option>Abuelo/a</option><option>Tutor/a legal</option></select></label>
        <label>Nombres<input name="t_nombres" required></label><label>Apellidos<input name="t_apellidos" required></label>
        <label>Teléfono<input name="t_telefono" placeholder="+56 9 ..."></label><label>Correo<input name="t_email" type="email"></label>
        <label>Canal preferido<select name="t_canal"><option>SMS</option><option>EMAIL</option><option>LLAMADA</option></select></label></div>
      </fieldset>
      <p class="err" id="pac-err" role="alert"></p>
      <div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar paciente</button></div>
    </form>`, root => {
    const f = $('#f-pac', root);
    f.rut.oninput = () => {
      validacion = null;
      intentoValidacion++;
      $('#res-val', root).textContent = '';
    };
    $('[name=t_rut]', f).onblur = () => {
      const r = normalizarRut(f.t_rut.value);
      const t = r && q1('SELECT * FROM tutor WHERE rut = ?', [r]);
      if (t) { f.t_nombres.value = t.nombres; f.t_apellidos.value = t.apellidos; f.t_telefono.value = t.telefono || ''; f.t_email.value = t.email || ''; f.t_canal.value = t.canal_preferido; toast('Tutor existente: se asociará el registro actual.', 'info'); }
    };
    $('#btn-validar', root).onclick = async () => {
      const intento = ++intentoValidacion;
      validacion = null;
      const rut = normalizarRut(f.rut.value);
      const box = $('#res-val', root);
      if (!rut) { box.innerHTML = '<p class="err">RUT inválido (dígito verificador incorrecto).</p>'; return; }
      if (q1('SELECT id FROM paciente WHERE rut = ?', [rut])) { box.innerHTML = '<p class="err">El paciente ya está registrado.</p>'; return; }
      f.rut.value = rut;
      box.innerHTML = '<p class="muted">Consultando servicios externos (simulados)…</p>';
      const resultado = await validarIdentidadYPrevision(rut);
      persist();
      if (intento !== intentoValidacion || normalizarRut(f.rut.value) !== rut || !root.isConnected) return;
      validacion = { ...resultado, rut };
      const ms = Math.round(validacion.ms);
      const tiempo = `<span class="${ms < 1500 ? 'ok-t' : 'err'}">${ms} ms ${ms < 1500 ? '(cumple < 1,5 s)' : '(excede 1,5 s)'}</span>`;
      if (validacion.estado === 'ERROR') {
        box.innerHTML = `<div class="alert alert-warn"><b>Sin conexión con servicios externos.</b> Puede continuar: el paciente quedará en estado <b>PROVISORIO</b> y la validación se reintentará automáticamente. ${tiempo}</div>`;
        return;
      }
      if (validacion.identidad) {
        const id = validacion.identidad;
        f.nombres.value = id.nombres; f.apellidos.value = id.apellidos; f.fecha_nacimiento.value = id.fecha_nacimiento; f.sexo.value = id.sexo;
      }
      const pv = validacion.prevision;
      const txtPrev = !pv ? '—' : pv.tipo === 'FONASA' ? `FONASA tramo ${pv.tramo}` : pv.tipo === 'ISAPRE' ? pv.nombre : 'Sin previsión vigente';
      box.innerHTML = `<div class="alert ${validacion.estado === 'VALIDADO' ? 'alert-ok' : 'alert-danger'}"><b>${validacion.estado === 'VALIDADO' ? '✔' : '⚠'} ${esc(validacion.mensaje)}</b><br>
        Registro Civil: ${validacion.identidad ? esc(validacion.identidad.estado) : 'no encontrado'} · Previsión: ${esc(txtPrev)} · Tiempo: ${tiempo}</div>`;
    };
    f.onsubmit = e => {
      e.preventDefault();
      const d = datosForm(f);
      const err = $('#pac-err', root);
      const rut = normalizarRut(d.rut), tRut = normalizarRut(d.t_rut);
      if (!rut) return err.textContent = 'RUT del paciente inválido.';
      if (!tRut) return err.textContent = 'RUT del tutor inválido.';
      if (!d.nombres || !d.apellidos || !d.fecha_nacimiento || !d.t_nombres || !d.t_apellidos) return err.textContent = 'Complete los campos obligatorios.';
      if (d.fecha_nacimiento > nowStr().slice(0, 10)) return err.textContent = 'La fecha de nacimiento no puede ser futura.';
      if (edad(d.fecha_nacimiento).anios >= 18) return err.textContent = 'El hospital es pediátrico: el paciente debe ser menor de 18 años.';
      if (!d.t_telefono && !d.t_email) return err.textContent = 'Ingrese al menos un medio de contacto del tutor (teléfono o correo).';
      if (d.t_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.t_email)) return err.textContent = 'Correo del tutor inválido.';
      if (q1('SELECT id FROM paciente WHERE rut = ?', [rut])) return err.textContent = 'El paciente ya está registrado.';
      // Sin validación o validación fallida por conexión → PROVISORIO y a la cola (criterio 1.3)
      let estado = 'PROVISORIO', prevId = null, tramo = null;
      if (validacion && validacion.estado !== 'ERROR' && validacion.rut === rut) {
        estado = validacion.estado; prevId = previsionId(validacion.prevision); tramo = validacion.prevision && validacion.prevision.tramo || null;
      }
      try {
        const pid = tx(() => {
          const id = run(`INSERT INTO paciente(rut, nombres, apellidos, fecha_nacimiento, sexo, prevision_id, tramo_fonasa, estado_validacion, alergias, antecedentes, creado_en)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [rut, d.nombres, d.apellidos, d.fecha_nacimiento, d.sexo, prevId, tramo, estado, d.alergias, d.antecedentes, nowStr()]);
          let t = q1('SELECT id FROM tutor WHERE rut = ?', [tRut]);
          const tid = t ? t.id : run(`INSERT INTO tutor(rut, nombres, apellidos, telefono, email, canal_preferido) VALUES (?,?,?,?,?,?)`,
            [tRut, d.t_nombres, d.t_apellidos, d.t_telefono, d.t_email, d.t_canal]);
          run('INSERT INTO paciente_tutor VALUES (?,?,?,1)', [id, tid, d.parentesco]);
          const n = q1('SELECT COUNT(*) AS n FROM ficha_clinica').n;
          run('INSERT INTO ficha_clinica(paciente_id, numero_ficha, fecha_apertura) VALUES (?,?,?)', [id, 'FC-' + (100230 + n), nowStr().slice(0, 10)]);
          if (estado === 'PROVISORIO') encolar('VALIDACION_PREVISIONAL', rut, { motivo: 'Registro sin validación externa' });
          registrarAuditoria('CREACION', 'paciente', id, `Registro de paciente ${rut} con estado ${estado}`);
          return id;
        });
        toast(estado === 'PROVISORIO' ? 'Paciente registrado en modo PROVISORIO; la validación queda en cola.' : 'Paciente registrado.', estado === 'VALIDADO' ? 'ok' : 'warn');
        ir('paciente/' + pid);
      } catch (ex) { err.textContent = 'No se pudo guardar: ' + ex.message; }
    };
  }, 'modal-lg');
}

function vistaPaciente(main, id) {
  const p = q1(`SELECT p.*, ip.nombre AS prevision, f.numero_ficha, f.grupo_sanguineo FROM paciente p LEFT JOIN institucion_prevision ip ON ip.id = p.prevision_id
                LEFT JOIN ficha_clinica f ON f.paciente_id = p.id WHERE p.id = ?`, [id]);
  if (!p) { main.innerHTML = '<p>Paciente no encontrado.</p>'; return; }
  auditar('CONSULTA', 'paciente', p.id, `Consulta de datos del paciente ${p.rut}`);
  const tutores = q(`SELECT t.*, pt.parentesco, pt.es_principal FROM tutor t JOIN paciente_tutor pt ON pt.tutor_id = t.id WHERE pt.paciente_id = ?`, [id]);
  const vals = q(`SELECT * FROM validacion_externa WHERE paciente_rut = ? ORDER BY id DESC LIMIT 6`, [p.rut]);
  const citas = q(`SELECT c.*, u.nombre AS prof FROM cita c JOIN usuario u ON u.id = c.profesional_id WHERE paciente_id = ? ORDER BY fecha_hora DESC LIMIT 6`, [id]);
  main.innerHTML = `
    <div class="head-row"><div><a href="#/pacientes" class="muted">← Pacientes</a><h1>${esc(p.nombres)} ${esc(p.apellidos)}</h1></div>
      <div class="acts">${puede('ficha.ver') ? `<a class="btn btn-primary" href="#/ficha/${p.id}">Abrir ficha clínica</a>` : ''}
      ${puede('validacion.ejecutar') ? '<button class="btn" id="btn-reval">Revalidar previsión</button>' : ''}
      ${puede('paciente.editar') ? '<button class="btn" id="btn-edit">Actualizar antecedentes</button>' : ''}</div></div>
    ${p.estado_validacion === 'ALERTA' ? '<div class="alert alert-danger">⚠ Paciente con alerta de identidad o previsión. La atención de urgencia no se bloquea (criterio 1.2).</div>' : ''}
    ${p.estado_validacion === 'PROVISORIO' ? '<div class="alert alert-warn">Registro PROVISORIO: la validación externa está en cola y se reintentará automáticamente (criterio 1.3).</div>' : ''}
    <div class="grid2">
      <section class="card"><h2>Identificación</h2><dl class="dl">
        <dt>RUT</dt><dd>${p.rut}</dd><dt>Nacimiento</dt><dd>${fechaCorta(p.fecha_nacimiento)} (${edad(p.fecha_nacimiento).texto})</dd>
        <dt>Sexo</dt><dd>${{ F: 'Femenino', M: 'Masculino', I: 'Indeterminado' }[p.sexo]}</dd>
        <dt>Previsión</dt><dd>${esc(p.prevision || '—')} ${p.tramo_fonasa ? 'tramo ' + p.tramo_fonasa : ''}</dd>
        <dt>Validación</dt><dd>${badgeEstado(p.estado_validacion)}</dd><dt>N° ficha</dt><dd>${p.numero_ficha}</dd>
        <dt>Grupo sanguíneo</dt><dd>${esc(p.grupo_sanguineo || '—')}</dd>
        <dt>Alergias</dt><dd>${esc(p.alergias || 'No registra')}</dd><dt>Antecedentes</dt><dd>${esc(p.antecedentes || 'No registra')}</dd></dl></section>
      <section class="card"><div class="head-row"><h2>Tutores legales</h2>${puede('paciente.editar') ? '<button class="btn btn-sm" id="btn-tutor">+ Asociar tutor</button>' : ''}</div>
        ${tutores.map(t => `<div class="tutor"><b>${esc(t.nombres)} ${esc(t.apellidos)}</b> ${t.es_principal ? badge('Principal', 'info') : ''}<br>
          <span class="muted">${t.rut} · ${esc(t.parentesco)} · ${esc(t.telefono || 'sin teléfono')} · ${esc(t.email || 'sin correo')} · canal: ${t.canal_preferido}</span></div>`).join('')}</section>
    </div>
    <div class="grid2">
      <section class="card"><h2>Validaciones externas recientes</h2>${vals.length ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Servicio</th><th>Resultado</th><th>ms</th></tr></thead><tbody>
        ${vals.map(v => `<tr><td>${fechaCorta(v.fecha)}</td><td>${v.servicio}</td><td>${badgeEstado(v.resultado)}</td><td>${v.tiempo_ms}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin validaciones registradas.</p>'}</section>
      <section class="card"><h2>Citas</h2>${citas.length ? `<table class="tbl"><tbody>${citas.map(c => `<tr><td>${fechaCorta(c.fecha_hora)}</td><td>${esc(c.especialidad)}</td><td>${badgeEstado(c.estado)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin citas.</p>'}</section>
    </div>`;
  if ($('#btn-reval')) $('#btn-reval').onclick = async () => {
    const b = $('#btn-reval'); b.disabled = true; b.textContent = 'Validando…';
    const r = await validarIdentidadYPrevision(p.rut);
    if (r.estado === 'ERROR') {
      tx(() => { if (!q1(`SELECT id FROM operacion_pendiente WHERE referencia = ? AND estado = 'PENDIENTE'`, [p.rut])) encolar('VALIDACION_PREVISIONAL', p.rut, {}); });
      toast('Sin conexión: la validación quedó en cola.', 'warn');
    } else { tx(() => aplicarValidacionAPaciente(p.rut, r)); toast(`${r.mensaje} (${Math.round(r.ms)} ms)`, r.estado === 'VALIDADO' ? 'ok' : 'warn'); }
    render();
  };
  if ($('#btn-edit')) $('#btn-edit').onclick = () => abrirModal('Actualizar antecedentes', `
    <form id="f-ed"><label>Alergias<input name="alergias" value="${esc(p.alergias || '')}"></label>
      <label>Antecedentes<textarea name="antecedentes" rows="3">${esc(p.antecedentes || '')}</textarea></label>
      <label>Grupo sanguíneo<select name="grupo">${['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(g => `<option ${g === (p.grupo_sanguineo || '') ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, root => {
    $('#f-ed', root).onsubmit = e => {
      e.preventDefault();
      if (!exigir('paciente.editar', 'paciente', p.id)) return;
      const d = datosForm(e.target);
      tx(() => {
        run('UPDATE paciente SET alergias = ?, antecedentes = ?, actualizado_en = ? WHERE id = ?', [d.alergias, d.antecedentes, nowStr(), p.id]);
        run('UPDATE ficha_clinica SET grupo_sanguineo = ? WHERE paciente_id = ?', [d.grupo || null, p.id]);
        registrarAuditoria('MODIFICACION', 'paciente', p.id, `Actualización de antecedentes. Antes: alergias="${p.alergias || ''}", antecedentes="${p.antecedentes || ''}"`);
      });
      toast('Antecedentes actualizados.', 'ok'); render();
    };
  });
  if ($('#btn-tutor')) $('#btn-tutor').onclick = () => abrirModal('Asociar tutor legal', `
    <form id="f-t"><div class="grid2"><label>RUT<input name="rut" required></label><label>Parentesco<select name="parentesco"><option>Madre</option><option>Padre</option><option>Abuelo/a</option><option>Tutor/a legal</option></select></label>
      <label>Nombres<input name="nombres"></label><label>Apellidos<input name="apellidos"></label><label>Teléfono<input name="telefono"></label><label>Correo<input name="email" type="email"></label></div>
      <p class="err" id="t-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Asociar</button></div></form>`, root => {
    $('#f-t', root).onsubmit = e => {
      e.preventDefault();
      const d = datosForm(e.target), rut = normalizarRut(d.rut);
      if (!rut) return $('#t-err', root).textContent = 'RUT inválido.';
      let t = q1('SELECT id FROM tutor WHERE rut = ?', [rut]);
      if (!t && (!d.nombres || !d.apellidos)) return $('#t-err', root).textContent = 'Tutor nuevo: ingrese nombres y apellidos.';
      if (q1('SELECT 1 FROM paciente_tutor pt JOIN tutor t ON t.id = pt.tutor_id WHERE pt.paciente_id = ? AND t.rut = ?', [p.id, rut])) return $('#t-err', root).textContent = 'Ese tutor ya está asociado.';
      tx(() => {
        const tid = t ? t.id : run('INSERT INTO tutor(rut, nombres, apellidos, telefono, email) VALUES (?,?,?,?,?)', [rut, d.nombres, d.apellidos, d.telefono, d.email]);
        run('INSERT INTO paciente_tutor VALUES (?,?,?,0)', [p.id, tid, d.parentesco]);
        registrarAuditoria('CREACION', 'paciente_tutor', p.id, `Tutor ${rut} asociado como ${d.parentesco}`);
      });
      toast('Tutor asociado.', 'ok'); render();
    };
  });
}

/* ============================ FICHA CLÍNICA (HU2, HU3) ============================ */
/** Rangos de PLAUSIBILIDAD de datos por edad (propuesta técnica, no constituyen criterio clínico). */
function rangosPorEdad(anios) {
  if (anios < 1) return { peso: [1, 15], talla: [30, 85], fc: [80, 220] };
  if (anios < 6) return { peso: [6, 35], talla: [60, 130], fc: [60, 200] };
  if (anios < 12) return { peso: [12, 90], talla: [95, 170], fc: [50, 160] };
  return { peso: [25, 160], talla: [130, 210], fc: [40, 150] };
}
function validarSignos(d, anios) {
  const r = rangosPorEdad(anios), errores = [];
  const chk = (val, [min, max], nombre, u) => { if (val !== '' && val != null && (isNaN(val) || Number(val) < min || Number(val) > max)) errores.push(`${nombre} fuera del rango plausible para ${anios} años (${min}–${max} ${u}).`); };
  chk(d.peso_kg, r.peso, 'Peso', 'kg'); chk(d.talla_cm, r.talla, 'Talla', 'cm'); chk(d.frecuencia_cardiaca, r.fc, 'Frecuencia cardíaca', 'lpm');
  chk(d.temperatura_c, [33, 43], 'Temperatura', '°C');
  if (d.escala_dolor !== '' && (d.escala_dolor < 0 || d.escala_dolor > 10)) errores.push('La escala de dolor va de 0 a 10.');
  if (['peso_kg', 'talla_cm', 'temperatura_c', 'frecuencia_cardiaca', 'escala_dolor'].every(k => d[k] === '' || d[k] == null)) errores.push('Ingrese al menos una constante vital.');
  return errores;
}
const camposSignos = `<div class="grid5"><label>Peso (kg)<input name="peso_kg" type="number" step="0.1"></label><label>Talla (cm)<input name="talla_cm" type="number" step="0.1"></label>
  <label>Temperatura (°C)<input name="temperatura_c" type="number" step="0.1"></label><label>F. cardíaca (lpm)<input name="frecuencia_cardiaca" type="number"></label>
  <label>Dolor (0-10)<input name="escala_dolor" type="number" min="0" max="10"></label></div>`;
const numONull = v => v === '' || v == null ? null : Number(v);

function vistaFicha(main, pacienteId) {
  const t0 = performance.now();
  const p = q1(`SELECT p.*, f.id AS ficha_id, f.numero_ficha, f.grupo_sanguineo, ip.nombre AS prevision FROM paciente p JOIN ficha_clinica f ON f.paciente_id = p.id
                LEFT JOIN institucion_prevision ip ON ip.id = p.prevision_id WHERE p.id = ?`, [pacienteId]);
  if (!p) { main.innerHTML = '<p>Ficha no encontrada.</p>'; return; }
  const atenciones = q(`SELECT a.*, u.nombre AS profesional FROM atencion a JOIN usuario u ON u.id = a.profesional_id WHERE a.ficha_id = ? ORDER BY a.fecha DESC`, [p.ficha_id]);
  const detalle = a => ({
    signos: q('SELECT * FROM signo_vital WHERE atencion_id = ? ORDER BY registrado_en', [a.id]),
    diags: q('SELECT * FROM diagnostico WHERE atencion_id = ?', [a.id]),
    procs: q('SELECT * FROM procedimiento WHERE atencion_id = ?', [a.id])
  });
  const examenes = q(`SELECT * FROM examen WHERE ficha_id = ? ORDER BY fecha_solicitud DESC`, [p.ficha_id]);
  const msCarga = Math.round(performance.now() - t0);
  auditar('CONSULTA', 'ficha_clinica', p.ficha_id, `Apertura de ficha ${p.numero_ficha} (${p.rut})`);
  const ed = edad(p.fecha_nacimiento);

  main.innerHTML = `
    <div class="head-row"><div><a href="#/paciente/${p.id}" class="muted">← Datos del paciente</a>
      <h1>Ficha ${p.numero_ficha} · ${esc(p.nombres)} ${esc(p.apellidos)}</h1>
      <p class="muted">${p.rut} · ${ed.texto} · ${esc(p.prevision || 'Previsión no validada')} · Grupo ${esc(p.grupo_sanguineo || '—')} · ${badgeEstado(p.estado_validacion)}
      <span class="chip chip-neutral" title="Criterio 2.3">Carga de ficha: ${msCarga} ms</span></p></div>
      <div class="acts">
        ${puede('atencion.crear') ? '<button class="btn btn-primary" id="btn-aten">+ Nueva atención</button>' : ''}
        ${puede('examen.registrar') ? '<button class="btn" id="btn-exam">+ Examen</button>' : ''}
        ${puede('red.consultar') ? '<button class="btn" id="btn-red">Consultar Red Pública</button>' : ''}
      </div></div>
    ${p.alergias ? `<div class="alert alert-danger"><b>Alergias:</b> ${esc(p.alergias)}</div>` : ''}
    <section class="card"><h2>Antecedentes</h2><p>${esc(p.antecedentes || 'No registra')}</p></section>
    <section class="card"><h2>Historial de atenciones (${atenciones.length})</h2>
      ${atenciones.length ? atenciones.map(a => {
        const d = detalle(a);
        return `<article class="aten ${a.estado === 'BORRADOR' ? 'borr' : ''}">
          <header><b>${fechaCorta(a.fecha)} · ${a.tipo}</b> ${badgeEstado(a.estado)} <span class="muted">${esc(a.profesional)}</span></header>
          <p><b>Motivo:</b> ${esc(a.motivo)}${a.anamnesis ? `<br><b>Anamnesis:</b> ${esc(a.anamnesis)}` : ''}${a.indicaciones ? `<br><b>Indicaciones:</b> ${esc(a.indicaciones)}` : ''}</p>
          ${d.signos.map(s => `<p class="vitals">Peso ${s.peso_kg ?? '—'} kg · Talla ${s.talla_cm ?? '—'} cm · T° ${s.temperatura_c ?? '—'} °C · FC ${s.frecuencia_cardiaca ?? '—'} lpm · Dolor ${s.escala_dolor ?? '—'}/10 <span class="muted">(${fechaCorta(s.registrado_en)})</span></p>`).join('')}
          ${d.diags.length ? `<p><b>Diagnósticos:</b> ${d.diags.map(x => `${esc(x.codigo_cie10 || '')} ${esc(x.descripcion)} <i>(${x.tipo.toLowerCase()})</i>`).join('; ')}</p>` : ''}
          ${d.procs.length ? `<p><b>Procedimientos:</b> ${d.procs.map(x => `${esc(x.descripcion)} <i>(${x.tipo.toLowerCase()})</i>`).join('; ')}</p>` : ''}
          ${a.firma_hash ? `<p class="muted small">Firma: ${a.firma_hash.slice(0, 24)}… · ${fechaCorta(a.firmada_en)}</p>` : ''}
          <div class="acts">
            ${puede('signos.registrar') ? `<button class="btn btn-sm" data-signos="${a.id}">+ Constantes vitales</button>` : ''}
            ${puede('atencion.crear') ? `<button class="btn btn-sm" data-diag="${a.id}">${a.estado === 'FIRMADA' ? 'Modificar diagnóstico' : '+ Diagnóstico'}</button>` : ''}
            ${puede('atencion.crear') && a.estado === 'BORRADOR' ? `<button class="btn btn-sm btn-primary" data-firmar="${a.id}">Firmar atención</button>` : ''}
          </div></article>`;
      }).join('') : '<p class="muted">Sin atenciones registradas.</p>'}
    </section>
    <section class="card"><h2>Exámenes (${examenes.length})</h2>
      ${examenes.length ? `<table class="tbl"><thead><tr><th>Solicitud</th><th>Examen</th><th>Tipo</th><th>Origen</th><th>Estado</th><th>Resultado</th><th></th></tr></thead><tbody>
      ${examenes.map(x => `<tr><td>${fechaCorta(x.fecha_solicitud)}</td><td>${esc(x.nombre)}</td><td>${x.tipo}</td><td>${x.origen === 'RED_PUBLICA' ? badge('Red pública', 'info') : 'Local'}</td>
        <td>${badgeEstado(x.estado)}</td><td>${esc(x.resultado || '—')}</td>
        <td>${x.estado === 'SOLICITADO' && puede('examen.registrar') ? `<button class="btn btn-sm" data-res="${x.id}">Registrar resultado</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin exámenes.</p>'}
    </section>
    <div id="red-res"></div>`;

  /* --- Nueva atención --- */
  if ($('#btn-aten')) $('#btn-aten').onclick = () => abrirModal('Nueva atención', `
    <form id="f-aten" novalidate>
      <div class="grid2"><label>Tipo<select name="tipo"><option>AMBULATORIA</option><option>URGENCIA</option><option>CONTROL</option><option>HOSPITALIZACION</option></select></label>
      <label>Motivo de consulta<input name="motivo" required></label></div>
      <label>Anamnesis<textarea name="anamnesis" rows="2"></textarea></label>
      <fieldset><legend>Constantes vitales (validadas según edad: ${ed.anios} años)</legend>${camposSignos}</fieldset>
      <fieldset><legend>Diagnóstico</legend><div class="grid3"><label>Código CIE-10<input name="cie" placeholder="Ej: J06.9"></label>
        <label>Descripción<input name="diag"></label><label>Tipo<select name="diag_tipo"><option>PRESUNTIVO</option><option>CONFIRMADO</option></select></label></div></fieldset>
      <fieldset><legend>Procedimiento o cirugía (opcional)</legend><div class="grid2"><label>Tipo<select name="proc_tipo"><option>PROCEDIMIENTO</option><option>CIRUGIA</option></select></label><label>Descripción<input name="proc"></label></div></fieldset>
      <label>Indicaciones<textarea name="indicaciones" rows="2"></textarea></label>
      <p class="err" id="a-err" role="alert"></p>
      <div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn" name="accion" value="borrador">Guardar borrador</button><button class="btn btn-primary" name="accion" value="firmar">Guardar y firmar</button></div>
    </form>`, root => {
    $('#f-aten', root).onsubmit = e => {
      e.preventDefault();
      if (!exigir('atencion.crear', 'atencion')) return;
      const d = datosForm(e.target), firmar = e.submitter && e.submitter.value === 'firmar';
      const err = $('#a-err', root);
      if (!d.motivo) return err.textContent = 'El motivo de consulta es obligatorio.';
      const hayVitales = ['peso_kg', 'talla_cm', 'temperatura_c', 'frecuencia_cardiaca', 'escala_dolor'].some(k => d[k] !== '');
      if (hayVitales) { const errs = validarSignos(d, ed.anios); if (errs.length) return err.innerHTML = errs.map(esc).join('<br>'); }
      if (firmar && !d.diag) return err.textContent = 'Para firmar debe registrar al menos un diagnóstico.';
      if (d.cie && !/^[A-Z]\d{2}(\.\d{1,2})?$/i.test(d.cie)) return err.textContent = 'Formato CIE-10 inválido (ej.: J06.9).';
      const aid = tx(() => {
        const fecha = nowStr();
        const id = run(`INSERT INTO atencion(ficha_id, profesional_id, fecha, tipo, motivo, anamnesis, indicaciones) VALUES (?,?,?,?,?,?,?)`,
          [p.ficha_id, sesion.id, fecha, d.tipo, d.motivo, d.anamnesis, d.indicaciones]);
        if (hayVitales) run(`INSERT INTO signo_vital(atencion_id, peso_kg, talla_cm, temperatura_c, frecuencia_cardiaca, escala_dolor, registrado_por, registrado_en) VALUES (?,?,?,?,?,?,?,?)`,
          [id, numONull(d.peso_kg), numONull(d.talla_cm), numONull(d.temperatura_c), numONull(d.frecuencia_cardiaca), numONull(d.escala_dolor), sesion.id, fecha]);
        if (d.diag) run('INSERT INTO diagnostico(atencion_id, codigo_cie10, descripcion, tipo) VALUES (?,?,?,?)', [id, d.cie.toUpperCase(), d.diag, d.diag_tipo]);
        if (d.proc) run('INSERT INTO procedimiento(atencion_id, tipo, descripcion, fecha) VALUES (?,?,?,?)', [id, d.proc_tipo, d.proc, fecha]);
        registrarAuditoria('CREACION', 'atencion', id, `Nueva atención ${d.tipo} en ficha ${p.numero_ficha}`);
        return id;
      });
      if (firmar) firmarAtencion(aid, p); else toast('Atención guardada como borrador.', 'ok');
      render();
    };
  }, 'modal-lg');

  /* --- Constantes vitales sobre una atención existente --- */
  $$('[data-signos]').forEach(b => b.onclick = () => {
    const aid = Number(b.dataset.signos);
    abrirModal('Registrar constantes vitales', `<form id="f-sv" novalidate>${camposSignos}<p class="muted small">Validación de plausibilidad para ${ed.anios} años (propuesta técnica, no criterio clínico).</p>
      <p class="err" id="sv-err" role="alert"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, root => {
      $('#f-sv', root).onsubmit = e => {
        e.preventDefault();
        if (!exigir('signos.registrar', 'signo_vital', aid)) return;
        const d = datosForm(e.target), errs = validarSignos(d, ed.anios);
        if (errs.length) return $('#sv-err', root).innerHTML = errs.map(esc).join('<br>');
        tx(() => {
          run(`INSERT INTO signo_vital(atencion_id, peso_kg, talla_cm, temperatura_c, frecuencia_cardiaca, escala_dolor, registrado_por, registrado_en) VALUES (?,?,?,?,?,?,?,?)`,
            [aid, numONull(d.peso_kg), numONull(d.talla_cm), numONull(d.temperatura_c), numONull(d.frecuencia_cardiaca), numONull(d.escala_dolor), sesion.id, nowStr()]);
          registrarAuditoria('CREACION', 'signo_vital', aid, 'Registro de constantes vitales');
        });
        toast('Constantes vitales registradas.', 'ok'); render();
      };
    });
  });

  /* --- Diagnóstico (criterio 2.2: tras la firma solo el médico asignado puede modificar) --- */
  $$('[data-diag]').forEach(b => b.onclick = () => {
    const aid = Number(b.dataset.diag);
    const a = q1('SELECT * FROM atencion WHERE id = ?', [aid]);
    if (a.estado === 'FIRMADA' && a.profesional_id !== sesion.id) {
      auditar('ACCESO_DENEGADO', 'diagnostico', aid, 'Intento de modificar diagnóstico firmado por otro profesional (criterio 2.2)');
      toast('Solo el médico asignado puede modificar el diagnóstico de una atención firmada. Intento registrado.', 'error');
      return;
    }
    const diags = q('SELECT * FROM diagnostico WHERE atencion_id = ?', [aid]);
    abrirModal(a.estado === 'FIRMADA' ? 'Modificar diagnóstico (atención firmada)' : 'Agregar diagnóstico', `
      ${diags.length ? `<p class="small">Actuales: ${diags.map(x => `${esc(x.codigo_cie10 || '')} ${esc(x.descripcion)} (${x.tipo})`).join('; ')}</p>` : ''}
      <form id="f-dg"><div class="grid3"><label>CIE-10<input name="cie"></label><label>Descripción<input name="diag" required></label>
        <label>Tipo<select name="tipo"><option>PRESUNTIVO</option><option>CONFIRMADO</option></select></label></div>
        ${a.estado === 'FIRMADA' && diags.length ? `<label><input type="checkbox" name="reemplazar" checked> Reemplazar el diagnóstico anterior</label>` : ''}
        <p class="err" id="dg-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, root => {
      $('#f-dg', root).onsubmit = e => {
        e.preventDefault();
        const d = datosForm(e.target);
        if (!d.diag) return $('#dg-err', root).textContent = 'Ingrese la descripción.';
        if (d.cie && !/^[A-Z]\d{2}(\.\d{1,2})?$/i.test(d.cie)) return $('#dg-err', root).textContent = 'Formato CIE-10 inválido.';
        tx(() => {
          const antes = diags.map(x => `${x.codigo_cie10} ${x.descripcion}`).join('; ');
          if (d.reemplazar) run('DELETE FROM diagnostico WHERE atencion_id = ?', [aid]);
          run('INSERT INTO diagnostico(atencion_id, codigo_cie10, descripcion, tipo) VALUES (?,?,?,?)', [aid, (d.cie || '').toUpperCase(), d.diag, d.tipo]);
          registrarAuditoria('MODIFICACION', 'diagnostico', aid, `${a.estado === 'FIRMADA' ? 'Modificación post-firma' : 'Nuevo diagnóstico'}. Antes: ${antes || '—'}. Ahora: ${d.cie} ${d.diag}`);
        });
        toast('Diagnóstico guardado.', 'ok'); render();
      };
    });
  });

  $$('[data-firmar]').forEach(b => b.onclick = () => {
    const aid = Number(b.dataset.firmar);
    if (!q1('SELECT id FROM diagnostico WHERE atencion_id = ?', [aid])) return toast('Agregue al menos un diagnóstico antes de firmar.', 'error');
    const a = q1('SELECT profesional_id FROM atencion WHERE id = ?', [aid]);
    if (a.profesional_id !== sesion.id) { auditar('ACCESO_DENEGADO', 'atencion', aid, 'Intento de firmar atención de otro profesional'); return toast('Solo el médico asignado puede firmar.', 'error'); }
    firmarAtencion(aid, p); render();
  });

  /* --- Exámenes --- */
  if ($('#btn-exam')) $('#btn-exam').onclick = () => abrirModal('Registrar examen', `
    <form id="f-ex"><div class="grid2"><label>Examen<input name="nombre" required></label><label>Tipo<select name="tipo"><option>LABORATORIO</option><option>IMAGEN</option><option>OTRO</option></select></label>
      <label>Atención asociada<select name="atencion_id"><option value="">(ninguna)</option>${atenciones.map(a => `<option value="${a.id}">${fechaCorta(a.fecha)} – ${esc(a.motivo)}</option>`).join('')}</select></label>
      <label>Resultado (si ya está disponible)<input name="resultado"></label></div>
      <p class="err" id="ex-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, root => {
    $('#f-ex', root).onsubmit = e => {
      e.preventDefault();
      if (!exigir('examen.registrar', 'examen')) return;
      const d = datosForm(e.target);
      if (!d.nombre) return $('#ex-err', root).textContent = 'Ingrese el nombre del examen.';
      tx(() => {
        const id = run(`INSERT INTO examen(ficha_id, atencion_id, nombre, tipo, fecha_solicitud, fecha_resultado, resultado, estado, registrado_por) VALUES (?,?,?,?,?,?,?,?,?)`,
          [p.ficha_id, d.atencion_id || null, d.nombre, d.tipo, nowStr(), d.resultado ? nowStr() : null, d.resultado || null, d.resultado ? 'CON_RESULTADO' : 'SOLICITADO', sesion.id]);
        registrarAuditoria('CREACION', 'examen', id, `Examen ${d.nombre} registrado en ficha ${p.numero_ficha}`);
      });
      toast('Examen registrado.', 'ok'); render();
    };
  });
  $$('[data-res]').forEach(b => b.onclick = () => {
    const eid = Number(b.dataset.res);
    abrirModal('Registrar resultado', `<form id="f-r"><label>Resultado<textarea name="resultado" rows="3" required></textarea></label><p class="err" id="r-err"></p>
      <div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, root => {
      $('#f-r', root).onsubmit = e => {
        e.preventDefault();
        const d = datosForm(e.target);
        if (!d.resultado) return $('#r-err', root).textContent = 'Ingrese el resultado.';
        tx(() => { run(`UPDATE examen SET resultado = ?, fecha_resultado = ?, estado = 'CON_RESULTADO' WHERE id = ?`, [d.resultado, nowStr(), eid]); registrarAuditoria('MODIFICACION', 'examen', eid, 'Registro de resultado de examen'); });
        toast('Resultado registrado.', 'ok'); render();
      };
    });
  });

  /* --- Red pública (HU3) --- */
  if ($('#btn-red')) $('#btn-red').onclick = async () => {
    const box = $('#red-res');
    box.innerHTML = '<section class="card"><p class="muted">Consultando Red de Salud Pública (adaptador simulado)…</p></section>';
    const r = await consultarRedPublica(p.rut);
    auditar('CONSULTA', 'red_publica', p.id, `Consulta de antecedentes en red pública: ${r.ok ? r.registros.length + ' registros' : 'error de conexión'}`);
    if (!r.ok) { box.innerHTML = `<section class="card"><div class="alert alert-warn">La Red Pública no responde (modo contingencia). Intente nuevamente al restablecerse la conexión. (${r.ms} ms)</div></section>`; return; }
    box.innerHTML = `<section class="card"><div class="head-row"><h2>Antecedentes en la Red de Salud Pública <span class="chip chip-neutral">${r.ms} ms</span></h2><button class="btn btn-sm btn-ghost" id="btn-fhir">Ver mensaje FHIR simulado</button></div>
      ${r.registros.length ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Establecimiento</th><th>Tipo</th><th>Descripción</th><th>Resultado</th><th></th></tr></thead><tbody>
      ${r.registros.map((x, i) => {
        const yaImportado = examenes.some(e => e.origen === 'RED_PUBLICA' && e.nombre === x.descripcion && e.fecha_solicitud.startsWith(x.fecha));
        return `<tr><td>${fechaCorta(x.fecha)}</td><td>${esc(x.establecimiento)}</td><td>${x.tipo}</td><td>${esc(x.descripcion)}</td><td>${esc(x.resultado)}</td>
        <td>${yaImportado ? badge('Importado', 'ok') : `<button class="btn btn-sm" data-imp="${i}">Importar a la ficha</button>`}</td></tr>`; }).join('')}</tbody></table>`
      : '<p class="muted">El paciente no registra antecedentes en otros establecimientos de la red (simulado).</p>'}
      <p class="muted small">Los antecedentes evitan repetir exámenes ya realizados en otros hospitales (HU3). Fuente: adaptador simulado, no conectado a servicios reales.</p></section>`;
    $('#btn-fhir').onclick = () => abrirModal('Mensaje recibido (simulación con estructura HL7 FHIR R4)', `<pre class="code">${esc(JSON.stringify(r.bundle, null, 2))}</pre>`, null, 'modal-lg');
    $$('[data-imp]').forEach(btn => btn.onclick = () => {
      const x = r.registros[Number(btn.dataset.imp)];
      tx(() => {
        const id = run(`INSERT INTO examen(ficha_id, nombre, tipo, fecha_solicitud, fecha_resultado, resultado, estado, origen, registrado_por) VALUES (?,?,?,?,?,?, 'CON_RESULTADO', 'RED_PUBLICA', ?)`,
          [p.ficha_id, x.descripcion, x.tipo, x.fecha + ' 00:00:00', x.fecha + ' 00:00:00', `${x.resultado} – ${x.establecimiento}`, sesion.id]);
        registrarAuditoria('CREACION', 'examen', id, `Antecedente importado desde red pública: ${x.descripcion}`);
      });
      toast('Antecedente importado a la ficha.', 'ok'); render();
    });
  };
}

function firmarAtencion(aid, p) {
  tx(() => {
    const a = q1('SELECT * FROM atencion WHERE id = ?', [aid]);
    const firma = sha256(`${a.id}|${a.ficha_id}|${a.profesional_id}|${a.fecha}|${a.motivo}|${nowStr()}`);
    run(`UPDATE atencion SET estado = 'FIRMADA', firmada_en = ?, firma_hash = ? WHERE id = ?`, [nowStr(), firma, aid]);
    registrarAuditoria('MODIFICACION', 'atencion', aid, 'Atención firmada electrónicamente');
    // Envío del resumen a la red pública: inmediato si hay conexión, en cola si no (HU3 + HU9)
    if (conexionExterna()) {
      run(`INSERT INTO validacion_externa(paciente_rut, servicio, resultado, detalle, tiempo_ms, fecha, usuario_id) VALUES (?,?,?,?,?,?,?)`,
        [p.rut, 'RED_PUBLICA', 'OK', `Atención #${aid} enviada a la red (simulado)`, 180, nowStr(), sesion.id]);
    } else encolar('ENVIO_RED_PUBLICA', aid, { rut: p.rut });
  });
  toast(conexionExterna() ? 'Atención firmada y enviada a la red pública (simulado).' : 'Atención firmada. El envío a la red quedó en cola (contingencia).', 'ok');
}

/* ============================ CITAS (HU5) ============================ */
function horariosDisponibles() {
  const h = [];
  for (let m = 8 * 60; m <= 17 * 60 + 30; m += 30) h.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return h;
}
function vistaCitas(main) {
  const gestiona = puede('cita.gestionar');
  const medicos = q(`SELECT u.id, u.nombre, u.especialidad FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE r.codigo = 'MEDICO' ORDER BY u.nombre`);
  main.innerHTML = `
    <div class="head-row"><h1>Agenda y citas</h1><div class="acts">${gestiona ? '<button class="btn" id="btn-espera">+ Lista de espera</button><button class="btn btn-primary" id="btn-cita">+ Nueva cita</button>' : ''}</div></div>
    <div class="card filtros">
      <label>Desde<input type="date" id="f-desde" value="${nowStr().slice(0, 10)}"></label>
      <label>Profesional<select id="f-prof"><option value="">Todos</option>${medicos.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></label>
      <label>Estado<select id="f-est"><option value="">Vigentes</option><option value="*">Todos</option><option>AGENDADA</option><option>CONFIRMADA</option><option>CANCELADA</option><option>REPROGRAMADA</option></select></label>
    </div>
    <section class="card" id="agenda"></section>
    <section class="card"><h2>Lista de espera</h2><div id="espera"></div></section>`;
  const pintar = () => {
    const est = $('#f-est').value, prof = $('#f-prof').value;
    let sql = `SELECT c.*, p.nombres, p.apellidos, p.rut, u.nombre AS prof FROM cita c JOIN paciente p ON p.id = c.paciente_id JOIN usuario u ON u.id = c.profesional_id WHERE c.fecha_hora >= ?`;
    const prm = [$('#f-desde').value + ' 00:00:00'];
    if (prof) { sql += ' AND c.profesional_id = ?'; prm.push(prof); }
    if (est === '') sql += ` AND c.estado IN ('AGENDADA','CONFIRMADA')`; else if (est !== '*') { sql += ' AND c.estado = ?'; prm.push(est); }
    const citas = q(sql + ' ORDER BY c.fecha_hora', prm);
    $('#agenda').innerHTML = citas.length ? `<table class="tbl"><thead><tr><th>Fecha y hora</th><th>Paciente</th><th>Especialidad</th><th>Profesional</th><th>Estado</th><th></th></tr></thead><tbody>
      ${citas.map(c => `<tr><td>${fechaCorta(c.fecha_hora)}</td><td>${esc(c.nombres)} ${esc(c.apellidos)}<br><span class="muted small">${c.rut}</span></td><td>${esc(c.especialidad)}</td><td>${esc(c.prof)}</td>
        <td>${badgeEstado(c.estado)}${c.cita_origen_id ? ' <span class="muted small">(reprog.)</span>' : ''}</td>
        <td class="acts">${gestiona && ['AGENDADA', 'CONFIRMADA'].includes(c.estado) ? `
          ${c.estado === 'AGENDADA' ? `<button class="btn btn-sm" data-conf="${c.id}">Confirmar</button>` : ''}
          <button class="btn btn-sm" data-repro="${c.id}">Reprogramar</button><button class="btn btn-sm btn-danger" data-canc="${c.id}">Cancelar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No hay citas para los filtros seleccionados.</p>';
    const espera = q(`SELECT le.*, p.nombres, p.apellidos FROM lista_espera le JOIN paciente p ON p.id = le.paciente_id ORDER BY le.estado, le.fecha_ingreso`);
    $('#espera').innerHTML = espera.length ? `<table class="tbl"><thead><tr><th>Ingreso</th><th>Paciente</th><th>Especialidad</th><th>Estado</th></tr></thead><tbody>
      ${espera.map(e => `<tr><td>${fechaCorta(e.fecha_ingreso)}</td><td>${esc(e.nombres)} ${esc(e.apellidos)}</td><td>${esc(e.especialidad)}</td><td>${badgeEstado(e.estado)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin pacientes en espera.</p>';
    $$('[data-conf]').forEach(b => b.onclick = () => {
      tx(() => { run(`UPDATE cita SET estado = 'CONFIRMADA' WHERE id = ?`, [b.dataset.conf]); registrarAuditoria('MODIFICACION', 'cita', b.dataset.conf, 'Cita confirmada por admisión'); });
      toast('Cita confirmada.', 'ok'); pintar();
    });
    $$('[data-canc]').forEach(b => b.onclick = () => modalCancelar(Number(b.dataset.canc), 'admisión', pintar));
    $$('[data-repro]').forEach(b => b.onclick = () => modalReprogramar(Number(b.dataset.repro), pintar));
  };
  ['#f-desde', '#f-prof', '#f-est'].forEach(s => $(s).onchange = pintar);
  pintar();
  auditar('CONSULTA', 'cita', null, 'Consulta de agenda');

  if ($('#btn-cita')) $('#btn-cita').onclick = () => {
    const pacs = q('SELECT id, rut, nombres, apellidos FROM paciente ORDER BY apellidos');
    abrirModal('Nueva cita', `<form id="f-c">
      <label>Paciente<select name="paciente_id" required>${pacs.map(p => `<option value="${p.id}">${esc(p.apellidos)}, ${esc(p.nombres)} (${p.rut})</option>`).join('')}</select></label>
      <label>Profesional<select name="profesional_id">${medicos.map(m => `<option value="${m.id}">${esc(m.nombre)} – ${esc(m.especialidad)}</option>`).join('')}</select></label>
      <div class="grid2"><label>Fecha<input type="date" name="fecha" required min="${nowStr().slice(0, 10)}"></label><label>Hora<select name="hora">${horariosDisponibles().map(h => `<option>${h}</option>`).join('')}</select></label></div>
      <p class="muted small">Se programarán recordatorios automáticos 48 h y 24 h antes por SMS y correo (criterio 5.1).</p>
      <p class="err" id="c-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Agendar</button></div></form>`, root => {
      $('#f-c', root).onsubmit = e => {
        e.preventDefault();
        if (!exigir('cita.gestionar', 'cita')) return;
        const d = datosForm(e.target), fh = `${d.fecha} ${d.hora}:00`;
        if (!d.fecha) return $('#c-err', root).textContent = 'Seleccione la fecha.';
        if (fh <= nowStr()) return $('#c-err', root).textContent = 'La cita debe ser en el futuro.';
        if (!tutorPrincipal(d.paciente_id)) return $('#c-err', root).textContent = 'El paciente no tiene tutor asociado para los recordatorios.';
        const m = medicos.find(x => x.id == d.profesional_id);
        try {
          const cid = tx(() => {
            const id = run(`INSERT INTO cita(paciente_id, profesional_id, especialidad, fecha_hora, creada_por, creada_en) VALUES (?,?,?,?,?,?)`, [d.paciente_id, d.profesional_id, m.especialidad, fh, sesion.id, nowStr()]);
            programarRecordatorios(id);
            notificarInmediato(id, 'CONFIRMACION', `Hora agendada: ${textoCita(datosCita(id))}`);
            const le = q1(`SELECT id FROM lista_espera WHERE paciente_id = ? AND especialidad = ? AND estado <> 'AGENDADO'`, [d.paciente_id, m.especialidad]);
            if (le) run(`UPDATE lista_espera SET estado = 'AGENDADO' WHERE id = ?`, [le.id]);
            registrarAuditoria('CREACION', 'cita', id, `Cita agendada para ${fh}`);
            return id;
          });
          procesarNotificaciones(true);
          toast(`Cita #${cid} agendada y recordatorios programados.`, 'ok'); cerrarModal(); pintar();
        } catch (ex) {
          $('#c-err', root).textContent = /UNIQUE/.test(ex.message) ? 'El profesional ya tiene una cita vigente en ese horario.' : ex.message;
        }
      };
    });
  };
  if ($('#btn-espera')) $('#btn-espera').onclick = () => {
    const pacs = q('SELECT id, nombres, apellidos FROM paciente ORDER BY apellidos');
    abrirModal('Agregar a lista de espera', `<form id="f-le"><label>Paciente<select name="paciente_id">${pacs.map(p => `<option value="${p.id}">${esc(p.apellidos)}, ${esc(p.nombres)}</option>`).join('')}</select></label>
      <label>Especialidad<select name="esp">${[...new Set(medicos.map(m => m.especialidad))].map(e => `<option>${esc(e)}</option>`).join('')}</select></label>
      <p class="err" id="le-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary">Agregar</button></div></form>`, root => {
      $('#f-le', root).onsubmit = e => {
        e.preventDefault();
        const d = datosForm(e.target);
        if (q1(`SELECT id FROM lista_espera WHERE paciente_id = ? AND especialidad = ? AND estado = 'EN_ESPERA'`, [d.paciente_id, d.esp])) return $('#le-err', root).textContent = 'El paciente ya está en espera para esa especialidad.';
        tx(() => { const id = run('INSERT INTO lista_espera(paciente_id, especialidad, fecha_ingreso) VALUES (?,?,?)', [d.paciente_id, d.esp, nowStr()]); registrarAuditoria('CREACION', 'lista_espera', id, `Ingreso a lista de espera ${d.esp}`); });
        toast('Agregado a la lista de espera.', 'ok'); cerrarModal(); pintar();
      };
    });
  };
}

function modalCancelar(citaId, origen, alTerminar) {
  abrirModal('Cancelar cita', `<form id="f-cc"><label>Motivo<input name="motivo" required placeholder="Ej.: imprevisto familiar"></label>
    <p class="muted small">Al cancelar se libera la hora y se invita automáticamente al primer paciente en lista de espera de la especialidad (criterio 5.2).</p>
    <p class="err" id="cc-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Volver</button><button class="btn btn-danger">Cancelar cita</button></div></form>`, root => {
    $('#f-cc', root).onsubmit = e => {
      e.preventDefault();
      const d = datosForm(e.target);
      if (!d.motivo) return $('#cc-err', root).textContent = 'Indique el motivo.';
      try {
        const inv = tx(() => cancelarCita(citaId, d.motivo, origen));
        toast(inv ? `Cita cancelada. Se invitó a ${inv.nombres.split(' ')[0]} desde la lista de espera.` : 'Cita cancelada. Hora liberada.', 'ok');
        cerrarModal(); alTerminar();
      } catch (ex) { $('#cc-err', root).textContent = ex.message; }
    };
  });
}
function modalReprogramar(citaId, alTerminar) {
  abrirModal('Reprogramar cita', `<form id="f-rp"><div class="grid2"><label>Nueva fecha<input type="date" name="fecha" required min="${nowStr().slice(0, 10)}"></label>
    <label>Hora<select name="hora">${horariosDisponibles().map(h => `<option>${h}</option>`).join('')}</select></label></div>
    <p class="err" id="rp-err"></p><div class="foot"><button type="button" class="btn btn-ghost" data-cerrar>Volver</button><button class="btn btn-primary">Reprogramar</button></div></form>`, root => {
    $('#f-rp', root).onsubmit = e => {
      e.preventDefault();
      const d = datosForm(e.target);
      if (!d.fecha) return $('#rp-err', root).textContent = 'Seleccione la fecha.';
      try { tx(() => reprogramarCita(citaId, `${d.fecha} ${d.hora}:00`)); toast('Cita reprogramada y tutor notificado.', 'ok'); cerrarModal(); alTerminar(); }
      catch (ex) { $('#rp-err', root).textContent = /UNIQUE/.test(ex.message) ? 'El profesional ya tiene una cita en ese horario.' : ex.message; }
    };
  });
}

/* ============================ NOTIFICACIONES (HU5) ============================ */
function vistaNotificaciones(main) {
  const notifs = q(`SELECT n.*, t.nombres || ' ' || t.apellidos AS tutor FROM notificacion n JOIN tutor t ON t.id = n.tutor_id ORDER BY n.programada_para DESC LIMIT 200`);
  const resumen = q(`SELECT estado, COUNT(*) n FROM notificacion GROUP BY estado`);
  main.innerHTML = `
    <div class="head-row"><h1>Recordatorios y notificaciones</h1><div class="acts">
      <button class="btn btn-primary" id="btn-proc">Procesar envíos vencidos</button>
      <button class="btn" data-adelantar="3">Adelantar reloj 3 h</button><button class="btn" data-adelantar="24">Adelantar reloj 24 h</button>
      ${relojOffsetHoras() ? '<button class="btn btn-ghost" id="btn-reloj">Restablecer reloj</button>' : ''}</div></div>
    <p class="muted">Hora del sistema: <b>${fechaCorta(nowStr())}</b>${relojOffsetHoras() ? ` (reloj simulado +${relojOffsetHoras()} h para la demostración)` : ''}. Canales SMS, correo y llamada son <b>simulados</b>: no se envían mensajes reales.</p>
    <div class="kpis">${resumen.map(r => `<div class="kpi"><span>${r.n}</span>${r.estado}</div>`).join('')}</div>
    <section class="card"><table class="tbl"><thead><tr><th>Programada</th><th>Canal</th><th>Tipo</th><th>Destinatario</th><th>Mensaje</th><th>Estado</th><th>Respuesta</th></tr></thead><tbody>
      ${notifs.map(n => `<tr><td>${fechaCorta(n.programada_para)}</td><td>${n.canal}</td><td class="small">${n.tipo.replace(/_/g, ' ')}</td><td>${esc(n.tutor)}</td>
        <td class="small">${esc(n.mensaje)}</td><td>${badgeEstado(n.estado)}</td><td class="small">${esc(n.respuesta || '')}</td></tr>`).join('')}</tbody></table></section>`;
  $('#btn-proc').onclick = () => { const r = procesarNotificaciones(); if (r.enviadas + r.derivadas + r.encoladas) toast(`${r.enviadas} enviadas · ${r.derivadas} derivadas a llamada · ${r.encoladas} en cola`, 'ok'); render(); };
  $$('[data-adelantar]').forEach(b => b.onclick = () => {
    setParam('reloj_offset_h', relojOffsetHoras() + Number(b.dataset.adelantar));
    auditar('MODIFICACION', 'parametro_sistema', 'reloj_offset_h', `Reloj de demostración adelantado ${b.dataset.adelantar} h`);
    render();
  });
  if ($('#btn-reloj')) $('#btn-reloj').onclick = () => { setParam('reloj_offset_h', 0); auditar('MODIFICACION', 'parametro_sistema', 'reloj_offset_h', 'Reloj de demostración restablecido'); render(); };
}

/* ============================ PORTAL DEL TUTOR (HU5) ============================ */
function vistaPortal(main) {
  const hijos = q(`SELECT p.* FROM paciente p JOIN paciente_tutor pt ON pt.paciente_id = p.id WHERE pt.tutor_id = ?`, [sesion.tutor_id]);
  const citas = q(`SELECT c.*, p.nombres, u.nombre AS prof FROM cita c JOIN paciente p ON p.id = c.paciente_id JOIN paciente_tutor pt ON pt.paciente_id = p.id
                   JOIN usuario u ON u.id = c.profesional_id WHERE pt.tutor_id = ? AND c.fecha_hora >= ? ORDER BY c.fecha_hora`, [sesion.tutor_id, nowStr().slice(0, 10)]);
  const bandeja = q(`SELECT * FROM notificacion WHERE tutor_id = ? AND estado IN ('ENVIADA','DERIVADA') ORDER BY enviada_en DESC LIMIT 30`, [sesion.tutor_id]);
  auditar('CONSULTA', 'portal_tutor', sesion.tutor_id, 'Ingreso al portal de tutores');
  main.innerHTML = `
    <h1>Mis citas</h1>
    <p class="muted">Hijos/as registrados: ${hijos.map(h => `<b>${esc(h.nombres)} ${esc(h.apellidos)}</b>`).join(', ') || 'ninguno'}</p>
    <div class="emerg"><span><b>¿Urgencia?</b> Llame al SAMU</span><a class="btn btn-danger" href="tel:131">📞 131</a></div>
    <section class="card"><h2>Próximas horas</h2>
      ${citas.length ? citas.map(c => `<div class="cita-card"><div><b>${esc(c.nombres.split(' ')[0])}</b> · ${esc(c.especialidad)}<br>${fechaCorta(c.fecha_hora)} · ${esc(c.prof)}</div>
        <div>${badgeEstado(c.estado)}</div><div class="acts">${['AGENDADA', 'CONFIRMADA'].includes(c.estado) ? `
        ${c.estado === 'AGENDADA' ? `<button class="btn btn-sm btn-primary" data-tconf="${c.id}">Confirmar</button>` : ''}
        <button class="btn btn-sm" data-trepro="${c.id}">Reprogramar</button><button class="btn btn-sm btn-danger" data-tcanc="${c.id}">Cancelar</button>` : ''}</div></div>`).join('') : '<p class="muted">No tiene horas próximas.</p>'}
    </section>
    <section class="card"><h2>Mensajes recibidos (simulación de SMS, correo y llamada)</h2>
      ${bandeja.length ? bandeja.map(n => `<div class="msg"><span class="chip chip-neutral">${n.canal}</span> <span class="muted small">${fechaCorta(n.enviada_en)}</span>
        ${n.estado === 'DERIVADA' ? badge('No entregado: ' + (n.respuesta || ''), 'warn') : ''}<p>${esc(n.mensaje)}</p>
        ${n.estado === 'ENVIADA' && n.tipo.startsWith('RECORDATORIO') && n.canal === 'SMS' && !n.respuesta ? `<div class="acts"><button class="btn btn-sm" data-resp="CONFIRMAR" data-n="${n.id}" data-c="${n.cita_id}">Responder CONFIRMAR</button><button class="btn btn-sm" data-resp="CANCELAR" data-n="${n.id}" data-c="${n.cita_id}">Responder CANCELAR</button></div>` : ''}
        ${n.respuesta && n.estado === 'ENVIADA' ? `<p class="small muted">Su respuesta: ${esc(n.respuesta)}</p>` : ''}</div>`).join('') : '<p class="muted">Sin mensajes. Los recordatorios se envían 48 h y 24 h antes de cada hora.</p>'}
    </section>`;
  const propia = id => q1(`SELECT c.id FROM cita c JOIN paciente_tutor pt ON pt.paciente_id = c.paciente_id WHERE c.id = ? AND pt.tutor_id = ?`, [id, sesion.tutor_id]);
  const confirmar = (id, via) => {
    if (!propia(id)) return toast('La cita no corresponde a sus hijos/as.', 'error');
    tx(() => { run(`UPDATE cita SET estado = 'CONFIRMADA' WHERE id = ? AND estado = 'AGENDADA'`, [id]); registrarAuditoria('MODIFICACION', 'cita', id, `Cita confirmada por tutor vía ${via}`); });
    toast('Cita confirmada. ¡Gracias!', 'ok'); render();
  };
  $$('[data-tconf]').forEach(b => b.onclick = () => confirmar(Number(b.dataset.tconf), 'portal web'));
  $$('[data-tcanc]').forEach(b => b.onclick = () => { if (propia(b.dataset.tcanc)) modalCancelar(Number(b.dataset.tcanc), 'tutor vía portal web', render); });
  $$('[data-trepro]').forEach(b => b.onclick = () => { if (propia(b.dataset.trepro)) modalReprogramar(Number(b.dataset.trepro), render); });
  $$('[data-resp]').forEach(b => b.onclick = () => {
    const citaId = Number(b.dataset.c), resp = b.dataset.resp;
    const c = q1('SELECT estado FROM cita WHERE id = ?', [citaId]);
    tx(() => run('UPDATE notificacion SET respuesta = ? WHERE id = ?', [resp, b.dataset.n]));
    if (!c || !['AGENDADA', 'CONFIRMADA'].includes(c.estado)) { toast('La cita ya no está vigente.', 'warn'); return render(); }
    if (resp === 'CONFIRMAR') confirmar(citaId, 'respuesta SMS');
    else { try { const inv = tx(() => cancelarCita(citaId, 'Cancelada por tutor vía respuesta SMS', 'tutor vía SMS')); toast('Cita cancelada. La hora quedó disponible' + (inv ? ' y se invitó a un paciente en lista de espera.' : '.'), 'ok'); } catch (ex) { toast(ex.message, 'error'); } render(); }
  });
}

/* ============================ ASISTENTE VIRTUAL (HU6) ============================ */
let conversacionId = null;
async function vistaAsistente(main) {
  if (!conversacionId || !q1('SELECT id FROM conversacion_asistente WHERE id = ? AND usuario_id = ?', [conversacionId, sesion.id])) {
    const ult = q1('SELECT id FROM conversacion_asistente WHERE usuario_id = ? ORDER BY id DESC LIMIT 1', [sesion.id]);
    conversacionId = ult ? ult.id : null;
  }
  main.innerHTML = `
    <div class="head-row"><h1>Asistente virtual</h1><div class="acts"><button class="btn btn-ghost" id="btn-nueva">Nueva conversación</button><button class="btn btn-ghost" id="btn-raw">Ver almacenamiento cifrado</button></div></div>
    <div class="alert alert-info"><b>Orientación preliminar, no reemplaza la atención médica.</b> Este asistente no entrega diagnósticos ni indica medicamentos o dosis. Funciona con reglas locales: sus mensajes no se comparten con servicios de IA externos y se guardan cifrados.</div>
    <div class="emerg"><span><b>Si su hijo/a presenta un signo de alarma</b>, no espere.</span><a class="btn btn-danger" href="tel:131">📞 Llamar a urgencias 131</a></div>
    <section class="card chat"><div id="chat-log" aria-live="polite"></div>
      <div class="sugs">${['Tiene fiebre desde ayer', '¿Qué dosis de paracetamol le doy?', 'Le cuesta respirar y tiene los labios morados', '¿Cuándo es mi próxima cita?', '¿Necesita ayuno para el examen de sangre?', 'Información de vacunas'].map(s => `<button class="chip-btn" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form id="f-chat" class="chat-in"><input name="m" placeholder="Escriba su consulta…" autocomplete="off" maxlength="400" aria-label="Mensaje"><button class="btn btn-primary">Enviar</button></form></section>`;
  const log = $('#chat-log');
  const burbuja = (emisor, texto, nivel) => {
    const div = document.createElement('div');
    div.className = `burb ${emisor === 'TUTOR' ? 'yo' : 'bot'} ${nivel ? 'n-' + nivel : ''}`;
    div.innerHTML = `${nivel && emisor === 'ASISTENTE' ? `<div>${badgeEstado(nivel)}</div>` : ''}${esc(texto).replace(/\n/g, '<br>')}
      ${nivel === 'CRITICO' ? '<div><a class="btn btn-danger btn-sm" href="tel:131">📞 Llamar a urgencias 131</a></div>' : ''}`;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
  };
  if (conversacionId) {
    for (const m of q('SELECT * FROM mensaje_asistente WHERE conversacion_id = ? ORDER BY id', [conversacionId])) {
      try { burbuja(m.emisor, await descifrar(m.texto_cifrado, m.iv), m.nivel_urgencia); } catch (_) { burbuja(m.emisor, '[mensaje no descifrable]', null); }
    }
  }
  if (!log.children.length) burbuja('ASISTENTE', 'Hola. Puedo orientarle sobre síntomas comunes, vacunas, preparación de exámenes y sus próximas citas. ¿En qué le ayudo?', 'INFORMATIVO');

  const enviar = async texto => {
    texto = texto.trim();
    if (!texto) return;
    if (!exigir('asistente.usar', 'asistente')) return;
    burbuja('TUTOR', texto);
    const r = responderAsistente(texto);
    setTimeout(() => burbuja('ASISTENTE', r.texto, r.nivel), 250);
    const [c1, c2] = [await cifrar(texto), await cifrar(r.texto)];
    tx(() => {
      if (!conversacionId) conversacionId = run('INSERT INTO conversacion_asistente(usuario_id, iniciada_en) VALUES (?,?)', [sesion.id, nowStr()]);
      run('INSERT INTO mensaje_asistente(conversacion_id, emisor, texto_cifrado, iv, nivel_urgencia, fecha) VALUES (?,?,?,?,?,?)', [conversacionId, 'TUTOR', c1.texto_cifrado, c1.iv, r.nivel, nowStr()]);
      run('INSERT INTO mensaje_asistente(conversacion_id, emisor, texto_cifrado, iv, nivel_urgencia, fecha) VALUES (?,?,?,?,?,?)', [conversacionId, 'ASISTENTE', c2.texto_cifrado, c2.iv, r.nivel, nowStr()]);
      registrarAuditoria('CONSULTA', 'asistente_virtual', conversacionId, `Consulta al asistente clasificada como ${r.nivel}`);
    });
  };
  $('#f-chat').onsubmit = e => { e.preventDefault(); const i = e.target.m; enviar(i.value); i.value = ''; i.focus(); };
  $$('[data-sug]').forEach(b => b.onclick = () => enviar(b.dataset.sug));
  $('#btn-nueva').onclick = () => { conversacionId = null; log.innerHTML = ''; burbuja('ASISTENTE', 'Nueva conversación. ¿En qué le ayudo?', 'INFORMATIVO'); };
  $('#btn-raw').onclick = () => {
    const filas = conversacionId ? q('SELECT id, emisor, substr(texto_cifrado, 1, 48) AS cifrado, iv, nivel_urgencia FROM mensaje_asistente WHERE conversacion_id = ? ORDER BY id DESC LIMIT 8', [conversacionId]) : [];
    abrirModal('Así se guardan los mensajes en la base de datos', `<p class="small">Tabla <code>mensaje_asistente</code>: el texto se almacena cifrado con AES-GCM de 256 bits (criterio 6.3).</p>
      ${filas.length ? `<table class="tbl"><thead><tr><th>id</th><th>Emisor</th><th>texto_cifrado (inicio)</th><th>Nivel</th></tr></thead><tbody>${filas.map(f => `<tr><td>${f.id}</td><td>${f.emisor}</td><td><code>${esc(f.cifrado)}…</code></td><td>${f.nivel_urgencia}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aún no hay mensajes en esta conversación.</p>'}`, null, 'modal-lg');
  };
}

/* ============================ REPORTES (HU4) ============================ */
function vistaReportes(main) {
  const pacs = q('SELECT id, rut, nombres, apellidos FROM paciente ORDER BY apellidos');
  const hist = q(`SELECT r.*, p.nombres || ' ' || p.apellidos AS paciente, u.nombre AS autor FROM reporte_generado r JOIN paciente p ON p.id = r.paciente_id JOIN usuario u ON u.id = r.generado_por ORDER BY r.id DESC LIMIT 15`);
  main.innerHTML = `
    <h1>Reportes clínicos</h1>
    <section class="card"><form id="f-rep" class="grid3">
      <label>Paciente<select name="paciente_id" id="rep-pac">${pacs.map(p => `<option value="${p.id}">${esc(p.apellidos)}, ${esc(p.nombres)}</option>`).join('')}</select></label>
      <label>Tipo de reporte<select name="tipo" id="rep-tipo"><option value="RESUMEN_ATENCION">Resumen de atención</option><option value="INFORME_ALTA">Informe de alta</option><option value="HISTORIAL_COMPLETO">Historial clínico completo</option></select></label>
      <label>Atención<select name="atencion_id" id="rep-aten"></select></label>
      <p class="err" id="rep-err"></p>
      <div><button class="btn btn-primary">Generar reporte</button></div></form>
      <p class="muted small">Solo se emiten reportes de atenciones firmadas. Cada generación y exportación queda en la auditoría.</p></section>
    <section class="card"><h2>Reportes generados recientemente</h2>${hist.length ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Paciente</th><th>Generado por</th></tr></thead><tbody>
      ${hist.map(h => `<tr><td>${fechaCorta(h.fecha)}</td><td>${h.tipo.replace(/_/g, ' ')}</td><td>${esc(h.paciente)}</td><td>${esc(h.autor)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aún no se han generado reportes.</p>'}</section>`;
  const cargarAten = () => {
    const at = q(`SELECT a.id, a.fecha, a.tipo, a.motivo FROM atencion a JOIN ficha_clinica f ON f.id = a.ficha_id WHERE f.paciente_id = ? AND a.estado = 'FIRMADA' ORDER BY a.fecha DESC`, [$('#rep-pac').value]);
    $('#rep-aten').innerHTML = at.map(a => `<option value="${a.id}">${fechaCorta(a.fecha)} · ${a.tipo} · ${esc(a.motivo)}</option>`).join('') || '<option value="">(sin atenciones firmadas)</option>';
    $('#rep-aten').disabled = $('#rep-tipo').value === 'HISTORIAL_COMPLETO';
  };
  $('#rep-pac').onchange = cargarAten; $('#rep-tipo').onchange = cargarAten; cargarAten();
  $('#f-rep').onsubmit = e => {
    e.preventDefault();
    if (!exigir('reporte.generar', 'reporte')) return;
    const d = datosForm(e.target);
    if (d.tipo !== 'HISTORIAL_COMPLETO' && !d.atencion_id) return $('#rep-err').textContent = 'El paciente no tiene atenciones firmadas.';
    const html = construirReporte(d.tipo, Number(d.paciente_id), Number(d.atencion_id));
    const rid = tx(() => {
      const id = run('INSERT INTO reporte_generado(tipo, paciente_id, atencion_id, generado_por, fecha) VALUES (?,?,?,?,?)', [d.tipo, d.paciente_id, d.tipo === 'HISTORIAL_COMPLETO' ? null : d.atencion_id, sesion.id, nowStr()]);
      registrarAuditoria('EXPORTACION', 'reporte_generado', id, `Generación de ${d.tipo} del paciente #${d.paciente_id}`);
      return id;
    });
    abrirModal('Vista previa del reporte', `<div class="acts"><button class="btn btn-primary" id="btn-print">Imprimir / Guardar PDF</button><button class="btn" id="btn-dl">Descargar HTML</button></div><div class="reporte" id="rep-doc">${html}</div>`, root => {
      $('#btn-print', root).onclick = () => {
        const w = window.open('', '_blank');
        if (!w) return toast('El navegador bloqueó la ventana emergente. Use "Descargar HTML".', 'warn');
        w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${rid}</title><style>${CSS_REPORTE}</style></head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);
        w.document.close();
        auditar('EXPORTACION', 'reporte_generado', rid, 'Impresión / exportación PDF');
      };
      $('#btn-dl', root).onclick = () => {
        descargar(`reporte_${d.tipo.toLowerCase()}_${rid}.html`, `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${rid}</title><style>${CSS_REPORTE}</style></head><body>${html}</body></html>`, 'text/html');
        auditar('EXPORTACION', 'reporte_generado', rid, 'Descarga en formato HTML');
      };
    }, 'modal-lg');
  };
}
const CSS_REPORTE = `body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}h1{font-size:18px;margin:0}h2{font-size:14px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:18px}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}.enc{display:flex;justify-content:space-between;border-bottom:2px solid #0b4f6c;padding-bottom:8px}
  .pie{margin-top:30px;font-size:10px;color:#555;border-top:1px solid #ccc;padding-top:6px}.firma{margin-top:40px;text-align:center}`;
function construirReporte(tipo, pacienteId, atencionId) {
  const p = q1(`SELECT p.*, f.numero_ficha, f.grupo_sanguineo, ip.nombre AS prevision FROM paciente p JOIN ficha_clinica f ON f.paciente_id = p.id LEFT JOIN institucion_prevision ip ON ip.id = p.prevision_id WHERE p.id = ?`, [pacienteId]);
  const t = tutorPrincipal(pacienteId);
  const ats = tipo === 'HISTORIAL_COMPLETO'
    ? q(`SELECT a.*, u.nombre AS prof FROM atencion a JOIN usuario u ON u.id = a.profesional_id WHERE a.ficha_id = (SELECT id FROM ficha_clinica WHERE paciente_id = ?) AND a.estado = 'FIRMADA' ORDER BY a.fecha`, [pacienteId])
    : q(`SELECT a.*, u.nombre AS prof FROM atencion a JOIN usuario u ON u.id = a.profesional_id WHERE a.id = ?`, [atencionId]);
  const titulo = { RESUMEN_ATENCION: 'Resumen de atención', INFORME_ALTA: 'Informe de alta', HISTORIAL_COMPLETO: 'Historial clínico pediátrico' }[tipo];
  const bloqueAt = a => {
    const sv = q('SELECT * FROM signo_vital WHERE atencion_id = ?', [a.id]);
    const dg = q('SELECT * FROM diagnostico WHERE atencion_id = ?', [a.id]);
    const pr = q('SELECT * FROM procedimiento WHERE atencion_id = ?', [a.id]);
    const ex = q('SELECT * FROM examen WHERE atencion_id = ?', [a.id]);
    return `<h2>${fechaCorta(a.fecha)} · ${a.tipo} · ${esc(a.prof)}</h2>
      <p><b>Motivo:</b> ${esc(a.motivo)}<br><b>Anamnesis:</b> ${esc(a.anamnesis || '—')}</p>
      ${sv.length ? `<table><tr><th>Peso</th><th>Talla</th><th>T°</th><th>FC</th><th>Dolor</th></tr>${sv.map(s => `<tr><td>${s.peso_kg ?? '—'} kg</td><td>${s.talla_cm ?? '—'} cm</td><td>${s.temperatura_c ?? '—'} °C</td><td>${s.frecuencia_cardiaca ?? '—'}</td><td>${s.escala_dolor ?? '—'}/10</td></tr>`).join('')}</table>` : ''}
      <p><b>Diagnósticos:</b> ${dg.map(d => `${esc(d.codigo_cie10 || '')} ${esc(d.descripcion)} (${d.tipo.toLowerCase()})`).join('; ') || '—'}</p>
      ${pr.length ? `<p><b>Procedimientos:</b> ${pr.map(x => esc(x.descripcion)).join('; ')}</p>` : ''}
      ${ex.length ? `<p><b>Exámenes:</b> ${ex.map(x => `${esc(x.nombre)}: ${esc(x.resultado || 'pendiente')}`).join('; ')}</p>` : ''}
      <p><b>Indicaciones${tipo === 'INFORME_ALTA' ? ' al alta' : ''}:</b> ${esc(a.indicaciones || '—')}</p>
      <p style="font-size:10px;color:#555">Firma electrónica: ${a.firma_hash || '—'}</p>`;
  };
  return `<div class="enc"><div><h1>${titulo}</h1><div>Hospital Dr. Luis Calvo Mackenna · Ficha ${p.numero_ficha}</div></div><div style="text-align:right">Emitido: ${fechaCorta(nowStr())}<br>Por: ${esc(sesion.nombre)}</div></div>
    <h2>Identificación del paciente</h2>
    <table><tr><th>Nombre</th><td>${esc(p.nombres)} ${esc(p.apellidos)}</td><th>RUT</th><td>${p.rut}</td></tr>
      <tr><th>Fecha de nacimiento</th><td>${fechaCorta(p.fecha_nacimiento)} (${edad(p.fecha_nacimiento).texto})</td><th>Previsión</th><td>${esc(p.prevision || '—')} ${p.tramo_fonasa || ''}</td></tr>
      <tr><th>Alergias</th><td>${esc(p.alergias || 'No registra')}</td><th>Grupo sanguíneo</th><td>${esc(p.grupo_sanguineo || '—')}</td></tr>
      <tr><th>Tutor legal</th><td colspan="3">${t ? `${esc(t.nombres)} ${esc(t.apellidos)} (${t.rut}) · ${esc(t.telefono || '')} ${esc(t.email || '')}` : '—'}</td></tr></table>
    ${tipo === 'HISTORIAL_COMPLETO' ? `<h2>Antecedentes</h2><p>${esc(p.antecedentes || 'No registra')}</p>` : ''}
    ${ats.map(bloqueAt).join('') || '<p>Sin atenciones firmadas.</p>'}
    <div class="firma">_____________________________<br>${esc(ats.length ? ats[ats.length - 1].prof : sesion.nombre)}</div>
    <div class="pie">Documento generado por el prototipo académico de Ficha Electrónica Pediátrica (RQY1101 – Duoc UC). Contiene exclusivamente datos ficticios. Información confidencial protegida por la Ley N° 20.584.</div>`;
}

/* ============================ AUDITORÍA (HU8) ============================ */
function vistaAuditoria(main) {
  const usuarios = q('SELECT DISTINCT username FROM auditoria ORDER BY username');
  const acciones = q('SELECT DISTINCT accion FROM auditoria ORDER BY accion');
  main.innerHTML = `
    <div class="head-row"><h1>Registros de auditoría</h1><div class="acts">
      <button class="btn btn-primary" id="btn-verif">Verificar integridad de la cadena</button>
      <button class="btn" id="btn-inmut">Probar inmutabilidad</button><button class="btn" id="btn-csv">Exportar CSV</button></div></div>
    <div id="verif"></div>
    <div class="card filtros">
      <label>Usuario<select id="a-u"><option value="">Todos</option>${usuarios.map(u => `<option>${esc(u.username)}</option>`).join('')}</select></label>
      <label>Acción<select id="a-a"><option value="">Todas</option>${acciones.map(a => `<option>${a.accion}</option>`).join('')}</select></label>
      <label>Entidad<input id="a-e" placeholder="paciente, cita, ficha_clinica…"></label>
      <label>Desde<input type="date" id="a-d"></label></div>
    <section class="card" id="a-tabla"></section>`;
  let filas = [];
  const pintar = () => {
    let sql = 'SELECT * FROM auditoria WHERE 1 = 1'; const prm = [];
    if ($('#a-u').value) { sql += ' AND username = ?'; prm.push($('#a-u').value); }
    if ($('#a-a').value) { sql += ' AND accion = ?'; prm.push($('#a-a').value); }
    if ($('#a-e').value.trim()) { sql += ' AND entidad LIKE ?'; prm.push('%' + $('#a-e').value.trim() + '%'); }
    if ($('#a-d').value) { sql += ' AND fecha_hora >= ?'; prm.push($('#a-d').value); }
    filas = q(sql + ' ORDER BY id DESC LIMIT 300', prm);
    $('#a-tabla').innerHTML = `<p class="muted small">${filas.length} registro(s) mostrados (máx. 300).</p><table class="tbl small"><thead><tr><th>#</th><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>Hash</th></tr></thead><tbody>
      ${filas.map(f => `<tr class="${f.accion === 'ACCESO_DENEGADO' || f.accion === 'LOGIN_FALLIDO' ? 'row-warn' : ''}"><td>${f.id}</td><td>${f.fecha_hora}</td><td>${esc(f.username)}</td><td>${esc(f.rol)}</td><td>${f.accion}</td><td>${esc(f.entidad)}${f.entidad_id ? ' #' + esc(f.entidad_id) : ''}</td><td>${esc(f.detalle || '')}</td><td><code title="${f.hash}">${f.hash.slice(0, 10)}…</code></td></tr>`).join('')}</tbody></table>`;
  };
  ['#a-u', '#a-a', '#a-d'].forEach(s => $(s).onchange = pintar); $('#a-e').oninput = pintar;
  auditar('CONSULTA', 'auditoria', null, 'Consulta de registros de auditoría');
  pintar();
  $('#btn-verif').onclick = () => {
    const r = verificarCadenaAuditoria();
    $('#verif').innerHTML = r.ok ? `<div class="alert alert-ok">✔ Cadena íntegra: ${r.total} registros verificados. Ningún registro fue alterado ni eliminado.</div>`
      : `<div class="alert alert-danger">✖ Se detectó una alteración en el registro #${r.id}.</div>`;
    auditar('CONSULTA', 'auditoria', null, `Verificación de integridad: ${r.ok ? 'íntegra' : 'alterada en #' + r.id}`);
  };
  $('#btn-inmut').onclick = () => {
    const res = [];
    for (const [desc, sql] of [['UPDATE (modificar detalle)', `UPDATE auditoria SET detalle = 'alterado' WHERE id = (SELECT MIN(id) FROM auditoria)`], ['DELETE (eliminar registro)', 'DELETE FROM auditoria WHERE id = (SELECT MIN(id) FROM auditoria)']]) {
      try { db.run(sql); res.push(`<li>${desc}: <b class="err">ejecutado (¡falla de seguridad!)</b></li>`); }
      catch (e) { res.push(`<li>${desc}: <b class="ok-t">bloqueado</b> por trigger – <code>${esc(e.message)}</code></li>`); }
    }
    auditar('CONSULTA', 'auditoria', null, 'Prueba de inmutabilidad ejecutada (UPDATE y DELETE rechazados)');
    abrirModal('Prueba de inmutabilidad de la auditoría', `<p>Se intentó modificar y eliminar el primer registro directamente en la base de datos:</p><ul>${res.join('')}</ul><p class="muted small">Los triggers <code>trg_auditoria_no_update</code> y <code>trg_auditoria_no_delete</code> impiden cualquier cambio, incluso desde una consulta SQL directa.</p>`);
  };
  $('#btn-csv').onclick = () => {
    const cols = ['id', 'fecha_hora', 'username', 'rol', 'accion', 'entidad', 'entidad_id', 'detalle', 'hash_anterior', 'hash'];
    const csv = [cols.join(';'), ...filas.map(f => cols.map(c => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    descargar('auditoria_fep_hlcm.csv', '﻿' + csv, 'text/csv');
    auditar('EXPORTACION', 'auditoria', null, `Exportación CSV de ${filas.length} registros`);
  };
}

/* ============================ SEGURIDAD (HU7) ============================ */
function vistaSeguridad(main) {
  const roles = q('SELECT * FROM rol ORDER BY id');
  const permisos = q('SELECT * FROM permiso ORDER BY id');
  const rp = new Set(q("SELECT rol_id || '-' || permiso_id AS k FROM rol_permiso").map(r => r.k));
  const usuarios = q('SELECT u.id, u.username, u.nombre, u.activo, u.intentos_fallidos, r.nombre AS rol FROM usuario u JOIN rol r ON r.id = u.rol_id ORDER BY r.id');
  auditar('CONSULTA', 'usuario', null, 'Consulta de usuarios, roles y permisos');
  main.innerHTML = `<h1>Usuarios, roles y permisos</h1>
    <section class="card"><h2>Usuarios</h2><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Intentos fallidos</th><th></th></tr></thead><tbody>
      ${usuarios.map(u => `<tr><td>${u.username}</td><td>${esc(u.nombre)}</td><td>${esc(u.rol)}</td><td>${u.activo ? badge('Activo', 'ok') : badge('Bloqueado', 'danger')}</td><td>${u.intentos_fallidos}</td>
        <td>${!u.activo && puede('contingencia.gestionar') ? `<button class="btn btn-sm" data-desb="${u.id}">Desbloquear</button>` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="muted small">La cuenta se bloquea tras ${MAX_INTENTOS} intentos fallidos. Solo soporte TI puede desbloquearla.</p></section>
    <section class="card"><h2>Matriz rol × permiso (leída desde la tabla rol_permiso)</h2><div class="scroll"><table class="tbl matriz"><thead><tr><th>Permiso</th>${roles.map(r => `<th>${esc(r.nombre)}</th>`).join('')}</tr></thead><tbody>
      ${permisos.map(p => `<tr><td><code>${p.codigo}</code><br><span class="muted small">${esc(p.descripcion)}</span></td>${roles.map(r => `<td class="c">${rp.has(r.id + '-' + p.id) ? '✔' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  $$('[data-desb]').forEach(b => b.onclick = () => {
    if (!exigir('contingencia.gestionar', 'usuario', b.dataset.desb)) return;
    tx(() => { run('UPDATE usuario SET activo = 1, intentos_fallidos = 0 WHERE id = ?', [b.dataset.desb]); registrarAuditoria('MODIFICACION', 'usuario', b.dataset.desb, 'Cuenta desbloqueada por soporte TI'); });
    toast('Cuenta desbloqueada.', 'ok'); render();
  });
}

/* ============================ CONTINGENCIA (HU9) ============================ */
function vistaContingencia(main) {
  const online = conexionExterna();
  const ops = q(`SELECT o.*, u.username FROM operacion_pendiente o LEFT JOIN usuario u ON u.id = o.usuario_id ORDER BY o.id DESC LIMIT 100`);
  main.innerHTML = `
    <h1>Contingencia y sincronización diferida</h1>
    <section class="card estado-con ${online ? 'on' : 'off'}">
      <div><h2>${online ? '● Servicios externos en línea' : '● Modo contingencia activo'}</h2>
      <p>${online ? 'Las integraciones (simuladas) responden normalmente. La cola se procesa automáticamente cada 8 segundos.' : 'Las operaciones externas se guardan localmente en la tabla operacion_pendiente y se sincronizarán al restablecer la conexión.'}</p></div>
      <div class="acts">${online ? '<button class="btn btn-danger" id="btn-caida">Simular caída de red externa</button>' : '<button class="btn btn-primary" id="btn-volver">Restablecer conexión</button>'}
        <button class="btn" id="btn-sync" ${online ? '' : 'disabled'}>Sincronizar ahora</button><button class="btn btn-ghost" id="btn-dbdl">Descargar respaldo .sqlite</button></div>
    </section>
    <div class="kpis">${['PENDIENTE', 'SINCRONIZADA', 'ERROR'].map(e => `<div class="kpi"><span>${q1('SELECT COUNT(*) n FROM operacion_pendiente WHERE estado = ?', [e]).n}</span>${e}</div>`).join('')}</div>
    <section class="card"><h2>Cola de operaciones</h2>${ops.length ? `<table class="tbl"><thead><tr><th>#</th><th>Creada</th><th>Tipo</th><th>Referencia</th><th>Usuario</th><th>Intentos</th><th>Estado</th><th>Sincronizada</th></tr></thead><tbody>
      ${ops.map(o => `<tr><td>${o.id}</td><td>${fechaCorta(o.creada_en)}</td><td>${o.tipo.replace(/_/g, ' ')}</td><td>${esc(o.referencia)}</td><td>${esc(o.username || 'sistema')}</td><td>${o.intentos}</td><td>${badgeEstado(o.estado)}</td><td>${fechaCorta(o.sincronizada_en)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin operaciones.</p>'}</section>`;
  if ($('#btn-caida')) $('#btn-caida').onclick = () => { cambiarConexion(false); toast('Modo contingencia activado.', 'warn'); render(); };
  if ($('#btn-volver')) $('#btn-volver').onclick = async () => {
    cambiarConexion(true); toast('Conexión restablecida. Sincronizando…', 'info');
    const r = await sincronizarPendientes(false); toast(`Sincronización: ${r.ok} recuperadas, ${r.error} con error.`, 'ok'); render();
  };
  $('#btn-sync').onclick = async () => { const r = await sincronizarPendientes(false); toast(`Sincronización: ${r.ok} recuperadas, ${r.error} con error.`, r.ok ? 'ok' : 'info'); render(); };
  $('#btn-dbdl').onclick = () => { descargar(`fep_hlcm_${nowStr().slice(0, 10)}.sqlite`, new Blob([db.export()], { type: 'application/x-sqlite3' })); db.run('PRAGMA foreign_keys = ON'); auditar('EXPORTACION', 'base_datos', null, 'Descarga de respaldo de la base de datos'); };
}

/* ============================ CONSULTAS SQL ============================ */
const CONSULTAS_SQL = [
  ['Historial completo de un paciente', `SELECT a.fecha, a.tipo, a.motivo, d.codigo_cie10, d.descripcion AS diagnostico, u.nombre AS profesional
FROM paciente p JOIN ficha_clinica f ON f.paciente_id = p.id
JOIN atencion a ON a.ficha_id = f.id JOIN usuario u ON u.id = a.profesional_id
LEFT JOIN diagnostico d ON d.atencion_id = a.id
WHERE p.rut = '24611345-9' ORDER BY a.fecha DESC`],
  ['Pacientes con tutor principal y previsión', `SELECT p.rut, p.nombres || ' ' || p.apellidos AS paciente, ip.nombre AS prevision, p.estado_validacion,
       t.nombres || ' ' || t.apellidos AS tutor, pt.parentesco
FROM paciente p LEFT JOIN institucion_prevision ip ON ip.id = p.prevision_id
JOIN paciente_tutor pt ON pt.paciente_id = p.id AND pt.es_principal = 1 JOIN tutor t ON t.id = pt.tutor_id`],
  ['Agenda de citas vigentes por profesional', `SELECT u.nombre AS profesional, c.fecha_hora, p.nombres || ' ' || p.apellidos AS paciente, c.estado
FROM cita c JOIN usuario u ON u.id = c.profesional_id JOIN paciente p ON p.id = c.paciente_id
WHERE c.estado IN ('AGENDADA','CONFIRMADA') ORDER BY u.nombre, c.fecha_hora`],
  ['Tasa de entrega de recordatorios por canal', `SELECT canal, COUNT(*) AS total,
       SUM(estado = 'ENVIADA') AS enviadas, SUM(estado = 'DERIVADA') AS derivadas,
       ROUND(100.0 * SUM(estado = 'ENVIADA') / COUNT(*), 1) AS pct_entrega
FROM notificacion WHERE estado <> 'PROGRAMADA' GROUP BY canal`],
  ['Accesos por usuario y acción (auditoría)', `SELECT username, rol, accion, COUNT(*) AS cantidad, MAX(fecha_hora) AS ultimo
FROM auditoria GROUP BY username, rol, accion ORDER BY username, cantidad DESC`],
  ['Intentos de acceso denegado', `SELECT fecha_hora, username, rol, entidad, detalle FROM auditoria
WHERE accion IN ('ACCESO_DENEGADO','LOGIN_FALLIDO') ORDER BY id DESC`],
  ['Quién accedió a la ficha de un paciente', `SELECT a.fecha_hora, a.username, a.rol, a.accion, a.detalle
FROM auditoria a JOIN ficha_clinica f ON a.entidad = 'ficha_clinica' AND a.entidad_id = CAST(f.id AS TEXT)
JOIN paciente p ON p.id = f.paciente_id WHERE p.rut = '24611345-9' ORDER BY a.id DESC`],
  ['Tiempos de respuesta de integraciones', `SELECT servicio, COUNT(*) AS consultas, ROUND(AVG(tiempo_ms)) AS promedio_ms, MAX(tiempo_ms) AS maximo_ms,
       SUM(tiempo_ms < 1500) AS bajo_1500ms
FROM validacion_externa GROUP BY servicio`],
  ['Estado de la cola de contingencia', `SELECT tipo, estado, COUNT(*) AS cantidad, MAX(intentos) AS max_intentos FROM operacion_pendiente GROUP BY tipo, estado`],
  ['Matriz de permisos por rol', `SELECT r.nombre AS rol, GROUP_CONCAT(p.codigo, ', ') AS permisos
FROM rol r JOIN rol_permiso rp ON rp.rol_id = r.id JOIN permiso p ON p.id = rp.permiso_id GROUP BY r.id`],
  ['Exámenes pendientes de resultado', `SELECT p.nombres || ' ' || p.apellidos AS paciente, e.nombre, e.fecha_solicitud
FROM examen e JOIN ficha_clinica f ON f.id = e.ficha_id JOIN paciente p ON p.id = f.paciente_id WHERE e.estado = 'SOLICITADO'`],
  ['Estructura de tablas (diccionario)', `SELECT m.name AS tabla, p.name AS columna, p.type AS tipo, p."notnull" AS obligatorio, p.pk AS clave_primaria
FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' ORDER BY m.name, p.cid`]
];
function vistaSQL(main) {
  main.innerHTML = `<h1>Consultas SQL (solo lectura)</h1>
    <section class="card"><label>Consulta predefinida<select id="sql-pre">${CONSULTAS_SQL.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></label>
      <label>SQL<textarea id="sql-txt" rows="7" class="mono" spellcheck="false"></textarea></label>
      <div class="acts"><button class="btn btn-primary" id="sql-run">Ejecutar</button><span class="muted small">Solo se permiten sentencias SELECT/WITH. Toda ejecución queda auditada.</span></div>
      <p class="err" id="sql-err"></p></section><section class="card" id="sql-res"></section>`;
  const cargar = () => { $('#sql-txt').value = CONSULTAS_SQL[$('#sql-pre').value][1]; };
  $('#sql-pre').onchange = cargar; cargar();
  $('#sql-run').onclick = () => {
    const sql = $('#sql-txt').value.trim().replace(/;\s*$/, '');
    $('#sql-err').textContent = '';
    if (!/^(select|with)\b/i.test(sql) || sql.includes(';') || /\b(insert|update|delete|drop|alter|create|replace|attach|pragma\s+\w+\s*=)\b/i.test(sql)) {
      auditar('ACCESO_DENEGADO', 'sql', null, 'Intento de ejecutar SQL no permitido: ' + sql.slice(0, 120));
      return $('#sql-err').textContent = 'Solo se permite una sentencia SELECT/WITH de lectura.';
    }
    try {
      const t0 = performance.now();
      const res = db.exec(sql);
      const ms = Math.round(performance.now() - t0);
      auditar('CONSULTA', 'sql', null, sql.slice(0, 200));
      if (!res.length) return $('#sql-res').innerHTML = `<p class="muted">Sin filas (${ms} ms).</p>`;
      const { columns, values } = res[0];
      $('#sql-res').innerHTML = `<p class="muted small">${values.length} fila(s) · ${ms} ms</p><div class="scroll"><table class="tbl small"><thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${values.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } catch (e) { $('#sql-err').textContent = e.message; }
  };
}
