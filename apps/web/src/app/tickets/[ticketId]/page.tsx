import type { Metadata } from 'next';
import { TicketDetail } from './ticket-detail';

export const metadata: Metadata = {
  title: 'Ingresso | Event Platform',
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <TicketDetail ticketId={ticketId} />;
}
