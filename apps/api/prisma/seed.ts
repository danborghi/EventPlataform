import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const ids = {
  organizer: '10000000-0000-4000-8000-000000000001',
  customerOne: '10000000-0000-4000-8000-000000000002',
  customerTwo: '10000000-0000-4000-8000-000000000003',
  gate: '10000000-0000-4000-8000-000000000004',
  publishedEvent: '20000000-0000-4000-8000-000000000001',
  draftEvent: '20000000-0000-4000-8000-000000000002',
} as const;

async function main() {
  const passwordHash = await hash('Test@123', 12);

  const users = [
    {
      id: ids.organizer,
      name: 'Organizador Demo',
      email: 'organizer@example.com',
      role: 'ORGANIZER' as const,
    },
    {
      id: ids.customerOne,
      name: 'Cliente Um',
      email: 'client1@example.com',
      role: 'CUSTOMER' as const,
    },
    {
      id: ids.customerTwo,
      name: 'Cliente Dois',
      email: 'client2@example.com',
      role: 'CUSTOMER' as const,
    },
    {
      id: ids.gate,
      name: 'Portaria Demo',
      email: 'gate@example.com',
      role: 'GATE' as const,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, passwordHash, role: user.role },
      create: { ...user, passwordHash },
    });
  }

  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 30);
  startsAt.setUTCHours(23, 30, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1_000);

  await prisma.event.upsert({
    where: { id: ids.publishedEvent },
    update: { startsAt, endsAt },
    create: {
      id: ids.publishedEvent,
      organizerId: ids.organizer,
      externalProvider: 'TMDB',
      externalId: '157336',
      sourceTitle: 'Interstellar',
      title: 'Interstellar - Sessão Especial',
      description:
        'Uma sessão especial preparada para demonstrar o fluxo completo da plataforma.',
      posterUrl:
        'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
      runtimeMinutes: 169,
      startsAt,
      endsAt,
      timezone: 'America/Sao_Paulo',
      venueName: 'Cine Teatro Demo',
      address: 'Rua das Artes, 100',
      city: 'Londrina',
      priceCents: 3500,
      capacity: 120,
      availableQuantity: 120,
      status: 'PUBLISHED',
    },
  });

  await prisma.event.upsert({
    where: { id: ids.draftEvent },
    update: {},
    create: {
      id: ids.draftEvent,
      organizerId: ids.organizer,
      externalProvider: 'TMDB',
      externalId: '438631',
      sourceTitle: 'Dune',
      title: 'Duna - Sessão em planejamento',
      description: 'Rascunho usado para demonstrar o painel do organizador.',
      posterUrl: null,
      runtimeMinutes: 155,
      startsAt: new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1_000),
      endsAt: new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1_000),
      timezone: 'America/Sao_Paulo',
      venueName: 'Local a confirmar',
      address: 'Endereço a confirmar',
      city: 'Londrina',
      priceCents: 4000,
      capacity: 80,
      availableQuantity: 80,
      status: 'DRAFT',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Database seed failed.', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
