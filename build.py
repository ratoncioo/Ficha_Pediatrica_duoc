"""Genera un HTML autocontenido para GitHub Pages, sin instalar dependencias."""
import argparse
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
VENDOR = ROOT / 'vendor' / 'sql.js'


def construir():
    wasm = base64.b64encode((VENDOR / 'sql-wasm.wasm').read_bytes()).decode('ascii')
    sqljs = (VENDOR / 'sql-wasm.js').read_text(encoding='utf-8')
    license_text = (VENDOR / 'LICENSE').read_text(encoding='utf-8')
    schema = (SRC / 'schema.sql').read_text(encoding='utf-8')
    scripts = '\n'.join(f'<script>{(SRC / name).read_text(encoding="utf-8")}</script>'
                        for name in ('util.js', 'core.js', 'seed.js', 'app.js'))
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Maqueta académica de ficha electrónica pediátrica HLCM · Duoc UC. Datos ficticios e integraciones simuladas.">
<meta name="theme-color" content="#0b5d7a">
<title>Ficha Electrónica Pediátrica · HLCM · Prototipo</title>
<style>{(SRC / 'styles.css').read_text(encoding='utf-8')}</style>
</head>
<body>
<div id="app"><p style="padding:2rem" role="status">Cargando ficha pediátrica…</p></div>
<noscript>Active JavaScript para usar la ficha electrónica pediátrica.</noscript>
<div id="toasts" aria-live="polite"></div>
<script>/* sql.js 1.10.3, incluido localmente.
{license_text}
*/
{sqljs}</script>
<script>
const SCHEMA_SQL = {json.dumps(schema, ensure_ascii=False)};
const WASM_B64 = "{wasm}";
function wasmBytes() {{ return Uint8Array.from(atob(WASM_B64), c => c.charCodeAt(0)); }}
</script>
{scripts}
<script>
iniciarApp().catch(e => {{
  console.error(e);
  const app = document.getElementById('app');
  app.innerHTML = '<section class="card" style="margin:2rem"><h1>No se pudo iniciar la maqueta</h1><p id="inicio-error"></p><p>Use un navegador actualizado e intente recargar la página.</p><button class="btn btn-primary" onclick="location.reload()">Volver a intentar</button></section>';
  document.getElementById('inicio-error').textContent = e.message;
}});
</script>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Comprueba que index.html coincide con src/.')
    args = parser.parse_args()
    html = construir()
    index = ROOT / 'index.html'
    if args.check:
        if not index.exists() or index.read_text(encoding='utf-8') != html:
            raise SystemExit('index.html está desactualizado. Ejecute: python3 build.py')
        print('OK: index.html coincide con el código fuente.')
        return
    index.write_text(html, encoding='utf-8')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    (dist / 'index.html').write_text(html, encoding='utf-8')
    (dist / '.nojekyll').touch()
    print(f'OK: index.html y dist/index.html ({len(html.encode("utf-8")) // 1024} KB).')


if __name__ == '__main__':
    main()
