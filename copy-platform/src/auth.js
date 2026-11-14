const enc = new TextEncoder();
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const stateCookie = (value, age) => `we_state=${value}; Path=/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const sessionCookie = (value, age) => `we_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookie = (request, name) => request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) ?? '';
const redirect = (location, setCookie) => new Response(null, { status: 303, headers: { Location: location, 'Set-Cookie': setCookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
const callback = origin => `${origin}/auth/google/callback`;

export async function beginGoogle(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response('Google login is not configured', { status: 503 });
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const hour = Math.floor(Date.now() / 3600000);
  const limited = await env.DB.prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').bind(`google:${await hash(ip)}:${hour}`, (hour + 1) * 3600000).first();
  if (limited.count > 20) return new Response('Too many login attempts', { status: 429 });
  const state = random(), verifier = random(), nonce = random(), expires = Date.now() + 600000;
  await env.DB.prepare('INSERT INTO oauth_states (state_hash, verifier, nonce, expires_at) VALUES (?, ?, ?, ?)').bind(await hash(state), verifier, nonce, expires).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback(new URL(request.url).origin), response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier))), code_challenge_method: 'S256', prompt: 'select_account' });
  return redirect(url.href, stateCookie(state, 600));
}

let keys;
async function verifyIdToken(token, env, nonce) {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8192) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
  } catch { return null; }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  if (!keys || keys.expires < Date.now() || !keys.values.some(x => x.kid === header.kid)) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    keys = { values: (await response.json()).keys, expires: Date.now() + Math.min(3600, Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1] || 3600)) * 1000 };
  }
  const jwk = keys.values.find(x => x.kid === header.kid && x.kty === 'RSA' && (!x.alg || x.alg === 'RS256'));
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  let signature;
  try { signature = unb64(parts[2]); } catch { return null; }
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, enc.encode(parts[0] + '.' + parts[1]))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID || typeof claims.exp !== 'number' || claims.exp < now - 60 || (typeof claims.iat === 'number' && claims.iat > now + 60) || claims.nonce !== nonce || claims.email_verified !== true || typeof claims.sub !== 'string' || typeof claims.email !== 'string' || !claims.sub || !claims.email) return null;
  return { sub: String(claims.sub).slice(0, 255), email: String(claims.email).toLowerCase().slice(0, 254), name: String(claims.name || claims.email).slice(0, 120) };
}

export async function finishGoogle(request, env) {
  const url = new URL(request.url), state = url.searchParams.get('state') || '';
  if (!state || state !== cookie(request, 'we_state')) return new Response('Invalid login state', { status: 400 });
  const row = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? RETURNING verifier, nonce, expires_at').bind(await hash(state)).first();
  if (!row || row.expires_at < Date.now() || !url.searchParams.get('code')) return new Response('Login expired', { status: 400 });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: url.searchParams.get('code'), code_verifier: row.verifier, grant_type: 'authorization_code', redirect_uri: callback(url.origin) }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) return new Response('Google login failed', { status: 400 });
  const { id_token } = await response.json();
  const claims = typeof id_token === 'string' ? await verifyIdToken(id_token, env, row.nonce) : null;
  if (!claims) return new Response('Google identity could not be verified', { status: 400 });
  let user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first();
  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, name) VALUES (?, ?, ?, ?) ON CONFLICT(google_sub) DO NOTHING').bind(id, claims.sub, claims.email, claims.name).run();
    user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first();
  }
  const token = random();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await hash(token), user.id, Date.now() + 7 * 86400000).run();
  const result = redirect('/dashboard', sessionCookie(token, 7 * 86400));
  result.headers.append('Set-Cookie', stateCookie('', 0));
  return result;
}

export async function currentUser(request, env) {
  const token = cookie(request, 'we_session');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').bind(await hash(token), Date.now()).first();
}

export async function logout(request, env) {
  const token = cookie(request, 'we_session');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
  return redirect('/', sessionCookie('', 0));
}
