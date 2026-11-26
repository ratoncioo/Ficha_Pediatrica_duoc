# Ficha Electrónica Pediátrica · HLCM

Maqueta universitaria de RQY1101, Ingeniería de Requisitos, Duoc UC. Conserva las historias de usuario de la presentación de avance N.º 3, los siete usuarios y los datos ficticios del proyecto original.

**Funciona en GitHub Pages sin servidor, npm, CDN ni servicios externos.** SQLite y WebAssembly están incluidos en el HTML. Los cambios se guardan en `localStorage`: cada navegador mantiene su propia base; no hay sincronización entre equipos. La integración con Registro Civil, FONASA, ISAPRE, la Red Pública y los envíos de SMS/correo/llamadas son simulaciones locales. El asistente funciona con reglas locales.

## Probar ahora

Abra `index.html` en un navegador actualizado. Haga clic en un usuario de demostración y luego en **Ingresar**. La contraseña de todos es **demo123**.

| Usuario | Perfil | Qué demostrar |
| --- | --- | --- |
| `adm.perez` | Admisión | Registrar pacientes y tutores, validar RUT, gestionar citas y recordatorios |
| `dra.rojas` | Médica | Ficha clínica, atenciones y firma, Red Pública, reportes |
| `dr.fuentes` | Médico | Segundo profesional para demostrar las restricciones de firma |
| `enf.munoz` | Enfermería | Signos vitales, exámenes y resultados |
| `aud.lagos` | Auditoría | Cadena de auditoría, exportación CSV y consultas SQL |
| `ti.vera` | Soporte TI | Contingencia, sincronización, desbloquear usuarios y respaldo SQLite |
| `tutor.ruiz` | Tutor | Confirmar/cancelar citas y usar el asistente |

Para volver a los datos iniciales, cierre sesión y seleccione **Restablecer base de demostración**. Esto elimina los cambios de ese navegador.

También puede usar un servidor local:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8000/`. No necesita instalar dependencias para ejecutar la maqueta.

## Subir a ratoncioo/Ficha_Pediatrica_duoc

Copie el contenido de esta carpeta a su checkout de `https://github.com/ratoncioo/Ficha_Pediatrica_duoc.git`, conservando el historial del repositorio, y publique los cambios. Si ya contiene archivos, revise las diferencias antes de reemplazarlos. Los archivos `.github/workflows/` y `.nojekyll` también forman parte del proyecto.

Para cargarlo desde la web de GitHub, extraiga el ZIP y use **Add file → Upload files**. Suba el contenido de la carpeta, con `index.html` en la raíz del repositorio, sin una carpeta intermedia.

### Publicación sencilla, desde una rama

1. Abra **Settings → Pages** del repositorio.
2. En **Source**, seleccione **Deploy from a branch**.
3. Elija la rama que contiene los archivos (`main` o `master`), carpeta **/(root)**, y pulse **Save**.
4. Espere a que termine el despliegue que muestra GitHub.

La dirección esperada, una vez publicado, es:

**https://ratoncioo.github.io/Ficha_Pediatrica_duoc/**

### Publicación con GitHub Actions

El repositorio incluye `.github/workflows/pages.yml`. Para usarlo, en **Settings → Pages → Source** seleccione **GitHub Actions** y publique los archivos en `main` o `master` (o ejecute el workflow manualmente). El workflow comprueba que el HTML corresponde al código fuente, ejecuta las pruebas locales, construye `dist/` y lo publica. No necesita secretos ni tokens adicionales.

Utilice una de las dos modalidades de publicación. Si eligió publicar desde una rama, puede desactivar el workflow «Publicar maqueta en GitHub Pages» en la pestaña Actions. Referencia: [configurar la fuente de publicación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Editar y reconstruir

Edite los archivos de `src/` y ejecute:

```sh
python3 build.py
```

Se generan `index.html` (incluido en Git para publicación directa) y `dist/index.html` (salida para Actions). Ambos son autocontenidos. Mantenga el `index.html` generado junto con los cambios en `src/`.

```sh
python3 build.py --check
npm test
```

Las 25 pruebas de integración usan el motor SQLite/WASM real y Node.js 22 o posterior. No requieren `npm install`. Cubren roles, persistencia y rollback, validaciones, contingencia, citas, recordatorios, reportes, cifrado, reglas del asistente y regresiones del formulario.

Las 49 pruebas de extremo a extremo originales están adaptadas para cualquier equipo:

```sh
python3 -m pip install -r pruebas/requirements.txt
python3 -m playwright install chromium
python3 pruebas/funcional.py
```

Por defecto abren el `index.html` local. Para probar la versión servida o publicada:

```sh
FEP_TEST_URL=http://127.0.0.1:8000/ python3 pruebas/funcional.py
```

`FEP_CHROME_PATH` permite indicar un ejecutable de Chrome propio. Los resultados y capturas nuevos se guardan en `pruebas/salidas/`. El workflow `pruebas.yml` ejecuta estas pruebas en Chromium usando `/Ficha_Pediatrica_duoc/`, la misma subruta de Pages. `pruebas/resultados_originales.json` es evidencia histórica del proyecto entregado y no representa una ejecución de esta adaptación.

## Archivos

- `index.html`: sitio listo para publicar o abrir por doble clic.
- `src/schema.sql`: 24 tablas SQLite, índices, restricciones y triggers.
- `src/util.js`: persistencia, transacciones, fechas y RUT.
- `src/core.js`: roles, integraciones simuladas, notificaciones y asistente.
- `src/seed.js`: perfiles y datos de demostración.
- `src/app.js` y `src/styles.css`: interfaz y navegación por rol.
- `vendor/sql.js/`: motor SQLite/WASM y licencia MIT.
- `build.py`: constructor sin dependencias de red.
- `.github/workflows/`: publicación y pruebas de navegador.
- `pruebas/VALIDACION.md`: verificaciones realizadas y sus límites.

## Alcance de la maqueta

Se mantiene la arquitectura local del proyecto original. Un respaldo `.sqlite` se puede descargar desde **Contingencia** con `ti.vera`. Los datos creados no se envían al repositorio ni se comparten con otros usuarios del sitio. La aplicación muestra explícitamente su carácter académico y simulado.
