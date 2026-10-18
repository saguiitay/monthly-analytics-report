import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDENTIAL_SESSION_KEY, credentialError, normalizePrivateKey, parseServiceAccountJson,
  readCredentialSession, resolveSessionCredentials, saveCredentialSession, validCredentials,
} from '../app/lib/credential-session.ts';

const credentials = {
  client_email: 'viewer@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER_NOT_A_REAL_KEY\n-----END PRIVATE KEY-----',
};
const empty = { client_email: '', private_key: '' };
const manual = value => ({ credentials: value, jsonKey: '', mode: 'manual' });

function session() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('credential drafts and the selected entry mode survive same-tab refreshes', () => {
  const storage = session();
  assert.equal(readCredentialSession(storage), null);
  for (const draft of [
    manual(credentials), manual({ ...empty, private_key: credentials.private_key }),
    manual({ ...empty, client_email: 'unfinished-email' }),
    { credentials: empty, jsonKey: '{"client_email": "unfinished', mode: 'json' },
    { credentials: empty, jsonKey: JSON.stringify({ type: 'service_account', ...credentials }), mode: 'json' },
  ]) {
    saveCredentialSession(storage, draft);
    assert.deepEqual(readCredentialSession(storage), draft);
  }
  assert.equal(readCredentialSession(session()), null);
});

test('session persistence allowlists state and does not persist visibility or unknown fields', () => {
  const storage = session();
  saveCredentialSession(storage, {
    ...manual({ ...credentials, token_uri: 'https://attacker.example' }),
    showPrivateKey: true, token: 'not-needed',
  });
  const saved = JSON.parse(storage.getItem(CREDENTIAL_SESSION_KEY));
  assert.deepEqual(saved, { version: 2, ...manual(credentials) });
});

test('clearing all entry fields removes the session, while incomplete replacements are retained', () => {
  const storage = session();
  saveCredentialSession(storage, manual(credentials));
  saveCredentialSession(storage, manual({ ...empty, private_key: 'partial private key' }));
  assert.equal(readCredentialSession(storage).credentials.private_key, 'partial private key');
  saveCredentialSession(storage, manual(empty));
  assert.equal(readCredentialSession(storage), null);
});

test('previously saved version-one keys migrate to visible manual fields without losing the key', () => {
  const storage = session();
  storage.setItem(CREDENTIAL_SESSION_KEY, JSON.stringify({ version: 1, credentials }));
  assert.deepEqual(readCredentialSession(storage), manual(credentials));
});

test('corrupt, unsupported and oversized session shapes are rejected, not confused with incomplete input', () => {
  const storage = session();
  for (const raw of [
    '{', 'null', '{}', 'x'.repeat(1024 * 1024 + 1),
    JSON.stringify({ version: 3, credentials }),
    JSON.stringify({ version: 2, ...manual(credentials), mode: 'unexpected' }),
    JSON.stringify({ version: 2, ...manual(credentials), jsonKey: 'x'.repeat(131073) }),
    JSON.stringify({ version: 1, credentials: { ...credentials, private_key: 42 } }),
    JSON.stringify({ version: 1, credentials: { ...credentials, private_key: 'x'.repeat(16385) } }),
  ]) {
    storage.setItem(CREDENTIAL_SESSION_KEY, raw);
    assert.throws(() => readCredentialSession(storage));
  }
});

test('literal backslash-n, escaped CRLF and real CRLF keys normalize without changing stored input', () => {
  for (const key of [
    credentials.private_key.replace(/\n/g, '\\n'),
    `${credentials.private_key.replace(/\n/g, '\\n')}\\n`,
    credentials.private_key.replace(/\n/g, '\\r\\n'),
    `${credentials.private_key.replace(/\n/g, '\\r\\n')}\\r\\n`,
    credentials.private_key.replace(/\n/g, '\r\n'),
  ]) {
    const storage = session();
    const draft = manual({ ...credentials, private_key: key });
    saveCredentialSession(storage, draft);
    assert.equal(readCredentialSession(storage).credentials.private_key, key);
    assert.equal(normalizePrivateKey(key), credentials.private_key);
    assert.deepEqual(resolveSessionCredentials(draft), credentials);
    assert.equal(validCredentials(draft.credentials), true);
  }
});

test('a complete JSON draft resolves immediately without an explicit load step and strips credential endpoints', () => {
  const jsonKey = JSON.stringify({
    type: 'service_account', ...credentials, token_uri: 'https://attacker.example/token',
    credential_source: { url: 'https://attacker.example' },
  });
  assert.deepEqual(parseServiceAccountJson(jsonKey), credentials);
  assert.deepEqual(resolveSessionCredentials({ credentials: empty, jsonKey, mode: 'json' }), credentials);
  assert.deepEqual(resolveSessionCredentials(manual(credentials)), credentials);
});

test('missing email, incomplete JSON, wrong key types and a PEM pasted in the JSON field produce actionable errors', () => {
  assert.match(credentialError({ ...empty, private_key: credentials.private_key }), /service-account email/);
  assert.throws(() => resolveSessionCredentials(manual({ ...empty, private_key: credentials.private_key })), /private key alone/);
  assert.throws(() => parseServiceAccountJson('{"unfinished"'), /complete service-account JSON/);
  assert.throws(() => parseServiceAccountJson(credentials.private_key), /Enter manually/);
  assert.throws(() => parseServiceAccountJson(JSON.stringify({ type: 'authorized_user', ...credentials })), /service-account JSON/);
  assert.throws(() => parseServiceAccountJson(JSON.stringify({ ...credentials, private_key: 'measurement-secret' })), /complete PEM/);
  assert.throws(() => parseServiceAccountJson('x'.repeat(131073)), /128 KB/);
});

test('browser storage denial and quota errors are not silently ignored', () => {
  const blocked = {
    getItem() { throw new Error('Denied'); },
    setItem() { throw new Error('Full'); },
    removeItem() { throw new Error('Denied'); },
  };
  assert.throws(() => readCredentialSession(blocked), /Denied/);
  assert.throws(() => saveCredentialSession(blocked, manual(credentials)), /Full/);
  assert.throws(() => saveCredentialSession(blocked, manual(empty)), /Denied/);
});
