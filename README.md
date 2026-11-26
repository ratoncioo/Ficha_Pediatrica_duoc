# Ficha Electrónica Pediátrica · Hospital Luis Calvo Mackenna

Prototipo funcional de una ficha clínica electrónica pediátrica, desarrollado como proyecto de la asignatura **RQY1101 – Ingeniería de Requisitos** (Duoc UC). El sistema implementa las historias de usuario de la presentación de avance N.º 3 sobre una aplicación web de una sola página, con base de datos SQLite real ejecutada en el navegador.

Todos los datos son ficticios y las integraciones externas son simuladas: el prototipo sirve para demostrar y validar requisitos, no para uso clínico.

**Demo publicada:** https://ratoncioo.github.io/Ficha_Pediatrica_duoc/

## Qué resuelve

El prototipo cubre el flujo completo de atención pediátrica ambulatoria y las reglas de negocio levantadas en el proyecto:

| Módulo | Funcionalidad |
| --- | --- |
| **Pacientes** | Registro de pacientes y tutores, validación de RUT con dígito verificador, vínculo paciente–tutor, consulta de previsión (FONASA/ISAPRE) |
| **Ficha clínica** | Atenciones, anamnesis, diagnósticos, procedimientos, signos vitales, exámenes y resultados, firma del profesional tratante |
| **Agenda y citas** | Agendamiento, reprogramación, cancelación, lista de espera y derivación a la Red Pública |
| **Recordatorios** | Envío simulado de SMS, correo y llamadas, con registro de estado por notificación |
| **Portal del tutor** | Vista propia del tutor para confirmar o cancelar sus citas |
| **Asistente virtual** | Respuestas por reglas locales sobre citas, documentación y uso del sistema, con historial de conversación |
| **Reportes** | Generación de reportes clínicos y de gestión, con vista previa, impresión y descarga |
| **Auditoría** | Registro inalterable de accesos y cambios, filtros y exportación a CSV |
| **Usuarios y roles** | 7 perfiles, permisos granulares por acción y bloqueo/desbloqueo de cuentas |
| **Contingencia** | Modo de operación degradada, cola de operaciones pendientes, sincronización y respaldo `.sqlite` descargable |
| **Consultas SQL** | Consola de solo lectura sobre la base de demostración, para auditoría y verificación de datos |

El control de acceso se aplica tanto al menú como a cada ruta: un intento de abrir una vista sin permiso queda registrado en auditoría.

## Arquitectura

- **Sin servidor ni dependencias de red.** SQLite compilado a WebAssembly (`sql.js`) viaja embebido en el HTML; no hay backend, npm en tiempo de ejecución, CDN ni API externa.
- **24 tablas** con índices, restricciones de integridad y triggers (`src/schema.sql`).
- **Persistencia en `localStorage`**, con transacciones y rollback. Cada navegador mantiene su propia base; no hay sincronización entre equipos.
- **Un solo archivo publicable:** `build.py` ensambla los fuentes de `src/` en un `index.html` autocontenido.
- Las integraciones con Registro Civil, FONASA, ISAPRE, Red Pública y los envíos de SMS/correo/llamadas son **simulaciones locales** y están identificadas como tales en la interfaz.

## Probar el prototipo

Abra `index.html` en un navegador actualizado, elija un usuario de demostración y pulse **Ingresar**. La contraseña de todos es **demo123**.

| Usuario | Perfil | Qué demuestra |
| --- | --- | --- |
| `adm.perez` | Admisión | Registro de pacientes y tutores, validación de RUT, citas y recordatorios |
| `dra.rojas` | Médica | Ficha clínica, atenciones y firma, Red Pública, reportes |
| `dr.fuentes` | Médico | Segundo profesional, para demostrar las restricciones de firma |
| `enf.munoz` | Enfermería | Signos vitales, exámenes y resultados |
| `aud.lagos` | Auditoría | Cadena de auditoría, exportación CSV y consultas SQL |
| `ti.vera` | Soporte TI | Contingencia, sincronización, desbloqueo de usuarios y respaldo SQLite |
| `tutor.ruiz` | Tutor | Portal de citas y asistente virtual |

Para volver al estado inicial, cierre sesión y use **Restablecer base de demostración**; esto borra los cambios hechos en ese navegador.

Opcionalmente, con servidor local:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

y abra `http://127.0.0.1:8000/`. No requiere instalar dependencias.

## Estructura del repositorio

- `index.html` — sitio generado, listo para publicar o abrir directamente.
- `src/schema.sql` — esquema de 24 tablas, índices, restricciones y triggers.
- `src/util.js` — persistencia, transacciones, fechas y validación de RUT.
- `src/core.js` — roles y permisos, integraciones simuladas, notificaciones y asistente.
- `src/seed.js` — perfiles y datos de demostración.
- `src/app.js` — enrutador, menú por rol y las 13 vistas de la interfaz.
- `src/styles.css` — estilos.
- `vendor/sql.js/` — motor SQLite/WASM y su licencia MIT.
- `build.py` — constructor, sin dependencias de red.
- `pruebas/` — pruebas de integración y de extremo a extremo, más `VALIDACION.md`.
- `.github/workflows/` — publicación en Pages y ejecución de pruebas.

## Editar y reconstruir

Modifique los archivos de `src/` y ejecute:

```sh
python3 build.py
```

Se generan `index.html` (versionado en Git para publicación directa) y `dist/index.html` (salida para Actions); ambos autocontenidos. Mantenga el `index.html` generado junto con los cambios de `src/`.

Verificación de que el HTML corresponde a los fuentes, y pruebas:

```sh
python3 build.py --check
npm test
```

## Pruebas

**Integración — 25 pruebas** sobre el motor SQLite/WASM real, con Node.js 22 o superior y sin `npm install`. Cubren roles y permisos, persistencia y rollback, validaciones, contingencia, citas, recordatorios, reportes, cifrado, reglas del asistente y regresiones del formulario.

**Extremo a extremo — 49 pruebas** con Playwright sobre Chromium:

```sh
python3 -m pip install -r pruebas/requirements.txt
python3 -m playwright install chromium
python3 pruebas/funcional.py
```

Por defecto usan el `index.html` local. Para probar una versión servida o publicada:

```sh
FEP_TEST_URL=http://127.0.0.1:8000/ python3 pruebas/funcional.py
```

`FEP_CHROME_PATH` permite indicar un Chrome propio. Los resultados y capturas se guardan en `pruebas/salidas/`. El workflow `pruebas.yml` las ejecuta en Chromium bajo la subruta `/Ficha_Pediatrica_duoc/`. `pruebas/resultados_originales.json` es evidencia histórica del proyecto entregado y no corresponde a una ejecución actual.

## Publicación en GitHub Pages

Dos modalidades; use solo una.

**Desde una rama:** en **Settings → Pages → Source** elija **Deploy from a branch**, rama `main`, carpeta **/(root)**, y guarde.

**Con GitHub Actions:** en **Settings → Pages → Source** elija **GitHub Actions**. El workflow `.github/workflows/pages.yml` comprueba que el HTML corresponde a los fuentes, ejecuta las pruebas, construye `dist/` y publica. No necesita secretos ni tokens.

Si publica desde una rama, puede desactivar el workflow «Publicar maqueta en GitHub Pages» en la pestaña Actions. Referencia: [configurar la fuente de publicación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Alcance y limitaciones

- Proyecto académico y demostrativo: no almacena ni procesa datos reales de pacientes.
- Los datos creados viven solo en el navegador de quien los crea; no se envían al repositorio ni se comparten entre usuarios del sitio.
- Sin autenticación real, cifrado en tránsito ni control de sesión de nivel productivo; las contraseñas de demostración son públicas a propósito.
- Las validaciones contra servicios externos son respuestas simuladas, incluidos los casos de demora y error.
- Detalle de lo verificado y sus límites en `pruebas/VALIDACION.md`.
