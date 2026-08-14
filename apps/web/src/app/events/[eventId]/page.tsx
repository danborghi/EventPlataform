import { EventDetail } from './event-detail';

interface EventPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { eventId } = await params;
  return <EventDetail eventId={eventId} />;
}
