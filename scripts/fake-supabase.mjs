// Faux Supabase, pour tester la sauvegarde en ligne (src/net/cloud.ts) sans vrai projet :
//   node scripts/fake-supabase.mjs        (écoute sur 127.0.0.1:54321)
// puis la configuration « dev-cloud » de .claude/launch.json, ou :
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-anon npx vite
//
// Il imite les appels du jeu (code par e-mail, vérification, renouvellement du jeton,
// déconnexion ; lecture, création et écriture conditionnelle de la ligne ; delete_account ; et
// pour le tableau de bord, admin_stats et report_error),
// avec les règles de supabase/schema.sql : chacun ne voit que sa ligne, et un PATCH dont le
// numéro de version n'est plus le bon ne touche rien. Tout vit en mémoire.
//
// Aucun e-mail ne part : le code se lit sur GET /__state (avec les comptes, les sauvegardes et
// le journal des requêtes). GET /__expire fait expirer tous les jetons, GET /__clearlog vide le
// journal. Deux « appareils » : http://127.0.0.1:5177 et http://localhost:5177 (deux
// localStorage distincts).
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const users = new Map(); // email -> {id,email}
const codes = new Map(); // email -> code
const access = new Map(); // token -> {uid, exp}
const refresh = new Map(); // token -> uid
const saves = new Map(); // uid -> {data, rev, updated_at}
const errors = new Map(); // sig -> {message, stack, version, count, first_at, last_at}
const log = [];

const issue = (u) => {
  const a = 'a_' + randomUUID(), r = 'r_' + randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  access.set(a, { uid: u.id, exp });
  refresh.set(r, u.id);
  return { access_token: a, refresh_token: r, expires_in: 3600, expires_at: exp, user: { id: u.id, email: u.email } };
};

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  let body = '';
  for await (const c of req) body += c;
  const u = new URL(req.url, 'http://x');
  const send = (st, obj) => { res.writeHead(st, { ...cors, 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  log.push(`${req.method} ${u.pathname}${u.search}`);
  if (u.pathname === '/__state') return send(200, { users: [...users.values()], saves: Object.fromEntries(saves), codes: Object.fromEntries(codes), log });
  if (u.pathname === '/__clearlog') { log.length = 0; return send(200, {}); }
  if (u.pathname === '/__expire') { for (const v of access.values()) v.exp = 0; return send(200, {}); }
  if (req.headers.apikey !== 'test-anon') return send(401, { message: 'no apikey' });
  const j = body ? JSON.parse(body) : {};
  // Le journal des erreurs (supabase/admin.sql, report_error) : avec ou sans compte.
  if (u.pathname === '/rest/v1/rpc/report_error') {
    const sig = `${j.p_message}|${String(j.p_stack ?? '').split('\n').slice(0, 2).join('|')}`;
    const now = new Date().toISOString();
    const e = errors.get(sig);
    if (e) Object.assign(e, { count: e.count + 1, last_at: now, version: j.p_version });
    else errors.set(sig, { message: j.p_message, stack: j.p_stack, version: j.p_version, count: 1, first_at: now, last_at: now });
    return send(204);
  }
  if (u.pathname === '/auth/v1/otp') {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    codes.set(j.email, code);
    if (!users.has(j.email)) users.set(j.email, { id: randomUUID(), email: j.email });
    return send(200, {});
  }
  if (u.pathname === '/auth/v1/verify') {
    if (codes.get(j.email) !== j.token) return send(403, { msg: 'Token has expired or is invalid' });
    codes.delete(j.email);
    return send(200, issue(users.get(j.email)));
  }
  if (u.pathname === '/auth/v1/token') {
    const uid = refresh.get(j.refresh_token);
    if (!uid) return send(400, { msg: 'Invalid Refresh Token' });
    refresh.delete(j.refresh_token);
    return send(200, issue([...users.values()].find((x) => x.id === uid)));
  }
  const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
  const sess = access.get(tok);
  if (u.pathname === '/auth/v1/logout') { access.delete(tok); return send(204); }
  if (!sess) return send(401, { message: 'no auth' });
  if (sess.exp < Date.now() / 1000) return send(401, { message: 'JWT expired' });
  const uid = sess.uid;
  const row = () => { const r = saves.get(uid); return r ? [{ data: r.data, rev: r.rev, updated_at: r.updated_at }] : []; };
  if (u.pathname === '/rest/v1/saves') {
    if (req.method === 'GET') return send(200, row());
    if (req.method === 'POST') {
      if (saves.has(uid)) return send(409, { code: '23505' });
      saves.set(uid, { data: j.data, rev: j.rev ?? 1, updated_at: new Date().toISOString() });
      return send(201, row());
    }
    if (req.method === 'PATCH') {
      const r = saves.get(uid);
      const want = Number(u.searchParams.get('rev')?.replace('eq.', ''));
      const forUid = u.searchParams.get('user_id')?.replace('eq.', '');
      if (!r || r.rev !== want || (forUid && forUid !== uid)) return send(200, []);
      Object.assign(r, { data: j.data, rev: j.rev, updated_at: new Date().toISOString() });
      return req.headers.prefer === 'return=minimal' ? send(204) : send(200, row());
    }
  }
  // Le tableau de bord (supabase/admin.sql, admin_stats) : ici, est administrateur tout compte
  // dont l'e-mail commence par « admin » (le vrai projet tient la liste dans public.admins).
  if (u.pathname === '/rest/v1/rpc/admin_stats') {
    const me = [...users.values()].find((x) => x.id === uid);
    if (!me?.email.startsWith('admin')) return send(403, { code: '42501', message: 'réservé aux administrateurs' });
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const players = [...saves].map(([id, r]) => {
      const d = r.data ?? {};
      return { id: id.slice(0, 8), updated_at: r.updated_at, rev: r.rev, started: d.started === true, runs: n(d.runs), wins: n(d.wins), best_room: n(d.bestRoom), baies: n(d.baies), shards: n(d.shards), beaten: (d.beaten ?? []).length, built: (d.built ?? []).length, seen: (d.seen ?? []).length, mons: Object.keys(d.mons ?? {}).length, temple: n(d.temple?.best) };
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return send(200, { at: new Date().toISOString(), players, errors: [...errors.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)) });
  }
  if (u.pathname === '/rest/v1/rpc/delete_account') {
    saves.delete(uid);
    for (const [e, x] of users) if (x.id === uid) users.delete(e);
    return send(200, null);
  }
  send(404, {});
}).listen(54321, '127.0.0.1', () => console.log('Faux Supabase sur http://127.0.0.1:54321'));
