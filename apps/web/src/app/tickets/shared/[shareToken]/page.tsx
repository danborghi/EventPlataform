import type { Metadata } from 'next';
import { SharedTicket } from './shared-ticket';

export const metadata: Metadata = {
  title: 'Ingresso compartilhado | Event Platform',
  robots: { index: false, follow: false },
};

export default async function SharedTicketPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <SharedTicket shareToken={shareToken} />;
}
