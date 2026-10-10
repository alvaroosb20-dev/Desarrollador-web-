import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/admin';
import { BUDGETS, BUSINESS_TYPES, CONTENT_STATUS, GOALS, REQUEST_STATUSES, TIMELINES, WEBSITE_TYPES, labelOf } from '@/lib/wizard';
import { applyRequestFilters, parseRequestFilters } from '@/lib/request-filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // evita inyección de fórmulas al abrir el CSV en Excel
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const filters = parseRequestFilters(new URL(req.url).searchParams);
  let q = admin.supabase
    .from('requests_overview')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  q = applyRequestFilters(q, filters);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    'Fecha', 'Estado', 'Origen', 'Nombre', 'Correo', 'Teléfono', 'Acepta publicidad', 'Negocio',
    'Tipo de negocio', 'Tipo de web', 'Objetivo', 'Presupuesto', 'Contenido', 'Plazo', 'Mensaje', 'ID',
  ];
  const rows = (data ?? []).map((r: any) => {
    return [
      new Date(r.created_at).toISOString(),
      labelOf(REQUEST_STATUSES, r.status),
      r.source,
      r.contact_name,
      r.contact_email,
      r.contact_phone,
      r.marketing_consent ? 'Sí' : 'No',
      r.business_name,
      labelOf(BUSINESS_TYPES, r.business_type),
      labelOf(WEBSITE_TYPES, r.website_type),
      labelOf(GOALS, r.goal),
      labelOf(BUDGETS, r.budget),
      labelOf(CONTENT_STATUS, r.content_status),
      labelOf(TIMELINES, r.timeline),
      r.message,
      r.id,
    ];
  });
  const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="solicitudes-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
