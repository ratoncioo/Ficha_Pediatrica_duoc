# Validación de la adaptación a GitHub Pages

Comprobaciones locales realizadas el 25 de noviembre de 2026:

- **25/25 pruebas de integración aprobadas** con Node.js y SQLite/WASM real (`npm test`). Incluyen pruebas de regresión de cambio de RUT, respuestas de validación tardías y sincronización de fondo que conserva los formularios.
- Construcción sin npm ni descargas (`python3 build.py`).
- Correspondencia del HTML generado con los fuentes (`python3 build.py --check`).
- Sintaxis de los fuentes JavaScript y compilación de los scripts Python.
- Los siete bloques JavaScript del HTML generado se analizaron sin errores de sintaxis.
- HTML autocontenido: no requiere archivos de CDN ni rutas absolutas para cargar sus recursos.

La apertura de un servidor HTTP local también fue rechazada por el aislamiento del sistema (`Operation not permitted`).

No fue posible ejecutar Chrome/Playwright ni validar visualmente el sitio en este entorno: no hay navegador de automatización instalado y el intento con WebKit fue bloqueado por el aislamiento del sistema. Las **49 pruebas de extremo a extremo originales** se adaptaron a rutas portables y a HTTP; quedan configuradas en GitHub Actions para ejecutarse en Chromium. Los resultados originales se conservaron aparte como evidencia histórica.

La publicación y el estado del repositorio remoto no están verificados: la conexión Git a github.com no resolvió DNS desde este entorno. El ZIP contiene el sitio y los workflows listos para subir, pero no implica un despliegue realizado.
