/* =====================================================================
 * seed.js – Datos de demostración (100% FICTICIOS) y datos de los
 * adaptadores externos simulados (Registro Civil, FONASA/ISAPRE, Red Pública).
 * Ningún nombre, RUT o antecedente corresponde a una persona real.
 * ===================================================================== */
'use strict';

const ROLES = [
  [1, 'MEDICO', 'Médico/a', 'Registra atenciones, diagnósticos y firma la ficha'],
  [2, 'ENFERMERA', 'Enfermero/a', 'Registra constantes vitales y exámenes'],
  [3, 'ADMISION', 'Administrativo/a de admisión', 'Registra pacientes, valida previsión y gestiona citas'],
  [4, 'AUDITOR', 'Auditor/a clínico y de cumplimiento', 'Consulta registros de auditoría (solo lectura)'],
  [5, 'ADMIN_TI', 'Administrador/a de soporte TI', 'Gestiona contingencias, sincronización y usuarios'],
  [6, 'TUTOR', 'Tutor legal / padre o madre', 'Portal de citas, recordatorios y asistente virtual']
];

const PERMISOS = [
  ['paciente.ver', 'Consultar datos de pacientes'],
  ['paciente.crear', 'Registrar pacientes y tutores'],
  ['paciente.editar', 'Actualizar antecedentes y datos de contacto'],
  ['ficha.ver', 'Ver ficha clínica e historial'],
  ['atencion.crear', 'Registrar y firmar atenciones, diagnósticos y procedimientos'],
  ['signos.registrar', 'Registrar constantes vitales'],
  ['examen.registrar', 'Registrar exámenes y resultados'],
  ['validacion.ejecutar', 'Validar identidad y previsión (FONASA/ISAPRE/Registro Civil)'],
  ['red.consultar', 'Consultar antecedentes en la Red de Salud Pública'],
  ['reporte.generar', 'Generar y exportar reportes clínicos'],
  ['cita.ver', 'Consultar agenda'],
  ['cita.gestionar', 'Crear, confirmar, cancelar y reprogramar citas'],
  ['notificacion.gestionar', 'Gestionar envío de recordatorios'],
  ['portal.tutor', 'Acceder al portal de tutores'],
  ['asistente.usar', 'Usar el asistente virtual'],
  ['auditoria.ver', 'Consultar registros de auditoría'],
  ['seguridad.ver', 'Ver usuarios, roles y permisos'],
  ['contingencia.gestionar', 'Gestionar modo contingencia y sincronización'],
  ['sql.consultar', 'Ejecutar consultas SQL de solo lectura']
];

const MATRIZ_ROL_PERMISO = {
  MEDICO: ['paciente.ver','paciente.editar','ficha.ver','atencion.crear','signos.registrar','examen.registrar','validacion.ejecutar','red.consultar','reporte.generar','cita.ver'],
  ENFERMERA: ['paciente.ver','ficha.ver','signos.registrar','examen.registrar','cita.ver'],
  ADMISION: ['paciente.ver','paciente.crear','paciente.editar','validacion.ejecutar','reporte.generar','cita.ver','cita.gestionar','notificacion.gestionar'],
  AUDITOR: ['auditoria.ver','seguridad.ver','sql.consultar'],
  ADMIN_TI: ['contingencia.gestionar','seguridad.ver','sql.consultar','notificacion.gestionar'],
  TUTOR: ['portal.tutor','asistente.usar']
};

const PASSWORD_DEMO = 'demo123';
const USUARIOS_DEMO = [
  // username, nombre, rol, especialidad, tutor_id
  ['dra.rojas', 'Dra. Camila Rojas Vidal', 'MEDICO', 'Pediatría general', null],
  ['dr.fuentes', 'Dr. Ignacio Fuentes Lara', 'MEDICO', 'Broncopulmonar infantil', null],
  ['enf.munoz', 'EU Valentina Muñoz Toro', 'ENFERMERA', null, null],
  ['adm.perez', 'Felipe Pérez Olmos', 'ADMISION', null, null],
  ['aud.lagos', 'Carolina Lagos Ibáñez', 'AUDITOR', null, null],
  ['ti.vera', 'Sebastián Vera Cáceres', 'ADMIN_TI', null, null],
  ['tutor.ruiz', 'Marcela Ruiz Pinto', 'TUTOR', null, 1]
];

/* ---- Adaptador simulado: Registro Civil ---- */
const MOCK_REGISTRO_CIVIL = {
  '24611345-9': { nombres: 'Tomás Andrés', apellidos: 'González Ruiz', fecha_nacimiento: '2013-04-12', sexo: 'M', estado: 'VIGENTE' },
  '27120458-2': { nombres: 'Isidora Belén', apellidos: 'González Ruiz', fecha_nacimiento: '2020-09-03', sexo: 'F', estado: 'VIGENTE' },
  '25103877-5': { nombres: 'Benjamín Ignacio', apellidos: 'Castro Leiva', fecha_nacimiento: '2015-06-21', sexo: 'M', estado: 'VIGENTE' },
  '26012993-7': { nombres: 'Agustina Paz', apellidos: 'Morales Díaz', fecha_nacimiento: '2017-11-02', sexo: 'F', estado: 'VIGENTE' },
  '25784120-0': { nombres: 'Matías Alonso', apellidos: 'Herrera Soto', fecha_nacimiento: '2016-02-14', sexo: 'M', estado: 'VIGENTE' },
  '27388019-4': { nombres: 'Florencia Antonia', apellidos: 'Navarro Paz', fecha_nacimiento: '2021-07-30', sexo: 'F', estado: 'VIGENTE' },
  // RUT disponibles para demostrar el registro de pacientes nuevos:
  '26455701-1': { nombres: 'Martina Josefa', apellidos: 'Vidal Campos', fecha_nacimiento: '2018-03-09', sexo: 'F', estado: 'VIGENTE' },
  '27650332-4': { nombres: 'Lucas Emilio', apellidos: 'Ortiz Reyes', fecha_nacimiento: '2022-01-17', sexo: 'M', estado: 'VIGENTE' },
  '26901144-0': { nombres: 'Gaspar Andrés', apellidos: 'Soto Molina', fecha_nacimiento: '2019-05-25', sexo: 'M', estado: 'BLOQUEADO' }
  // 26777888-4 es un RUT válido que NO existe en el Registro Civil simulado
};

/* ---- Adaptador simulado: FONASA / ISAPRE ---- */
const MOCK_PREVISION = {
  '24611345-9': { tipo: 'FONASA', tramo: 'B' },
  '27120458-2': { tipo: 'FONASA', tramo: 'B' },
  '25103877-5': { tipo: 'ISAPRE', nombre: 'ISAPRE Ficticia Andes' },
  '26012993-7': { tipo: 'FONASA', tramo: 'A' },
  '25784120-0': { tipo: 'FONASA', tramo: 'C' },
  '27388019-4': { tipo: 'FONASA', tramo: 'C' },
  '26455701-1': { tipo: 'FONASA', tramo: 'D' },
  '27650332-4': { tipo: 'ISAPRE', nombre: 'ISAPRE Ficticia Cordillera' },
  '26901144-0': { tipo: 'SIN_PREVISION' }
};

/* ---- Adaptador simulado: Red de Salud Pública (antecedentes de otros hospitales) ---- */
const MOCK_RED_PUBLICA = {
  '24611345-9': [
    { establecimiento: 'Hospital Público Ficticio Sur (simulado)', fecha: '2025-08-14', tipo: 'LABORATORIO', descripcion: 'Hemograma completo', resultado: 'Dentro de rangos de referencia (dato ficticio)' },
    { establecimiento: 'CESFAM Ficticio Los Aromos (simulado)', fecha: '2026-03-02', tipo: 'OTRO', descripcion: 'Control niño sano', resultado: 'Sin observaciones (dato ficticio)' }
  ],
  '25103877-5': [
    { establecimiento: 'Hospital Público Ficticio Norte (simulado)', fecha: '2026-01-20', tipo: 'IMAGEN', descripcion: 'Radiografía de tórax', resultado: 'Informe disponible en establecimiento de origen (dato ficticio)' }
  ],
  '26012993-7': [
    { establecimiento: 'Hospital Público Ficticio Sur (simulado)', fecha: '2026-05-11', tipo: 'LABORATORIO', descripcion: 'Perfil bioquímico', resultado: 'Dentro de rangos de referencia (dato ficticio)' }
  ]
};

const PREVISIONES = [[1,'FONASA','FONASA'],[2,'ISAPRE','ISAPRE Ficticia Andes'],[3,'ISAPRE','ISAPRE Ficticia Cordillera'],[4,'SIN_PREVISION','Sin previsión']];

const TUTORES = [
  // id, rut, nombres, apellidos, teléfono, email, canal
  [1, '15234876-2', 'Marcela', 'Ruiz Pinto', '+56 9 1111 0001', 'marcela.ruiz@correo-ficticio.cl', 'SMS'],
  [2, '14987321-K', 'Rodrigo', 'Castro Núñez', '+56 9 1111 0002', 'rodrigo.castro@correo-ficticio.cl', 'EMAIL'],
  [3, '16345982-5', 'Paula', 'Díaz Fernández', '', 'rebota@correo-ficticio.cl', 'EMAIL'],   // sin teléfono y correo que rebota → demuestra derivación a llamada
  [4, '13876540-7', 'Jorge', 'Herrera Molina', '+56 9 1111 0004', 'jorge.herrera@correo-ficticio.cl', 'SMS'],
  [5, '17023456-1', 'Carla', 'Paz Errázuriz', '+56 9 1111 0005', 'carla.paz@correo-ficticio.cl', 'SMS']
];

/** Crea el esquema y carga los datos de demostración. */
function sembrarBase() {
  db.exec(SCHEMA_SQL);
  const ahoraS = nowStr();
  const hoy = ahora();
  const diaRel = (dias, hh, mm = 0) => { const d = new Date(hoy); d.setDate(d.getDate() + dias); d.setHours(hh, mm, 0, 0); return fmt(d); };

  db.run('BEGIN');
  ROLES.forEach(r => run('INSERT INTO rol VALUES (?,?,?,?)', r));
  PERMISOS.forEach(([c, d]) => run('INSERT INTO permiso(codigo, descripcion) VALUES (?,?)', [c, d]));
  Object.entries(MATRIZ_ROL_PERMISO).forEach(([rol, perms]) => perms.forEach(p =>
    run('INSERT INTO rol_permiso SELECT r.id, p.id FROM rol r, permiso p WHERE r.codigo = ? AND p.codigo = ?', [rol, p])));
  PREVISIONES.forEach(p => run('INSERT INTO institucion_prevision VALUES (?,?,?)', p));
  TUTORES.forEach(t => run('INSERT INTO tutor VALUES (?,?,?,?,?,?,?)', t));
  USUARIOS_DEMO.forEach(([u, n, rol, esp, tut]) => {
    const sal = sha256(u + 'sal-demo').slice(0, 16);
    run(`INSERT INTO usuario(username, nombre, password_hash, sal, rol_id, tutor_id, especialidad)
         VALUES (?,?,?,?,(SELECT id FROM rol WHERE codigo = ?),?,?)`, [u, n, sha256(sal + PASSWORD_DEMO), sal, rol, tut, esp]);
  });
  const uid = u => q1('SELECT id FROM usuario WHERE username = ?', [u]).id;
  const ROJAS = uid('dra.rojas'), FUENTES = uid('dr.fuentes'), MUNOZ = uid('enf.munoz'), PEREZ = uid('adm.perez');

  // Pacientes: [rut, previsión_id, tramo, estado, alergias, antecedentes, tutor_id, parentesco, grupo]
  const pacientes = [
    ['24611345-9', 1, 'B', 'VALIDADO', 'Penicilina (dato ficticio)', 'Asma bronquial leve (dato ficticio)', 1, 'Madre', 'O+'],
    ['27120458-2', 1, 'B', 'VALIDADO', '', 'Sin antecedentes relevantes', 1, 'Madre', 'A+'],
    ['25103877-5', 2, null, 'VALIDADO', '', 'Fractura de antebrazo 2024 (dato ficticio)', 2, 'Padre', 'B+'],
    ['26012993-7', 1, 'A', 'VALIDADO', 'Látex (dato ficticio)', 'Prematurez 34 semanas (dato ficticio)', 3, 'Madre', 'O-'],
    ['25784120-0', 1, 'C', 'PROVISORIO', '', '', 4, 'Padre', null],
    ['27388019-4', 1, 'C', 'VALIDADO', '', 'Sin antecedentes relevantes', 5, 'Madre', 'AB+']
  ];
  pacientes.forEach(([rut, prev, tramo, est, alg, ant, tut, par, gs], i) => {
    const rc = MOCK_REGISTRO_CIVIL[rut];
    const pid = run(`INSERT INTO paciente(rut, nombres, apellidos, fecha_nacimiento, sexo, prevision_id, tramo_fonasa,
                     estado_validacion, alergias, antecedentes, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [rut, rc.nombres, rc.apellidos, rc.fecha_nacimiento, rc.sexo, prev, tramo, est, alg, ant, ahoraS]);
    run('INSERT INTO paciente_tutor VALUES (?,?,?,1)', [pid, tut, par]);
    run('INSERT INTO ficha_clinica(paciente_id, numero_ficha, fecha_apertura, grupo_sanguineo) VALUES (?,?,?,?)',
      [pid, 'FC-' + String(100230 + i), diaRel(-200 + i * 7, 9).slice(0, 10), gs]);
  });
  // Paciente 5 quedó provisorio: su validación está pendiente en la cola de sincronización
  run(`INSERT INTO operacion_pendiente(tipo, referencia, payload, creada_en, usuario_id)
       VALUES ('VALIDACION_PREVISIONAL','25784120-0','{"motivo":"Caída del servicio externo durante admisión"}',?,?)`, [diaRel(-1, 10, 15), PEREZ]);

  // Atenciones firmadas de ejemplo
  const atenciones = [
    [1, ROJAS, diaRel(-40, 10), 'AMBULATORIA', 'Tos persistente de 5 días', 'Tos seca nocturna, sin fiebre (dato ficticio)', 'Control en 2 semanas', [['J20.9', 'Bronquitis aguda, no especificada', 'PRESUNTIVO']], [], [24.5, 128, 36.8, 96, 2]],
    [1, ROJAS, diaRel(-12, 11), 'CONTROL', 'Control de asma', 'Evolución favorable (dato ficticio)', 'Mantener indicaciones previas', [['J45.9', 'Asma, no especificada', 'CONFIRMADO']], [], [25.1, 129, 36.5, 92, 0]],
    [3, FUENTES, diaRel(-25, 15), 'URGENCIA', 'Dificultad respiratoria leve', 'Sibilancias espiratorias (dato ficticio)', 'Nebulización en servicio', [['J21.9', 'Bronquiolitis aguda, no especificada', 'PRESUNTIVO']], [['PROCEDIMIENTO', 'Nebulización con suero fisiológico']], [32.0, 141, 37.9, 118, 4]],
    [4, ROJAS, diaRel(-60, 9), 'HOSPITALIZACION', 'Deshidratación moderada', 'Cuadro gastrointestinal de 3 días (dato ficticio)', 'Alta con control en APS', [['A09', 'Diarrea y gastroenteritis de presunto origen infeccioso', 'CONFIRMADO']], [['PROCEDIMIENTO', 'Hidratación endovenosa']], [16.2, 104, 38.2, 130, 3]],
    [6, FUENTES, diaRel(-5, 12), 'AMBULATORIA', 'Fiebre de 1 día', 'Sin signos de alarma (dato ficticio)', 'Control si persiste más de 48 h', [['R50.9', 'Fiebre, no especificada', 'PRESUNTIVO']], [], [13.4, 92, 38.4, 135, 2]]
  ];
  atenciones.forEach(([fichaId, prof, fecha, tipo, motivo, anam, ind, diags, procs, sv]) => {
    const firma = sha256(`${fichaId}|${prof}|${fecha}|${motivo}`);
    const aid = run(`INSERT INTO atencion(ficha_id, profesional_id, fecha, tipo, motivo, anamnesis, indicaciones, estado, firmada_en, firma_hash)
                     VALUES (?,?,?,?,?,?,?,'FIRMADA',?,?)`, [fichaId, prof, fecha, tipo, motivo, anam, ind, sumarHoras(fecha, 1), firma]);
    diags.forEach(d => run('INSERT INTO diagnostico(atencion_id, codigo_cie10, descripcion, tipo) VALUES (?,?,?,?)', [aid, ...d]));
    procs.forEach(p => run('INSERT INTO procedimiento(atencion_id, tipo, descripcion, fecha) VALUES (?,?,?,?)', [aid, p[0], p[1], fecha]));
    run(`INSERT INTO signo_vital(atencion_id, peso_kg, talla_cm, temperatura_c, frecuencia_cardiaca, escala_dolor, registrado_por, registrado_en)
         VALUES (?,?,?,?,?,?,?,?)`, [aid, ...sv, MUNOZ, fecha]);
  });
  // Exámenes
  [[1, 1, 'Espirometría', 'OTRO', diaRel(-40, 10), diaRel(-35, 9), 'Patrón obstructivo leve reversible (dato ficticio)'],
   [3, 3, 'Radiografía de tórax', 'IMAGEN', diaRel(-25, 15), diaRel(-25, 17), 'Sin consolidación (dato ficticio)'],
   [4, 4, 'Electrolitos plasmáticos', 'LABORATORIO', diaRel(-60, 9), diaRel(-60, 13), 'Normalizados al alta (dato ficticio)'],
   [1, 2, 'Hemograma', 'LABORATORIO', diaRel(-12, 11), null, null]
  ].forEach(([ficha, aten, nom, tipo, fs, fr, res]) =>
    run(`INSERT INTO examen(ficha_id, atencion_id, nombre, tipo, fecha_solicitud, fecha_resultado, resultado, estado, registrado_por)
         VALUES (?,?,?,?,?,?,?,?,?)`, [ficha, aten, nom, tipo, fs, fr, res, res ? 'CON_RESULTADO' : 'SOLICITADO', MUNOZ]));

  // Citas futuras (relativas a la fecha actual) y lista de espera
  const citas = [
    [1, ROJAS, 'Pediatría general', diaRel(2, 10, 0), 'AGENDADA'],
    [2, ROJAS, 'Pediatría general', diaRel(3, 11, 30), 'CONFIRMADA'],
    [3, FUENTES, 'Broncopulmonar infantil', diaRel(1, 15, 0), 'AGENDADA'],
    [4, ROJAS, 'Pediatría general', diaRel(2, 9, 0), 'AGENDADA'],
    [6, FUENTES, 'Broncopulmonar infantil', diaRel(5, 16, 30), 'AGENDADA']
  ];
  citas.forEach(([pac, prof, esp, fh, est]) => {
    const cid = run(`INSERT INTO cita(paciente_id, profesional_id, especialidad, fecha_hora, estado, creada_por, creada_en)
                     VALUES (?,?,?,?,?,?,?)`, [pac, prof, esp, fh, est, PEREZ, ahoraS]);
    programarRecordatorios(cid);
  });
  run(`INSERT INTO lista_espera(paciente_id, especialidad, fecha_ingreso) VALUES (5, 'Pediatría general', ?)`, [diaRel(-3, 9)]);
  run(`INSERT INTO lista_espera(paciente_id, especialidad, fecha_ingreso) VALUES (2, 'Broncopulmonar infantil', ?)`, [diaRel(-2, 9)]);

  setParam('conexion_externa', 'ON');
  setParam('reloj_offset_h', '0');
  setParam('version_base', '1.0');
  db.run('COMMIT');
  registrarAuditoria('CREACION', 'base_datos', null, 'Inicialización de base de demostración con datos ficticios', USUARIO_SISTEMA);
  persist();
}
