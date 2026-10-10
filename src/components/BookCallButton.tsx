import Link from 'next/link';
import { IconCalendar } from './Icons';

/** Botón «Agendar una llamada»: lleva al sistema real de reservas (/reservar). */
export default function BookCallButton({
  size,
  block,
  label = 'Agendar una llamada',
  className = '',
}: {
  size?: 'sm';
  block?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/reservar"
      className={`btn btn-call${size === 'sm' ? ' btn-sm' : ''}${block ? ' btn-block' : ''} ${className}`.trim()}
    >
      <IconCalendar />
      <span>{label}</span>
    </Link>
  );
}
