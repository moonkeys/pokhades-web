import Peer, { type DataConnection } from 'peerjs';
import type { BoonOffer } from '../combat/boons';
import type { Move } from '../combat/moves';
import type { SkillOffer } from '../run/rewards';
import type { Cmd } from './drawrec';

// Le jeu en ligne (le relais de Roucarnage) : portage web de autoloads/Net.gd.
//
// Comme le jeu Godot, l'hôte fait autorité : il simule toute la run (salles,
// ennemis, dégâts, récompenses) et les autres le rejoignent avec un code. Un
// navigateur ne peut pas ouvrir de port comme ENet : on passe par WebRTC
// (PeerJS), en pair-à-pair. Seule la mise en relation passe par le serveur de
// signalisation public de PeerJS ; ensuite, plus rien ne transite par lui.
//
// Écart voulu avec Net.gd : chaque invité pilote son Pokémon chez lui (il le
// déplace lui-même, sans attendre l'hôte) et n'envoie que sa position et ses
// attaques ; l'hôte renvoie l'état du monde une vingtaine de fois par
// seconde (net/sync.ts). Sur le Web, attendre l'aller-retour de l'hôte pour
// chaque pas rendrait la marche pâteuse.

export const MAX_PLAYERS = 6;
/** Base 32 sans les caractères ambigus (0/O, 1/I), comme CODE_CHARS de Net.gd. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;
/** Préfixe des identifiants PeerJS : le serveur de signalisation est partagé avec le monde entier. */
const PREFIX = 'pokhades-web-';

/**
 * Serveurs ICE de la connexion directe (WebRTC). Retour de test : mobile contre ordinateur,
 * même sur le même Wi-Fi, « l'hôte ne répond pas ». Deux causes : les navigateurs masquent les
 * adresses locales (mDNS) que bien des box ne relaient pas, et la 4G/5G ou un Wi-Fi public
 * bloquent le pair-à-pair. Il faut alors un relais TURN. Celui que PeerJS fournit par défaut
 * (turn:*.turn.peerjs.com) n'existe plus : son nom de domaine ne se résout plus, d'où l'échec.
 *
 * Passer `config` à PeerJS remplace ses serveurs : on met des STUN, plus le relais TURN du projet
 * (ExpressTURN, offre gratuite sans carte) si le build en reçoit les identifiants :
 * VITE_TURN_URLS (adresses séparées par des virgules), VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL.
 * Ils sont lisibles dans le jeu publié : un compte gratuit à quota, qu'on change au besoin.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const env = import.meta.env;
  // Une adresse collée telle quelle du tableau de bord (« host:3478 », sans `turn:`) fait refuser la
  // configuration entière par le navigateur : on complète, et on ajoute la variante TCP (traverse
  // les réseaux qui coupent l'UDP).
  const urls = String(env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .flatMap((u) => (/^turns?:/i.test(u) ? [u] : [`turn:${u}`, `turn:${u}?transport=tcp`]));
  if (urls.length) servers.push({ urls, username: String(env.VITE_TURN_USERNAME ?? ''), credential: String(env.VITE_TURN_CREDENTIAL ?? '') });
  return servers;
}
const PEER_OPTIONS = { config: { iceServers: iceServers(), sdpSemantics: 'unified-plan' } as RTCConfiguration };
/** Délai pour établir la liaison avec l'hôte : via un relais TURN, elle prend plus de 12 s. */
const JOIN_TIMEOUT_MS = 30000;
/**
 * Reconnexion de l'invité coupé en pleine run (Wi-Fi qui saute, téléphone mis en veille) :
 * il retente seul, autant de fois, en laissant ce délai entre deux essais. L'hôte lui garde sa
 * place (Net.dropped) le temps de la run.
 */
const REJOIN_TRIES = 4;
const REJOIN_DELAY_MS = 2500;

/** Jeton de ce navigateur, gardé d'une session à l'autre : l'hôte reconnaît l'invité qui revient. */
function browserToken(): string {
  const KEY = 'pokhades-net-token';
  try {
    const t = localStorage.getItem(KEY);
    if (t) return t;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return `t${Math.random().toString(36).slice(2)}`;
  }
}

/** Un hôte et un invité de versions différentes ne se comprendraient pas (Net._reject_version). */
export const NET_VERSION = 2;

/** Le Pokémon qu'un joueur emmène dans la run en ligne : un seul chacun (MultiplayerLobbyScreen). */
export interface Loadout {
  species: number;
  level: number;
  name: string;
  moves: Move[];
  /** PV max relevés au Repaire (Vitalité, objet, nature) : l'hôte les reprend tels quels. */
  maxHp: number;
}

export interface LobbyPlayer {
  id: string;
  host: boolean;
  loadout: Loadout | null;
  /** Jeton du navigateur de l'invité (Net.token) : il le reconnaît s'il revient en pleine run. */
  token?: string;
}

/**
 * Un écran que l'hôte ouvre chez un invité (main.ts, remoteUi) : l'invité a pressé E près de la
 * récompense, d'un article de la boutique, de Leveinard… Il choisit chez lui, l'hôte applique.
 */
export type RemoteUi =
  | { kind: 'talk'; species: number; name: string; text: string; options: { label: string; disabled?: string }[]; rewards?: { icon: string; label: string; desc?: string }[] }
  | { kind: 'boons'; offer: BoonOffer }
  | { kind: 'skill'; offer: SkillOffer; price: number };

/** La réponse de l'invité : l'option, la carte ou l'attaque choisie ; rien s'il a refermé. */
export interface RemotePick {
  /** Dialogue : rang de l'option ; dons : rang de la carte. */
  i?: number;
  /** Nouvelle attaque : rang dans offer.learn, et l'emplacement qu'elle remplace (-1 : un libre). */
  learn?: number;
  replace?: number;
  /** Renforcer l'attaque de cet emplacement. */
  upgrade?: number;
}

/** Ce que l'invité envoie à l'hôte. */
export type ClientMsg =
  | {
      t: 'hello';
      version: number;
      loadout: Loadout;
      /** Jeton de ce navigateur, gardé d'une session à l'autre (reconnexion en pleine run). */
      token: string;
      /** L'invité est encore dans la run (il revient d'une coupure) ; sinon l'hôte la lui relance. */
      inRun: boolean;
    }
  | { t: 'pick'; id: number; pick: RemotePick | null }
  | { t: 'loadout'; loadout: Loadout }
  | {
      t: 'in';
      /** Numéro de la carte où l'invité se croit : une position d'avant le changement de salle est ignorée. */
      epoch: number;
      x: number;
      y: number;
      dir: number;
      moving: boolean;
      dashT: number;
      swimming: boolean;
      /** Emplacement d'attaque pressé depuis le dernier envoi, ou -1. */
      move: number;
      mx: number;
      my: number;
      /** E pressé depuis le dernier envoi (ouvrir un coffre). */
      interact?: boolean;
      /** R pressé depuis le dernier envoi : l'ultime de la run (jauge commune). */
      ult?: boolean;
    };

/** De quoi régénérer la carte chez l'invité : la génération est déterministe. */
export type WorldKey =
  | { kind: 'room'; biome: string; seed: number; store: boolean; cave: boolean; layout?: string; mouthUsed: boolean; entry?: 'N' | 'S' | 'E' | 'W'; arena?: boolean }
  | { kind: 'cave'; seed: number };

/** Un Pokémon sur le terrain, tel que l'hôte le voit (net/sync.ts). */
export interface ActorSnap {
  n: number;
  s: number;
  x: number;
  y: number;
  d: number;
  m: number;
  /** Action PMD en cours et son temps écoulé. */
  a?: string;
  at?: number;
  hp: number;
  mh: number;
  lv: number;
  dt: number;
  sw: number;
  /** 0 sauvage, 1 Pokémon de champion, 2 son as, 3 membre d'un joueur, 4 figurant (boutique, marchand, grotte). */
  r: number;
  b: number;
  bl: number;
  h: number;
  tr: number;
  nm?: string;
  fl?: [string, number, number, number];
  st?: string | null;
}

export interface StrikeSnap {
  x: number;
  y: number;
  t: number;
  dur: number;
  color: string;
  hostile: boolean;
  shape?: unknown;
}

/** Ce que l'hôte envoie aux invités. */
export type HostMsg =
  | { t: 'lobby'; players: LobbyPlayer[] }
  | { t: 'reject'; reason: string }
  | { t: 'start' }
  | {
      t: 'camp';
      epoch: number;
      /** Le Repaire de l'hôte, où les invités se promènent : ses aménagements et les libérés qui y vivent. */
      built: string[];
      dwellers: number[];
      /** Les recrues qui attendent chez l'hôte (espèces) : l'invité les voit autour du feu, sans pouvoir leur parler. */
      recruits?: number[];
      /** Où chaque nouvel arrivant apparaît (identifiant de pair → position). */
      spawn: Record<string, { x: number; y: number }>;
    }
  | {
      t: 'room';
      epoch: number;
      key: WorldKey;
      /** Où chaque invité apparaît (identifiant de pair → position). */
      spawn: Record<string, { x: number; y: number }>;
      /** Cases bloquées et infranchissables chez l'hôte (la boutique, un coffre en posent ou en ôtent après la génération). */
      blocked: string;
      solid: string;
      weather: string;
      music: string;
      color: string;
      /**
       * Les objets que la salle a posés ou ôtés après la génération (torches de l'Autel, enclos de
       * la Pension, arbres chassés par une place) : la carte régénérée chez l'invité ne les a pas.
       */
      added?: { sprite: unknown; x: number; y: number; fades: boolean }[];
      removed?: [number, number][];
    }
  | {
      t: 'snap';
      epoch: number;
      actors: ActorSnap[];
      /** Identifiant de pair → n° d'acteur de son Pokémon. */
      own: Record<string, number>;
      /** Recharges de chaque invité : emplacement → secondes restantes, et leur maximum. */
      cd: Record<string, [number[], number[]]>;
      strikes: StrikeSnap[];
      fx: [string, unknown[]][];
      shake: number;
      hud: {
        place: string;
        money: number;
        fade: number;
        boss: { name: string; sub: string; ace: boolean; bars: number; barsLeft: number; ratio: number } | null;
        /** L'ultime de la run et sa jauge : commune à tous, chacun la lance (R). */
        ult?: [string, number] | null;
      };
    }
  | {
      /**
       * Ce qui a changé dans la carte depuis sa génération : cases libérées (obstacle coupé),
       * coffres ouverts, objets retirés (torches de l'Autel). La carte de l'invité est régénérée
       * depuis sa graine, et ces changements, faits en jeu chez l'hôte, n'y étaient pas.
       */
      t: 'tiles';
      epoch: number;
      blocked: string;
      solid: string;
      opened: [number, number][];
      gone: [number, number][];
    }
  /** L'invite [E] de ce qui est devant mon Pokémon (boutique, coffre, source…), en HTML ; vide sinon. */
  | { t: 'prompt'; h: string }
  /** Un écran de choix à ouvrir chez moi (RemoteUi). */
  | { t: 'ui'; id: number; ui: RemoteUi }
  /** Mes attaques telles que l'hôte les tient (apprises, renforcées, évolution). */
  | { t: 'moves'; moves: Move[] }
  | { t: 'hud'; k: 'message' | 'toast' | 'announce'; args: unknown[] }
  | {
      t: 'scene';
      epoch: number;
      /** Ce que l'hôte dessine de la salle (net/drawrec.ts) : décor trié avec les Pokémon (y en pixels du monde), sol, voile. */
      extras: [number, Cmd[]][];
      ground: Cmd[];
      overlay: Cmd[];
      /** Étiquettes HTML (portes, récompense, grotte) : leur balisage et leur point dans le monde. */
      labels: { h: string; x: number; y: number; s?: number }[];
      /** Canvas fabriqués (icônes), une fois chacun. */
      defs: Record<string, string>;
    }
  | {
      /** Un gain de la run : versé dans la sauvegarde de chaque joueur (ajout : « ce qui est gagné l'est pour tous »). */
      t: 'loot';
      baies?: number;
      shards?: number;
      res?: Record<string, number>;
      mats?: Record<string, number>;
      items?: Record<string, number>;
      text?: string;
    }
  | { t: 'dialogue'; speaker: unknown; text: string }
  | {
      t: 'end';
      won: boolean;
      rooms: number;
      baies: number;
      /** Le bilan de la run, pour l'écran de fin de l'invité (retour de test : « je ne vois pas le résultat quand je meurs »). */
      sum?: {
        act: number;
        biome: string;
        color: string;
        champion: string;
        boons: number;
        time: number;
        kos: number;
        dealt: number;
        taken: number;
        shards: number;
        champions: string[];
        /** Identifiant de pair → [PV infligés, PV encaissés] de son Pokémon. */
        mem: Record<string, [number, number]>;
      };
    }
  | { t: 'bye'; reason: string };

export type Role = 'off' | 'host' | 'client';

function makeCode(): string {
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  for (const b of buf) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

/** Un code saisi à la main : majuscules, sans espaces ni tirets. */
export function cleanCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .slice(0, CODE_LEN);
}

/**
 * La session en ligne : un hôte et jusqu'à cinq invités. Le jeu s'abonne aux
 * messages (`onHost`, `onClient`) et aux changements de lobby (`onChange`).
 */
export class Net {
  role: Role = 'off';
  code = '';
  /** Mon identifiant de pair (celui de l'hôte : PREFIX + code). */
  id = '';
  /** Message d'état à afficher (connexion, erreur, hôte parti…). */
  status = '';
  players: LobbyPlayer[] = [];
  /** La run en ligne a commencé. */
  inRun = false;
  private peer: Peer | null = null;
  /** Hôte : les invités ; invité : la connexion à l'hôte. */
  private readonly conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private readonly listeners = new Set<() => void>();
  /** Hôte : un message d'invité. */
  onClient: (from: string, msg: ClientMsg) => void = () => {};
  /** Invité : un message de l'hôte. */
  onHost: (msg: HostMsg) => void = () => {};
  /** Un invité est parti (hôte), ou l'invité a quitté la partie, de lui-même ou non (`from` vide). */
  onLeave: (from: string) => void = () => {};
  /** Hôte : un invité vient d'entrer (il attend le Repaire de l'hôte). */
  onJoin: (id: string) => void = () => {};
  /**
   * Hôte : un invité coupé en pleine run revient (nouvel identifiant de pair `id`, l'ancien
   * `was`) ; `inRun` : il est resté dans la run chez lui, sinon il faut la lui relancer.
   */
  onRejoin: (id: string, was: string, inRun: boolean) => void = () => {};
  /** Ce navigateur, d'une session à l'autre. */
  readonly token = browserToken();
  /** Hôte : les invités coupés en pleine run, par jeton, avec leur ancien identifiant (leur place est gardée). */
  private readonly dropped = new Map<string, LobbyPlayer>();
  /** Invité : le code et le Pokémon de la partie, pour s'y reconnecter. */
  private joined: { code: string; loadout: Loadout } | null = null;
  /** Invité : une reconnexion est en cours. */
  reconnecting = false;

  get active(): boolean {
    return this.role !== 'off';
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    for (const cb of this.listeners) cb();
  }

  /** Ouvre une partie : le code s'affiche une fois le serveur de signalisation joint. */
  host(loadout: Loadout): Promise<void> {
    this.leave();
    this.role = 'host';
    this.status = 'Ouverture du relais…';
    this.changed();
    return this.openHost(loadout, 0);
  }

  private openHost(loadout: Loadout, attempt: number): Promise<void> {
    const code = makeCode();
    const peer = new Peer(PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
    return new Promise((resolve) => {
      peer.on('open', (id) => {
        this.code = code;
        this.id = id;
        this.status = '';
        this.players = [{ id, host: true, loadout }];
        this.changed();
        resolve();
      });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('error', (err) => {
        // Code déjà pris par une autre partie : on en tire un autre.
        if (err.type === 'unavailable-id' && attempt < 4 && this.peer === peer) {
          peer.destroy();
          void this.openHost(loadout, attempt + 1).then(resolve);
          return;
        }
        this.status = `Relais injoignable (${err.type}).`;
        this.changed();
        resolve();
      });
      peer.on('disconnected', () => {
        // Le serveur de signalisation a lâché : les parties en cours continuent, mais plus personne ne peut entrer.
        if (this.peer === peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  private accept(conn: DataConnection): void {
    const refuse = (reason: string) => {
      conn.send({ t: 'reject', reason } satisfies HostMsg);
      setTimeout(() => conn.close(), 500);
    };
    conn.on('open', () => {
      // Pendant la run, seul un invité coupé peut revenir : on attend son « hello » pour le savoir.
      if (this.players.length >= MAX_PLAYERS && !this.inRun) return refuse('La partie est pleine (six joueurs).');
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (data) => {
      const msg = data as ClientMsg;
      if (msg.t === 'hello') {
        if (msg.version !== NET_VERSION) {
          conn.send({ t: 'reject', reason: 'Versions du jeu différentes : rechargez la page tous les deux.' } satisfies HostMsg);
          setTimeout(() => conn.close(), 500);
          return;
        }
        // Un invité coupé en pleine run revient : il reprend sa place (son Pokémon, ses PV).
        const back = this.inRun ? this.dropped.get(msg.token) : undefined;
        if (this.inRun && !back) {
          this.conns.delete(conn.peer);
          return refuse('La run a déjà commencé.');
        }
        if (!this.players.some((p) => p.id === conn.peer)) this.players.push({ id: conn.peer, host: false, loadout: back?.loadout ?? msg.loadout, token: msg.token });
        this.syncLobby();
        if (back) {
          this.dropped.delete(msg.token);
          this.onRejoin(conn.peer, back.id, msg.inRun);
        } else this.onJoin(conn.peer);
        return;
      }
      if (msg.t === 'loadout') {
        const p = this.players.find((q) => q.id === conn.peer);
        if (p) p.loadout = msg.loadout;
        this.syncLobby();
        return;
      }
      this.onClient(conn.peer, msg);
    });
    conn.on('close', () => this.drop(conn.peer));
    conn.on('error', () => this.drop(conn.peer));
  }

  private drop(id: string): void {
    if (!this.conns.has(id) && !this.players.some((p) => p.id === id)) return;
    this.conns.delete(id);
    // En pleine run, sa place est gardée : il peut revenir avec le même navigateur.
    const p = this.players.find((q) => q.id === id);
    if (this.inRun && p?.token) this.dropped.set(p.token, p);
    this.players = this.players.filter((p) => p.id !== id);
    this.onLeave(id);
    this.syncLobby();
  }

  private syncLobby(): void {
    this.broadcast({ t: 'lobby', players: this.players });
    this.changed();
  }

  /** Rejoint la partie d'un hôte par son code. */
  join(code: string, loadout: Loadout): Promise<void> {
    this.leave();
    const clean = cleanCode(code);
    this.role = 'client';
    this.code = clean;
    this.joined = { code: clean, loadout };
    this.status = 'Connexion à l’hôte…';
    this.changed();
    return this.connect(clean, loadout, (why) => {
      this.leave(why);
      this.changed();
    });
  }

  /**
   * La liaison à l'hôte : un pair, une connexion, le « hello ». `fail` : elle n'a pas pu se faire.
   * Sert à rejoindre, puis à revenir après une coupure (rejoin).
   */
  private connect(clean: string, loadout: Loadout, onFail: (why: string) => void): Promise<void> {
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    return new Promise((resolve) => {
      const fail = (why: string) => {
        if (this.peer !== peer) return resolve();
        onFail(why);
        resolve();
      };
      peer.on('error', (err) => fail(err.type === 'peer-unavailable' ? `Aucune partie ouverte sous le code ${clean}.` : `Connexion impossible (${err.type}).`));
      peer.on('open', (id) => {
        this.id = id;
        const conn = peer.connect(PREFIX + clean, { reliable: true });
        this.hostConn = conn;
        const timer = setTimeout(
          () => fail('Liaison impossible avec l’hôte : la connexion directe est bloquée entre vos deux appareils (il manque le relais TURN du jeu).'),
          JOIN_TIMEOUT_MS,
        );
        this.status = 'Connexion à l’hôte… (jusqu’à 30 s via un relais)';
        this.changed();
        conn.on('open', () => {
          clearTimeout(timer);
          this.status = '';
          this.reconnecting = false;
          conn.send({ t: 'hello', version: NET_VERSION, loadout, token: this.token, inRun: this.inRun } satisfies ClientMsg);
          this.changed();
          resolve();
        });
        conn.on('data', (data) => {
          const msg = data as HostMsg;
          if (msg.t === 'reject') return fail(msg.reason);
          if (msg.t === 'lobby') {
            this.players = msg.players;
            this.changed();
            return;
          }
          if (msg.t === 'bye') return this.hostGone(msg.reason);
          this.onHost(msg);
        });
        // Une coupure (sans « bye ») : en pleine run, on tente de revenir avant d'abandonner.
        conn.on('close', () => this.hostConn === conn && this.lost('L’hôte a fermé la partie.'));
        conn.on('error', () => this.hostConn === conn && this.lost('Connexion à l’hôte perdue.'));
      });
    });
  }

  private hostGone(reason: string): void {
    if (this.role !== 'client') return;
    this.leave(reason);
  }

  /** La liaison à l'hôte a lâché sans qu'il ait dit au revoir. */
  private lost(reason: string): void {
    if (this.role !== 'client') return;
    if (!this.inRun || !this.joined) return this.hostGone(reason);
    void this.rejoin(reason, REJOIN_TRIES);
  }

  /**
   * Revenir dans la run après une coupure : l'hôte a gardé la place (dropped). L'écran garde la
   * dernière image reçue, et un message dit qu'on se reconnecte ; après REJOIN_TRIES essais, on
   * rentre au Repaire comme avant.
   */
  private async rejoin(reason: string, tries: number): Promise<void> {
    const j = this.joined;
    if (!j || this.role !== 'client') return;
    this.reconnecting = true;
    this.hostConn = null;
    const old = this.peer;
    this.peer = null;
    old?.destroy();
    this.status = 'Liaison perdue : reconnexion à l’hôte…';
    this.changed();
    await new Promise((r) => setTimeout(r, REJOIN_DELAY_MS));
    if (this.role !== 'client' || !this.reconnecting) return;
    await this.connect(j.code, j.loadout, (why) => {
      if (tries > 1) void this.rejoin(reason, tries - 1);
      else {
        this.reconnecting = false;
        this.leave(`${reason} ${why}`);
      }
    });
  }

  /** Quitte la partie (l'hôte la ferme pour tout le monde). */
  leave(reason = ''): void {
    const wasClient = this.role === 'client';
    if (this.role === 'host') this.broadcast({ t: 'bye', reason: 'L’hôte a fermé la partie.' });
    const peer = this.peer;
    this.peer = null;
    this.hostConn = null;
    this.conns.clear();
    this.dropped.clear();
    this.joined = null;
    this.reconnecting = false;
    this.players = [];
    this.role = 'off';
    this.code = '';
    this.inRun = false;
    this.status = reason;
    // Laisse partir le « bye » avant de couper.
    if (peer) setTimeout(() => peer.destroy(), 200);
    // L'invité rentre chez lui (main.ts : son propre Repaire).
    if (wasClient) this.onLeave('');
    this.changed();
  }

  /** Hôte → tous les invités. */
  broadcast(msg: HostMsg): void {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  /** Hôte → un seul invité. */
  sendTo(id: string, msg: HostMsg): void {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  /** Invité → hôte. */
  send(msg: ClientMsg): void {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  /** Mon Pokémon change dans le lobby. */
  setLoadout(loadout: Loadout): void {
    if (this.role === 'client') this.send({ t: 'loadout', loadout });
    const me = this.players.find((p) => p.id === this.id);
    if (me) me.loadout = loadout;
    if (this.role === 'host') this.syncLobby();
    else this.changed();
  }

  /** Invités prêts à partir (l'hôte compris). */
  get guests(): LobbyPlayer[] {
    return this.players.filter((p) => !p.host);
  }
}

export const net = new Net();
