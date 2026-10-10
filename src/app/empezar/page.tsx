import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Wizard from '@/components/Wizard';
import { getSettings } from '@/lib/settings';
import { LEAD_COOKIE, verifyLead } from '@/lib/lead-cookie';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cuéntanos tu proyecto',
  description: 'Responde a unas sencillas preguntas y te ayudaremos a encontrar la mejor solución para tu web.',
  alternates: { canonical: '/empezar' },
};

export default async function EmpezarPage() {
  const [s, store] = await Promise.all([getSettings(), cookies()]);
  const already = Boolean(await verifyLead(store.get(LEAD_COOKIE)?.value));
  return <Wizard brand={s.business_name} alreadySubmitted={already} />;
}
