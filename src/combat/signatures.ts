import type { Actor } from '../entities/actor';
import type { AreaShape } from './combat';

// Attaques signatures des champions : une figure de zones propre à chaque
// arène, que ses Pokémon lancent une fois sur deux à la place de la zone de
// leur type (EnemyBrain.tryArea). Toutes passent par Combat.enemyArea : même
// annonce au sol, mêmes dégâts par cible, mêmes esquives (dash, Abri).
//
// Écart voulu : le jeu Godot n'a pas de signatures, un champion ne se
// distinguait de ses sauvages que par ses barres de PV. Ici chaque combat de
// boss se lit autrement : la cage de Pierre se quitte par sa brèche, la vague
// d'Ondine se traverse en dash, la croix de Major Bob se fuit en diagonale…
//
// Chaque figure tient en moins de 2 s et se lit dès la pose : une seule
// règle à comprendre par champion.

export interface SignatureCtx {
  caster: Actor;
  /** Cible du lanceur (le membre le plus proche, ou celui qui le provoque). */
  target: Actor;
  /** Membres encore debout. */
  alive: readonly Actor[];
  /** Délai de base entre la pose d'une zone et son impact (AREA_DELAY). */
  delay: number;
  /** Pose une zone : `pow` multiplie la puissance de la capacité du lanceur. */
  area: (shape: AreaShape, x: number, y: number, pow: number, delay: number) => void;
  /** Lance `fn` dans `t` s (figures qui suivent l'équipe) ; annulé si le lanceur tombe. */
  later: (t: number, fn: () => void) => void;
  /** Bruitage au moment voulu. */
  quake: (t: number) => void;
}

interface Signature {
  /** Nom affiché au-dessus du lanceur. */
  name: string;
  /**
   * Pose la figure ; rend la durée jusqu'au dernier impact (le lanceur tient
   * la pose jusque-là), ou null si elle n'atteindrait personne d'ici.
   */
  cast: (c: SignatureCtx) => number | null;
}

const dist = (a: Actor, b: Actor) => Math.hypot(b.x - a.x, b.y - a.y);
/** Direction unitaire du lanceur vers sa cible. */
function aim(c: SignatureCtx): [number, number] {
  const d = dist(c.caster, c.target) || 1;
  return [(c.target.x - c.caster.x) / d, (c.target.y - c.caster.y) / d];
}
/** Quelqu'un à moins de `r` du lanceur ? (figures centrées sur lui) */
const near = (c: SignatureCtx, r: number) => c.alive.some((m) => dist(c.caster, m) <= r);
/** Au plus 3 membres visés : à six, la salle deviendrait un tapis rouge illisible. */
const victims = (c: SignatureCtx) => [c.target, ...c.alive.filter((m) => m !== c.target)].slice(0, 3);

export const SIGNATURES: Record<string, Signature> = {
  // Une cage de rochers autour de chaque membre, ouverte d'un côté au hasard,
  // puis un gros bloc au centre : on sort par la brèche (ou en dash).
  Pierre: {
    name: 'Éboulement',
    cast(c) {
      const slots = 8;
      for (const m of victims(c)) {
        const gap = Math.floor(Math.random() * slots);
        for (let i = 0; i < slots; i++) {
          if (i === gap || i === (gap + 1) % slots) continue;
          const a = (i / slots) * Math.PI * 2;
          c.area({ kind: 'circle', r: 0.85 }, m.x + Math.cos(a) * 2, m.y + Math.sin(a) * 2, 0.6, c.delay + i * 0.03);
        }
        c.area({ kind: 'circle', r: 1.4 }, m.x, m.y, 1, c.delay + 0.5);
      }
      c.quake(c.delay + 0.5);
      return c.delay + 0.5;
    },
  },
  // Un front de vague qui avance depuis Ondine vers sa cible, bande après
  // bande, sur 14 cases de large : on le traverse en dash au bon moment, ou
  // l'on passe derrière elle.
  Ondine: {
    name: 'Surf',
    cast(c) {
      if (dist(c.caster, c.target) > 10) return null;
      const [dx, dy] = aim(c);
      const bands = 6;
      for (let k = 0; k < bands; k++) {
        const along = 1.2 + k * 1.7;
        const cx = c.caster.x + dx * along;
        const cy = c.caster.y + dy * along;
        // Bande perpendiculaire à la visée : rayon tracé de -dy,dx… depuis 7 cases sur le côté.
        c.area({ kind: 'line', len: 14, halfW: 0.85, dx: -dy, dy: dx }, cx + dy * 7, cy - dx * 7, 0.8, c.delay + k * 0.22);
      }
      return c.delay + (bands - 1) * 0.22;
    },
  },
  // Quatre éclairs en croix depuis Major Bob, puis la croix tournée de 45° :
  // la case sûre change, il faut bouger entre les deux.
  'Major Bob': {
    name: 'Cage-Éclair',
    cast(c) {
      if (dist(c.caster, c.target) > 10) return null;
      const base = Math.atan2(c.target.y - c.caster.y, c.target.x - c.caster.x);
      for (const [turn, t] of [[0, c.delay], [Math.PI / 4, c.delay + 0.6]] as const) {
        for (let i = 0; i < 4; i++) {
          const a = base + turn + (i * Math.PI) / 2;
          c.area({ kind: 'line', len: 10, halfW: 0.55, dx: Math.cos(a), dy: Math.sin(a) }, c.caster.x, c.caster.y, 0.9, t);
        }
      }
      return c.delay + 0.6;
    },
  },
  // Deux bras de pétales en spirale qui partent d'Erika : on s'écarte du
  // bras qui arrive plutôt que de fuir tout droit.
  Erika: {
    name: 'Danse-Fleur',
    cast(c) {
      if (!near(c, 7)) return null;
      const n = 10;
      const start = Math.random() * Math.PI * 2;
      for (const arm of [0, Math.PI]) {
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const a = start + arm + u * Math.PI * 1.5;
          const r = 1.4 + u * 5;
          c.area({ kind: 'circle', r: 0.9 }, c.caster.x + Math.cos(a) * r, c.caster.y + Math.sin(a) * r, 0.7, c.delay + i * 0.1);
        }
      }
      return c.delay + (n - 1) * 0.1;
    },
  },
  // Des flaques sous les membres, qui piquent quatre fois de suite : un
  // sol empoisonné à quitter, pas un coup à esquiver une fois.
  Koga: {
    name: 'Toxik',
    cast(c) {
      const ticks = 4;
      for (const m of victims(c)) {
        const a = Math.random() * Math.PI * 2;
        const x = m.x + Math.cos(a) * 0.5;
        const y = m.y + Math.sin(a) * 0.5;
        for (let k = 0; k < ticks; k++) c.area({ kind: 'circle', r: 1.5 }, x, y, 0.35, c.delay + k * 0.5);
      }
      return c.delay + (ticks - 1) * 0.5;
    },
  },
  // Trois salves de disques posés là où chaque membre se tient À CET
  // INSTANT : rester immobile, c'est prendre les trois.
  Morgane: {
    name: 'Prémonition',
    cast(c) {
      const salvo = () => {
        for (const m of victims(c)) {
          if (m.pokemon && !m.pokemon.fainted && m.deathT < 0) c.area({ kind: 'circle', r: 1.2 }, m.x, m.y, 0.7, c.delay);
        }
      };
      salvo();
      c.later(0.55, salvo);
      c.later(1.1, salvo);
      return 1.1 + c.delay;
    },
  },
  // Un anneau de feu autour d'Auguste (sûr tout contre lui ou loin), puis
  // une explosion sur lui-même : on rentre, puis on ressort.
  Auguste: {
    name: 'Déflagration',
    cast(c) {
      if (!near(c, 6)) return null;
      const { x, y } = c.caster;
      c.area({ kind: 'ring', r0: 1.7, r: 4.8 }, x, y, 0.9, c.delay);
      c.area({ kind: 'circle', r: 2.2 }, x, y, 1.1, c.delay + 0.65);
      return c.delay + 0.65;
    },
  },
  // Des ondes qui s'éloignent de Giovanni, couronne après couronne : on les
  // saute en dash, ou l'on court plus vite qu'elles.
  Giovanni: {
    name: 'Séisme',
    cast(c) {
      if (!near(c, 8)) return null;
      const { x, y } = c.caster;
      const rings = [0, 2, 3.8, 5.6, 7.4];
      for (let k = 0; k + 1 < rings.length; k++) {
        c.area({ kind: 'ring', r0: rings[k], r: rings[k + 1] }, x, y, 0.85, c.delay + k * 0.3);
        c.quake(c.delay + k * 0.3);
      }
      return c.delay + (rings.length - 2) * 0.3;
    },
  },
  // Trois Roulades, chacune visée sur la position de la cible au moment où
  // elle part : on esquive de côté au dernier moment, trois fois.
  Blanche: {
    name: 'Roulade',
    cast(c) {
      if (dist(c.caster, c.target) > 11) return null;
      const roll = () => {
        const [dx, dy] = aim(c);
        c.area({ kind: 'line', len: 11, halfW: 0.9, dx, dy }, c.caster.x, c.caster.y, 0.8, c.delay * 0.8);
      };
      roll();
      c.later(0.6, roll);
      c.later(1.2, roll);
      return 1.2 + c.delay * 0.8;
    },
  },
  // Trois rafales en cône qui balaient d'un flanc à l'autre de la visée
  // d'Olga : on se glisse derrière la rafale qui vient de passer.
  Olga: {
    name: 'Blizzard',
    cast(c) {
      if (dist(c.caster, c.target) > 8) return null;
      const base = Math.atan2(c.target.y - c.caster.y, c.target.x - c.caster.x);
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let k = 0; k < 3; k++) {
        const a = base + side * (k - 1) * 0.75;
        c.area({ kind: 'cone', r: 7.5, half: 0.42, dx: Math.cos(a), dy: Math.sin(a) }, c.caster.x, c.caster.y, 0.8, c.delay + k * 0.35);
      }
      return c.delay + 0.7;
    },
  },
};
