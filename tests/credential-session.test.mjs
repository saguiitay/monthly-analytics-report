import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDENTIAL_SESSION_KEY, readSessionCredentials, saveSessionCredentials, validCredentials,
} from '../app/lib/credential-session.ts';

const credentials = {
  client_email: 'viewer@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER_NOT_A_REAL_KEY\n-----END PRIVATE KEY-----',
};

function session() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('loaded credentials survive refresh-style reads in the same tab session', () => {
  const storage = session();
  assert.equal(readSessionCredentials(storage), null);
  saveSessionCredentials(storage, credentials);
  assert.deepEqual(readSessionCredentials(storage), credentials);
  assert.deepEqual(readSessionCredentials(storage), credentials);
  assert.equal(readSessionCredentials(session()), null);
});

test('session persistence stores only credential fields, never visibility or full uploaded JSON', () => {
  const storage = session();
  saveSessionCredentials(storage, { ...credentials, showPrivateKey: true, token_uri: 'https://attacker.example', private_key_id: 'not-needed' });
  const saved = JSON.parse(storage.getItem(CREDENTIAL_SESSION_KEY));
  assert.deepEqual(saved, { version: 1, credentials });
});

test('clearing or replacing credentials with incomplete input removes the prior saved key', () => {
  const storage = session();
  for (const next of [
    { client_email: '', private_key: '' },
    { ...credentials, private_key: 'partial private key' },
    { ...credentials, client_email: 'incomplete' },
  ]) {
    saveSessionCredentials(storage, credentials);
    saveSessionCredentials(storage, next);
    assert.equal(readSessionCredentials(storage), null);
  }
});

test('corrupt, unsupported and oversized saved credentials are rejected explicitly', () => {
  const storage = session();
  for (const raw of [
    '{', 'null', '{}', 'x'.repeat(20001),
    JSON.stringify({ version: 2, credentials }),
    JSON.stringify({ version: 1, credentials: { client_email: credentials.client_email, private_key: 'bad' } }),
    JSON.stringify({ version: 1, credentials: { ...credentials, private_key: 'x'.repeat(16385) } }),
  ]) {
    storage.setItem(CREDENTIAL_SESSION_KEY, raw);
    assert.throws(() => readSessionCredentials(storage));
  }
  assert.equal(validCredentials(credentials), true);
});

test('browser storage denial and quota errors are not silently ignored', () => {
  const blocked = {
    getItem() { throw new Error('Denied'); },
    setItem() { throw new Error('Full'); },
    removeItem() { throw new Error('Denied'); },
  };
  assert.throws(() => readSessionCredentials(blocked), /Denied/);
  assert.throws(() => saveSessionCredentials(blocked, credentials), /Full/);
  assert.throws(() => saveSessionCredentials(blocked, { client_email: '', private_key: '' }), /Denied/);
});
