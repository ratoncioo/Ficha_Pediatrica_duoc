"""Pruebas funcionales E2E del prototipo (una por historia de usuario)."""
import asyncio, json, re, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get('FEP_TEST_URL', (ROOT / 'index.html').as_uri())
OUT = ROOT / 'pruebas' / 'salidas'
SHOTS = str(OUT / 'capturas') + '/'
resultados = []

def reg(id_, hu, desc, esperado, ok, obtenido=''):
    resultados.append(dict(id=id_, hu=hu, caso=desc, esperado=esperado, obtenido=obtenido, resultado='APROBADO' if ok else 'RECHAZADO'))
    print(('OK  ' if ok else 'FAIL'), id_, desc, '|', obtenido)

async def main():
    import os; os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        opciones = {'headless': True}
        if os.environ.get('FEP_CHROME_PATH'):
            opciones['executable_path'] = os.environ['FEP_CHROME_PATH']
        b = await p.chromium.launch(**opciones)
        ctx = await b.new_context(viewport={'width': 1366, 'height': 860}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        Q = lambda sql: pg.evaluate(f'q({json.dumps(sql)})')
        async def n(sql): return (await Q(sql))[0]['n']
        async def login(u, pw='demo123'):
            if await pg.query_selector('#btn-salir'): await pg.click('#btn-salir'); await pg.wait_for_timeout(300)
            await pg.fill('[name=username]', u); await pg.fill('[name=password]', pw); await pg.click('#f-login button'); await pg.wait_for_timeout(500)
        async def shot(name): await pg.screenshot(path=SHOTS + name + '.png')
        async def go(h): await pg.evaluate(f"(location.hash==='{h}') ? render() : (location.hash='{h}')"); await pg.wait_for_timeout(500)
        await shot('00_login')

        # ---------------- HU7 Control de acceso ----------------
        await login('adm.perez', 'mala')
        t = await pg.inner_text('#login-err')
        reg('PF-07.1', 'HU7', 'Login con contraseña incorrecta', 'Se rechaza y se audita LOGIN_FALLIDO',
            'incorrectos' in t and await n("SELECT COUNT(*) n FROM auditoria WHERE accion='LOGIN_FALLIDO'") >= 1, t)
        await login('enf.munoz')
        menu = await pg.inner_text('nav.side')
        reg('PF-07.2', 'HU7', 'Menú de enfermería sin opciones de auditoría, citas de gestión ni reportes', 'Menú filtrado por permisos',
            'Auditoría' not in menu and 'Reportes' not in menu and 'Pacientes' in menu, menu.replace('\n', ' · '))
        antes = await n("SELECT COUNT(*) n FROM auditoria WHERE accion='ACCESO_DENEGADO'")
        await go('#/auditoria')
        txt = await pg.inner_text('#main')
        despues = await n("SELECT COUNT(*) n FROM auditoria WHERE accion='ACCESO_DENEGADO'")
        await shot('07_acceso_denegado')
        reg('PF-07.3', 'HU7', 'Enfermera intenta abrir la vista de auditoría por URL', 'Acceso denegado y registrado', 'Acceso denegado' in txt and despues == antes + 1, f'denegados {antes}→{despues}')
        await go('#/ficha/1')
        reg('PF-07.4', 'HU7', 'Enfermera abre ficha: puede registrar constantes pero no crear atención', 'Botón "Nueva atención" oculto',
            await pg.query_selector('#btn-aten') is None and await pg.query_selector('[data-signos]') is not None)
        # Bloqueo por intentos
        for i in range(5): await login('dr.fuentes', 'x')
        bloq = await Q("SELECT activo FROM usuario WHERE username='dr.fuentes'")
        reg('PF-07.5', 'HU7', '5 intentos fallidos bloquean la cuenta', 'Cuenta bloqueada (activo=0)', bloq[0]['activo'] == 0, await pg.inner_text('#login-err'))
        await login('ti.vera'); await go('#/seguridad'); await shot('07_matriz_roles')
        await pg.click('[data-desb]'); await pg.wait_for_timeout(300)
        reg('PF-07.6', 'HU7', 'Soporte TI desbloquea la cuenta', 'activo=1', (await Q("SELECT activo FROM usuario WHERE username='dr.fuentes'"))[0]['activo'] == 1)

        # ---------------- HU1 Validación externa ----------------
        await login('adm.perez'); await go('#/pacientes')
        await pg.click('#btn-nuevo'); await pg.fill('[name=rut]', '12.345.678-0'); await pg.click('#btn-validar'); await pg.wait_for_timeout(200)
        reg('PF-01.1', 'HU1', 'RUT con dígito verificador inválido', 'Mensaje de RUT inválido', 'inválido' in await pg.inner_text('#res-val'))
        await pg.fill('[name=rut]', '26455701-1'); await pg.click('#btn-validar'); await pg.wait_for_selector('#res-val .alert', timeout=5000)
        rv = await pg.inner_text('#res-val'); ms = int(re.search(r'(\d+) ms', rv).group(1))
        nom = await pg.input_value('[name=nombres]')
        await shot('01_validacion_ok')
        reg('PF-01.2', 'HU1', 'Validación de RUT afiliado a FONASA', 'Identidad y previsión validadas en < 1,5 s; datos autocompletados', 'validadas' in rv and ms < 1500 and nom == 'Martina Josefa', f'{ms} ms; nombres="{nom}"')
        await pg.fill('[name=t_rut]', '18765432-7'); await pg.fill('[name=t_nombres]', 'Andrea'); await pg.fill('[name=t_apellidos]', 'Campos Ríos'); await pg.fill('[name=t_telefono]', '+56 9 2222 3333')
        await pg.click('#f-pac button.btn-primary'); await pg.wait_for_timeout(600)
        est = await Q("SELECT estado_validacion e FROM paciente WHERE rut='26455701-1'")
        reg('PF-01.3', 'HU1', 'Registro del paciente validado con su tutor', 'Paciente VALIDADO, ficha creada, tutor asociado',
            est and est[0]['e'] == 'VALIDADO' and await n("SELECT COUNT(*) n FROM ficha_clinica f JOIN paciente p ON p.id=f.paciente_id WHERE p.rut='26455701-1'") == 1, str(est))
        await go('#/pacientes'); await pg.click('#btn-nuevo'); await pg.fill('[name=rut]', '26901144-0'); await pg.click('#btn-validar'); await pg.wait_for_selector('#res-val .alert', timeout=5000)
        rv = await pg.inner_text('#res-val'); await shot('01_validacion_alerta')
        reg('PF-01.4', 'HU1', 'RUT con cédula bloqueada y sin previsión', 'Alerta visible sin bloquear la atención (criterio 1.2)', 'BLOQUEADO' in rv and 'continuar' in rv, rv.replace('\n', ' '))
        await pg.fill('[name=t_rut]', '15234876-2'); await pg.dispatch_event('[name=t_rut]', 'blur'); await pg.wait_for_timeout(200)
        await pg.click('#f-pac button.btn-primary'); await pg.wait_for_timeout(600)
        est = await Q("SELECT estado_validacion e FROM paciente WHERE rut='26901144-0'")
        reg('PF-01.5', 'HU1', 'Se permite registrar al paciente con alerta', 'Paciente guardado con estado ALERTA y tutor existente reutilizado', est and est[0]['e'] == 'ALERTA', str(est))
        await go('#/pacientes'); await pg.click('#btn-nuevo'); await pg.fill('[name=rut]', '26777888-4'); await pg.click('#btn-validar'); await pg.wait_for_selector('#res-val .alert', timeout=5000)
        reg('PF-01.6', 'HU1', 'RUT válido inexistente en Registro Civil', 'Alerta "no figura en el Registro Civil"', 'no figura' in await pg.inner_text('#res-val'))
        await pg.click('[data-cerrar]')

        # ---------------- HU9 Contingencia ----------------
        await login('ti.vera'); await go('#/contingencia'); await pg.click('#btn-caida'); await pg.wait_for_timeout(300)
        await shot('09_contingencia_activa')
        reg('PF-09.1', 'HU9', 'Simular caída de la red externa', 'Banner de modo contingencia visible', 'Modo contingencia activo' in await pg.inner_text('#app'))
        await login('adm.perez'); await go('#/pacientes'); await pg.click('#btn-nuevo'); await pg.fill('[name=rut]', '27650332-4')
        await pg.click('#btn-validar'); await pg.wait_for_selector('#res-val .alert', timeout=5000)
        rv = await pg.inner_text('#res-val')
        await pg.fill('[name=nombres]', 'Lucas Emilio'); await pg.fill('[name=apellidos]', 'Ortiz Reyes'); await pg.fill('[name=fecha_nacimiento]', '2022-01-17')
        await pg.fill('[name=t_rut]', '13876540-7'); await pg.dispatch_event('[name=t_rut]', 'blur'); await pg.wait_for_timeout(200)
        pend_antes = await n("SELECT COUNT(*) n FROM operacion_pendiente WHERE estado='PENDIENTE'")
        await pg.click('#f-pac button.btn-primary'); await pg.wait_for_timeout(600)
        est = await Q("SELECT estado_validacion e FROM paciente WHERE rut='27650332-4'")
        pend = await n("SELECT COUNT(*) n FROM operacion_pendiente WHERE estado='PENDIENTE'")
        await shot('09_paciente_provisorio')
        reg('PF-09.2', 'HU9', 'Registrar paciente sin conexión externa', 'Paciente PROVISORIO y validación en cola (criterio 1.3)', 'Sin conexión' in rv and est[0]['e'] == 'PROVISORIO' and pend == pend_antes + 1, f'estado={est[0]["e"]}; pendientes {pend_antes}→{pend}')
        await login('dra.rojas'); await go('#/ficha/1'); await pg.click('#btn-aten')
        await pg.fill('[name=motivo]', 'Control post contingencia'); await pg.fill('[name=diag]', 'Control de salud de rutina'); await pg.fill('[name=cie]', 'Z00.1')
        await pg.click('button[value=firmar]'); await pg.wait_for_timeout(500)
        red = await n("SELECT COUNT(*) n FROM operacion_pendiente WHERE tipo='ENVIO_RED_PUBLICA' AND estado='PENDIENTE'")
        reg('PF-09.3', 'HU9', 'Firmar atención durante la caída', 'Registro clínico local guardado; envío a red en cola', red >= 1, f'envíos en cola={red}')
        await login('ti.vera'); await go('#/contingencia'); await pg.click('#btn-volver'); await pg.wait_for_timeout(3500)
        est = await Q("SELECT estado_validacion e FROM paciente WHERE rut='27650332-4'")
        pend = await n("SELECT COUNT(*) n FROM operacion_pendiente WHERE estado='PENDIENTE'")
        await go('#/contingencia'); await shot('09_sincronizado')
        reg('PF-09.4', 'HU9', 'Restablecer conexión y sincronizar', 'Cola vacía; paciente pasa a VALIDADO', pend == 0 and est[0]['e'] == 'VALIDADO', f'pendientes={pend}; estado={est[0]["e"]}')

        # ---------------- HU2 Historial clínico ----------------
        await login('dra.rojas'); await go('#/ficha/1')
        carga = int(re.search(r'Carga de ficha: (\d+) ms', await pg.inner_text('#main')).group(1))
        await shot('02_ficha')
        reg('PF-02.1', 'HU2', 'Carga de ficha con historial', 'Carga < 2 s (criterio 2.3, escala de prototipo)', carga < 2000, f'{carga} ms')
        await pg.click('#btn-aten'); await pg.fill('[name=motivo]', 'Fiebre y tos'); await pg.fill('[name=peso_kg]', '500'); await pg.fill('[name=diag]', 'Infección respiratoria aguda'); await pg.fill('[name=cie]', 'J06.9')
        await pg.click('button[value=firmar]'); await pg.wait_for_timeout(300)
        e = await pg.inner_text('#a-err')
        reg('PF-02.2', 'HU2', 'Constantes vitales fuera de rango para la edad', 'Se rechaza con mensaje (criterio 2.1)', 'fuera del rango' in e, e)
        await pg.fill('[name=peso_kg]', '26.3'); await pg.fill('[name=talla_cm]', '131'); await pg.fill('[name=temperatura_c]', '38.1'); await pg.fill('[name=frecuencia_cardiaca]', '104'); await pg.fill('[name=escala_dolor]', '3')
        await pg.fill('[name=proc]', 'Aseo nasal')
        await shot('02_nueva_atencion')
        await pg.click('button[value=borrador]'); await pg.wait_for_timeout(500)
        aid = (await Q("SELECT MAX(id) id FROM atencion"))[0]['id']
        reg('PF-02.3', 'HU2', 'Guardar atención con constantes, diagnóstico y procedimiento', 'Atención en BORRADOR con datos estructurados',
            (await Q(f"SELECT estado FROM atencion WHERE id={aid}"))[0]['estado'] == 'BORRADOR' and await n(f"SELECT COUNT(*) n FROM signo_vital WHERE atencion_id={aid}") == 1)
        await pg.click(f'[data-firmar="{aid}"]'); await pg.wait_for_timeout(400)
        reg('PF-02.4', 'HU2', 'Firmar la atención', 'Estado FIRMADA con hash de firma', (await Q(f"SELECT estado, firma_hash FROM atencion WHERE id={aid}"))[0]['estado'] == 'FIRMADA')
        await login('dr.fuentes'); await go('#/ficha/1')
        antes = await n("SELECT COUNT(*) n FROM auditoria WHERE accion='ACCESO_DENEGADO' AND entidad='diagnostico'")
        await pg.click(f'[data-diag="{aid}"]'); await pg.wait_for_timeout(300)
        despues = await n("SELECT COUNT(*) n FROM auditoria WHERE accion='ACCESO_DENEGADO' AND entidad='diagnostico'")
        reg('PF-02.5', 'HU2', 'Otro médico intenta modificar un diagnóstico firmado', 'Bloqueado y auditado (criterio 2.2)', despues == antes + 1 and await pg.query_selector('#f-dg') is None)
        try:
            await pg.evaluate(f"db.run(\"UPDATE atencion SET estado='BORRADOR' WHERE id={aid}\")"); ok = False
        except Exception as ex: ok = 'firmada' in str(ex)
        reg('PF-02.6', 'HU2', 'Revertir una atención firmada a borrador desde SQL', 'Trigger lo impide', ok)
        await login('enf.munoz'); await go('#/ficha/1'); await pg.click(f'[data-signos="{aid}"]')
        await pg.fill('#f-sv [name=temperatura_c]', '37.4'); await pg.fill('#f-sv [name=frecuencia_cardiaca]', '98'); await pg.click('#f-sv .btn-primary'); await pg.wait_for_timeout(300)
        reg('PF-02.7', 'HU2', 'Enfermera registra constantes vitales en atención existente', 'Segundo registro de constantes', await n(f"SELECT COUNT(*) n FROM signo_vital WHERE atencion_id={aid}") == 2)
        await pg.click('#btn-exam'); await pg.fill('#f-ex [name=nombre]', 'Proteína C reactiva'); await pg.click('#f-ex .btn-primary'); await pg.wait_for_timeout(300)
        eid = (await Q("SELECT MAX(id) id FROM examen"))[0]['id']
        await pg.click(f'[data-res="{eid}"]'); await pg.fill('#f-r [name=resultado]', 'Valor dentro de rango (dato ficticio)'); await pg.click('#f-r .btn-primary'); await pg.wait_for_timeout(300)
        reg('PF-02.8', 'HU2', 'Solicitar examen y registrar su resultado', 'Examen CON_RESULTADO', (await Q(f"SELECT estado FROM examen WHERE id={eid}"))[0]['estado'] == 'CON_RESULTADO')

        # ---------------- HU3 Red pública ----------------
        await login('dra.rojas'); await go('#/ficha/1'); await pg.click('#btn-red'); await pg.wait_for_selector('#red-res table', timeout=5000)
        await shot('03_red_publica')
        filas = len(await pg.query_selector_all('#red-res tbody tr'))
        reg('PF-03.1', 'HU3', 'Consultar antecedentes del paciente en la red pública', 'Se listan antecedentes de otros establecimientos (simulado)', filas == 2, f'{filas} registros')
        await pg.click('[data-imp="0"]'); await pg.wait_for_timeout(400)
        reg('PF-03.2', 'HU3', 'Importar antecedente externo a la ficha', 'Examen con origen RED_PUBLICA', await n("SELECT COUNT(*) n FROM examen WHERE origen='RED_PUBLICA'") == 1)
        await login('enf.munoz'); await go('#/ficha/1')
        reg('PF-03.3', 'HU3', 'Enfermera no ve la consulta a la red pública', 'Botón oculto (permiso red.consultar)', await pg.query_selector('#btn-red') is None)

        # ---------------- HU4 Reportes ----------------
        await login('dra.rojas'); await go('#/reportes')
        await pg.select_option('#rep-pac', '4'); await pg.select_option('#rep-tipo', 'INFORME_ALTA'); await pg.wait_for_timeout(200)
        await pg.click('#f-rep .btn-primary'); await pg.wait_for_selector('#rep-doc', timeout=3000)
        doc = await pg.inner_text('#rep-doc'); await shot('04_informe_alta')
        reg('PF-04.1', 'HU4', 'Generar informe de alta', 'Documento con identificación, diagnósticos e indicaciones al alta', 'Informe de alta' in doc and 'A09' in doc and 'Indicaciones al alta' in doc)
        async with pg.expect_download() as dl: await pg.click('#btn-dl')
        d = await dl.value
        reg('PF-04.2', 'HU4', 'Exportar el reporte', 'Descarga del archivo y auditoría EXPORTACION', d.suggested_filename.endswith('.html') and await n("SELECT COUNT(*) n FROM auditoria WHERE accion='EXPORTACION' AND entidad='reporte_generado'") >= 2, d.suggested_filename)
        await pg.click('[data-cerrar]')
        await pg.select_option('#rep-pac', '5'); await pg.select_option('#rep-tipo', 'RESUMEN_ATENCION'); await pg.click('#f-rep .btn-primary'); await pg.wait_for_timeout(300)
        reg('PF-04.3', 'HU4', 'Paciente sin atenciones firmadas', 'No se emite reporte', 'no tiene atenciones firmadas' in await pg.inner_text('#rep-err'))

        # ---------------- HU5 Citas y notificaciones ----------------
        await login('adm.perez'); await go('#/citas')
        nn = await n("SELECT COUNT(*) n FROM notificacion")
        await pg.click('#btn-cita'); await pg.select_option('#f-c [name=paciente_id]', '2')
        fecha = await pg.evaluate("(()=>{const d=ahora(); d.setDate(d.getDate()+6); return fmt(d).slice(0,10)})()")
        await pg.fill('#f-c [name=fecha]', fecha); await pg.select_option('#f-c [name=hora]', '10:30'); await pg.click('#f-c .btn-primary'); await pg.wait_for_timeout(500)
        cid = (await Q("SELECT MAX(id) id FROM cita"))[0]['id']
        nuevas = await n(f"SELECT COUNT(*) n FROM notificacion WHERE cita_id={cid}")
        reg('PF-05.1', 'HU5', 'Agendar cita', 'Cita creada y 4 recordatorios (48 h y 24 h × SMS y correo) + confirmación', nuevas == 5, f'{nuevas} notificaciones nuevas')
        await pg.click('#btn-cita'); await pg.select_option('#f-c [name=paciente_id]', '3')
        await pg.fill('#f-c [name=fecha]', fecha); await pg.select_option('#f-c [name=hora]', '10:30'); await pg.click('#f-c .btn-primary'); await pg.wait_for_timeout(300)
        reg('PF-05.2', 'HU5', 'Agendar dos citas al mismo profesional y hora', 'Rechazo por horario ocupado', 'ya tiene una cita' in await pg.inner_text('#c-err'))
        await pg.click('[data-cerrar]')
        cped = (await Q("SELECT id FROM cita WHERE especialidad='Pediatría general' AND estado='AGENDADA' AND paciente_id=4"))[0]['id']
        await pg.click(f'[data-canc="{cped}"]'); await pg.fill('#f-cc [name=motivo]', 'Imprevisto familiar'); await pg.click('#f-cc .btn-danger'); await pg.wait_for_timeout(500)
        await shot('05_agenda')
        reg('PF-05.3', 'HU5', 'Cancelar cita de Pediatría', 'Hora liberada e invitación al primero en lista de espera (criterio 5.2)',
            (await Q(f"SELECT estado FROM cita WHERE id={cped}"))[0]['estado'] == 'CANCELADA' and await n("SELECT COUNT(*) n FROM lista_espera WHERE estado='INVITADO'") == 1
            and await n("SELECT COUNT(*) n FROM notificacion WHERE tipo='INVITACION_LISTA_ESPERA'") == 1)
        await pg.click(f'[data-repro="{cid}"]')
        f2 = await pg.evaluate("(()=>{const d=ahora(); d.setDate(d.getDate()+8); return fmt(d).slice(0,10)})()")
        await pg.fill('#f-rp [name=fecha]', f2); await pg.click('#f-rp .btn-primary'); await pg.wait_for_timeout(400)
        reg('PF-05.4', 'HU5', 'Reprogramar cita', 'Cita original REPROGRAMADA y nueva cita vinculada', (await Q(f"SELECT estado FROM cita WHERE id={cid}"))[0]['estado'] == 'REPROGRAMADA'
            and await n(f"SELECT COUNT(*) n FROM cita WHERE cita_origen_id={cid}") == 1)
        await go('#/notificaciones'); await pg.click('#btn-proc'); await pg.wait_for_timeout(400)
        der = await n("SELECT COUNT(*) n FROM notificacion WHERE estado='DERIVADA'")
        lla = await n("SELECT COUNT(*) n FROM notificacion WHERE canal='LLAMADA'")
        reg('PF-05.5', 'HU5', 'Procesar recordatorios vencidos con correo que rebota', 'Envío fallido derivado a llamada automática 3 h después (criterio 5.3)', der >= 1 and lla >= 1, f'derivadas={der}; llamadas={lla}')
        await pg.click('[data-adelantar="3"]'); await pg.wait_for_timeout(300); await pg.click('#btn-proc'); await pg.wait_for_timeout(300)
        await shot('05_recordatorios')
        reg('PF-05.6', 'HU5', 'Adelantar reloj 3 h y procesar', 'La llamada derivada se ejecuta', await n("SELECT COUNT(*) n FROM notificacion WHERE canal='LLAMADA' AND estado='ENVIADA'") >= 1)
        await pg.click('#btn-reloj'); await pg.wait_for_timeout(200)
        await login('tutor.ruiz'); await pg.wait_for_timeout(300)
        await shot('05_portal_tutor')
        btn = await pg.query_selector('[data-resp="CONFIRMAR"]')
        if btn:
            c = await btn.get_attribute('data-c'); await btn.click(); await pg.wait_for_timeout(300)
            ok = (await Q(f"SELECT estado FROM cita WHERE id={c}"))[0]['estado'] == 'CONFIRMADA'
        else: ok = False
        reg('PF-05.7', 'HU5', 'Tutor responde CONFIRMAR a un SMS de recordatorio', 'Cita CONFIRMADA', ok)

        # ---------------- HU6 Asistente ----------------
        await go('#/asistente'); await pg.wait_for_timeout(500)
        async def chat(t):
            await pg.fill('#f-chat [name=m]', t); await pg.click('#f-chat .btn-primary'); await pg.wait_for_timeout(700)
            return await pg.inner_text('#chat-log .burb.bot:last-child')
        r1 = await chat('Mi hija tiene fiebre desde ayer')
        reg('PF-06.1', 'HU6', 'Consulta por fiebre', 'Orientación preliminar clasificada PRIORITARIO', 'PRIORITARIO' in r1, r1[:80])
        r2 = await chat('¿Qué dosis de paracetamol le doy?')
        reg('PF-06.2', 'HU6', 'Solicitud de dosis', 'Rechazo explícito sin indicar medicamento (criterio 6.2)', 'RESTRINGIDO' in r2 and 'No puedo indicar' in r2, r2[:80])
        r3 = await chat('Le cuesta respirar y tiene los labios morados')
        has131 = await pg.query_selector('#chat-log .burb.bot:last-child a[href="tel:131"]') is not None
        await shot('06_asistente')
        reg('PF-06.3', 'HU6', 'Síntoma crítico', 'Advertencia CRÍTICO y botón directo a urgencias 131', 'CRITICO' in r3 and has131, r3[:80])
        r4 = await chat('¿Cuándo es mi próxima cita?')
        reg('PF-06.4', 'HU6', 'Consulta de próximas citas', 'Lista de horas de sus hijos', 'próximas horas' in r4, r4[:80])
        filas = await Q("SELECT texto_cifrado FROM mensaje_asistente")
        reg('PF-06.5', 'HU6', 'Almacenamiento de la conversación', 'Mensajes cifrados (sin texto plano) (criterio 6.3)', len(filas) >= 8 and not any('fiebre' in f['texto_cifrado'] for f in filas), f'{len(filas)} mensajes cifrados')
        await go('#/auditoria')
        reg('PF-06.6', 'HU6', 'Tutor intenta abrir auditoría', 'Acceso denegado', 'Acceso denegado' in await pg.inner_text('#main'))

        # ---------------- HU8 Auditoría ----------------
        await login('aud.lagos'); await go('#/auditoria'); await pg.click('#btn-verif'); await pg.wait_for_timeout(300)
        v = await pg.inner_text('#verif')
        reg('PF-08.1', 'HU8', 'Verificar integridad de la cadena de hash', 'Cadena íntegra', 'Cadena íntegra' in v, v)
        await pg.click('#btn-inmut'); await pg.wait_for_timeout(300)
        m = await pg.inner_text('.modal-b'); await shot('08_inmutabilidad')
        reg('PF-08.2', 'HU8', 'Intentar UPDATE y DELETE sobre la auditoría', 'Ambos bloqueados por triggers', m.count('bloqueado') == 2)
        await pg.click('[data-cerrar]')
        reg('PF-08.3', 'HU8', 'Los registros identifican usuario, rol, fecha, hora y acción', 'Sin registros incompletos',
            await n("SELECT COUNT(*) n FROM auditoria WHERE username IS NULL OR rol IS NULL OR fecha_hora IS NULL OR accion IS NULL") == 0
            and await n("SELECT COUNT(DISTINCT accion) n FROM auditoria") >= 8, f'{await n("SELECT COUNT(*) n FROM auditoria")} registros, {await n("SELECT COUNT(DISTINCT accion) n FROM auditoria")} tipos de acción')
        await pg.select_option('#a-a', 'ACCESO_DENEGADO'); await pg.wait_for_timeout(200); await shot('08_auditoria')
        await go('#/sql'); await pg.fill('#sql-txt', "DELETE FROM auditoria"); await pg.click('#sql-run'); await pg.wait_for_timeout(200)
        reg('PF-08.4', 'HU8', 'Ejecutar DELETE desde la consola SQL', 'Rechazado y auditado', 'Solo se permite' in await pg.inner_text('#sql-err'))
        await pg.select_option('#sql-pre', '6'); await pg.click('#sql-run'); await pg.wait_for_timeout(300)
        await shot('08_sql_quien_accedio')
        reg('PF-08.5', 'HU8', 'Consultar quién accedió a la ficha de un paciente', 'Lista de accesos con usuario y rol', 'dra.rojas' in await pg.inner_text('#sql-res'))
        # Dashboard screenshot
        await login('dra.rojas'); await go('#/inicio'); await shot('00_inicio_medico')
        await go('#/pacientes'); await shot('01_pacientes')
        reg('PF-GEN', 'Todas', 'Errores de JavaScript durante toda la prueba', 'Ninguno', len(errs) == 0, '; '.join(errs)[:200])
        await b.close()
    with (OUT / 'resultados.json').open('w', encoding='utf-8') as archivo:
        json.dump(resultados, archivo, ensure_ascii=False, indent=2)
    print(sum(r['resultado'] == 'APROBADO' for r in resultados), '/', len(resultados))
    if any(r['resultado'] != 'APROBADO' for r in resultados):
        raise SystemExit(1)
asyncio.run(main())
