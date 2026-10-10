import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = () => {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  return v;
};
const anonKey = () => {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return v;
};

/** Cliente anónimo sin sesión: solo puede leer el contenido público (RLS). */
export function publicClient() {
  return createClient(url(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de servicio: ignora RLS. SOLO para rutas de servidor que ya han
 * validado la entrada (formularios públicos, webhooks) o comprobado que el
 * usuario es administrador. Nunca se envía al navegador.
 */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente con la sesión del usuario (cookies). Respeta RLS. */
export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}
