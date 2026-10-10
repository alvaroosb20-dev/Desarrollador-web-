// Formulario obligatorio: se decide antes de pintar la página para evitar parpadeos.
try {
  var c = window.WQV_CONFIG || {};
  if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY && c.LEAD_GATE !== false && !localStorage.getItem('wqv_lead')) {
    document.documentElement.classList.add('gate');
  }
} catch (e) {}
