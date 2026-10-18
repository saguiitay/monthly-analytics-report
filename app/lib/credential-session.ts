import type { ServiceAccountCredentials } from './dashboard-types';

export const CREDENTIAL_SESSION_KEY = 'monthly.credentials.session.v1';

export interface CredentialSession {
  credentials: ServiceAccountCredentials;
  jsonKey: string;
  mode: 'json' | 'manual';
}

export function normalizePrivateKey(value: string): string {
  return value.replace(/\\r\\n|\\n|\r\n/g, '\n').trim();
}

export function credentialError(credentials: ServiceAccountCredentials): string | null {
  if (!credentials.client_email.trim()) return 'Enter the service-account email as well as the private key. A private key alone cannot identify your Google account.';
  if (credentials.client_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.client_email.trim())) {
    return 'Enter the service-account email (client_email) from your Google JSON key.';
  }
  const key = normalizePrivateKey(credentials.private_key);
  if (credentials.private_key.length > 16384 || !key.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !key.endsWith('-----END PRIVATE KEY-----')) {
    return 'Enter the complete PEM private_key from the service-account JSON, including BEGIN PRIVATE KEY and END PRIVATE KEY. Literal \\n line breaks are supported.';
  }
  return null;
}

export function validCredentials(credentials: ServiceAccountCredentials): boolean {
  return credentialError(credentials) === null;
}

export function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  if (raw.length > 131072) throw new Error('Use a service-account JSON key smaller than 128 KB.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('Paste the complete service-account JSON key, including client_email and private_key, or use Enter manually for a PEM private key.'); }
  if (!parsed || typeof parsed !== 'object' || ('type' in parsed && parsed.type !== 'service_account') ||
    !('client_email' in parsed) || typeof parsed.client_email !== 'string' ||
    !('private_key' in parsed) || typeof parsed.private_key !== 'string') {
    throw new Error('Use a service-account JSON key containing client_email and private_key. A Measurement Protocol API secret cannot read reports.');
  }
  const credentials = { client_email: parsed.client_email.trim(), private_key: normalizePrivateKey(parsed.private_key) };
  const error = credentialError(credentials);
  if (error) throw new Error(error);
  return credentials;
}

export function resolveSessionCredentials(session: CredentialSession): ServiceAccountCredentials {
  if (session.mode === 'json' && session.jsonKey.trim()) return parseServiceAccountJson(session.jsonKey);
  const error = credentialError(session.credentials);
  if (error) throw new Error(error);
  return {
    client_email: session.credentials.client_email.trim(),
    private_key: normalizePrivateKey(session.credentials.private_key),
  };
}

function credentialDraft(input: unknown): ServiceAccountCredentials {
  if (!input || typeof input !== 'object' || !('client_email' in input) || typeof input.client_email !== 'string' ||
    input.client_email.length > 254 || !('private_key' in input) || typeof input.private_key !== 'string' ||
    input.private_key.length > 16384) throw new Error('Invalid saved credential draft');
  return { client_email: input.client_email, private_key: input.private_key };
}

export function readCredentialSession(storage: Pick<Storage, 'getItem'>): CredentialSession | null {
  const raw = storage.getItem(CREDENTIAL_SESSION_KEY);
  if (raw === null) return null;
  if (raw.length > 1024 * 1024) throw new Error('Invalid saved credentials');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || !('credentials' in parsed)) {
    throw new Error('Invalid saved credentials');
  }
  const credentials = credentialDraft(parsed.credentials);
  // Older sessions stored a loaded key without its entry mode. Show it in the
  // manual fields instead of restoring an apparently empty JSON connection.
  if (parsed.version === 1) return { credentials, jsonKey: '', mode: 'manual' };
  if (parsed.version !== 2 || !('mode' in parsed) || (parsed.mode !== 'json' && parsed.mode !== 'manual') ||
    !('jsonKey' in parsed) || typeof parsed.jsonKey !== 'string' || parsed.jsonKey.length > 131072) {
    throw new Error('Invalid saved credentials');
  }
  return { credentials, jsonKey: parsed.jsonKey, mode: parsed.mode };
}

export function saveCredentialSession(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  session: CredentialSession,
): void {
  const credentials = credentialDraft(session.credentials);
  if (session.jsonKey.length > 131072 || (session.mode !== 'json' && session.mode !== 'manual')) throw new Error('Invalid credential draft');
  if (!credentials.client_email && !credentials.private_key && !session.jsonKey) {
    storage.removeItem(CREDENTIAL_SESSION_KEY);
    return;
  }
  storage.setItem(CREDENTIAL_SESSION_KEY, JSON.stringify({
    version: 2,
    credentials,
    jsonKey: session.jsonKey,
    mode: session.mode,
  }));
}
