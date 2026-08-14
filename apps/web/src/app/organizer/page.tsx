import type { Metadata } from 'next';
import { OrganizerStudio } from './organizer-studio';

export const metadata: Metadata = {
  title: 'Estúdio do organizador | Event Platform',
  description: 'Pesquise filmes, monte sessões e publique sua programação.',
};

export default function OrganizerPage() {
  return <OrganizerStudio />;
}
