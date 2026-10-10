# WEBS QUE VENDEN — web de la agencia

Web comercial completa para vender páginas web: formulario inicial paso a paso, página principal, planes y precios, mantenimiento, reservas de llamadas propias, contratación con Stripe y panel de administración privado.

**Tecnología:** Next.js 15 (App Router) · Supabase (base de datos, autenticación, almacenamiento) · Stripe · Resend (correo) · despliegue en Vercel.

---

## Puesta en marcha (unos 20 minutos)

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (región Europa recomendada).
2. Ve a **SQL Editor** y ejecuta, en este orden, el contenido de:
   1. `supabase/migrations/0001_schema.sql` — tablas, relaciones, seguridad (RLS) y protección anti-reservas dobles.
   2. `supabase/migrations/0002_storage.sql` — almacenamiento para el logotipo y las imágenes.
   3. `supabase/seed.sql` — paquetes, mantenimiento, preguntas frecuentes y proyectos de demostración iniciales.
3. **Crea tu usuario administrador**: Authentication → Users → *Add user* → correo y contraseña (marca *Auto Confirm User*).
4. Dale permisos de administración. En el SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TU-CORREO@ejemplo.com';
   ```
5. Recomendado: Authentication → Providers → Email → desactiva *Allow new users to sign up* (nadie más necesita registrarse).
6. Copia las claves de Project Settings → API (las necesitas en el paso 3).

### 2. Correo (Resend) — recomendado

1. Crea una cuenta en [resend.com](https://resend.com) y verifica tu dominio (añadiendo los registros DNS que te indique).
2. Crea una API key.

Sin esto la web funciona igual, pero **no se envía ningún correo** (confirmaciones de solicitud, de reserva, cambios, cancelaciones ni avisos). El panel lo indica en cada reserva; nunca finge que se ha enviado.

### 3. Vercel

1. Importa este repositorio en [vercel.com](https://vercel.com) → *Add New Project*.
2. En *Environment Variables* añade las de `.env.example`:

| Variable | Obligatoria | Dónde se obtiene |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Sí | Tu dominio, p. ej. `https://webs-que-venden.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Supabase → Settings → API (*anon public*) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Supabase → Settings → API (*service_role*, **secreta**) |
| `LEAD_COOKIE_SECRET` | Sí | Cadena aleatoria: `openssl rand -hex 32` |
| `RESEND_API_KEY` | Recomendada | Resend → API Keys |
| `EMAIL_FROM` | Recomendada | Remitente verificado, p. ej. `Webs que venden <hola@tudominio.com>` |
| `ADMIN_NOTIFY_EMAIL` | Recomendada | Tu correo para recibir avisos |
| `STRIPE_SECRET_KEY` | Para cobrar | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Para cobrar | Ver paso 4 |
| `LEAD_GATE` | No | `on` (por defecto) u `off` para desactivar el formulario obligatorio |

3. Despliega. Entra en `https://tu-dominio/admin` con el usuario del paso 1.

### 4. Stripe (pagos)

1. Empieza en **modo de pruebas** (claves `sk_test_…`).
2. Stripe → Developers → Webhooks → *Add endpoint*:
   - URL: `https://tu-dominio/api/stripe/webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
3. Copia el *Signing secret* (`whsec_…`) en `STRIPE_WEBHOOK_SECRET` y vuelve a desplegar.
4. Prueba una contratación con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC).
5. Cuando todo funcione, cambia a las claves reales y crea el webhook también en modo real.

Sin Stripe, la contratación se guarda como «pago online no activo» y no se cobra nada.

### 5. Primeros ajustes en el panel

- **Ajustes generales**: nombre comercial, logotipo, color, correo, WhatsApp, textos, **datos legales** y modo de pago (completo o señal).
- **Disponibilidad**: revisa tu horario y **activa las reservas** (vienen desactivadas para que nadie reserve antes de que lo revises).
- **Paquetes y precios**: precios, características, mantenimiento y servicios adicionales.
- **Integraciones**: muestra qué está operativo y qué falta.

> Los textos legales son plantillas orientativas. Revísalos con un profesional antes de publicar.

---

## Cómo funciona

- **Formulario inicial obligatorio** (`/empezar`): 9 preguntas, una por pantalla, con barra de progreso, validación, guardado temporal (24 h, solo en el navegador), resumen editable y protección contra envíos dobles. Al guardarse correctamente se crea una cookie firmada (sin datos personales) que da acceso al resto de la web.
  Las páginas de reservas, legales y de gestión de citas son accesibles sin el formulario. Los buscadores también verán el formulario: si priorizas el SEO de la portada, pon `LEAD_GATE=off`.
- **Reservas** (`/reservar`): solo muestra huecos reales según tu horario, antelación mínima y máxima, descanso, festivos, vacaciones, bloqueos y citas existentes. Una restricción de la base de datos impide reservas solapadas aunque dos personas reserven a la vez. Se muestran en la zona horaria del visitante. Cada correo incluye un enlace seguro para cambiar o cancelar y un archivo de calendario (.ics).
- **Vinculación**: si quien reserva o contrata ya rellenó el formulario, se vincula a su solicitud; si no, se crea o reutiliza su contacto por correo, sin duplicarlo.
- **Contratación** (`/contratar/[plan]`): resumen del alcance, requisitos especiales, mantenimiento opcional, precio final, importe a pagar ahora, costes recurrentes y aceptación de condiciones. El precio siempre se calcula en el servidor. Un pedido solo pasa a «pagado» cuando el webhook de Stripe lo confirma.
- **Seguridad**: RLS en todas las tablas (el público no puede leer datos de clientes), escrituras públicas solo desde el servidor tras validar, límite de envíos por IP, campo trampa antispam, panel protegido con Supabase Auth y comprobación de administrador en cada página, acción y en la base de datos.

## Desarrollo local

```bash
cp .env.example .env.local   # y rellena las variables
npm install
npm run dev
```

Para probar el webhook en local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
