'use client';

import { IconArrow } from './Icons';

/** Lleva al formulario de contacto con el servicio ya elegido como asunto. */
export default function AskInfoButton({ topic }: { topic: string }) {
  return (
    <a
      href="#contacto"
      className="more"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('wqv:topic', { detail: topic }));
        window.setTimeout(() => document.getElementById('c-name')?.focus({ preventScroll: true }), 600);
      }}
    >
      Solicitar información <IconArrow />
    </a>
  );
}
