# WEBS QUE VENDEN — web de la agencia

Web comercial para vender páginas web: formulario inicial obligatorio paso a paso, página principal, planes y precios, mantenimiento, reservas de llamadas, contratación con Stripe y panel de administración privado.

**Tecnología**

- **Web (frontend):** HTML5, CSS3 y JavaScript puro, sin frameworks ni paso de compilación. Todo está en la carpeta `public/` y se puede publicar en cualquier hosting estático (o por FTP).
- **Backend:** Supabase. Base de datos PostgreSQL con seguridad RLS, autenticación del panel, almacenamiento de imágenes y 6 Edge Functions para lo que debe ocurrir en el servidor (guardar formularios, reservas, pagos, correos).
- **Pagos:** Stripe Checkout (sesión creada en el servidor y confirmada por webhook firmado).
- **Correo:** Resend.

> Esta versión sustituye a la anterior en Next.js. La base de datos es la misma (se añade la migración `0003`), así que no se pierde ningún dato.

---

## Estructura

```
public/                       ← lo que se publica en el hosting
  index.html  script.js        página principal + formulario obligatorio
  styles.css                   estilos de la web
  reservas.html reservas.js    reservar una llamada
  cita.html  cita.js           cambiar o cancelar una cita (enlace del correo)
  contratar.html contratar.js  contratación de un plan
  pedido.html pedido.js        estado del pedido tras pagar
  admin.html admin.css admin.js  panel de administración
  aviso-legal.html, politica-privacidad.html, cookies.html, condiciones.html
  404.html  robots.txt
  config.js                    ← ÚNICO archivo que debes editar (datos públicos de Supabase)
  _headers  .htaccess          cabeceras de seguridad (Netlify/Cloudflare y Apache)
  assets/js/                   módulos compartidos (formulario, calendario, diseños…)
  assets/fonts/                tipografía Inter, alojada en tu propio servidor
supabase/
  migrations/0001…0003         tablas, seguridad RLS y funciones de la base de datos
  seed.sql                     paquetes, precios, FAQ y galería iniciales
  functions/                   Edge Functions: forms, booking, checkout,
                               stripe-webhook, admin, calendar-feed
  functions/.env.example       lista de secretos del servidor
  config.toml
tests/                         pruebas automáticas (no se publican)
```

---

## Puesta en marcha

### 1. Supabase (base de datos y panel)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región Europa).
2. **SQL Editor** → ejecuta, en este orden, el contenido de:
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_storage.sql`
   3. `supabase/migrations/0003_web_estatica.sql`
   4. `supabase/seed.sql`

   *Si ya tenías la base de datos de la versión Next.js, ejecuta solo `0003_web_estatica.sql` (y `seed.sql` si quieres los textos nuevos de los planes; no duplica nada).*
3. **Tu usuario administrador:** Authentication → Users → *Add user* → correo y contraseña (marca *Auto Confirm User*). Después, en el SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TU-CORREO@ejemplo.com';
   ```
4. Authentication → Providers → Email → desactiva **Allow new users to sign up** (nadie más necesita registrarse).
5. Authentication → URL Configuration → *Site URL*: la dirección de tu web.

### 2. Edge Functions (servidor)

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/cli) en tu ordenador:

```bash
supabase login
supabase link --project-ref TU_REFERENCIA_DE_PROYECTO
cp supabase/functions/.env.example supabase/functions/.env   # rellénalo
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy forms booking checkout stripe-webhook admin calendar-feed
```

`config.toml` ya indica que las funciones no exigen JWT de Supabase (son públicas o comprueban la sesión por su cuenta, y el webhook de Stripe no envía JWT).

Secretos (ver `supabase/functions/.env.example`):

| Secreto | Obligatorio | Para qué |
|---|---|---|
| `SITE_URL` | Sí | Dirección de la web (enlaces de correos y Stripe; solo esa web puede usar los formularios) |
| `LEAD_SECRET` | Sí | Firma el comprobante del formulario. Genera uno con `openssl rand -hex 32` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Recomendado | Correos de confirmación |
| `ADMIN_NOTIFY_EMAIL` | Recomendado | Avisos a ti de solicitudes, llamadas y pagos |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Para cobrar online | Pagos |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los añade Supabase automáticamente. **La clave service_role nunca está en la web.**

### 3. Conectar la web (`public/config.js`)

```js
window.WQV_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ…',   // Project Settings → API → anon public (o publishable key)
  LEAD_GATE: true,             // formulario obligatorio al entrar
};
```

Esa clave es pública por diseño: la protección la ponen las políticas RLS de la base de datos.

### 4. Correo (Resend)

1. Cuenta en [resend.com](https://resend.com) → verifica tu dominio (registros DNS que te indique).
2. Crea una API key y ponla en `RESEND_API_KEY`. `EMAIL_FROM` debe usar ese dominio.

Sin esto todo se guarda igual, pero **no se envía ningún correo**: la web lo dice al reservar (y muestra el enlace para gestionar la cita) y el panel lo indica en cada llamada. Nunca se finge un envío.

### 5. Stripe

1. En [dashboard.stripe.com](https://dashboard.stripe.com) usa primero el **modo de prueba**: copia la clave `sk_test_…` en `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → *Add endpoint*:
   - URL: `https://TU_PROYECTO.supabase.co/functions/v1/stripe-webhook` (también aparece en el panel → Integraciones)
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
   - Copia el *Signing secret* (`whsec_…`) en `STRIPE_WEBHOOK_SECRET`.
3. Vuelve a ejecutar `supabase secrets set …`.
4. Prueba con la tarjeta `4242 4242 4242 4242`. Cuando funcione, cambia a las claves reales y crea el webhook también en modo real.

Sin Stripe, las contrataciones se registran como «Pago online no activado» y no se cobra nada. Un pedido **solo** pasa a «Pagado» cuando llega el aviso firmado de Stripe con el importe correcto (o si registras tú un cobro manual): volver a la página de éxito no cuenta, y la base de datos impide marcarlo a mano.

### 6. Publicar la web (hosting y dominio)

Sube **el contenido de la carpeta `public/`** (no la carpeta entera del proyecto).

- **Netlify o Cloudflare Pages (recomendado, gratis):** conecta el repositorio y pon como directorio de publicación `public` (sin comando de compilación). Las cabeceras de seguridad de `_headers` se aplican solas.
- **Hosting compartido con Apache (cPanel, FTP):** sube el contenido de `public/` a `public_html`. El archivo `.htaccess` activa HTTPS, URLs limpias, la página 404 y las cabeceras de seguridad.
- **Dominio:** en tu registrador, apunta el dominio al hosting (registros que te indique Netlify/Cloudflare o tu hosting) y activa HTTPS. Después actualiza `SITE_URL` (y `ALLOWED_ORIGINS` si usas `www`).

### 7. Revisión antes de abrir al público

- [ ] Panel → **Ajustes**: datos legales reales (titular, NIF, domicilio, correo), contacto y WhatsApp.
- [ ] Revisa los textos legales con un profesional (las páginas legales muestran un aviso mientras falten datos).
- [ ] Panel → **Disponibilidad**: activa las reservas y define tus horarios.
- [ ] Panel → **Integraciones**: todo en verde (o sabes qué falta y por qué).
- [ ] Haz una solicitud, una reserva y un pago de prueba de principio a fin.

---

## Uso diario

**Panel de administración:** `https://tu-dominio.com/admin.html` con el correo y contraseña del paso 1.3. Las demás cuentas no pueden entrar aunque conozcan la dirección: la base de datos rechaza cualquier lectura o cambio que no venga de un administrador.

- **Resumen:** solicitudes, presupuestos, clientes aceptados, proyectos, llamadas, contrataciones, pagos. Separa lo **cobrado** de lo **pendiente**.
- **Solicitudes:** búsqueda por nombre/correo/empresa, filtros por estado, tipo de web, presupuesto, origen y fechas, exportación a CSV. En cada solicitud: respuestas, cambio de estado, notas privadas, llamadas y contrataciones vinculadas, y eliminación.
- **Llamadas:** marcar como realizada/pendiente, cambiar la hora o cancelar (el cliente recibe el aviso si el correo está configurado).
- **Disponibilidad:** días y tramos horarios, duración, descanso entre llamadas, antelación mínima y máxima, zona horaria, vacaciones, festivos y bloqueos de horas. También eliges entre el calendario propio o Calendly.
- **Contrataciones:** estado de cada pedido y registro de cobros manuales (transferencia, Bizum…).
- **Paquetes y precios:** nombre, precio, descripción, qué incluye, límite de páginas, rondas de cambios, etiqueta destacada, mantenimiento y servicios adicionales. Se ve en la web al instante.
- **Contenido:** textos de portada, servicios, pasos, preguntas frecuentes y galería de demostraciones (con imagen propia opcional).
- **Ajustes:** nombre de la agencia, logotipo, color de acento, contacto, SEO, datos legales, modo de pago (completo o señal y su porcentaje) y analítica opcional.
- **Integraciones:** estado de cada servicio, prueba de correo y **calendario suscribible**: pega ese enlace en Google Calendar («Otros calendarios» → «Desde URL») para ver tus llamadas allí.

**Cambiar precios:** Panel → Paquetes y precios → abre el plan → cambia el precio → Guardar.
**Cambiar horarios:** Panel → Disponibilidad → marca los días, pon los tramos → Guardar disponibilidad.
**Recibir solicitudes:** llegan al panel (Solicitudes) y, si configuras Resend, también a tu correo.

---

## Cómo funciona (y qué protege cada cosa)

- **Formulario obligatorio:** se muestra antes de la web y bloquea el resto de la página (`inert`). Las respuestas se guardan en el navegador solo mientras se rellena (sessionStorage) y se borran al enviar. La confirmación solo aparece cuando la base de datos ha guardado la solicitud. Después se guarda un comprobante firmado (id + firma HMAC, sin datos personales) para no repetir el formulario y para vincular automáticamente las llamadas y contrataciones posteriores. *Nota honesta:* en una web estática, alguien con conocimientos técnicos podría saltarse el formulario desde la consola del navegador; el contenido de la página es público igualmente (y así lo ven los buscadores).
- **Antispam:** campo trampa, tiempo mínimo de rellenado, límite de envíos por IP (guardada cifrada) y comprobación del origen.
- **Envíos duplicados:** cada envío lleva una clave única; repetirlo devuelve el mismo registro.
- **Reservas:** el servidor solo ofrece huecos realmente libres (horarios, descansos, bloqueos, antelación) y la base de datos impide que dos reservas se solapen aunque se confirmen en el mismo instante. Las citas se gestionan con un enlace secreto (en el `#` de la dirección, que no llega a ningún servidor).
- **Pagos:** precios siempre leídos de la base de datos; sesión de Stripe creada en el servidor; estado «pagado» solo por webhook verificado; eventos procesados una sola vez.
- **Privacidad:** RLS en todas las tablas; los visitantes no pueden leer ningún dato de clientes; notas internas solo para administradores; sin cookies de seguimiento (si añades analítica en Ajustes, se pide consentimiento antes de cargarla).

---

## Pruebas automáticas

En `tests/` hay un entorno local que imita Supabase (PostgreSQL + PostgREST + las Edge Functions reales + imitaciones de Stripe y Resend):

```bash
bash tests/run-stack.sh            # necesita PostgreSQL 16, PostgREST y Deno
deno run -A tests/unit.test.js     # horarios, zonas horarias, firmas
deno run -A tests/api.test.js      # 78 comprobaciones del servidor y la seguridad
python3 tests/e2e_browser.py       # 44 comprobaciones en un navegador real (escritorio y móvil)
```
