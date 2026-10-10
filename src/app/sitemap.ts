import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';
import { getPackages } from '@/lib/settings';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const packages = await getPackages();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/empezar`, lastModified: now, priority: 0.9 },
    { url: `${base}/reservar`, lastModified: now, priority: 0.8 },
    ...packages.map((p) => ({ url: `${base}/contratar/${p.slug}`, lastModified: now, priority: 0.7 })),
    ...['aviso-legal', 'privacidad', 'cookies', 'condiciones'].map((d) => ({ url: `${base}/legal/${d}`, lastModified: now, priority: 0.2 })),
  ];
}
