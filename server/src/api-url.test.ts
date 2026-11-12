import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { resolveApiUrl } from '../../client/src/api/apiUrl.js';

const site = { protocol: 'https:', hostname: 'crosswindscommunityday.com', origin: 'https://crosswindscommunityday.com' };
const local = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8081' };

describe('api address', () => {
  test('the public site does not call the computer that built it', () => {
    assert.equal(resolveApiUrl('http://localhost:8787', site), 'https://crosswindscommunityday.com');
    assert.equal(resolveApiUrl(undefined, site), 'https://crosswindscommunityday.com');
    assert.equal(resolveApiUrl('http://crosswindscommunityday.com', site), 'https://crosswindscommunityday.com');
  });

  test('local web development keeps the API port', () => {
    assert.equal(resolveApiUrl('http://localhost:8787', local), 'http://localhost:8787');
    assert.equal(resolveApiUrl('http://127.0.0.1:9090', local), 'http://127.0.0.1:9090');
    assert.equal(resolveApiUrl('https://crosswindscommunityday.com', local), 'http://localhost:8787');
  });

  test('a separate https API address is kept', () => {
    assert.equal(resolveApiUrl('https://api.example.com', site), 'https://api.example.com');
  });
});
