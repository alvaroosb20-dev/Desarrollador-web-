import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { LEAD_COOKIE, verifyLead } from './lib/lead-cookie';

// Rutas accesibles sin haber completado el formulario inicial.
const OPEN_PREFIXES = ['/empezar', '/api', '/admin', '/legal', '/reservar', '/cita', '/contratar/resultado'];

function isOpen(pathname: string) {
  return OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function refreshAdminSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list) {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLogin = req.nextUrl.pathname.startsWith('/admin/login');
  if (!user && !isLogin) {
    const to = req.nextUrl.clone();
    to.pathname = '/admin/login';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin')) return refreshAdminSession(req);

  const gateOn = (process.env.LEAD_GATE || 'on').toLowerCase() !== 'off';
  if (!gateOn || isOpen(pathname)) return NextResponse.next();

  const ok = await verifyLead(req.cookies.get(LEAD_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const to = req.nextUrl.clone();
  to.pathname = '/empezar';
  to.search = '';
  return NextResponse.redirect(to);
}

export const config = {
  // Excluye archivos estáticos e internos de Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)'],
};
