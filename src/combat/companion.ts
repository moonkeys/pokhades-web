import { PLAYER_SPEED, type Actor } from '../entities/actor';
import type { WorldMap } from '../world/generate';
import type { Combat } from './combat';
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

const AI_SPEED = 7.5;
const AI_SEEK_RADIUS = 18.75;
const AI_FOLLOW_DIST = 5.6;
const REGROUP_DIST = 22;

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

    const target = this.nearestEnemy(enemies);
    if (target) {
      const slot = this.pickMove(enemies, combat);
      const d = Math.hypot(target.x - a.x, target.y - a.y);
      if (d <= combat.reach(a, slot)) {
        combat.companionAttack(a, slot, target, enemies);
        return { mx: 0, my: 0 };
      }
      return this.steer(dt, world, target.x, target.y);
    }
    if (Math.hypot(leader.x - a.x, leader.y - a.y) > AI_FOLLOW_DIST) return this.steer(dt, world, leader.x, leader.y);
    return { mx: 0, my: 0 };
  }

  /** L'ennemi visible le plus proche dans le rayon de recherche (un sauvage caché dans l'herbe ne compte pas). */
  private nearestEnemy(enemies: readonly Actor[]): Actor | null {
    const a = this.actor;
    let best: Actor | null = null;
    let bestD = AI_SEEK_RADIUS;
    for (const e of enemies) {
      if (!e.pokemon || e.pokemon.fainted || e.deathT >= 0 || e.hidden || e.intro) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** TeamMember._companion_pick_move : une capacité prête, sinon celle dont la recharge finit le plus tôt. */
  private pickMove(enemies: readonly Actor[], combat: Combat): number {
    const a = this.actor;
    const n = Math.min(a.pokemon?.moves.length ?? 0, 4);
    if (n <= 0) return 0;
    let best = 0;
    for (let i = 0; i < n; i++) {
      if (combat.canLaunch(a, enemies, i)) return i;
      if (a.atk.moveCd[i] < a.atk.moveCd[best]) best = i;
    }
    return best;
  }

  private steer(dt: number, world: WorldMap, tx: number, ty: number): { mx: number; my: number } {
    const a = this.actor;
    const dir = this.nav.direction(dt, world, a.x, a.y, tx, ty, a.canSwim);
    const k = AI_SPEED / PLAYER_SPEED;
    return { mx: dir.x * k, my: dir.y * k };
  }
}
