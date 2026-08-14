import type { TicketStatus as TicketStatusValue } from '@event-platform/contracts';

const LABELS: Record<TicketStatusValue, string> = {
  VALID: 'Válido',
  USED: 'Já utilizado',
  CANCELED: 'Cancelado',
};

export function TicketStatus({ status }: { status: TicketStatusValue }) {
  const tone =
    status === 'VALID'
      ? 'border-success bg-success-soft text-success'
      : status === 'USED'
        ? 'border-warning bg-warning-soft text-warning'
        : 'border-error bg-error-soft text-error';

  return (
    <span className={`status-stamp ${tone}`}>
      {status === 'VALID' ? '✓ ' : status === 'USED' ? '● ' : '× '}
      {LABELS[status]}
    </span>
  );
}
