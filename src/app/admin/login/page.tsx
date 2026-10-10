import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main id="contenido" className="wizard" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="card">
          <span className="eyebrow">Panel privado</span>
          <h1 style={{ fontSize: 28 }}>Iniciar sesión</h1>
          {error === 'no-autorizado' ? (
            <div className="alert alert-error">Tu cuenta no tiene acceso al panel o la sesión ha caducado.</div>
          ) : null}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
