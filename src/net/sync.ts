import { PLAYER_ACTIONS, WILD_ACTIONS, loadInfo, loadSheet } from '../assets/pmd';
import { Pokemon, type Status } from '../combat/pokemon';
import { Actor } from '../entities/actor';
import type { ActorSnap } from './net';

// Les Pokémon sur le terrain, d'un navigateur à l'autre : l'hôte les décrit
// (snap), l'invité les redessine (ClientField). Seul ce qui se voit voyage :
// position, regard, action PMD en cours, PV, statut, K.O.

const ROLE = { wild: 0, champion: 1, boss: 2 } as const;
const ROLE_OF = ['wild', 'champion', 'boss'] as const;
/** Les poses des figurants (boutique, marchand, grotte, mercenaires à vendre). */
const NPC_ACTIONS = ['Sleep', 'Idle', 'Eat', 'Hop', 'Hurt', 'Attack', 'Shoot', 'Charge'];
/** L'invité rattrape la position reçue en ~1/14 s ; au-delà de 3 cases (téléport), il saute. */
const CATCH_UP = 14;
const SNAP_DIST = 3;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Hôte : un numéro stable par acteur, le temps qu'il vive. */
export class NetIds {
  private readonly ids = new WeakMap<Actor, number>();
  private next = 1;

  of(a: Actor): number {
    let n = this.ids.get(a);
    if (n === undefined) this.ids.set(a, (n = this.next++));
    return n;
  }
}

/** Hôte : ce qu'un invité doit savoir d'un Pokémon pour le dessiner. */
export function snapActor(a: Actor, n: number, member: boolean, npc = false): ActorSnap {
  const mon = a.pokemon;
  const s: ActorSnap = {
    n,
    s: a.speciesId,
    x: r2(a.x),
    y: r2(a.y),
    d: a.dir,
    m: a.moving ? 1 : 0,
    hp: mon?.hp ?? 1,
    mh: mon?.maxHp ?? 1,
    lv: mon?.level ?? 5,
    dt: r2(a.deathT),
    sw: a.swimming ? 1 : 0,
    r: npc ? 4 : member ? 3 : ROLE[a.role],
    b: a.bars,
    bl: a.barsLeft,
    h: a.hidden ? 1 : 0,
    tr: a.trapped ? 1 : 0,
  };
  if (a.action) {
    s.a = a.action.anim.name;
    s.at = r2(a.action.t);
  }
  if (a.flash.t > 0) s.fl = [a.flash.color, r2(a.flash.t), a.flash.dur, a.flash.alpha];
  if (mon?.status) s.st = mon.status;
  if (mon) s.nm = mon.name;
  return s;
}

/**
 * Invité : les Pokémon que l'hôte décrit, recréés ici pour le rendu. Ils ne
 * pensent pas : ils rattrapent la position reçue et rejouent l'action PMD.
 */
export class ClientField {
  readonly actors = new Map<number, Actor>();
  private readonly targets = new Map<number, { x: number; y: number }>();
  /** Le n° du Pokémon que je pilote : sa position est la mienne, pas celle de l'hôte. */
  own = -1;

  clear(): void {
    this.actors.clear();
    this.targets.clear();
    this.own = -1;
  }

  /** Les Pokémon de l'instantané, sauf le mien (le joueur local, dessiné à part). */
  list(): Actor[] {
    return [...this.actors.entries()].filter(([n]) => n !== this.own).map(([, a]) => a);
  }

  /** Ennemis (pour le HUD : flèches, cibles). */
  enemies(): Actor[] {
    return this.list().filter((a) => !a.remote);
  }

  apply(snaps: readonly ActorSnap[], me: Actor | null): void {
    const seen = new Set<number>();
    for (const s of snaps) {
      seen.add(s.n);
      if (s.n === this.own && me) {
        applyState(me, s);
        continue;
      }
      let a = this.actors.get(s.n);
      if (!a || a.speciesId !== s.s) {
        const fresh = make(s);
        if (a) {
          fresh.x = fresh.prevX = a.x;
          fresh.y = fresh.prevY = a.y;
        }
        a = fresh;
        this.actors.set(s.n, a);
      }
      this.targets.set(s.n, { x: s.x, y: s.y });
      a.dir = s.d;
      a.moving = !!s.m;
      applyState(a, s);
    }
    for (const n of [...this.actors.keys()]) {
      if (!seen.has(n)) {
        this.actors.delete(n);
        this.targets.delete(n);
      }
    }
  }

  /** Un pas : chacun glisse vers la position reçue, ses minuteurs tournent. */
  update(dt: number): void {
    for (const [n, a] of this.actors) {
      if (n === this.own) continue;
      const t = this.targets.get(n);
      a.prevX = a.x;
      a.prevY = a.y;
      if (t) {
        if (Math.hypot(t.x - a.x, t.y - a.y) > SNAP_DIST) {
          a.x = a.prevX = t.x;
          a.y = a.prevY = t.y;
        } else {
          const k = Math.min(1, dt * CATCH_UP);
          a.x += (t.x - a.x) * k;
          a.y += (t.y - a.y) * k;
        }
      }
      a.tickTimers(dt);
      a.animT += dt;
      if (a.deathT >= 0) a.deathT += dt;
      const target = a.swimming ? 1 : 0;
      a.swimBlend += Math.max(-dt * 4, Math.min(dt * 4, target - a.swimBlend));
    }
  }
}

function make(s: ActorSnap): Actor {
  const a = new Actor(s.s, s.x, s.y);
  const member = s.r === 3;
  const npc = s.r === 4;
  a.role = member || npc ? 'wild' : ROLE_OF[s.r];
  // Un membre d'un joueur ou un figurant : marqué « remote » pour que le HUD ne le prenne pas pour un ennemi.
  if (member || npc) a.remote = npc ? 'npc' : 'net';
  a.canSwim = true;
  void loadSheet(s.s, npc ? NPC_ACTIONS : member ? PLAYER_ACTIONS : WILD_ACTIONS).then((sheet) => (a.sheet = sheet));
  void loadInfo(s.s).then((i) => (a.info = i));
  // Un figurant n'a pas de fiche de combat : ni PV, ni barre.
  if (npc) return a;
  void Pokemon.load(s.s, s.lv, false).then((mon) => {
    mon.fitMaxHp(a.pokemon?.maxHp ?? s.mh);
    mon.hp = a.pokemon?.hp ?? s.hp;
    if (s.nm) mon.rename(s.nm);
    a.pokemon = mon;
  });
  return a;
}

/** Ce qui vient de l'hôte, pour tous (y compris mon Pokémon : PV, K.O., action jouée). */
function applyState(a: Actor, s: ActorSnap): void {
  a.bars = s.b;
  a.barsLeft = s.bl;
  a.hidden = !!s.h;
  a.trapped = !!s.tr;
  a.swimming = !!s.sw;
  const mon = a.pokemon;
  if (mon) {
    mon.fitMaxHp(s.mh);
    mon.hp = s.hp;
    mon.status = (s.st ?? null) as Status | null;
    if (s.nm && mon.name !== s.nm) mon.rename(s.nm);
  }
  // K.O. : un membre se couche (et se relève, ranimé) ; un sauvage s'efface.
  if (s.dt >= 0 && a.deathT < 0) {
    a.deathT = s.dt;
    if (s.r === 3) a.lieDown();
  } else if (s.dt < 0 && a.deathT >= 0) a.getUp();
  if (s.fl) a.flash = { color: s.fl[0], t: s.fl[1], dur: s.fl[2], alpha: s.fl[3] };
  if (s.a && !a.downed) {
    const anim = a.sheet?.actions.get(s.a);
    const at = s.at ?? 0;
    if (anim && (!a.action || a.action.anim !== anim || Math.abs(a.action.t - at) > 0.25)) a.action = { anim, t: at };
    // Un figurant boucle sur sa pose (Sleep, Eat…) entre deux instantanés.
    if (anim && s.r === 4) a.pose = s.a;
  }
}
