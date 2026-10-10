// =====================================================================
// CONFIGURACIÓN PÚBLICA DE LA WEB
// Estos valores NO son secretos: la clave «anon/publishable» de Supabase está
// pensada para usarse en el navegador y está protegida por las políticas RLS.
// NUNCA pongas aquí la clave service_role ni las claves secretas de Stripe o Resend:
// esas van en los «Secrets» de las Edge Functions de Supabase (ver README).
// =====================================================================
window.WQV_CONFIG = {
  // Supabase → Project Settings → API → Project URL
  SUPABASE_URL: '',
  // Supabase → Project Settings → API → anon public (o «publishable key»)
  SUPABASE_ANON_KEY: '',
  // Formulario obligatorio antes de ver la web (true / false)
  LEAD_GATE: true,
};
