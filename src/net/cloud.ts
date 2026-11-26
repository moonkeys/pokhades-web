import { SAVE_KEY } from '../meta/save';

// Sauvegarde en ligne (demande : « créer une espèce de compte juste pour sauvegarder nos
// données […] même si on passe du mobile à l'ordi »). Facultative : on joue sans compte comme
// avant, la progression reste dans le navigateur ; avec un compte, elle suit le joueur partout.
//
// Le serveur est un projet Supabase (supabase/schema.sql, README) : une connexion par e-mail
// et code à 6 chiffres, et une table d'une ligne par joueur qui contient sa sauvegarde. On lui
// parle avec de simples fetch plutôt qu'avec supabase-js : quatre appels d'authentification et
// trois de données, pas de quoi alourdir le jeu d'une bibliothèque.
//
// Ce qu'on garde (« vraiment, on garde le moins de choses possible ») : l'e-mail, côté
// Supabase, et la sauvegarde. Ce navigateur garde en plus sa session (jetons) et de quoi savoir
// si la partie a bougé depuis la dernière synchro (numéro de version et empreinte).
//
// Le principe de la synchro, pour ne jamais perdre une partie :
//   • chaque écriture de la sauvegarde part en ligne quelques secondes après (une seule requête
//     pour une rafale d'écritures), et tout de suite quand on quitte la page ;
//   • le serveur numérote les versions, et on n'écrit que par-dessus celle qu'on a vue
//     (PATCH …?rev=eq.N) : si un autre appareil a écrit entre-temps, l'écriture échoue ;
//   • au lancement, on compare : rien n'a bougé ici et le compte a avancé → on prend la partie
//     du compte ; on a joué ici et le compte n'a pas bougé → on l'envoie ; les deux ont bougé →
//     conflit : le joueur choisit laquelle garder (l'autre est mise de côté, jamais effacée).

const URL_ = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

/** Le projet Supabase est configuré au build : sans lui, pas d'entrée « Compte » du tout. */
export const cloudEnabled = Boolean(URL_ && ANON);

/** La session de ce navigateur, rangée à côté de la sauvegarde. */
const SESSION_KEY = 'pokhades-cloud';
/** La partie de ce navigateur, mise de côté quand le joueur lui préfère celle du compte. */
export const SAVE_ASIDE_KEY = `${SAVE_KEY}-avant-compte`;

/** Délai entre la dernière écriture et l'envoi : une fin de salle écrit plusieurs fois de suite. */
const PUSH_DELAY_MS = 4000;
/** Le lancement n'attend pas plus le serveur : hors ligne, on joue tout de suite. */
const BOOT_TIMEOUT_MS = 4000;
/** fetch keepalive (envoi en quittant la page) refuse les corps de plus de 64 Ko. */
const KEEPALIVE_MAX = 60_000;

interface Session {
  uid: string;
  email: string;
  access: string;
  refresh: string;
  /** Expiration du jeton d'accès (secondes depuis 1970). */
  exp: number;
  /** Version de la ligne du compte que ce navigateur a vue en dernier (null : pas encore de ligne). */
  rev: number | null;
  /** Empreinte de la sauvegarde à la dernière synchro : différente, on a joué depuis. */
  hash: string | null;
}

/** Une sauvegarde, résumée pour choisir entre deux parties. */
export interface SaveSummary {
  mons: number;
  wins: number;
  baies: number;
  badges: number;
  bestRoom: number;
  started: boolean;
}

export type CloudStatus =
  /** Pas de projet configuré : le jeu tel qu'avant. */
  | 'off'
  /** Pas connecté. */
  | 'out'
  /** Connecté, à jour. */
  | 'ok'
  /** Un envoi ou une lecture en cours. */
  | 'busy'
  /** Le serveur ne répond pas : on réessaiera (rien n'est perdu, la partie est dans le navigateur). */
  | 'offline'
  /** Les deux parties ont avancé chacune de leur côté : le joueur doit choisir. */
  | 'conflict';

export interface CloudConflict {
  local: SaveSummary;
  cloud: SaveSummary;
  /** Date de la dernière écriture de la partie du compte. */
  cloudAt: Date;
}

// ── État ────────────────────────────────────────────────────────────────

let session: Session | null = readSession();
let status: CloudStatus = !cloudEnabled ? 'off' : session ? 'ok' : 'out';
/** La partie du compte, gardée le temps que le joueur tranche un conflit. */
let conflict: { data: unknown; rev: number; at: Date } | null = null;
/** Dernière erreur à montrer (connexion refusée, hors ligne…). */
let lastError = '';
let lastSyncAt: Date | null = null;
const listeners = new Set<() => void>();

export const cloudStatus = (): CloudStatus => status;
export const cloudEmail = (): string => session?.email ?? '';
export const cloudError = (): string => lastError;
export const cloudLastSync = (): Date | null => lastSyncAt;
/** Écoute les changements d'état (écran Compte, écran titre). Renvoie de quoi se désabonner. */
export const onCloudChange = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

function setStatus(s: CloudStatus, error = ''): void {
  status = s;
  lastError = error;
  for (const f of listeners) f();
}

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return s && typeof s.uid === 'string' && typeof s.refresh === 'string' ? s : null;
  } catch {
    return null;
  }
}

function writeSession(): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Stockage plein ou refusé : la session vit le temps de l'onglet.
  }
}

// ── Empreinte et résumé ─────────────────────────────────────────────────

/**
 * JSON aux clés triées : Postgres (jsonb) range les clés dans son ordre à lui, et le jeu dans le
 * sien. Sans ce tri, une même partie aurait deux empreintes, et chaque aller-retour passerait
 * pour une modification.
 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a sur 2 × 32 bits : pour savoir si une partie a changé, pas pour la sécurité. */
function hashOf(data: unknown): string {
  const s = canonical(data);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

export function summarize(data: unknown): SaveSummary {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const num = (k: string) => Math.max(0, Math.floor(Number(d[k]) || 0));
  return {
    started: Boolean(d.started),
    mons: d.mons && typeof d.mons === 'object' ? Object.keys(d.mons).length : 0,
    wins: num('wins'),
    baies: num('baies'),
    badges: Array.isArray(d.beaten) ? d.beaten.length : 0,
    bestRoom: num('bestRoom'),
  };
}

function localData(): unknown {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Une partie qui vaut d'être gardée : au moins le premier Pokémon choisi. */
const worthKeeping = (data: unknown): boolean => summarize(data).started;

// ── Requêtes ────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`);
  }
}

async function call(path: string, init: RequestInit & { auth?: boolean } = {}, retried = false): Promise<unknown> {
  const headers: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.auth) {
    await freshToken();
    if (!session) throw new HttpError(401, 'session perdue');
    headers.Authorization = `Bearer ${session.access}`;
  }
  const res = await fetch(`${URL_}${path}`, { ...init, headers });
  const text = await res.text();
  // Jeton refusé alors qu'on le croyait valide (horloge du téléphone en avance ou en retard,
  // session révoquée) : on le renouvelle et on réessaie une fois.
  if (res.status === 401 && init.auth && !retried && session) {
    session.exp = 0;
    return call(path, init, true);
  }
  if (!res.ok) throw new HttpError(res.status, text);
  return text ? JSON.parse(text) : null;
}

interface AuthReply {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id: string; email?: string };
}

function adopt(r: AuthReply, email?: string): void {
  const exp = r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600);
  const uid = r.user?.id ?? session?.uid ?? '';
  // Un autre compte que celui d'avant sur ce navigateur : on repart sans version ni empreinte.
  const same = session?.uid === uid;
  session = {
    uid,
    email: r.user?.email ?? email ?? session?.email ?? '',
    access: r.access_token,
    refresh: r.refresh_token,
    exp,
    rev: same ? (session?.rev ?? null) : null,
    hash: same ? (session?.hash ?? null) : null,
  };
  writeSession();
}

/** Le jeton d'accès dure une heure : on le renouvelle une minute avant. */
async function freshToken(): Promise<void> {
  if (!session || session.exp - 60 > Date.now() / 1000) return;
  // Un autre onglet a peut-être déjà renouvelé : son jeton est dans le localStorage.
  const stored = readSession();
  if (stored && stored.uid === session.uid && stored.access !== session.access && stored.exp > session.exp) {
    session = { ...stored, rev: session.rev, hash: session.hash };
    if (session.exp - 60 > Date.now() / 1000) return;
  }
  try {
    adopt((await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh }) })) as AuthReply);
  } catch (err) {
    // Jeton refusé (compte supprimé ailleurs, session révoquée) : il faut se reconnecter. Sinon
    // (réseau), on garde la session pour la prochaine fois.
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      session = null;
      writeSession();
      setStatus('out', 'Ta session a expiré : reconnecte-toi.');
    }
    throw err;
  }
}

interface Row {
  data: unknown;
  rev: number;
  updated_at: string;
}

async function pull(): Promise<Row | null> {
  const rows = (await call('/rest/v1/saves?select=data,rev,updated_at', { auth: true })) as Row[];
  return rows[0] ?? null;
}

function remember(row: Row): void {
  if (!session) return;
  session.rev = row.rev;
  session.hash = hashOf(row.data);
  writeSession();
  lastSyncAt = new Date();
}

// ── Connexion ───────────────────────────────────────────────────────────

const friendly = (err: unknown, fallback: string): string => {
  if (!(err instanceof HttpError)) return 'Le serveur ne répond pas. Vérifie ta connexion.';
  if (err.status === 429) return 'Trop d’essais d’un coup : réessaie dans une minute.';
  return fallback;
};

/** Envoie le code de connexion. Le compte se crée tout seul au premier code. */
export async function sendCode(email: string): Promise<string | null> {
  try {
    await call('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), create_user: true }) });
    return null;
  } catch (err) {
    return friendly(err, 'Impossible d’envoyer le code à cette adresse.');
  }
}

/**
 * Vérifie le code et rapproche aussitôt les deux parties. Renvoie une erreur à afficher, ou
 * `reload` quand la partie du compte vient de remplacer celle du navigateur (main.ts recharge
 * la page : toute la partie en mémoire en découle).
 */
export async function verifyCode(email: string, code: string): Promise<{ error?: string; reload?: boolean }> {
  try {
    const r = (await call('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email: email.trim().toLowerCase(), token: code.trim() }) })) as AuthReply;
    adopt(r, email);
  } catch (err) {
    return { error: friendly(err, 'Code faux ou expiré. Redemande-en un.') };
  }
  setStatus('busy');
  const outcome = await reconcile();
  return { reload: outcome === 'took' };
}

export async function logout(): Promise<void> {
  // On envoie d'abord ce qui reste, puis on oublie la session (le serveur révoque le jeton).
  await flush();
  const s = session;
  session = null;
  writeSession();
  conflict = null;
  setStatus('out');
  // scope=local : seul cet appareil se déconnecte (par défaut, Supabase les déconnecterait tous).
  if (s) fetch(`${URL_}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${s.access}` } }).catch(() => {});
}

/** Efface l'e-mail et la sauvegarde du serveur. La partie reste dans ce navigateur. */
export async function deleteAccount(): Promise<string | null> {
  try {
    await call('/rest/v1/rpc/delete_account', { method: 'POST', body: '{}', auth: true });
  } catch (err) {
    return friendly(err, 'La suppression a échoué. Réessaie.');
  }
  session = null;
  writeSession();
  conflict = null;
  setStatus('out');
  return null;
}

// ── Synchro ─────────────────────────────────────────────────────────────

/** Le résultat d'un rapprochement : rien à faire, partie envoyée, partie du compte reprise, conflit. */
type Outcome = 'same' | 'pushed' | 'took' | 'conflict' | 'offline';

function take(row: Row): void {
  try {
    // La partie de ce navigateur est mise de côté, au cas où (une seule copie, la dernière).
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw && worthKeeping(JSON.parse(raw))) localStorage.setItem(SAVE_ASIDE_KEY, raw);
    localStorage.setItem(SAVE_KEY, JSON.stringify(row.data));
  } catch {
    // Stockage plein : on ne peut pas reprendre la partie du compte ici.
    return;
  }
  remember(row);
}

/** Compare la partie du navigateur à celle du compte, et fait ce qui s'impose (voir en tête). */
async function reconcile(): Promise<Outcome> {
  if (!session) return 'same';
  let row: Row | null;
  try {
    row = await pull();
  } catch {
    if (session) setStatus('offline', 'Hors ligne : la partie sera envoyée plus tard.');
    return 'offline';
  }
  const local = localData();
  const localHash = local ? hashOf(local) : null;
  const done = (o: Outcome): Outcome => {
    if (o !== 'conflict') setStatus('ok');
    return o;
  };
  if (!row) {
    // Pas encore de partie sur le compte : on y met celle d'ici (si elle vaut quelque chose).
    session.rev = null;
    writeSession();
    if (!local || !worthKeeping(local)) return done('same');
    return done((await pushNow()) ? 'pushed' : 'offline');
  }
  if (localHash === hashOf(row.data)) {
    remember(row);
    return done('same');
  }
  const changedHere = localHash !== session.hash;
  const changedThere = row.rev !== session.rev;
  // Rien d'intéressant ici (partie neuve) : la partie du compte, sans poser de question.
  if (!local || !worthKeeping(local)) {
    take(row);
    return done('took');
  }
  if (!changedHere && changedThere) {
    take(row);
    return done('took');
  }
  if (changedHere && !changedThere) return done((await pushNow()) ? 'pushed' : 'offline');
  conflict = { data: row.data, rev: row.rev, at: new Date(row.updated_at) };
  setStatus('conflict');
  return 'conflict';
}

/**
 * Au lancement, avant de lire la sauvegarde (main.ts) : reprend la partie du compte si elle a
 * avancé ailleurs. N'attend pas plus de quelques secondes un serveur lent ou absent.
 */
export async function cloudBoot(): Promise<void> {
  if (!cloudEnabled || !session) return;
  setStatus('busy');
  const timeout = new Promise<'offline'>((r) => setTimeout(() => r('offline'), BOOT_TIMEOUT_MS));
  const o = await Promise.race([reconcile(), timeout]);
  if (o === 'offline' && status === 'busy') setStatus('offline', 'Hors ligne : la partie sera envoyée plus tard.');
}

/** Le conflit en cours, résumé pour le choix. */
export function cloudConflict(): CloudConflict | null {
  if (!conflict) return null;
  return { local: summarize(localData()), cloud: summarize(conflict.data), cloudAt: conflict.at };
}

/**
 * Tranche un conflit. « cloud » : la partie du compte remplace celle d'ici (qui est mise de
 * côté) ; renvoie true, main.ts recharge la page. « local » : celle d'ici écrase celle du compte.
 */
export async function resolveConflict(keep: 'local' | 'cloud'): Promise<boolean> {
  const c = conflict;
  if (!c || !session) return false;
  conflict = null;
  if (keep === 'cloud') {
    take({ data: c.data, rev: c.rev, updated_at: c.at.toISOString() });
    setStatus('ok');
    return true;
  }
  // La partie du compte, qu'on va écraser, est mise de côté ici (l'écran le promet).
  try {
    localStorage.setItem(SAVE_ASIDE_KEY, JSON.stringify(c.data));
  } catch {
    // Stockage plein : tant pis pour la copie, le choix du joueur passe avant.
  }
  // On écrit par-dessus la version qu'on vient de voir : une partie plus récente encore
  // (un troisième appareil) ramènerait le conflit.
  session.rev = c.rev;
  session.hash = null;
  writeSession();
  setStatus('busy');
  if (await pushNow()) setStatus('ok');
  return false;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> = Promise.resolve();

/** Une écriture de la sauvegarde vient d'avoir lieu (save.ts) : envoi dans quelques secondes. */
function schedule(): void {
  if (!session || status === 'conflict') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushNow();
  }, PUSH_DELAY_MS);
}

/** Envoie tout de suite ce qui attend (déconnexion, retour du réseau). */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await pushNow();
  } else await chain;
}

/** Envoie la partie si elle a changé. Une seule requête à la fois. Renvoie false en cas d'échec. */
function pushNow(): Promise<boolean> {
  const job = chain.then(() => push());
  chain = job.catch(() => {});
  return job;
}

async function push(): Promise<boolean> {
  if (!session || status === 'conflict') return false;
  const data = localData();
  if (!data || !worthKeeping(data)) return true;
  const h = hashOf(data);
  if (h === session.hash) return true;
  setStatus('busy');
  try {
    let rows: Row[];
    if (session.rev === null) {
      rows = (await call('/rest/v1/saves?select=data,rev,updated_at', {
        method: 'POST',
        auth: true,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ data, rev: 1 }),
      })) as Row[];
    } else {
      rows = (await call(`/rest/v1/saves?select=data,rev,updated_at&user_id=eq.${encodeURIComponent(session.uid)}&rev=eq.${session.rev}`, {
        method: 'PATCH',
        auth: true,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ data, rev: session.rev + 1 }),
      })) as Row[];
    }
    if (rows[0]) {
      remember(rows[0]);
      setStatus('ok');
      return true;
    }
    // Aucune ligne touchée : un autre appareil a écrit depuis notre dernière lecture.
    await reconcile();
    return status === 'ok';
  } catch (err) {
    // 409 : la ligne existe déjà (créée par un autre appareil entre-temps) : on rapproche.
    if (err instanceof HttpError && err.status === 409) {
      await reconcile();
      return status === 'ok';
    }
    if (session) setStatus('offline', 'Hors ligne : la partie sera envoyée plus tard.');
    return false;
  }
}

/**
 * En quittant la page (onglet fermé, appli mise en arrière-plan sur téléphone) : un dernier envoi
 * qui survit à la page (keepalive), sans attendre le délai. Au-delà de 64 Ko, le navigateur le
 * refuserait : l'envoi normal partira au prochain lancement.
 */
function farewell(): void {
  if (!session || status === 'conflict' || !timer) return;
  clearTimeout(timer);
  timer = null;
  const data = localData();
  if (!data || !worthKeeping(data) || session.rev === null || session.exp - 30 < Date.now() / 1000) return;
  const h = hashOf(data);
  if (h === session.hash) return;
  const body = JSON.stringify({ data, rev: session.rev + 1 });
  if (body.length > KEEPALIVE_MAX) return;
  fetch(`${URL_}/rest/v1/saves?user_id=eq.${encodeURIComponent(session.uid)}&rev=eq.${session.rev}`, {
    method: 'PATCH',
    keepalive: true,
    headers: { apikey: ANON, Authorization: `Bearer ${session.access}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body,
  }).catch(() => {});
  // On ne saura pas si c'est passé : au prochain lancement, la version du compte dira (rev+1 et
  // même partie → rien à faire ; sinon le rapprochement habituel).
}

/** Branche la synchro : à appeler une fois au lancement (main.ts). */
export function startCloud(onSaved: (f: () => void) => void): void {
  if (!cloudEnabled) return;
  onSaved(schedule);
  addEventListener('pagehide', farewell);
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') farewell();
  });
  // Le réseau revient : ce qui attendait part.
  addEventListener('online', () => {
    if (session && status === 'offline') void reconcile();
  });
}
