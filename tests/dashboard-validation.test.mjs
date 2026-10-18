import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  validateDashboardRequest, DashboardInputError, readDashboardBody,
  enforceDashboardOrigin, MAX_DASHBOARD_BODY_BYTES, respondToDashboard,
} from '../app/lib/dashboard-validation.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const private_key = privateKey.export({ type: 'pkcs8', format: 'pem' });
const now = new Date('2026-10-18T12:00:00Z');
const valid = () => ({
  projects: [{ id: 'site-1', name: 'Example', url: 'https://example.com', propertyId: '12345' }],
  credentials: { client_email: 'analytics@example.iam.gserviceaccount.com', private_key },
  endDate: '2026-10-17', days: 7,
});

test('validates and trims an explicit dashboard request without retaining unknown credentials', () => {
  const input = valid();
  input.projects[0].name = ' Example ';
  input.projects[0].propertyId = ' 12345 ';
  input.credentials.client_email = ` ${input.credentials.client_email} `;
  const output = validateDashboardRequest(input, now);
  assert.equal(output.projects[0].name, 'Example');
  assert.equal(output.projects[0].propertyId, '12345');
  assert.equal(output.credentials.client_email, 'analytics@example.iam.gserviceaccount.com');
  assert.deepEqual(Object.keys(output.credentials), ['client_email', 'private_key']);
});

test('rejects malformed, incomplete and unsupported request shapes', () => {
  for (const input of [null, [], 1, {}, { ...valid(), credentials: null }, { ...valid(), extra: true }]) {
    assert.throws(() => validateDashboardRequest(input, now), DashboardInputError);
  }
  for (const count of [0, 13]) {
    const input = valid();
    input.projects = Array.from({ length: count }, (_, i) => ({ ...input.projects[0], id: `p${i}` }));
    assert.throws(() => validateDashboardRequest(input, now), /between 1 and 12/);
  }
  const twelve = valid();
  twelve.projects = Array.from({ length: 12 }, (_, i) => ({ ...twelve.projects[0], id: `p${i}` }));
  assert.equal(validateDashboardRequest(twelve, now).projects.length, 12);
});

test('rejects unsafe project URLs, invalid identifiers and unbounded strings', () => {
  for (const url of [
    'javascript:alert(1)', 'ftp://example.com', 'https://user:pass@example.com',
    'https://user@example.com', 'https://@example.com', 'https://example.com\\@evil.com', 'not a url',
    'https://example.com/a b', `https://example.com/${'a'.repeat(2048)}`,
  ]) {
    const input = valid();
    input.projects[0].url = url;
    assert.throws(() => validateDashboardRequest(input, now), DashboardInputError);
  }
  for (const propertyId of ['G-ABC', 'properties/123', '0', '-1', '1e3', '1.2', '1'.repeat(21)]) {
    const input = valid();
    input.projects[0].propertyId = propertyId;
    assert.throws(() => validateDashboardRequest(input, now), DashboardInputError);
  }
  for (const name of ['', 'x'.repeat(101), 'bad\u0000name']) {
    const input = valid();
    input.projects[0].name = name;
    assert.throws(() => validateDashboardRequest(input, now), DashboardInputError);
  }
  const duplicate = valid();
  duplicate.projects.push({ ...duplicate.projects[0] });
  assert.throws(() => validateDashboardRequest(duplicate, now), /unique/);
});

test('only accepts exact supported periods and real nonfuture calendar dates', () => {
  for (const days of [0, 1, 8, 365, '7', null]) {
    assert.throws(() => validateDashboardRequest({ ...valid(), days }, now), /7, 30 or 90/);
  }
  for (const endDate of ['2026-02-29', '2026-04-31', '2026-10-19', '2026-1-1', 'tomorrow', '0000-01-01']) {
    assert.throws(() => validateDashboardRequest({ ...valid(), endDate }, now), DashboardInputError);
  }
  for (const days of [7, 30, 90]) {
    assert.equal(validateDashboardRequest({ ...valid(), days, endDate: '2024-02-29' }, now).days, days);
  }
});

test('rejects API secrets, invalid PEM keys, bad emails and injected credential endpoints', () => {
  for (const credentials of [
    { client_email: 'not-email', private_key },
    { client_email: 'bad@@example.com', private_key },
    { client_email: 'bad@example..com', private_key },
    { client_email: 'x@example.com', private_key: 'measurement-secret' },
    { client_email: 'x@example.com', private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' },
    { ...valid().credentials, token_uri: 'https://attacker.example/token' },
    { ...valid().credentials, credential_source: { url: 'https://attacker.example' } },
  ]) {
    assert.throws(() => validateDashboardRequest({ ...valid(), credentials }, now), DashboardInputError);
  }
  const { privateKey: weak } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  assert.throws(() => validateDashboardRequest({
    ...valid(), credentials: { ...valid().credentials, private_key: weak.export({ type: 'pkcs8', format: 'pem' }) },
  }, now), /2048/);
});

test('enforces browser same-origin requests without trusting proxy headers', () => {
  const make = headers => new Request('https://dashboard.example/api/dashboard', { headers });
  for (const origin of ['https://attacker.example', 'null', 'http://dashboard.example', 'https://dashboard.example:444']) {
    assert.throws(() => enforceDashboardOrigin(make({ origin })), error => error.status === 403);
  }
  assert.throws(() => enforceDashboardOrigin(make({ 'sec-fetch-site': 'same-site' })), /this site/);
  assert.doesNotThrow(() => enforceDashboardOrigin(make({ origin: 'https://dashboard.example', 'sec-fetch-site': 'same-origin' })));
  assert.doesNotThrow(() => enforceDashboardOrigin(make({})));
  assert.doesNotThrow(() => enforceDashboardOrigin(new Request('http://localhost:3100/api/dashboard', {
    headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100', 'sec-fetch-site': 'same-origin' },
  })));
  assert.throws(() => enforceDashboardOrigin(make({
    origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https',
  })), error => error.status === 403);
  assert.throws(() => enforceDashboardOrigin(make({
    host: 'dashboard.example@attacker.example', origin: 'https://attacker.example',
  })), error => error.status === 403);
});

test('bounded streaming JSON reader rejects empty, invalid, oversized and non-JSON bodies', async () => {
  const make = (body, headers = {}) => new Request('https://example.com/api/dashboard', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
  });
  assert.deepEqual(await readDashboardBody(make('{"ok":true}')), { ok: true });
  for (const body of ['', '{', '<html>', new Uint8Array([255])]) {
    await assert.rejects(readDashboardBody(make(body)), DashboardInputError);
  }
  await assert.rejects(readDashboardBody(make('{}', { 'content-type': 'text/plain' })), error => error.status === 415);
  await assert.rejects(readDashboardBody(make('{}', { 'content-length': `${MAX_DASHBOARD_BODY_BYTES + 1}` })), error => error.status === 413);
  // No Content-Length: the actual bytes, not the caller's header, define the limit.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_DASHBOARD_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await assert.rejects(readDashboardBody(new Request('https://example.com', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2' },
    body: stream, duplex: 'half',
  })), error => error.status === 413);
});

test('HTTP handler rejects untrusted bodies before any analytics call and always sends no-store', async () => {
  let calls = 0;
  const generate = async () => { calls++; throw new Error('provider-secret'); };
  const make = (body, headers = {}) => new Request('https://example.com/api/dashboard', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
  });
  for (const [body, headers, status] of [
    ['{', {}, 400],
    [null, {}, 400],
    ['{}', {}, 400],
    [JSON.stringify(valid()), { origin: 'https://attacker.example' }, 403],
    ['{}', { 'content-length': `${MAX_DASHBOARD_BODY_BYTES + 1}` }, 413],
  ]) {
    const response = await respondToDashboard(make(body, headers), generate);
    assert.equal(response.status, status);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal(calls, 0);
  const unexpected = await respondToDashboard(make(JSON.stringify(valid())), generate);
  assert.equal(unexpected.status, 500);
  assert.ok(!(await unexpected.text()).includes('provider-secret'));
});

test('HTTP handler returns structured non-2xx for all-project failure and 200 for partial success', async () => {
  const make = () => new Request('https://example.com/api/dashboard', {
    method: 'POST', body: JSON.stringify(valid()), headers: { 'content-type': 'application/json' },
  });
  const failure = { reports: [], errors: [{ project: valid().projects[0], message: 'Check access.' }], generatedAt: now.toISOString() };
  const failed = await respondToDashboard(make(), async () => failure);
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), failure);
  const partial = await respondToDashboard(make(), async () => ({ ...failure, reports: [{ project: valid().projects[0] }] }));
  assert.equal(partial.status, 200);
  assert.match(partial.headers.get('cache-control'), /no-store/);
});
