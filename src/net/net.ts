import Peer, { type DataConnection } from 'peerjs';
import type { Move } from '../combat/moves';
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
/** Un hôte et un invité de versions différentes ne se comprendraient pas (Net._reject_version). */
export const NET_VERSION = 1;

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
}

/** Ce que l'invité envoie à l'hôte. */
export type ClientMsg =
  | { t: 'hello'; version: number; loadout: Loadout }
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
    };

/** De quoi régénérer la carte chez l'invité : la génération est déterministe. */
export type WorldKey =
  | { kind: 'room'; biome: string; seed: number; store: boolean; cave: boolean; layout?: string; mouthUsed: boolean }
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
      hud: { place: string; money: number; fade: number; boss: { name: string; sub: string; ace: boolean; bars: number; barsLeft: number; ratio: number } | null };
    }
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
  | { t: 'end'; won: boolean; rooms: number; baies: number }
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
    const peer = new Peer(PREFIX + code);
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
    conn.on('open', () => {
      if (this.players.length >= MAX_PLAYERS || this.inRun) {
        conn.send({ t: 'reject', reason: this.inRun ? 'La run a déjà commencé.' : 'La partie est pleine (six joueurs).' } satisfies HostMsg);
        setTimeout(() => conn.close(), 500);
        return;
      }
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
        if (!this.players.some((p) => p.id === conn.peer)) this.players.push({ id: conn.peer, host: false, loadout: msg.loadout });
        this.syncLobby();
        this.onJoin(conn.peer);
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
    this.status = 'Connexion à l’hôte…';
    this.changed();
    const peer = new Peer();
    this.peer = peer;
    return new Promise((resolve) => {
      const fail = (why: string) => {
        if (this.peer !== peer) return resolve();
        this.leave(why);
        this.changed();
        resolve();
      };
      peer.on('error', (err) => fail(err.type === 'peer-unavailable' ? `Aucune partie ouverte sous le code ${clean}.` : `Connexion impossible (${err.type}).`));
      peer.on('open', (id) => {
        this.id = id;
        const conn = peer.connect(PREFIX + clean, { reliable: true });
        this.hostConn = conn;
        const timer = setTimeout(() => fail('L’hôte ne répond pas.'), 12000);
        conn.on('open', () => {
          clearTimeout(timer);
          this.status = '';
          conn.send({ t: 'hello', version: NET_VERSION, loadout } satisfies ClientMsg);
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
        conn.on('close', () => this.hostGone('L’hôte a fermé la partie.'));
        conn.on('error', () => this.hostGone('Connexion à l’hôte perdue.'));
      });
    });
  }

  private hostGone(reason: string): void {
    if (this.role !== 'client') return;
    this.leave(reason);
  }

  /** Quitte la partie (l'hôte la ferme pour tout le monde). */
  leave(reason = ''): void {
    const wasClient = this.role === 'client';
    if (this.role === 'host') this.broadcast({ t: 'bye', reason: 'L’hôte a fermé la partie.' });
    const peer = this.peer;
    this.peer = null;
    this.hostConn = null;
    this.conns.clear();
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
