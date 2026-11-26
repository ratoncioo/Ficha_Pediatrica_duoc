-- =====================================================================
-- Ficha Electrónica Pediátrica – Hospital Dr. Luis Calvo Mackenna
-- Prototipo académico RQY1101 – Duoc UC
-- Modelo relacional (SQLite 3). Todos los datos de prueba son FICTICIOS.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. SEGURIDAD: roles, permisos y usuarios (HU7)
-- ---------------------------------------------------------------------
CREATE TABLE rol (
  id          INTEGER PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE permiso (
  id          INTEGER PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL
);

CREATE TABLE rol_permiso (
  rol_id     INTEGER NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  permiso_id INTEGER NOT NULL REFERENCES permiso(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE tutor (
  id         INTEGER PRIMARY KEY,
  rut        TEXT NOT NULL UNIQUE,
  nombres    TEXT NOT NULL,
  apellidos  TEXT NOT NULL,
  telefono   TEXT,
  email      TEXT,
  canal_preferido TEXT NOT NULL DEFAULT 'SMS' CHECK (canal_preferido IN ('SMS','EMAIL','LLAMADA'))
);

CREATE TABLE usuario (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- SHA-256(sal + contraseña)
  sal           TEXT NOT NULL,
  rol_id        INTEGER NOT NULL REFERENCES rol(id),
  tutor_id      INTEGER REFERENCES tutor(id),   -- solo para usuarios con rol TUTOR
  especialidad  TEXT,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  intentos_fallidos INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 2. PACIENTES, PREVISIÓN Y TUTORES (HU1, HU2)
-- ---------------------------------------------------------------------
CREATE TABLE institucion_prevision (
  id     INTEGER PRIMARY KEY,
  tipo   TEXT NOT NULL CHECK (tipo IN ('FONASA','ISAPRE','SIN_PREVISION')),
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE paciente (
  id                INTEGER PRIMARY KEY,
  rut               TEXT NOT NULL UNIQUE,
  nombres           TEXT NOT NULL,
  apellidos         TEXT NOT NULL,
  fecha_nacimiento  TEXT NOT NULL,                       -- AAAA-MM-DD
  sexo              TEXT NOT NULL CHECK (sexo IN ('F','M','I')),
  prevision_id      INTEGER REFERENCES institucion_prevision(id),
  tramo_fonasa      TEXT CHECK (tramo_fonasa IN ('A','B','C','D') OR tramo_fonasa IS NULL),
  estado_validacion TEXT NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado_validacion IN ('VALIDADO','PROVISORIO','ALERTA','PENDIENTE')),
  alergias          TEXT,
  antecedentes      TEXT,
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT
);

CREATE TABLE paciente_tutor (
  paciente_id  INTEGER NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  tutor_id     INTEGER NOT NULL REFERENCES tutor(id),
  parentesco   TEXT NOT NULL,
  es_principal INTEGER NOT NULL DEFAULT 0 CHECK (es_principal IN (0,1)),
  PRIMARY KEY (paciente_id, tutor_id)
);

-- ---------------------------------------------------------------------
-- 3. FICHA CLÍNICA E HISTORIAL (HU2)
-- ---------------------------------------------------------------------
CREATE TABLE ficha_clinica (
  id              INTEGER PRIMARY KEY,
  paciente_id     INTEGER NOT NULL UNIQUE REFERENCES paciente(id),   -- 1 ficha por paciente
  numero_ficha    TEXT NOT NULL UNIQUE,
  fecha_apertura  TEXT NOT NULL,
  grupo_sanguineo TEXT
);

CREATE TABLE atencion (
  id             INTEGER PRIMARY KEY,
  ficha_id       INTEGER NOT NULL REFERENCES ficha_clinica(id),
  profesional_id INTEGER NOT NULL REFERENCES usuario(id),           -- médico asignado
  fecha          TEXT NOT NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('AMBULATORIA','URGENCIA','HOSPITALIZACION','CONTROL')),
  motivo         TEXT NOT NULL,
  anamnesis      TEXT,
  indicaciones   TEXT,
  estado         TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','FIRMADA')),
  firmada_en     TEXT,
  firma_hash     TEXT
);

CREATE TABLE signo_vital (
  id                  INTEGER PRIMARY KEY,
  atencion_id         INTEGER NOT NULL REFERENCES atencion(id) ON DELETE CASCADE,
  peso_kg             REAL CHECK (peso_kg BETWEEN 0.3 AND 200),
  talla_cm            REAL CHECK (talla_cm BETWEEN 20 AND 220),
  temperatura_c       REAL CHECK (temperatura_c BETWEEN 30 AND 44),
  frecuencia_cardiaca INTEGER CHECK (frecuencia_cardiaca BETWEEN 30 AND 260),
  escala_dolor        INTEGER CHECK (escala_dolor BETWEEN 0 AND 10),
  registrado_por      INTEGER NOT NULL REFERENCES usuario(id),
  registrado_en       TEXT NOT NULL
);

CREATE TABLE diagnostico (
  id           INTEGER PRIMARY KEY,
  atencion_id  INTEGER NOT NULL REFERENCES atencion(id) ON DELETE CASCADE,
  codigo_cie10 TEXT,
  descripcion  TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('PRESUNTIVO','CONFIRMADO'))
);

CREATE TABLE procedimiento (
  id          INTEGER PRIMARY KEY,
  atencion_id INTEGER NOT NULL REFERENCES atencion(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('PROCEDIMIENTO','CIRUGIA')),
  descripcion TEXT NOT NULL,
  fecha       TEXT NOT NULL
);

CREATE TABLE examen (
  id              INTEGER PRIMARY KEY,
  ficha_id        INTEGER NOT NULL REFERENCES ficha_clinica(id),
  atencion_id     INTEGER REFERENCES atencion(id),
  nombre          TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('LABORATORIO','IMAGEN','OTRO')),
  fecha_solicitud TEXT NOT NULL,
  fecha_resultado TEXT,
  resultado       TEXT,
  estado          TEXT NOT NULL DEFAULT 'SOLICITADO' CHECK (estado IN ('SOLICITADO','CON_RESULTADO')),
  origen          TEXT NOT NULL DEFAULT 'LOCAL' CHECK (origen IN ('LOCAL','RED_PUBLICA')),
  registrado_por  INTEGER REFERENCES usuario(id)
);

-- ---------------------------------------------------------------------
-- 4. CITAS, LISTA DE ESPERA Y NOTIFICACIONES (HU5)
-- ---------------------------------------------------------------------
CREATE TABLE cita (
  id                 INTEGER PRIMARY KEY,
  paciente_id        INTEGER NOT NULL REFERENCES paciente(id),
  profesional_id     INTEGER NOT NULL REFERENCES usuario(id),
  especialidad       TEXT NOT NULL,
  fecha_hora         TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'AGENDADA'
                     CHECK (estado IN ('AGENDADA','CONFIRMADA','CANCELADA','REPROGRAMADA','ATENDIDA')),
  cita_origen_id     INTEGER REFERENCES cita(id),       -- si nace de una reprogramación
  motivo_cancelacion TEXT,
  creada_por         INTEGER REFERENCES usuario(id),
  creada_en          TEXT NOT NULL
);
-- Un profesional no puede tener dos citas vigentes en el mismo horario
CREATE UNIQUE INDEX ux_cita_horario_vigente ON cita(profesional_id, fecha_hora)
  WHERE estado IN ('AGENDADA','CONFIRMADA');

CREATE TABLE lista_espera (
  id            INTEGER PRIMARY KEY,
  paciente_id   INTEGER NOT NULL REFERENCES paciente(id),
  especialidad  TEXT NOT NULL,
  fecha_ingreso TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'EN_ESPERA' CHECK (estado IN ('EN_ESPERA','INVITADO','AGENDADO'))
);

CREATE TABLE notificacion (
  id              INTEGER PRIMARY KEY,
  cita_id         INTEGER REFERENCES cita(id),
  tutor_id        INTEGER NOT NULL REFERENCES tutor(id),
  canal           TEXT NOT NULL CHECK (canal IN ('SMS','EMAIL','LLAMADA')),
  tipo            TEXT NOT NULL CHECK (tipo IN ('RECORDATORIO_48H','RECORDATORIO_24H','CONFIRMACION',
                                                'CANCELACION','REPROGRAMACION','INVITACION_LISTA_ESPERA')),
  mensaje         TEXT NOT NULL,
  programada_para TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'PROGRAMADA'
                  CHECK (estado IN ('PROGRAMADA','ENVIADA','FALLIDA','DERIVADA','EN_COLA')),
  enviada_en      TEXT,
  respuesta       TEXT
);

-- ---------------------------------------------------------------------
-- 5. INTEGRACIONES EXTERNAS (HU1, HU3) – adaptadores SIMULADOS
-- ---------------------------------------------------------------------
CREATE TABLE validacion_externa (
  id          INTEGER PRIMARY KEY,
  paciente_rut TEXT NOT NULL,
  servicio    TEXT NOT NULL CHECK (servicio IN ('FONASA','ISAPRE','REGISTRO_CIVIL','RED_PUBLICA')),
  resultado   TEXT NOT NULL CHECK (resultado IN ('OK','NO_AFILIADO','INCONSISTENCIA','NO_ENCONTRADO','ERROR_CONEXION')),
  detalle     TEXT,
  tiempo_ms   INTEGER,
  fecha       TEXT NOT NULL,
  usuario_id  INTEGER REFERENCES usuario(id)
);

-- ---------------------------------------------------------------------
-- 6. ASISTENTE VIRTUAL (HU6) – mensajes almacenados CIFRADOS (criterio 6.3)
-- ---------------------------------------------------------------------
CREATE TABLE conversacion_asistente (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  iniciada_en TEXT NOT NULL
);

CREATE TABLE mensaje_asistente (
  id              INTEGER PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversacion_asistente(id) ON DELETE CASCADE,
  emisor          TEXT NOT NULL CHECK (emisor IN ('TUTOR','ASISTENTE')),
  texto_cifrado   TEXT NOT NULL,     -- AES-GCM (Web Crypto) en base64
  iv              TEXT NOT NULL,
  nivel_urgencia  TEXT CHECK (nivel_urgencia IN ('CRITICO','PRIORITARIO','NO_URGENTE','INFORMATIVO','RESTRINGIDO')),
  fecha           TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- 7. REPORTES (HU4)
-- ---------------------------------------------------------------------
CREATE TABLE reporte_generado (
  id           INTEGER PRIMARY KEY,
  tipo         TEXT NOT NULL CHECK (tipo IN ('RESUMEN_ATENCION','INFORME_ALTA','HISTORIAL_COMPLETO')),
  paciente_id  INTEGER NOT NULL REFERENCES paciente(id),
  atencion_id  INTEGER REFERENCES atencion(id),
  generado_por INTEGER NOT NULL REFERENCES usuario(id),
  fecha        TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- 8. AUDITORÍA INALTERABLE (HU8)
-- Cadena de hash: cada registro incluye el hash del anterior.
-- Los triggers impiden UPDATE y DELETE a cualquier usuario de la aplicación.
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id            INTEGER PRIMARY KEY,
  fecha_hora    TEXT NOT NULL,
  usuario_id    INTEGER REFERENCES usuario(id),
  username      TEXT NOT NULL,
  rol           TEXT NOT NULL,
  accion        TEXT NOT NULL CHECK (accion IN ('LOGIN','LOGOUT','LOGIN_FALLIDO','CONSULTA','CREACION',
                       'MODIFICACION','EXPORTACION','ACCESO_DENEGADO','VALIDACION','SINCRONIZACION','CONTINGENCIA')),
  entidad       TEXT NOT NULL,
  entidad_id    TEXT,
  detalle       TEXT,
  hash_anterior TEXT NOT NULL,
  hash          TEXT NOT NULL UNIQUE
);

CREATE TRIGGER trg_auditoria_no_update BEFORE UPDATE ON auditoria
BEGIN
  SELECT RAISE(ABORT, 'Los registros de auditoría son inalterables (Ley 20.584 / 21.719)');
END;

CREATE TRIGGER trg_auditoria_no_delete BEFORE DELETE ON auditoria
BEGIN
  SELECT RAISE(ABORT, 'Los registros de auditoría no se pueden eliminar');
END;

-- Una atención firmada no puede volver a BORRADOR
CREATE TRIGGER trg_atencion_firmada BEFORE UPDATE OF estado ON atencion
WHEN OLD.estado = 'FIRMADA' AND NEW.estado <> 'FIRMADA'
BEGIN
  SELECT RAISE(ABORT, 'Una atención firmada no puede volver a borrador');
END;

-- ---------------------------------------------------------------------
-- 9. CONTINGENCIA Y SINCRONIZACIÓN DIFERIDA (HU9)
-- ---------------------------------------------------------------------
CREATE TABLE operacion_pendiente (
  id              INTEGER PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('VALIDACION_PREVISIONAL','ENVIO_RED_PUBLICA','ENVIO_NOTIFICACION')),
  referencia      TEXT NOT NULL,          -- RUT, id de atención o id de notificación
  payload         TEXT,                   -- JSON
  estado          TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','SINCRONIZADA','ERROR')),
  intentos        INTEGER NOT NULL DEFAULT 0,
  creada_en       TEXT NOT NULL,
  sincronizada_en TEXT,
  usuario_id      INTEGER REFERENCES usuario(id)
);

CREATE TABLE parametro_sistema (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Índices de apoyo a consultas frecuentes
CREATE INDEX ix_atencion_ficha   ON atencion(ficha_id, fecha);
CREATE INDEX ix_examen_ficha     ON examen(ficha_id);
CREATE INDEX ix_cita_paciente    ON cita(paciente_id, fecha_hora);
CREATE INDEX ix_notif_estado     ON notificacion(estado, programada_para);
CREATE INDEX ix_auditoria_fecha  ON auditoria(fecha_hora);
CREATE INDEX ix_auditoria_entidad ON auditoria(entidad, entidad_id);
CREATE INDEX ix_pendiente_estado ON operacion_pendiente(estado);
