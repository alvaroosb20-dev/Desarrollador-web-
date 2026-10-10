'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as { error?: string });
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="l-email">Correo electrónico</label>
        <input id="l-email" name="email" type="email" className="input" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="l-pass">Contraseña</label>
        <input id="l-pass" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state?.error ? (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      ) : null}
      <button className="btn btn-primary btn-block" disabled={pending} aria-busy={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null} Entrar
      </button>
    </form>
  );
}
