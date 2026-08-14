import type { Metadata } from 'next';
import { TicketWallet } from './ticket-wallet';

export const metadata: Metadata = {
  title: 'Meus ingressos | Event Platform',
};

export default function TicketsPage() {
  return <TicketWallet />;
}
