import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Reveal from '@/components/Reveal';
import { getSettings } from '@/lib/settings';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <>
      <Header brand={s.business_name} logoUrl={s.logo_url} />
      <main id="contenido">{children}</main>
      <Footer s={s} />
      <Reveal />
    </>
  );
}
