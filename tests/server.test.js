import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('Express dashboard serves HTML and live JSON on Node 22+', async () => {
  const payload = {
    services: [],
    scannedAt: '2026-01-01T00:00:00.000Z',
    noOsv: true,
    scanStatus: { complete: true, error: null },
  };
  const { server, port } = await createServer(payload, 0, '2.0.0');
  try {
    const [htmlResponse, dataResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`),
      fetch(`http://127.0.0.1:${port}/api/data`),
    ]);
    assert.equal(htmlResponse.status, 200);
    assert.match(await htmlResponse.text(), /osv-ui/);
    assert.deepEqual(await dataResponse.json(), payload);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Express dashboard rejects invalid ports', async () => {
  await assert.rejects(
    createServer({ services: [], scannedAt: new Date().toISOString(), noOsv: true }, Number.NaN, '2.0.0'),
    /Invalid port/,
  );
});
