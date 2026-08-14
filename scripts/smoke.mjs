const webUrl = (process.env.SMOKE_WEB_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const apiUrl = (process.env.SMOKE_API_URL ?? 'http://localhost:3333').replace(
  /\/$/,
  '',
);

const checks = [
  { name: 'web', url: webUrl, validate: (body) => body.includes('<main') },
  {
    name: 'api live',
    url: `${apiUrl}/api/v1/health/live`,
    validate: (body) => JSON.parse(body).status === 'ok',
  },
  {
    name: 'api ready',
    url: `${apiUrl}/api/v1/health/ready`,
    validate: (body) => JSON.parse(body).status === 'ready',
  },
  {
    name: 'openapi',
    url: `${apiUrl}/api/docs-json`,
    validate: (body) => JSON.parse(body).openapi.startsWith('3.'),
  },
];

let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      headers: { 'user-agent': 'event-platform-smoke/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    const valid = response.ok && check.validate(body);
    console.log(`${valid ? 'PASS' : 'FAIL'} ${check.name} ${check.url}`);
    failed ||= !valid;
  } catch (error) {
    failed = true;
    console.error(
      `FAIL ${check.name} ${check.url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failed) process.exitCode = 1;
