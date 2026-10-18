import type { PropertyDiscoveryRequest, PropertyDiscoveryResponse } from '../dashboard-types';

export type PropertyPageLoader = (input: PropertyDiscoveryRequest) => Promise<unknown>;

async function loadPropertyPage(input: PropertyDiscoveryRequest): Promise<unknown> {
  const { analyticsadmin, auth } = await import('googleapis/build/src/apis/analyticsadmin/index.js');
  const client = new auth.JWT({
    email: input.credentials.client_email,
    key: input.credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    transporterOptions: { timeout: 10_000, retry: false },
  });
  const api = analyticsadmin({ version: 'v1beta', auth: client });
  const response = await api.accountSummaries.list(
    { pageSize: 50, pageToken: input.pageToken },
    { timeout: 15_000, retry: false, maxContentLength: 2 * 1024 * 1024 },
  );
  return response.data;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid property response');
  return value as Record<string, unknown>;
}

export function normalizePropertyPage(input: unknown): PropertyDiscoveryResponse {
  const page = record(input);
  if (page.accountSummaries !== undefined && !Array.isArray(page.accountSummaries)) throw new Error('Invalid account summaries');
  if (page.nextPageToken !== undefined && (typeof page.nextPageToken !== 'string' || page.nextPageToken.length > 4096 ||
    /[\u0000-\u001f\u007f]/u.test(page.nextPageToken))) throw new Error('Invalid page token');
  const properties = new Map<string, PropertyDiscoveryResponse['properties'][number]>();
  for (const entry of page.accountSummaries ?? []) {
    const account = record(entry);
    if (account.propertySummaries !== undefined && !Array.isArray(account.propertySummaries)) throw new Error('Invalid property summaries');
    const accountName = typeof account.displayName === 'string' ? account.displayName.slice(0, 100) : 'Google Analytics account';
    for (const summary of account.propertySummaries ?? []) {
      const property = record(summary);
      if (typeof property.property !== 'string' || !/^properties\/[1-9]\d{0,19}$/.test(property.property)) {
        throw new Error('Invalid property identifier');
      }
      const propertyId = property.property.slice('properties/'.length);
      const name = typeof property.displayName === 'string' ? property.displayName.trim().slice(0, 100) : '';
      properties.set(propertyId, { propertyId, name: name || `GA4 property ${propertyId}`, accountName });
    }
  }
  return { properties: [...properties.values()], nextPageToken: page.nextPageToken || null };
}

export function safePropertyDiscoveryError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as {
    code?: unknown; message?: unknown; response?: { status?: number };
  } : {};
  const code = value.response?.status ?? value.code;
  const description = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  if (/service_disabled|accessnotconfigured|has not been used|api.*disabled|enable.*admin.*api/.test(description)) {
    return 'Enable the Google Analytics Admin API in your service account’s Google Cloud project, then find properties again. Reporting uses the separate Analytics Data API.';
  }
  if (code === 401 || code === 16 || /invalid_grant|invalid.*jwt|invalid.*credential|invalid.*signature/.test(description)) {
    return 'Google rejected this key. Load a current service-account JSON key with its matching email and private key.';
  }
  if (code === 403 || code === 7) {
    return 'Access denied. Enable the Google Analytics Admin API and give this service account Viewer access to your GA4 properties.';
  }
  if (code === 429 || code === 8) return 'Google’s request quota was reached. Wait a few minutes, then try finding properties again.';
  if (code === 504 || code === 'ETIMEDOUT' || code === 'ECONNABORTED' || /timeout|timed out/.test(description)) {
    return 'Google did not respond in time. Try finding properties again.';
  }
  return 'Could not find GA4 properties. Check your connection, service-account key, property access and that the Google Analytics Admin API is enabled.';
}

export async function discoverProperties(
  input: PropertyDiscoveryRequest,
  load: PropertyPageLoader = loadPropertyPage,
): Promise<PropertyDiscoveryResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const page = await Promise.race([
      load(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject({ code: 504 }), 20_000);
      }),
    ]);
    return normalizePropertyPage(page);
  } finally {
    clearTimeout(timer);
  }
}
