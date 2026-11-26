/* =====================================================================
 * util.js – Utilidades: acceso a datos (SQLite), hash, fechas, RUT, UI
 * Ficha Electrónica Pediátrica HLCM – Prototipo académico
 * ===================================================================== */
'use strict';

const STORAGE_KEY = 'fep_hlcm_db_v1';
let SQL = null;   // módulo sql.js
let db = null;    // base de datos SQLite en memoria (persistida en localStorage)

/* ---------- Capa de persistencia ---------- */

/** Ejecuta un SELECT y devuelve un arreglo de objetos. */
function q(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}
/** Primera fila de un SELECT o null. */
function q1(sql, params = []) { return q(sql, params)[0] || null; }
/** Ejecuta INSERT/UPDATE/DELETE y devuelve el id insertado. */
function run(sql, params = []) {
  db.run(sql, params);
  return q1('SELECT last_insert_rowid() AS id').id;
}
/** Ejecuta varias operaciones como una transacción atómica. */
let enTransaccion = false;
function tx(fn) {
  if (enTransaccion) return fn();          // transacciones anidadas se unen a la externa
  db.run('BEGIN');
  enTransaccion = true;
  try { const r = fn(); db.run('COMMIT'); enTransaccion = false; persist(); return r; }
  catch (e) { enTransaccion = false; try { db.run('ROLLBACK'); } catch (_) {} throw e; }
}
/** Guarda la base completa en localStorage (resguardo local del prototipo). */
function persist() {
  if (enTransaccion) return;               // se persiste al confirmar la transacción
  try {
    const bytes = db.export();
    db.run('PRAGMA foreign_keys = ON');   // export() reinicia la conexión
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    localStorage.setItem(STORAGE_KEY, btoa(bin));
  } catch (e) { console.warn('No fue posible persistir en localStorage:', e.message); }
}
function loadPersisted() {
  try {
    const b64 = localStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (e) { return null; }
}
function param(clave, valorPorDefecto = null) {
  const r = q1('SELECT valor FROM parametro_sistema WHERE clave = ?', [clave]);
  return r ? r.valor : valorPorDefecto;
}
function setParam(clave, valor) {
  run('INSERT INTO parametro_sistema(clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', [clave, String(valor)]);
}

/* ---------- SHA-256 síncrono (para cadena de auditoría y contraseñas) ---------- */
function sha256(ascii) {
  const utf8 = unescape(encodeURIComponent(ascii));
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off+4*i] << 24) | (bytes[off+4*i+1] << 16) | (bytes[off+4*i+2] << 8) | bytes[off+4*i+3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H = H.map((v, i) => (v + [a,b,c,d,e,f,g,h][i]) | 0);
  }
  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/* ---------- Fechas (con reloj simulado para la demostración) ---------- */
const pad = n => String(n).padStart(2, '0');
function relojOffsetHoras() { return db ? Number(param('reloj_offset_h', '0')) : 0; }
function ahora() { return new Date(Date.now() + relojOffsetHoras() * 3600 * 1000); }
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function nowStr() { return fmt(ahora()); }
function parseFecha(s) { return new Date(String(s).replace(' ', 'T')); }
function sumarHoras(s, h) { return fmt(new Date(parseFecha(s).getTime() + h * 3600 * 1000)); }
function fechaCorta(s) {
  if (!s) return '—';
  const d = parseFecha(s);
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}` + (String(s).length > 10 ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
}
function edad(fechaNac) {
  const n = parseFecha(fechaNac + ' 00:00:00'), h = ahora();
  let anios = h.getFullYear() - n.getFullYear();
  let meses = h.getMonth() - n.getMonth();
  if (h.getDate() < n.getDate()) meses--;
  if (meses < 0) { anios--; meses += 12; }
  return { anios, meses, texto: anios > 0 ? `${anios} año${anios === 1 ? '' : 's'} ${meses} m` : `${meses} meses` };
}

/* ---------- RUT chileno ---------- */
function limpiarRut(rut) { return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
function dvRut(cuerpo) {
  let s = 0, m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { s += Number(cuerpo[i]) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
/** Normaliza a formato 12345678-9 o devuelve null si es inválido (módulo 11). */
function normalizarRut(rut) {
  const l = limpiarRut(rut);
  if (l.length < 2) return null;
  const cuerpo = l.slice(0, -1), dv = l.slice(-1);
  if (!/^\d{6,8}$/.test(cuerpo)) return null;
  return dvRut(cuerpo) === dv ? `${Number(cuerpo)}-${dv}` : null;
}

/* ---------- UI genérica ---------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, tipo = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

function badge(texto, tipo) { return `<span class="badge b-${tipo || 'neutral'}">${esc(texto)}</span>`; }
const BADGE_ESTADO = {
  VALIDADO: 'ok', PROVISORIO: 'warn', ALERTA: 'danger', PENDIENTE: 'neutral',
  AGENDADA: 'info', CONFIRMADA: 'ok', CANCELADA: 'danger', REPROGRAMADA: 'neutral', ATENDIDA: 'ok',
  PROGRAMADA: 'info', ENVIADA: 'ok', FALLIDA: 'danger', DERIVADA: 'warn', EN_COLA: 'warn',
  BORRADOR: 'warn', FIRMADA: 'ok', SOLICITADO: 'warn', CON_RESULTADO: 'ok',
  SINCRONIZADA: 'ok', ERROR: 'danger', EN_ESPERA: 'neutral', INVITADO: 'info', AGENDADO: 'ok',
  OK: 'ok', NO_AFILIADO: 'warn', INCONSISTENCIA: 'danger', NO_ENCONTRADO: 'danger', ERROR_CONEXION: 'danger',
  CRITICO: 'danger', PRIORITARIO: 'warn', NO_URGENTE: 'info', INFORMATIVO: 'neutral', RESTRINGIDO: 'warn'
};
function badgeEstado(e) { return badge(String(e).replace(/_/g, ' '), BADGE_ESTADO[e]); }

/** Ventana modal reutilizable. onMount recibe el elemento raíz. */
function abrirModal(titulo, html, onMount, ancho = '') {
  cerrarModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal';
  wrap.className = 'modal-bg';
  wrap.innerHTML = `<div class="modal ${ancho}" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <div class="modal-h"><h3 id="modal-t">${esc(titulo)}</h3><button class="btn-x" data-cerrar aria-label="Cerrar">×</button></div>
      <div class="modal-b">${html}</div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-cerrar]')) cerrarModal(); });
  if (onMount) onMount(wrap);
  const primero = wrap.querySelector('input,select,textarea');
  if (primero) primero.focus();
}
function cerrarModal() { const m = $('#modal'); if (m) m.remove(); }

/** Lee los campos de un formulario como objeto (trim de textos). */
function datosForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
function descargar(nombre, contenido, tipo = 'text/plain') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const dormir = ms => new Promise(r => setTimeout(r, ms));
