/** Mensajes de resultado tras una acción (vienen en la URL como ?ok= / ?error=). */
export default function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (sp.error) {
    return (
      <div className="alert alert-error flash" role="alert">
        {sp.error}
      </div>
    );
  }
  if (sp.ok) {
    return (
      <div className="alert alert-ok flash" role="status">
        {sp.ok}
      </div>
    );
  }
  return null;
}
