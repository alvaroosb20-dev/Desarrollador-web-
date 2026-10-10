# Pruebas en navegador real (Chromium) contra el entorno local de tests/run-stack.sh.
# python3 tests/e2e_browser.py
import random
import sys
from playwright.sync_api import sync_playwright

B = 'http://127.0.0.1:8080/'

# Los límites antispam son reales; se reinician para que las pruebas no dependan de ejecuciones anteriores.
import urllib.request
_keys = dict(l.split('=', 1) for l in open('/tmp/wqv-keys.env').read().split())
urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:54321/rest/v1/rate_limits?key=neq.x', method='DELETE',
    headers={'apikey': _keys['ANON_KEY'], 'Authorization': 'Bearer ' + _keys['SERVICE_KEY']}))
results = []
problems = []


def ok(cond, msg):
    results.append(cond)
    print(('  ✔ ' if cond else '  ✘ ') + msg)


def watch(pg):
    pg.on('pageerror', lambda e: problems.append(f'{pg.url}: {e}'))
    # Errores de consola (incluye violaciones de la política de seguridad CSP).
    # Se ignoran las respuestas 4xx esperadas (contraseña incorrecta, antispam).
    pg.on('console', lambda m: problems.append(f'{pg.url}: {m.text}') if m.type == 'error' and 'status of 4' not in m.text else None)


with sync_playwright() as p:
    b = p.chromium.launch()

    print('Formulario obligatorio (escritorio)')
    ctx = b.new_context(viewport={'width': 1366, 'height': 860})
    pg = ctx.new_page(); watch(pg)
    pg.goto(B); pg.wait_for_timeout(1000)
    w = pg.locator('#wizard')
    ok(w.is_visible() and not pg.locator('#main').is_visible(), 'al entrar por primera vez solo se ve el formulario')
    ok(pg.evaluate("document.querySelector('#site').inert") is True, 'el resto de la web queda bloqueado (inert), no solo tapado')
    ok(not pg.locator('[data-wizard-close]').is_visible(), 'el formulario obligatorio no se puede cerrar')
    C = lambda: w.get_by_role('button', name='Continuar').click()
    w.get_by_role('button', name='Empezar').click()
    C(); pg.wait_for_timeout(200)
    ok('Escribe tu nombre' in w.inner_text(), 'no deja continuar sin nombre')
    pg.fill('#w-name', 'Lucía Pérez'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    ok(w.locator('[data-wizard-count]').inner_text() == 'Pregunta 2 de 9', 'una sola pregunta por pantalla con contador')
    w.get_by_role('button', name='Atrás').click(); pg.wait_for_timeout(250)
    ok(pg.input_value('#w-name') == 'Lucía Pérez', 'al retroceder se conserva la respuesta')
    C(); pg.wait_for_timeout(200)
    pg.check('input[name=noName]'); C(); pg.wait_for_timeout(200)
    C(); pg.wait_for_timeout(200)
    ok('Elige una opción' in w.inner_text(), 'en las opciones exige elegir una')
    for opt in ['Tienda física', 'Tienda Online', 'Vender productos', 'Más de 700 €', 'Necesito ayuda con todo', 'Lo antes posible']:
        w.locator('label.choice', has_text=opt).click(); C(); pg.wait_for_timeout(200)
    pg.fill('#w-email', 'lucia@ejemplo'); C(); pg.wait_for_timeout(200)
    ok('no parece válido' in w.inner_text(), 'valida el correo')
    pg.fill('#w-email', f'lucia{random.randint(1, 10**6)}@ejemplo.com'); C(); pg.wait_for_timeout(200)
    ok('política de privacidad' in w.locator('.err').inner_text(), 'exige aceptar la privacidad')
    w.locator('input[name=privacy]').check(); C(); pg.wait_for_timeout(300)
    width = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.progress span')).width) / document.querySelector('.progress').clientWidth")
    ok('Revisa tu solicitud' in w.inner_text() and width > 0.9, 'resumen final con la barra de progreso casi completa')
    w.get_by_role('button', name='Cambiar presupuesto').click(); pg.wait_for_timeout(200)
    w.locator('label.choice', has_text='Entre 450 € y 700 €').click(); C(); pg.wait_for_timeout(300)
    ok('Revisa tu solicitud' in w.inner_text() and 'Entre 450 € y 700 €' in w.inner_text(), 'se puede corregir una respuesta y volver al resumen')
    pg.reload(); pg.wait_for_timeout(900)
    ok('Revisa tu solicitud' in w.inner_text(), 'el progreso se conserva al recargar')
    pg.evaluate("window.__clicks = 0")
    w.get_by_role('button', name='Enviar solicitud').dblclick(); pg.wait_for_timeout(1500)
    ok('¡Perfecto! Hemos recibido tu solicitud' in w.inner_text(), 'confirmación solo tras guardarse en el servidor')
    ok(pg.evaluate("localStorage.getItem('wqv_lead')").count('.') == 1, 'se guarda el comprobante firmado (sin datos personales)')
    ok(pg.evaluate("sessionStorage.getItem('wqv_wizard')") is None, 'se borran las respuestas temporales del navegador')
    ok('@' not in pg.url, 'no hay datos personales en la URL')
    w.get_by_role('button', name='Ver nuestros planes').click(); pg.wait_for_timeout(900)
    ok(pg.locator('#planes').is_visible() and not w.is_visible(), '«Ver nuestros planes» lleva a los precios')
    pg.goto(B); pg.wait_for_timeout(900)
    ok(not pg.locator('#wizard').is_visible(), 'en la siguiente visita no se repite el formulario')
    pg.click('[data-open-wizard]'); pg.wait_for_timeout(300)
    ok(pg.locator('[data-wizard-close]').is_visible(), '«Crear mi página web» abre el formulario (ahora sí se puede cerrar)')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    print('Página principal')
    ok(pg.locator('.plan').count() == 3, 'tres planes')
    ok(pg.locator('.demo').count() == 8 and 'No representan clientes reales' in pg.inner_text('#portafolio'), 'galería de 8 demostraciones marcadas como tales')
    ok(pg.locator('a.btn-call[href="reservas.html"]').count() >= 5, '«Agendar una llamada» en cabecera, portada, precios, preguntas y contacto')
    pg.locator('[data-ask]').first.click(); pg.wait_for_timeout(700)
    ok(pg.input_value('#c-topic') == 'Diseño de páginas web', 'los botones de servicio preparan el formulario de contacto')
    pg.fill('#c-name', 'Pepe'); pg.fill('#c-email', 'pepe@ejemplo.com'); pg.fill('#c-message', 'Quiero información, por favor.'); pg.check('#contact-form input[name=privacy]')
    pg.wait_for_timeout(2200)
    pg.click('#contact-form button[type=submit]'); pg.wait_for_timeout(1200)
    ok('Mensaje enviado' in pg.inner_text('#contacto'), 'el formulario de contacto envía de verdad')
    pg.click('a[href="contratar.html?plan=tienda-online"]'); pg.wait_for_timeout(3200)

    print('Contratación')
    ok('Contratar Tienda Online' in pg.inner_text('h1'), 'resumen del plan elegido')
    pg.check('input[name=mode][value=quote]')
    pg.fill('#k-req', 'Necesito conexión con mi ERP'); pg.fill('#k-name', 'Lucía'); pg.fill('#k-email', 'lucia@ejemplo.com')
    pg.click('[data-submit]'); pg.wait_for_timeout(500)
    ok('condiciones de contratación' in pg.inner_text('#checkout-form .err:not(:empty)'), 'exige aceptar las condiciones')
    pg.check('input[name=acceptTerms]'); pg.check('input[name=acceptPrivacy]'); pg.click('[data-submit]'); pg.wait_for_timeout(2500)
    ok('Pendiente de presupuesto' in pg.inner_text('main'), 'presupuesto revisado: pedido registrado sin cobro')
    pg.goto(B + 'contratar.html?plan=web-avanzada'); pg.wait_for_timeout(3200)
    pg.fill('#k-name', 'Lucía'); pg.fill('#k-email', 'lucia@ejemplo.com'); pg.check('input[name=acceptTerms]'); pg.check('input[name=acceptPrivacy]')
    pg.click('[data-submit]'); pg.wait_for_timeout(2000)
    ok('fake-stripe/pay' in pg.url, 'el pago va a la página de Stripe (sesión creada en el servidor)')
    pg.click('#volver'); pg.wait_for_timeout(2500)
    ok('Pendiente de pago' in pg.inner_text('main') and 'Pagado' not in pg.inner_text('.status-pill'), 'volver de Stripe sin confirmación NO muestra «Pagado»')

    print('Reservas (móvil)')
    m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    mp = m.new_page(); watch(mp)
    mp.goto(B + 'reservas.html'); mp.wait_for_timeout(3200)
    ok(mp.evaluate('document.documentElement.scrollWidth') <= 390, 'sin desplazamiento horizontal en móvil')
    ok(mp.locator('.cal-day.free').count() > 0, 'muestra días con horarios libres reales')
    mp.locator('.cal-day.free').first.click(); mp.locator('.slot').nth(2).click()
    mp.fill('#b-name', 'Mario Ruiz'); mp.fill('#b-email', f'mario{random.randint(1, 10**6)}@ejemplo.com'); mp.check('#booking-form input[name=privacy]')
    mp.click('#booking-form button[type=submit]'); mp.wait_for_timeout(1500)
    ok('Llamada reservada' in mp.inner_text('main'), 'reserva confirmada')
    href = mp.locator('a', has_text='Cambiar o cancelar').get_attribute('href')
    mp.goto(B + href); mp.wait_for_timeout(1200)
    mp.get_by_role('button', name='Cambiar la hora').click(); mp.wait_for_timeout(1500)
    mp.locator('.cal-day.free').nth(1).click(); mp.locator('.slot').first.click(); mp.click('text=Confirmar el cambio'); mp.wait_for_timeout(1500)
    ok('Cita cambiada' in mp.inner_text('main'), 'se puede cambiar la cita con el enlace seguro')
    mp.get_by_role('button', name='Cancelar la cita').click(); mp.click('text=Sí, cancelar la cita'); mp.wait_for_timeout(1200)
    ok('Cancelada' in mp.inner_text('.status-pill'), 'y cancelarla')

    print('Panel de administración')
    a = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    ap = a.new_page(); watch(ap)
    ap.goto(B + 'admin.html'); ap.wait_for_timeout(800)
    ap.fill('#l-email', 'intruso@prueba.local'); ap.fill('#l-password', 'clave-intruso-123'); ap.click('#login-form button[type=submit]'); ap.wait_for_timeout(1000)
    ok(not ap.locator('#shell').is_visible() and 'no tiene permisos' in ap.inner_text('#login'), 'un usuario sin permisos no entra')
    ap.fill('#l-email', 'admin@prueba.local'); ap.fill('#l-password', 'clave-admin-123'); ap.click('#login-form button[type=submit]'); ap.wait_for_timeout(1500)
    ok(ap.locator('#shell').is_visible() and 'Resumen' in ap.inner_text('#view'), 'el administrador entra')
    ap.goto(B + 'admin.html#/solicitudes'); ap.wait_for_timeout(1200)
    ap.select_option('#f-wt', 'tienda_online'); ap.click('[data-filters] button[type=submit]'); ap.wait_for_timeout(800)
    ok(ap.locator('tbody tr').count() >= 1 and all('Tienda Online' in t for t in ap.locator('tbody tr td:nth-child(4)').all_inner_texts()), 'filtros por tipo de web')
    with ap.expect_download() as d:
        ap.click('[data-csv]')
    csv = open(d.value.path(), encoding='utf-8-sig').read()
    ok(csv.startswith('"Fecha";"Estado"') and 'Tienda Online' in csv, 'exportación a CSV')
    ap.locator('tbody tr.click').first.click(); ap.wait_for_timeout(1200)
    ap.select_option('[data-status] select', 'presupuesto_enviado'); ap.click('[data-status] button'); ap.wait_for_timeout(500)
    ap.fill('#note-body', 'Enviar propuesta el lunes'); ap.click('[data-note] button'); ap.wait_for_timeout(900)
    ok('Enviar propuesta el lunes' in ap.inner_text('.notes'), 'notas privadas')
    ap.goto(B + 'admin.html#/paquetes'); ap.wait_for_timeout(1500)
    det = ap.locator('[data-pk] details').first; det.locator('summary').click()
    det.locator('input[name=price_cents]').fill('259,99'); det.locator('button[type=submit]').click(); ap.wait_for_timeout(1000)
    pub = a.new_page(); pub.add_init_script("localStorage.setItem('wqv_lead','x')"); pub.goto(B); pub.wait_for_timeout(1500)
    ok(pub.locator('.plan-price').first.inner_text().startswith('259,99'), 'el precio editado aparece en la web pública')
    det = ap.locator('[data-pk] details').first; det.locator('summary').click()
    det.locator('input[name=price_cents]').fill('249,99'); det.locator('button[type=submit]').click(); ap.wait_for_timeout(800)
    ap.goto(B + 'admin.html#/contrataciones'); ap.wait_for_timeout(1200)
    ok(ap.locator('[data-order-status] option[value=paid]:not([disabled]), [data-order-status] option[value=deposit_paid]:not([disabled])').count() == 0, 'el panel no permite marcar «Pagado» a mano')
    ap.goto(B + 'admin.html#/integraciones'); ap.wait_for_timeout(1500)
    ok('Pagos con Stripe (modo de prueba)' in ap.inner_text('#view'), 'el panel muestra el estado de las integraciones')
    ap.click('[data-logout]'); ap.wait_for_timeout(500)
    ap.goto(B + 'admin.html#/solicitudes'); ap.wait_for_timeout(800)
    ok(not ap.locator('#shell').is_visible(), 'tras cerrar sesión no se puede volver a entrar sin contraseña')

    b.close()

print()
for pr in problems:
    print('  ! ' + pr)
ok(not problems, 'sin errores en la consola ni bloqueos de la política de seguridad')
print(f"\n{sum(results)} correctas, {len(results) - sum(results)} fallidas")
sys.exit(0 if all(results) else 1)
