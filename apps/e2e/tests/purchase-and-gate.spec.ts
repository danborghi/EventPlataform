import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('completes purchase, ticket display and one-time gate validation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Escolha sua próxima sessão/i }),
  ).toBeVisible();

  await page
    .getByRole('link', { name: /Interstellar/i })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: /Interstellar/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Reservar por 10 minutos' }).click();
  await page.getByLabel('E-mail').fill('client2@example.com');
  await page.getByLabel('Senha').fill('Test@123');
  await page.getByRole('button', { name: 'Entrar e reservar' }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  const paymentResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/reservations\/[^/]+\/payment$/.test(response.url()),
  );
  await page.getByRole('button', { name: 'Simular aprovação' }).click();
  const paymentResponse = await paymentResponsePromise;
  expect(paymentResponse.ok()).toBeTruthy();
  const payment = (await paymentResponse.json()) as {
    tickets: Array<{ id: string }>;
  };
  const ticketId = payment.tickets[0]?.id;
  expect(ticketId).toBeTruthy();
  await expect(page.getByText('Pagamento aprovado')).toBeVisible();

  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByText(/Válido/)).toBeVisible();
  await page.getByText('Exibir código técnico').click();
  const qrCode = await page.getByLabel('Código completo').inputValue();
  expect(qrCode).toMatch(/^v1\./);

  await page.goto('/gate');
  await page.getByLabel('E-mail').fill('gate@example.com');
  await page.getByLabel('Senha').fill('Test@123');
  await page.getByRole('button', { name: 'Abrir portaria' }).click();
  await page.getByRole('button', { name: /Interstellar/i }).click();
  await page.getByLabel('Código completo do ingresso').fill(qrCode);
  await page.getByRole('button', { name: 'Validar ingresso' }).click();
  await expect(
    page.getByRole('heading', { name: 'Entrada liberada' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Validar próximo ingresso' }).click();
  await page.getByLabel('Código completo do ingresso').fill(qrCode);
  await page.getByRole('button', { name: 'Validar ingresso' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ingresso já utilizado' }),
  ).toBeVisible();

  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByText(/Já utilizado/)).toBeVisible();
});

test('marketplace has no serious automated accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();

  const audit = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const seriousViolations = audit.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  );

  expect(seriousViolations).toEqual([]);
});

test('organizer filters events and reads the event dashboard', async ({
  page,
}) => {
  await page.goto('/organizer');
  await page.getByRole('button', { name: 'Entrar como organizador' }).click();
  await expect(page.getByText('Sua programação')).toBeVisible();

  const filteredEventsPromise = page.waitForResponse((response) =>
    response.url().includes('/organizer/events?page=1&status=PUBLISHED'),
  );
  await page.getByLabel('Filtrar por status').selectOption('PUBLISHED');
  await filteredEventsPromise;
  await expect(
    page.getByRole('button', { name: /Interstellar/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Duna/i })).toHaveCount(0);

  await page.getByRole('button', { name: /Interstellar/i }).click();
  for (const metric of [
    'Capacidade',
    'Disponíveis',
    'Reservados',
    'Vendidos',
  ]) {
    await expect(page.getByText(metric, { exact: true }).first()).toBeVisible();
  }
});
