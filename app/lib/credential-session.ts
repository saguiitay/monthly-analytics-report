import type { ServiceAccountCredentials } from './dashboard-types';

export const CREDENTIAL_SESSION_KEY = 'monthly.credentials.session.v1';

export function validCredentials(credentials: ServiceAccountCredentials): boolean {
  return credentials.client_email.length <= 254 && credentials.private_key.length <= 16384 &&
    /^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(credentials.client_email.trim()) &&
    credentials.private_key.trim().startsWith('-----BEGIN PRIVATE KEY-----') &&
    credentials.private_key.trim().endsWith('-----END PRIVATE KEY-----');
}

export function readSessionCredentials(storage: Pick<Storage, 'getItem'>): ServiceAccountCredentials | null {
  const raw = storage.getItem(CREDENTIAL_SESSION_KEY);
  if (raw === null) return null;
  if (raw.length > 20000) throw new Error('Invalid saved credentials');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 ||
    !('credentials' in parsed) || !parsed.credentials || typeof parsed.credentials !== 'object') {
    throw new Error('Invalid saved credentials');
  }
  const credentials = parsed.credentials;
  if (!('client_email' in credentials) || typeof credentials.client_email !== 'string' ||
    !('private_key' in credentials) || typeof credentials.private_key !== 'string' ||
    !validCredentials({ client_email: credentials.client_email, private_key: credentials.private_key })) {
    throw new Error('Invalid saved credentials');
  }
  return { client_email: credentials.client_email, private_key: credentials.private_key };
}

export function saveSessionCredentials(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  credentials: ServiceAccountCredentials,
): void {
  if (!validCredentials(credentials)) {
    storage.removeItem(CREDENTIAL_SESSION_KEY);
    return;
  }
  storage.setItem(CREDENTIAL_SESSION_KEY, JSON.stringify({
    version: 1,
    credentials: { client_email: credentials.client_email.trim(), private_key: credentials.private_key.trim() },
  }));
}
