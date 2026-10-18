import { createPrivateKey } from 'node:crypto';
import type { DashboardRequest, DashboardResponse, WorkspaceProject } from './dashboard-types';

export const MAX_DASHBOARD_BODY_BYTES = 256 * 1024;

export class DashboardInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DashboardInputError';
    this.status = status;
  }
}

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DashboardInputError(`${label} must be an object.`);
  }
  if (Object.keys(value).some(key => !keys.includes(key))) {
    throw new DashboardInputError(`${label} contains unsupported fields.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new DashboardInputError(`${label} must be nonempty text of at most ${max} characters.`);
  }
  const result = value.trim();
  if (/[\u0000-\u001f\u007f]/u.test(result)) {
    throw new DashboardInputError(`${label} contains unsupported characters.`);
  }
  return result;
}

export function validateDashboardRequest(input: unknown, now = new Date()): DashboardRequest {
  const data = object(input, ['projects', 'credentials', 'endDate', 'days'], 'Request');
  if (!Array.isArray(data.projects) || data.projects.length < 1 || data.projects.length > 12) {
    throw new DashboardInputError('Add between 1 and 12 projects.');
  }
  const ids = new Set<string>();
  const projects: WorkspaceProject[] = data.projects.map(value => {
    const project = object(value, ['id', 'name', 'url', 'propertyId'], 'Project');
    const id = text(project.id, 80, 'Project ID');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) {
      throw new DashboardInputError('Project IDs must be unique and use letters, numbers, underscores or hyphens.');
    }
    ids.add(id);
    const name = text(project.name, 100, 'Project name');
    const url = text(project.url, 2048, 'Project URL');
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname ||
          parsed.username || parsed.password || /^[a-z]+:\/\/[^/]*@/i.test(url) || /[\\\s]/u.test(url)) {
        throw new Error('invalid');
      }
    } catch {
      throw new DashboardInputError('Project URL must be an http(s) URL without embedded credentials.');
    }
    const propertyId = text(project.propertyId, 20, 'GA4 property ID');
    if (!/^[1-9]\d{0,19}$/.test(propertyId)) {
      throw new DashboardInputError('Use the numeric GA4 property ID, not a G- measurement ID.');
    }
    return { id, name, url, propertyId };
  });
  if (data.days !== 7 && data.days !== 30 && data.days !== 90) {
    throw new DashboardInputError('Date range must be 7, 30 or 90 days.');
  }
  const endDate = text(data.endDate, 10, 'End date');
  const parsedDate = new Date(`${endDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== endDate || endDate < '2005-01-01' ||
      endDate > now.toISOString().slice(0, 10)) {
    throw new DashboardInputError('End date must be a valid, nonfuture YYYY-MM-DD date from 2005 onward.');
  }
  const credentials = object(data.credentials, ['client_email', 'private_key'], 'Credentials');
  const client_email = text(credentials.client_email, 254, 'Service account email');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(client_email) ||
      client_email.includes('..') || client_email.includes('.@')) {
    throw new DashboardInputError('Enter a valid service account client_email from the JSON key.');
  }
  if (typeof credentials.private_key !== 'string' || credentials.private_key.length > 16384) {
    throw new DashboardInputError('Enter the PEM private_key from the service account JSON key.');
  }
  const private_key = credentials.private_key.trim().replace(/\r\n/g, '\n');
  if (!/^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----$/.test(private_key)) {
    throw new DashboardInputError('Enter a valid unencrypted PEM private_key from the service account JSON key.');
  }
  try {
    const key = createPrivateKey(private_key);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error('invalid');
    }
  } catch {
    throw new DashboardInputError('The private_key is not a valid RSA service account key (2048 bits or stronger).');
  }
  return { projects, credentials: { client_email, private_key }, endDate, days: data.days };
}

export function enforceDashboardOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  // Next can normalize request.url to localhost. Host is the original HTTP
  // authority; do not substitute caller-supplied forwarding headers.
  const host = request.headers.get('host');
  if (host !== null) {
    try {
      if (!/^[a-zA-Z0-9.[\]:-]+$/.test(host)) throw new Error('Invalid host');
      const authority = new URL(`${requestUrl.protocol}//${host}`);
      if (!authority.hostname) throw new Error('Invalid host');
      requestUrl.host = authority.host;
    } catch {
      throw new DashboardInputError('Dashboard requests must come from this site.', 403);
    }
  }
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== requestUrl.origin) {
    throw new DashboardInputError('Dashboard requests must come from this site.', 403);
  }
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    throw new DashboardInputError('Dashboard requests must come from this site.', 403);
  }
}

export async function readDashboardBody(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_DASHBOARD_BODY_BYTES)) {
    throw new DashboardInputError('Request body is too large or has an invalid content length.', 413);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new DashboardInputError('Send the dashboard request as application/json.', 415);
  }
  if (!request.body) throw new DashboardInputError('A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DashboardInputError('Request body timed out.', 408)), 10_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DASHBOARD_BODY_BYTES) {
        throw new DashboardInputError('Request body exceeds 256 KB.', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new DashboardInputError('Request body must contain valid JSON.');
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof DashboardInputError) throw error;
    throw new DashboardInputError('Could not read the JSON request body.');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function respondToDashboard(
  request: Request,
  generate: (input: DashboardRequest) => Promise<DashboardResponse>,
): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    enforceDashboardOrigin(request);
    const input = validateDashboardRequest(await readDashboardBody(request));
    const result = await generate(input);
    return Response.json(result, { status: result.reports.length ? 200 : 502, headers });
  } catch (error) {
    const expected = error instanceof DashboardInputError;
    return Response.json({
      reports: [],
      errors: [],
      generatedAt: new Date().toISOString(),
      error: expected ? error.message : 'The dashboard could not be generated. Please try again.',
    }, { status: expected ? error.status : 500, headers });
  }
}
