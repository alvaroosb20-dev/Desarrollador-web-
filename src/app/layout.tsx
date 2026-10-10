import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { getSettings } from '@/lib/settings';
import { contrastText } from '@/lib/format';
import { siteUrl } from '@/lib/env';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const description = s.hero_subtitle;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${s.business_name} · Diseño de páginas web profesionales`, template: `%s · ${s.business_name}` },
    description,
    applicationName: s.business_name,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'es_ES',
      siteName: s.business_name,
      title: `${s.business_name} · Diseño de páginas web profesionales`,
      description,
    },
    twitter: { card: 'summary_large_image', title: s.business_name, description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#08080a',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const style = { '--accent': s.accent_color, '--accent-ink': contrastText(s.accent_color) } as React.CSSProperties;
  return (
    <html lang="es" className={`${geist.variable} ${instrument.variable}`}>
      <body style={style}>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
