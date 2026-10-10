import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Busca un contacto por correo (sin distinguir mayúsculas) o lo crea.
 * Si ya existe, solo completa los datos que falten: nunca sobrescribe
 * información existente con lo que escriba un visitante anónimo.
 */
export async function upsertContact(
  db: SupabaseClient,
  input: { name: string; email: string; phone?: string | null; marketing?: boolean },
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const pattern = email.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data: existing } = await db
    .from('contacts')
    .select('id, phone, marketing_consent')
    .ilike('email', pattern)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.phone && input.phone) patch.phone = input.phone;
    if (input.marketing && !existing.marketing_consent) {
      patch.marketing_consent = true;
      patch.marketing_consent_at = new Date().toISOString();
    }
    if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', existing.id);
    return { id: existing.id as string };
  }

  const { data, error } = await db
    .from('contacts')
    .insert({
      name: input.name,
      email,
      phone: input.phone || null,
      marketing_consent: Boolean(input.marketing),
      marketing_consent_at: input.marketing ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error) {
    // carrera: otro proceso creó el contacto a la vez
    if (error.code === '23505') {
      const { data: again } = await db.from('contacts').select('id').ilike('email', pattern).limit(1).single();
      if (again) return { id: again.id as string };
    }
    throw new Error(`No se pudo guardar el contacto: ${error.message}`);
  }
  return { id: data.id as string };
}
