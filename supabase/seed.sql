-- =====================================================================
-- Datos iniciales. Todo es editable después desde el panel de admin.
-- Es seguro ejecutarlo varias veces (no duplica).
-- =====================================================================

insert into public.site_settings (id, services, process_steps, pricing_note)
values (
  1,
  '[
    {"key":"diseno","title":"Diseño de páginas web","description":"Webs corporativas modernas, rápidas y pensadas para que te contacten."},
    {"key":"tiendas","title":"Tiendas online","description":"Catálogo, carrito y pagos seguros con Stripe para vender desde el primer día."},
    {"key":"landing","title":"Landing pages","description":"Una página enfocada en un único objetivo: que el visitante dé el siguiente paso."},
    {"key":"renovacion","title":"Renovación de páginas web","description":"Modernizamos tu web actual: diseño, velocidad y adaptación a móvil."},
    {"key":"reservas","title":"Páginas de reservas","description":"Tus clientes eligen día y hora sin llamadas ni mensajes de ida y vuelta."},
    {"key":"mantenimiento","title":"Mantenimiento web","description":"Revisiones, copias de seguridad y pequeños cambios con límites claros."}
  ]'::jsonb,
  '[
    {"title":"Nos cuentas tu idea","description":"Respondes unas preguntas o agendas una llamada de 15 minutos."},
    {"title":"Analizamos las necesidades de tu negocio","description":"Definimos el alcance, el plan adecuado y un presupuesto cerrado."},
    {"title":"Diseñamos tu página web","description":"Creamos el diseño y lo desarrollamos sobre una base rápida y segura."},
    {"title":"Revisamos contigo el resultado","description":"Aplicamos las rondas de cambios incluidas en tu plan."},
    {"title":"Publicamos la web después de tu aprobación","description":"Nada sale a Internet sin tu visto bueno."}
  ]'::jsonb,
  'Precios orientativos para el alcance descrito. IVA y costes externos no incluidos salvo que se indique.'
)
on conflict (id) do nothing;

insert into public.booking_settings (id, enabled, weekly_hours)
values (
  1,
  false,
  '{"1":[{"start":"10:00","end":"14:00"},{"start":"16:00","end":"19:00"}],
    "2":[{"start":"10:00","end":"14:00"},{"start":"16:00","end":"19:00"}],
    "3":[{"start":"10:00","end":"14:00"},{"start":"16:00","end":"19:00"}],
    "4":[{"start":"10:00","end":"14:00"},{"start":"16:00","end":"19:00"}],
    "5":[{"start":"10:00","end":"14:00"}]}'::jsonb
)
on conflict (id) do nothing;

insert into public.packages (slug, name, price_cents, audience, description, features, page_limit, revision_rounds, badge, highlighted, cta_label, sort)
values
('web-basica', 'Web Básica', 24999,
 'Para autónomos y pequeños negocios.',
 'Una web profesional y sencilla para que te encuentren y te contacten.',
 '["Diseño moderno y responsive","Hasta 3 páginas o secciones sencillas","Presentación del negocio","Apartado de servicios","Formulario de contacto","Botón de WhatsApp","SEO básico inicial","Configuración y publicación inicial","Una ronda de modificaciones acordadas"]'::jsonb,
 3, 1, null, false, 'Contratar Web Básica', 1),
('web-avanzada', 'Web Avanzada', 44999,
 'Para empresas que necesitan una web más completa.',
 'Más páginas, diseño a medida y una experiencia cuidada en cada detalle.',
 '["Hasta 7 páginas","Diseño personalizado","Animaciones elegantes","Formularios avanzados","Integración de WhatsApp","Galería de imágenes","Presentación de servicios","SEO inicial","Optimización de velocidad","Diseño responsive","Publicación inicial","Dos rondas de modificaciones acordadas"]'::jsonb,
 7, 2, 'Más elegido', true, 'Contratar Web Avanzada', 2),
('tienda-online', 'Tienda Online', 69999,
 'Para negocios que quieren vender productos por Internet.',
 'Todo lo necesario para empezar a vender online con pagos seguros.',
 '["Diseño profesional de comercio electrónico","Catálogo de productos","Fichas de producto","Carrito de compra","Integración de pagos mediante Stripe","Gestión de productos y pedidos","Configuración inicial de envíos","Configuración inicial de impuestos según la información facilitada por el cliente","Diseño responsive","Publicación inicial","Dos rondas de modificaciones acordadas"]'::jsonb,
 null, 2, null, false, 'Contratar Tienda Online', 3)
on conflict (slug) do nothing;

insert into public.maintenance_plans (slug, name, price_cents, price_from, description, features, response_time, limits, sort)
values
('mantenimiento-basico', 'Básico', 1999, false,
 'Para que tu web siga funcionando sin preocuparte.',
 '["Revisión básica del funcionamiento (mensual)","Actualizaciones cuando correspondan a la tecnología utilizada","Copias de seguridad cuando la plataforma lo permita","Soporte básico por correo"]'::jsonb,
 'Respuesta en un máximo de 3 días laborables.',
 'Hasta 30 minutos de soporte al mes. No incluye cambios de diseño ni nuevas secciones.', 1),
('mantenimiento-profesional', 'Profesional', 3999, false,
 'Soporte prioritario y pequeños cambios de contenido incluidos.',
 '["Todo lo incluido en el plan básico","Mayor prioridad de soporte","Pequeñas modificaciones de contenido (textos, imágenes, precios)","Revisión periódica del funcionamiento (quincenal)"]'::jsonb,
 'Respuesta en un máximo de 2 días laborables.',
 'Hasta 2 horas de trabajo al mes. Las horas no consumidas no se acumulan. Nuevas funciones se presupuestan aparte.', 2),
('mantenimiento-tienda', 'Tienda Online', 5999, true,
 'Para tiendas que necesitan revisar que se puede comprar sin problemas.',
 '["Revisión básica de la tienda","Comprobación de los procesos de compra","Revisión de errores habituales","Soporte y pequeñas modificaciones dentro del alcance acordado"]'::jsonb,
 'Respuesta en un máximo de 1 día laborable para incidencias que impidan comprar; 2 días laborables para el resto.',
 'Hasta 3 horas de trabajo al mes. Carga masiva de productos y nuevas funciones se presupuestan aparte. El precio final depende del tamaño de la tienda.', 3)
on conflict (slug) do nothing;

insert into public.addons (name, description, price_cents, unit, price_from, sort)
select * from (values
  ('Página adicional', 'Una sección o página extra sobre el límite del plan.', 4999, 'one_time', true, 1),
  ('Carga de productos', 'Alta de productos en la tienda a partir de tus datos.', 2999, 'hourly', false, 2),
  ('Redacción de textos', 'Te ayudamos a escribir los textos de tu web.', 7999, 'one_time', true, 3)
) as v(name, description, price_cents, unit, price_from, sort)
where not exists (select 1 from public.addons);

insert into public.faqs (question, answer, sort)
select * from (values
  ('¿Cuánto cuesta crear una web?', 'Tenemos tres planes con precio cerrado para el alcance descrito: Web Básica, Web Avanzada y Tienda Online. Si necesitas algo que se sale del plan, te enviamos un presupuesto antes de cobrar nada.', 1),
  ('¿Cuánto se tarda en desarrollar?', 'Depende del plan y de que tengamos el contenido (textos e imágenes). Te damos un plazo concreto junto con el presupuesto, antes de empezar.', 2),
  ('¿El dominio está incluido?', 'No, salvo acuerdo expreso. El dominio se registra a tu nombre para que siempre sea tuyo; te ayudamos a elegirlo y configurarlo.', 3),
  ('¿El hosting está incluido?', 'No, salvo acuerdo expreso. Te recomendamos el alojamiento adecuado para tu web y lo dejamos configurado. Su coste lo paga directamente el cliente al proveedor.', 4),
  ('¿Qué incluye el mantenimiento?', 'Cada plan de mantenimiento indica las tareas, el tiempo de respuesta y el límite de trabajo mensual. No ofrecemos mantenimiento ilimitado: preferimos dejar claro qué incluye cada modalidad.', 5),
  ('¿Podré modificar mi web?', 'Sí. Te explicamos cómo actualizar los contenidos habituales. Si prefieres que lo hagamos nosotros, puedes contratar un plan de mantenimiento.', 6),
  ('¿Cómo se realizan los pagos?', 'Online con tarjeta mediante Stripe, una pasarela de pago segura. Según el proyecto, se paga el importe completo o una señal inicial; antes de pagar verás el alcance, el precio final y cualquier coste recurrente.', 7),
  ('¿Quién será el propietario de la web?', 'Tú. Una vez abonado el importe total, el diseño final y los contenidos de tu web son tuyos. Los detalles se recogen en las condiciones de contratación.', 8),
  ('¿Cómo funciona la contratación?', 'Eliges un plan, nos cuentas si necesitas algo especial, revisas el precio final y las condiciones, y confirmas. Si tus requisitos superan el plan, te enviamos un presupuesto revisado antes de cobrar.', 9),
  ('¿Cómo se agenda una llamada?', 'Pulsa «Agendar una llamada», elige un día y una hora disponibles y deja tus datos. Recibirás un correo de confirmación con enlaces para cambiar o cancelar la cita.', 10)
) as v(question, answer, sort)
where not exists (select 1 from public.faqs);

insert into public.demo_projects (title, sector, description, layout, palette, sort)
select title, sector, description, layout, palette::jsonb, sort from (values
  ('Brasa & Sal', 'Restaurantes', 'Carta digital, reservas de mesa y galería de platos.', 'restaurant', '{"bg":"#1a1210","fg":"#f6efe6","accent":"#e2a15b"}', 1),
  ('Taller Motorvía', 'Talleres mecánicos', 'Servicios, cita previa y presupuesto rápido por WhatsApp.', 'workshop', '{"bg":"#0f1418","fg":"#eef2f5","accent":"#ff6a3d"}', 2),
  ('Casa Atlántica', 'Inmobiliarias', 'Buscador de inmuebles con fichas y contacto por propiedad.', 'realestate', '{"bg":"#f3f0ea","fg":"#1c1c1a","accent":"#2f5d50"}', 3),
  ('Navaja Barber Club', 'Peluquerías y barberías', 'Reserva online por profesional y servicio.', 'barber', '{"bg":"#121212","fg":"#f1ece4","accent":"#c9a86a"}', 4),
  ('Lino Studio', 'Tiendas de ropa', 'Lookbook editorial y colecciones por temporada.', 'fashion', '{"bg":"#efebe5","fg":"#141414","accent":"#141414"}', 5),
  ('Pulso Gym', 'Gimnasios', 'Horario de clases, tarifas y alta online.', 'gym', '{"bg":"#0b0b0d","fg":"#f2f2f2","accent":"#d7ff3a"}', 6),
  ('Clara Asesores', 'Empresas de servicios', 'Servicios, equipo y formulario de consulta.', 'services', '{"bg":"#f7f8fa","fg":"#14213d","accent":"#3a6df0"}', 7),
  ('Isla Mercado', 'Tiendas online', 'Catálogo, carrito y pago seguro con Stripe.', 'shop', '{"bg":"#fbf7f1","fg":"#1f1a14","accent":"#e4572e"}', 8)
) as v(title, sector, description, layout, palette, sort)
where not exists (select 1 from public.demo_projects);
