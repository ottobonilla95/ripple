import express from 'express';
import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const COOKIE = '__Host-ripple-session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function loadAuthConfig(path = process.env.AUTH_CONFIG_FILE) {
  if (!path) return null;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof config.username !== 'string' || !config.username || config.username.length > 100
    || !/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{64}$/.test(config.passwordHash)
    || !/^[a-f0-9]{64}$/.test(config.sessionSecret)) throw new Error('Invalid authentication configuration.');
  return config;
}

function loginPage(error = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0a0a0a"><title>Sign in · Ripple</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0a0a0a;color:#ededed;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(100% - 40px,340px);margin:15vh auto}h1{font-size:16px;font-weight:500;margin:0 0 32px}label{display:block;font-size:13px;color:#aaa;margin:18px 0 8px}input,button{font:inherit;width:100%;border:1px solid #292929;border-radius:6px;padding:12px;background:#111;color:#ededed}button{margin-top:24px;background:#e5e5e5;color:#111;font-size:14px;cursor:pointer}input:focus-visible,button:focus-visible{outline:2px solid #aaa;outline-offset:3px}p{font-size:13px;line-height:1.5;color:#e0a3a3}</style></head><body><main><h1>ripple</h1>
${error ? `<p role="alert">${error}</p>` : ''}<form method="post" action="/login"><label for="username">Username</label><input id="username" name="username" autocomplete="username" required maxlength="100" autocapitalize="none" spellcheck="false"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Sign in</button></form></main></body></html>`;
}

export function installAuth(app, config) {
  const failures = new Map();
  app.set('trust proxy', 'loopback');
  const signature = value => createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  function authenticated(req) {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
    if (!cookie) return false;
    const [payload, supplied, extra] = cookie.slice(COOKIE.length + 1).split('.');
    if (!payload || !/^[A-Za-z0-9_-]{43}$/.test(supplied || '') || extra || payload.length > 1000) return false;
    const expected = signature(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return false;
    try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return session.username === config.username && session.expires > Date.now(); }
    catch { return false; }
  }
  function sameOrigin(req) {
    try { return !req.get('origin') || new URL(req.get('origin')).host === req.get('host'); }
    catch { return false; }
  }
  function page(res, error = '', status = 200) {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    return res.status(status).type('html').send(loginPage(error));
  }
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
  app.get('/login', (req, res) => authenticated(req) ? res.redirect(303, '/') : page(res, req.query.error ? 'Username or password is incorrect.' : ''));
  app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin requests are not allowed.');
    res.set('Cache-Control', 'no-store');
    const now = Date.now();
    for (const [key, entry] of failures) if (entry.expires <= now) failures.delete(key);
    const key = req.ip;
    const entry = failures.get(key) || { count: 0, expires: now + 10 * 60 * 1000 };
    if (entry.count >= 8) { res.set('Retry-After', String(Math.ceil((entry.expires - now) / 1000))); return page(res, 'Too many attempts. Try again in a few minutes.', 429); }
    // Reserve the attempt before the asynchronous password check to bound concurrent guesses.
    entry.count++;
    if (failures.size >= 1000 && !failures.has(key)) failures.delete(failures.keys().next().value);
    failures.set(key, entry);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const hash = await deriveKey(password.slice(0, 256), config.salt, 32);
    if (req.body?.username !== config.username || !password || password.length > 256 || !timingSafeEqual(hash, Buffer.from(config.passwordHash, 'hex'))) return res.redirect(303, '/login?error=1');
    failures.delete(key);
    const payload = Buffer.from(JSON.stringify({ username: config.username, expires: now + SESSION_SECONDS * 1000 })).toString('base64url');
    res.cookie(COOKIE, `${payload}.${signature(payload)}`, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
    res.redirect(303, '/');
  });
  app.post('/logout', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin requests are not allowed.');
    res.set('Cache-Control', 'no-store');
    res.clearCookie(COOKIE, cookieOptions);
    res.redirect(303, '/login');
  });
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (authenticated(req)) return next();
    if (req.path === '/api' || req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in again.', login: '/login' });
    return res.redirect(303, '/login');
  });
}
