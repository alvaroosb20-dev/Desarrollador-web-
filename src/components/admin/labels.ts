export const ORDER_LABELS: Record<string, string> = {
  awaiting_quote: 'Presupuesto pendiente',
  pending_payment: 'Esperando pago',
  payment_setup_pending: 'Pago online no activo',
  deposit_paid: 'Señal pagada',
  paid: 'Pagado',
  payment_failed: 'Pago fallido',
  cancelled: 'Cancelado',
  in_progress: 'En desarrollo',
  delivered: 'Entregado',
};

export const BOOKING_LABELS: Record<string, string> = {
  confirmed: 'Pendiente',
  completed: 'Realizada',
  cancelled: 'Cancelada',
};

export const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Cobrado',
  failed: 'Fallido',
  expired: 'Caducado',
  refunded: 'Reembolsado',
};

export const EMAIL_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Error al enviar',
  not_configured: 'Correo no configurado',
};

export const BLOCK_LABELS: Record<string, string> = {
  holiday: 'Festivo',
  vacation: 'Vacaciones',
  block: 'Bloqueo de horas',
};
