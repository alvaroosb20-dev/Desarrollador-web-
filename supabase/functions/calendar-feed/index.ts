// Punto de entrada de la Edge Function. La lógica está en handler.js (JavaScript).
import handler from './handler.js';

Deno.serve(handler);
