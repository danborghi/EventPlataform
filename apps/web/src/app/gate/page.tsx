import type { Metadata } from 'next';
import { GateConsole } from './gate-console';

export const metadata: Metadata = {
  title: 'Portaria | Event Platform',
};

export default function GatePage() {
  return <GateConsole />;
}
