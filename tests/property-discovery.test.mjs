import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { validatePropertyDiscoveryRequest, validatePropertyWebsiteRequest } from '../app/lib/dashboard-validation.ts';
import { discoverProperties, discoverPropertyWebsite, normalizeDataStreamPage, normalizePropertyPage, safePropertyDiscoveryError } from '../app/lib/services/property-discovery.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const credentials = {
  client_email: 'analytics@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const providerPage = {
  accountSummaries: [
    { displayName: 'My account', propertySummaries: [
      { property: 'properties/12345', displayName: 'First website' },
      { property: 'properties/67890', displayName: 'Second website' },
    ] },
  ],
  nextPageToken: 'opaque-next-page',
};

test('discovery validates explicit credentials independently of projects and reporting dates', () => {
  assert.deepEqual(validatePropertyDiscoveryRequest({ credentials }), { credentials: {
    ...credentials, private_key: credentials.private_key.trim(),
  } });
  assert.equal(validatePropertyDiscoveryRequest({ credentials, pageToken: 'next-page' }).pageToken, 'next-page');
  for (const input of [
    null, {}, { credentials: {} }, { credentials, projects: [] },
    { credentials: { ...credentials, token_uri: 'https://attacker.example' } },
    { credentials: { ...credentials, private_key: 'measurement-api-secret' } },
    ...['', 'x'.repeat(4097), 'bad\ncursor', 123, null].map(pageToken => ({ credentials, pageToken })),
  ]) {
    assert.throws(() => validatePropertyDiscoveryRequest(input));
  }
});

test('discovery normalizes account and property names, IDs, and the next page token', () => {
  assert.deepEqual(normalizePropertyPage(providerPage), {
    properties: [
      { propertyId: '12345', name: 'First website', accountName: 'My account' },
      { propertyId: '67890', name: 'Second website', accountName: 'My account' },
    ],
    nextPageToken: 'opaque-next-page',
  });
  assert.deepEqual(normalizePropertyPage({}), { properties: [], nextPageToken: null });
  assert.deepEqual(normalizePropertyPage({ accountSummaries: [] }), { properties: [], nextPageToken: null });
});

test('discovery deduplicates properties and provides editable bounded fallback names', () => {
  const page = normalizePropertyPage({ accountSummaries: [
    { propertySummaries: [{ property: 'properties/12345' }] },
    { propertySummaries: [{ property: 'properties/12345' }, { property: 'properties/67890', displayName: 'N'.repeat(150) }] },
  ] });
  assert.equal(page.properties.length, 2);
  assert.equal(page.properties[0].name, 'GA4 property 12345');
  assert.equal(page.properties[0].accountName, 'Google Analytics account');
  assert.equal(page.properties[1].name.length, 100);
});

test('malformed provider responses fail rather than appearing as an empty property list', () => {
  for (const input of [
    null, [], { accountSummaries: {} }, { accountSummaries: [null] },
    { accountSummaries: [{ propertySummaries: {} }] },
    { accountSummaries: [{ propertySummaries: [null] }] },
    { accountSummaries: [{ propertySummaries: [{ property: 'properties/G-ABC' }] }] },
    { accountSummaries: [{ propertySummaries: [{ property: 'properties/0' }] }] },
    { nextPageToken: 123 }, { nextPageToken: 'x'.repeat(4097) },
  ]) {
    assert.throws(() => normalizePropertyPage(input));
  }
});

test('discovery requests one explicit page with isolated credentials and never exports credentials', async () => {
  const inputs = [];
  const load = async input => {
    inputs.push(input);
    return providerPage;
  };
  const first = { credentials };
  const second = { credentials: { ...credentials, client_email: 'other@example.iam.gserviceaccount.com' }, pageToken: 'page-two' };
  const output = await Promise.all([discoverProperties(first, load), discoverProperties(second, load)]);
  assert.deepEqual(inputs, [first, second]);
  assert.equal(inputs[0].credentials.client_email, credentials.client_email);
  assert.equal(inputs[1].pageToken, 'page-two');
  assert.equal(JSON.stringify(output).includes('BEGIN PRIVATE KEY'), false);
  assert.equal(JSON.stringify(output).includes(credentials.client_email), false);
});

test('discovery preserves provider failure for safe HTTP classification instead of fabricating success', async () => {
  const error = { response: { status: 403 }, message: 'PRIVATE_PROVIDER_DETAIL' };
  await assert.rejects(discoverProperties({ credentials }, async () => { throw error; }), value => value === error);
  assert.match(safePropertyDiscoveryError(error), /Viewer/);
  assert.match(safePropertyDiscoveryError({ code: 403, message: 'Google Analytics Admin API has not been used' }), /Enable the Google Analytics Admin API/);
  assert.match(safePropertyDiscoveryError({ code: 401 }), /current service-account JSON key/);
  assert.match(safePropertyDiscoveryError({ code: 429 }), /quota/);
  assert.match(safePropertyDiscoveryError({ code: 504 }), /in time/);
  for (const error of [new Error('PRIVATE_PROVIDER_DETAIL'), { code: 401, message: 'PRIVATE_PROVIDER_DETAIL' }, null]) {
    assert.doesNotMatch(safePropertyDiscoveryError(error), /PRIVATE_PROVIDER_DETAIL/);
  }
});

test('website lookup validates credentials and a numeric property ID without allowing API path injection', () => {
  assert.deepEqual(validatePropertyWebsiteRequest({ credentials, propertyId: '12345' }), {
    credentials: { ...credentials, private_key: credentials.private_key.trim() }, propertyId: '12345',
  });
  for (const input of [
    null, {}, { propertyId: '12345' }, { credentials, propertyId: '12345', url: 'https://example.com' },
    ...['0', '', 'G-12345', 'properties/12345', '../12345', '1'.repeat(21), 12345, null].map(propertyId => ({ credentials, propertyId })),
  ]) assert.throws(() => validatePropertyWebsiteRequest(input));
});

const webStream = defaultUri => ({ type: 'WEB_DATA_STREAM', webStreamData: { defaultUri } });

test('website lookup uses real web stream URLs, deduplicates them and does not guess URLs for app streams', () => {
  assert.deepEqual(normalizeDataStreamPage({ dataStreams: [
    { type: 'ANDROID_APP_DATA_STREAM', androidAppStreamData: { packageName: 'com.example.app' } },
    { type: 'IOS_APP_DATA_STREAM', webStreamData: { defaultUri: 'https://not-a-web-stream.example' } },
    webStream(' https://example.com/blog '), webStream('https://example.com/blog'),
    webStream('http://second.example'), webStream(null), webStream(''),
  ], nextPageToken: 'second-page' }), {
    urls: ['https://example.com/blog', 'http://second.example'], nextPageToken: 'second-page',
  });
  assert.deepEqual(normalizeDataStreamPage({}), { urls: [], nextPageToken: null });
});

test('website lookup rejects malformed pages and unsafe URLs instead of returning misleading empty results', () => {
  for (const input of [
    null, [], { dataStreams: {} }, { dataStreams: [null] }, { nextPageToken: 12 },
    ...['javascript:alert(1)', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com\\path',
      'https://example.com/white space', 'https://example.com/' + 'x'.repeat(2048), 123].map(defaultUri => ({ dataStreams: [webStream(defaultUri)] })),
  ]) assert.throws(() => normalizeDataStreamPage(input));
});

test('website lookup follows pagination with isolated credentials and handles app-only properties', async () => {
  const calls = [];
  const result = await discoverPropertyWebsite({ credentials, propertyId: '12345' }, async (input, signal) => {
    calls.push(input);
    assert.equal(signal.aborted, false);
    return input.pageToken
      ? { dataStreams: [webStream('https://example.com'), webStream('https://other.example')] }
      : { dataStreams: [webStream('https://example.com')], nextPageToken: 'second-page' };
  });
  assert.deepEqual(result, { urls: ['https://example.com', 'https://other.example'] });
  assert.deepEqual(calls, [
    { credentials, propertyId: '12345' },
    { credentials, propertyId: '12345', pageToken: 'second-page' },
  ]);
  assert.deepEqual(await discoverPropertyWebsite({ credentials, propertyId: '12345' }, async () => ({
    dataStreams: [{ type: 'ANDROID_APP_DATA_STREAM' }],
  })), { urls: [] });
  assert.equal(JSON.stringify(result).includes('PRIVATE KEY'), false);
  assert.equal(JSON.stringify(result).includes(credentials.client_email), false);
});

test('website lookup preserves provider failures and rejects cyclic or unbounded pagination', async () => {
  const error = { response: { status: 403 }, message: 'PRIVATE_PROVIDER_DETAIL' };
  await assert.rejects(discoverPropertyWebsite({ credentials, propertyId: '12345' }, async () => { throw error; }), value => value === error);
  await assert.rejects(discoverPropertyWebsite({ credentials, propertyId: '12345' }, async () => ({ nextPageToken: 'repeat' })), /pagination/);
  let calls = 0;
  await assert.rejects(discoverPropertyWebsite({ credentials, propertyId: '12345' }, async () => ({ nextPageToken: `next-${++calls}` })), /pagination/);
  assert.equal(calls, 11);
});
