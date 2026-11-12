import { PLAYER_SPEED, type Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import type { Combat } from './combat';
import { typeMultiplier } from './damage';
import { NavAgent } from './nav';

// IA d'un compagnon, reprise de TeamMember._companion_process : un membre de
// l'équipe qu'on ne joue pas. S'il voit un ennemi à moins de 18,75 cases, il
// choisit une capacité prête (la première dont la portée minimale est
// respectée, sinon celle qui revient le plus tôt), s'en approche jusqu'à sa
// portée et la lance ; sinon il rejoint le Pokémon joué dès qu'il s'en
// éloigne de plus de 5,6 cases. Il marche à 7,5 cases/s (le joueur à 9,4), et
// contourne les obstacles comme les sauvages (nav.ts).
//
// Écart voulu avec le jeu : un compagnon resté très loin (plus de 22 cases,
// coincé derrière un obstacle) est ramené auprès du Pokémon joué, au lieu de
// chercher son chemin indéfiniment.
//
// Plus malin (retour de test du 11 novembre 2026 : « ils se lancent dans le
// tas ») :
// - il sort des marques des sauvages et des zones des champions avant
//   qu'elles frappent (Combat.threatAt) ;
// - il ne court pas après un ennemi à plus de LEASH cases du Pokémon joué, et
//   s'occupe d'abord de ceux qui le serrent de près, puis des affaiblis ;
// - il choisit l'attaque qui fait le plus mal à sa cible (puissance, type,
//   même type que lui), pas la première prête ;
// - avec une attaque à distance, il garde ses distances (recule sous
//   KITE_MIN cases) ; blessé (moins de LOW_HP de ses PV), il ne va plus au
//   contact et revient près du Pokémon joué.

const AI_SPEED = 7.5;
const AI_SEEK_RADIUS = 18.75;
const AI_FOLLOW_DIST = 5.6;
const REGROUP_DIST = 22;
/** Au-delà, un ennemi est laissé au Pokémon joué : le compagnon ne s'éloigne pas tant de lui. */
const LEASH = 9;
/** Un tireur recule s'il a un ennemi plus près que ça. */
const KITE_MIN = 2.6;
/** Part de PV sous laquelle il se replie. */
const LOW_HP = 0.3;
/** Un ennemi à moins de ça du Pokémon joué le menace : prioritaire. */
const GUARD = 3.5;

export class CompanionBrain {
  private readonly nav = new NavAgent();

  constructor(private readonly actor: Actor) {}

  reset(): void {
    this.nav.reset();
  }

  /**
   * Décide ce que fait le compagnon ce pas-ci. Rend sa marche, en fraction de
   * la vitesse du joueur (Actor.updatePlayer l'applique) ; lance l'attaque
   * elle-même quand la cible est à portée.
   */
  update(dt: number, leader: Actor, enemies: readonly Actor[], world: WorldMap, combat: Combat): { mx: number; my: number } {
    const a = this.actor;
    const mon = a.pokemon;
    if (!mon || a.deathT >= 0 || !mon.canAct) return { mx: 0, my: 0 };

    if (Math.hypot(leader.x - a.x, leader.y - a.y) > REGROUP_DIST) {
      a.x = a.prevX = leader.x;
      a.y = a.prevY = leader.y;
      this.nav.reset();
      return { mx: 0, my: 0 };
    }

    // 1. Sortir de ce qui va frapper.
    const threat = combat.threatAt(a.x, a.y);
    if (threat) {
      let ex = a.x - threat.x;
      let ey = a.y - threat.y;
      if (Math.hypot(ex, ey) < 0.2) {
        // Pile au centre : de côté par rapport au Pokémon joué.
        ex = -(leader.y - a.y) || 1;
        ey = leader.x - a.x;
      }
      const l = Math.hypot(ex, ey) || 1;
      return this.steer(dt, world, a.x + (ex / l) * 2.5, a.y + (ey / l) * 2.5, 1.15);
    }

    const hurt = mon.hp < mon.maxHp * LOW_HP;
    const target = this.pickTarget(enemies, leader);
    if (target) {
      const slot = this.pickMove(enemies, combat, target);
      const ranged = mon.moves[slot]?.damageClass === 'special';
      const reach = combat.reach(a, slot);
      const d = Math.hypot(target.x - a.x, target.y - a.y);
      // 2. Un tireur recule devant qui l'approche (s'il le peut, sinon il tire).
      if (ranged && d < KITE_MIN && !combat.threatAt(a.x + ((a.x - target.x) / (d || 1)) * 1.5, a.y + ((a.y - target.y) / (d || 1)) * 1.5)) {
        if (combat.canLaunch(a, enemies, slot)) combat.companionAttack(a, slot, target, enemies);
        return this.steer(dt, world, a.x + ((a.x - target.x) / (d || 1)) * 2, a.y + ((a.y - target.y) / (d || 1)) * 2);
      }
      if (d <= reach) {
        combat.companionAttack(a, slot, target, enemies);
        return { mx: 0, my: 0 };
      }
      // 3. Blessé et sans tir : il ne s'avance plus, il reste près du Pokémon joué.
      if (!(hurt && !ranged)) {
        // Un tireur s'approche juste assez pour toucher.
        if (!ranged || d > reach * 0.85) return this.steer(dt, world, target.x, target.y);
        return { mx: 0, my: 0 };
      }
    }
    const follow = hurt ? 2.5 : AI_FOLLOW_DIST;
    if (Math.hypot(leader.x - a.x, leader.y - a.y) > follow) return this.steer(dt, world, leader.x, leader.y);
    return { mx: 0, my: 0 };
  }

  /**
   * La cible : un ennemi visible, dans le rayon de recherche, pas trop loin du
   * Pokémon joué. Le plus proche de lui-même, mais ceux qui serrent le Pokémon
   * joué passent devant, et un ennemi affaibli attire (on l'achève).
   */
  private pickTarget(enemies: readonly Actor[], leader: Actor): Actor | null {
    const a = this.actor;
    let best: Actor | null = null;
    let bestScore = Infinity;
    for (const e of enemies) {
      if (!e.pokemon || e.pokemon.fainted || e.deathT >= 0 || e.hidden || e.intro) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      const dl = Math.hypot(e.x - leader.x, e.y - leader.y);
      if (d > AI_SEEK_RADIUS || dl > LEASH + 4) continue;
      const hp = e.pokemon.hp / Math.max(1, e.pokemon.maxHp);
      const score = d + 0.5 * dl - (dl < GUARD ? 4 : 0) - (1 - hp) * 3;
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * TeamMember._companion_pick_move, en mieux : parmi les capacités prêtes,
   * celle qui frappe le plus fort cette cible (puissance × efficacité ×
   * bonus de même type) ; une capacité de statut passe après. Rien de prêt :
   * celle qui revient le plus tôt.
   */
  private pickMove(enemies: readonly Actor[], combat: Combat, target: Actor): number {
    const a = this.actor;
    const mon = a.pokemon;
    const n = Math.min(mon?.moves.length ?? 0, 4);
    if (!mon || n <= 0) return 0;
    let best = -1;
    let bestScore = -1;
    let soonest = 0;
    for (let i = 0; i < n; i++) {
      if (a.atk.moveCd[i] < a.atk.moveCd[soonest]) soonest = i;
      if (!combat.canLaunch(a, enemies, i)) continue;
      const m = mon.moves[i];
      const score = m.power > 0 ? m.power * typeMultiplier(m.type, target.pokemon?.types ?? []) * (mon.types.includes(m.type) ? 1.5 : 1) : 25;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best >= 0 ? best : soonest;
  }

  /** `boost` : allure en plus (pour fuir une marque). */
  private steer(dt: number, world: WorldMap, tx: number, ty: number, boost = 1): { mx: number; my: number } {
    const a = this.actor;
    const dir = this.nav.direction(dt, world, a.x, a.y, tx, ty, a.canSwim);
    const k = (AI_SPEED / PLAYER_SPEED) * boost;
    return { mx: dir.x * k, my: dir.y * k };
  }
}
