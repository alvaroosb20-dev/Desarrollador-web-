import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="contenido" className="wizard" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="container center" style={{ maxWidth: 560 }}>
        <div className="serif accent" style={{ fontSize: 120, lineHeight: 1 }}>
          404
        </div>
        <h1 style={{ fontSize: 32, marginTop: 12 }}>Esta página no existe</h1>
        <p className="muted">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link href="/" className="btn btn-primary">
            Volver al inicio
          </Link>
          <Link href="/reservar" className="btn btn-call">
            Agendar una llamada
          </Link>
        </div>
      </div>
    </main>
  );
}
