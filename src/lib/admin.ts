import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from './supabase/server';

/**
 * Comprueba en el servidor que hay sesión y que el usuario está en la tabla
 * `admins`. No basta con ocultar el panel: cada página y cada acción lo verifica,
 * y además la base de datos aplica RLS con la misma regla.
 */
export async function requireAdmin() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) redirect('/admin/login?error=no-autorizado');
  return { supabase, user };
}

/** Variante para route handlers / acciones: no redirige, devuelve null. */
export async function getAdmin() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  return isAdmin === true ? { supabase, user } : null;
}
