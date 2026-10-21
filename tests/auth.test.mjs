import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac, scryptSync } from 'node:crypto';
import { installAuth } from '../server/auth.mjs';

test('form login protects pages and API, validates sessions, and clears the cookie on sign-out', async () => {
  const config = { username: 'otto', salt: '01'.repeat(16), sessionSecret: '02'.repeat(32) };
  config.passwordHash = scryptSync('test-password', config.salt, 32).toString('hex');
  const app = express();
  installAuth(app, config);
  app.get('/', (req, res) => res.send('Private app'));
  app.get('/api/insights', (req, res) => res.json([{ content: 'Private insight' }]));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (username, password, origin = base) => fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { Origin: origin }, body: new URLSearchParams({ username, password }) });
  try {
    let response = await fetch(base, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    response = await fetch(`${base}/api/insights`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), null, 'no browser HTTP-auth prompt');
    response = await fetch(`${base}/login`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /autocomplete="current-password"/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    response = await login('otto', 'incorrect');
    assert.equal(response.headers.get('location'), '/login?error=1');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await login('otto', 'test-password', 'https://unrelated.example')).status, 403);
    response = await login('otto', 'test-password');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    const cookieHeader = response.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(cookieHeader.includes(flag), flag);
    const cookie = cookieHeader.split(';')[0];
    response = await fetch(`${base}/api/insights`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json())[0].content, 'Private insight');
    for (const bad of [`${cookie}x`, '__Host-ripple-session=bad.bad', `__Host-ripple-session=bad.${'é'.repeat(43)}`]) {
      assert.equal((await fetch(`${base}/api/insights`, { headers: { Cookie: bad } })).status, 401);
    }
    const payload = Buffer.from(JSON.stringify({ username: 'otto', expires: Date.now() - 1000 })).toString('base64url');
    const signature = createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
    assert.equal((await fetch(`${base}/api/insights`, { headers: { Cookie: `__Host-ripple-session=${payload}.${signature}` } })).status, 401);
    response = await fetch(`${base}/logout`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: 'https://unrelated.example' } });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/logout`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    for (let n = 0; n < 8; n++) await login('otto', 'incorrect');
    response = await login('otto', 'incorrect');
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
