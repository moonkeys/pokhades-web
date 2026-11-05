import { sfx } from '../audio/audio';
import { loadImage } from '../assets/pmd';
import { hash2 } from '../core/rng';
import type { CombatFx } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { TILE } from '../world/tiles';

// Arbres à baies (A-FAIRE 1.4 ; BerryTree.gd et BerryPickup.gd du jeu Godot).
// La génération en pose deux ou trois par salle (WorldMap.berries), tous de
// la baie du biome (Biome.berry). On les frappe — corps à corps ou tir, peu
// importe — : au second coup, l'arbre lâche 2 à 4 baies qui sautillent
// autour de lui ; on marche dessus pour les ramasser, 3 Baies chacune (la
// monnaie permanente, comme l'or des sauvages). Elles pourrissent au bout de
// 25 s. Avec l'Aimant à Baies d'Alakazam, celles à moins de 7 cases filent
// vers le joueur, d'autant plus vite qu'il est près.
//
// La planche Essentials (Characters/berrytree_<BAIE>.png) : 4×4 cases de
// 32×64, une rangée par stade de pousse (pousse, plant, en fleur, mûr), une
// colonne par image de balancement. Dessinée à demi-échelle, comme les
// dresseurs : un arbre d'une case de large sur deux de haut.
//
// Écarts voulus :
// - Godot libérait l'arbre une fois cueilli ; ici il reste debout, en fleur
//   (rangée 2, sans baies) : il garde sa case bloquée, et la salle ne perd
//   pas d'un coup un repère qu'on venait de contourner.
// - Une seule baie par biome (Godot tirait parmi trois), et une baie pour la
//   Plage, que Godot n'avait pas.

const CELL_W = 32;
const CELL_H = 64;
const SCALE = 0.5;
/** BerryTree.gd : 2 coups. */
const TREE_HP = 2;
/** BerryPickup.VALUE vaut 3. Écart voulu (retour de test : trop de Baies en fin de run) : 1. */
const VALUE = 1;
/** BerryPickup.LIFETIME, en secondes ; elles clignotent les 3 dernières. */
const LIFETIME = 25;
/** Distance de ramassage, en cases (Godot 1,1 en unités 3D : un peu moins ici, il faut marcher dessus). */
const PICK = 0.7;
/** BerryPickup : portée et vitesse de l'aimant. */
const MAGNET_RANGE = 7;
const MAGNET_SPEED = 12;
/** Pesanteur du bond des baies, en cases/s². */
const GRAVITY = 22;
/** Taille d'une baie au sol, en pixels du monde (icône Essentials de 48 px). */
const ICON = 12;

interface Tree {
  x: number;
  y: number;
  hp: number;
  /** Secousse du dernier coup, en secondes restantes. */
  shake: number;
  /** Décalage du balancement, pour que deux arbres voisins ne battent pas la mesure ensemble. */
  phase: number;
}

interface Drop {
  x: number;
  y: number;
  /** Hauteur du saut, en cases. */
  h: number;
  vh: number;
  vx: number;
  vy: number;
  age: number;
}

export interface BerryHost {
  fx: CombatFx;
  /** Crédite des Baies (sauvegarde comprise). */
  earn(n: number): void;
}

export class BerryGrove {
  private trees: Tree[] = [];
  private drops: Drop[] = [];
  private world: WorldMap | null = null;
  private sheet: HTMLImageElement | null = null;
  private icon: HTMLImageElement | null = null;
  private berry = '';
  private clock = 0;

  constructor(private readonly host: BerryHost) {}

  /** Arbres de la salle qu'on vient de générer (aucun si le biome n'a pas de baie). */
  build(world: WorldMap, berry: string | undefined): void {
    this.clear();
    if (!berry || !world.berries?.length) return;
    this.world = world;
    this.trees = world.berries.map(({ x, y }) => ({ x, y, hp: TREE_HP, shake: 0, phase: (x * 7 + y * 13) % 4 }));
    if (berry !== this.berry) {
      this.berry = berry;
      this.sheet = this.icon = null;
      void loadImage(`/game/assets/essentials/berries/berrytree_${berry}.png`).then((img) => berry === this.berry && (this.sheet = img), () => {});
      void loadImage(`/game/assets/essentials/items/${berry}.png`).then((img) => berry === this.berry && (this.icon = img), () => {});
    }
  }

  clear(): void {
    this.trees = [];
    this.drops = [];
    this.world = null;
  }

  /**
   * Un coup porté en (x, y) avec une allonge `reach` (en cases) : frappe
   * l'arbre encore chargé le plus proche, et rend le point touché (pour
   * l'impact et l'élan de l'attaque), sinon null. Un arbre déjà cueilli ne
   * réagit plus : le coup part dans le vide, ou bute sur sa case bloquée.
   */
  hit(x: number, y: number, reach: number): { x: number; y: number } | null {
    let best: Tree | null = null;
    let bd = reach;
    for (const t of this.trees) {
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x + 0.5 - x, t.y + 0.6 - y);
      if (d <= bd) {
        bd = d;
        best = t;
      }
    }
    if (!best) return null;
    const p = { x: best.x + 0.5, y: best.y + 0.6 };
    best.shake = 0.3;
    best.hp--;
    this.host.fx.impact(p.x, p.y, '#7cc24a');
    if (best.hp <= 0) {
      // BerryTree._break : 2 à 4 baies et un nuage vert. Le nombre (le gain) est
      // figé par la case de l'arbre, donc par la graine de la salle ; la trajectoire reste libre.
      this.host.fx.poof(p.x, p.y);
      const n = 2 + Math.floor(hash2(best.x, best.y, 4421) * 3);
      for (let i = 0; i < n; i++) this.drop(best);
    }
    return p;
  }

  /** Une baie qui saute du pied de l'arbre vers une case libre autour. */
  private drop(t: Tree): void {
    const W = this.world!;
    const ox = t.x + 0.5;
    const oy = t.y + 1.2;
    // Repli : juste au pied, case toujours libre (la génération l'exige).
    let tx = ox + (Math.random() - 0.5) * 0.6;
    let ty = oy + 0.3;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.9 + Math.random() * 0.8;
      const cx = ox + Math.cos(a) * r;
      const cy = oy + Math.sin(a) * r * 0.8;
      const i = Math.floor(cy) * W.w + Math.floor(cx);
      if (cx < 0 || cy < 0 || cx >= W.w || cy >= W.h || W.blocked[i] || !W.reachable[i]) continue;
      tx = cx;
      ty = cy;
      break;
    }
    // BerryPickup._ready : un petit bond ; la course horizontale dure le temps du saut.
    const vh = 3.2 + Math.random() * 1.2;
    const air = (2 * vh) / GRAVITY;
    this.drops.push({ x: ox, y: oy, h: 0.4, vh, vx: (tx - ox) / air, vy: (ty - oy) / air, age: 0 });
  }

  update(dt: number, player: { x: number; y: number }, magnet: boolean): void {
    this.clock += dt;
    for (const t of this.trees) t.shake = Math.max(0, t.shake - dt);
    for (const d of this.drops) {
      d.age += dt;
      if (d.h > 0 || d.vh > 0) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vh -= GRAVITY * dt;
        d.h += d.vh * dt;
        if (d.h <= 0) d.h = d.vh = 0;
        continue;
      }
      const dx = player.x - d.x;
      const dy = player.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (magnet && dist < MAGNET_RANGE && dist > 0.01) {
        const step = Math.min(dist, MAGNET_SPEED * Math.min(1.5, Math.max(0.3, 1.5 - dist / MAGNET_RANGE)) * dt);
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
      }
      if (Math.hypot(player.x - d.x, player.y - d.y) < PICK) {
        d.age = Infinity;
        sfx('coin');
        this.host.earn(VALUE);
        this.host.fx.number('buff', d.x, d.y, 0, `+${VALUE} Baies`);
      }
    }
    this.drops = this.drops.filter((d) => d.age < LIFETIME);
  }

  /** Arbres et baies au sol, triés avec les acteurs et le décor (ligne de sol = pied). */
  extras(): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const out: { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] = [];
    const sheet = this.sheet;
    if (sheet) {
      for (const t of this.trees) {
        out.push({
          y: (t.y + 1) * TILE,
          draw: (b, camX, camY, k) => {
            const w = CELL_W * SCALE * k;
            const h = CELL_H * SCALE * k;
            const cx = (t.x + 0.5) * TILE;
            const foot = (t.y + 1) * TILE;
            // Mûr : la rangée du bas, balancée lentement ; cueilli : en fleur, sans baies.
            const row = t.hp > 0 ? 3 : 2;
            const col = Math.floor(this.clock * 1.6 + t.phase) % 4;
            const jolt = t.shake > 0 ? Math.sin(t.shake * 60) * t.shake * 4 : 0;
            b.fillStyle = 'rgba(16,24,12,0.28)';
            b.beginPath();
            b.ellipse(Math.round((cx - camX) * k), Math.round((foot - 1 - camY) * k), 6 * k, 2.5 * k, 0, 0, Math.PI * 2);
            b.fill();
            b.drawImage(sheet, col * CELL_W, row * CELL_H, CELL_W, CELL_H, Math.round((cx + jolt - camX) * k - w / 2), Math.round((foot - camY) * k - h + 1 * k), Math.round(w), Math.round(h));
          },
        });
      }
    }
    const icon = this.icon;
    if (icon) {
      for (const d of this.drops) {
        out.push({
          y: d.y * TILE,
          draw: (b, camX, camY, k) => {
            // Les 3 dernières secondes, elles clignotent avant de pourrir.
            if (LIFETIME - d.age < 3 && Math.floor(d.age * 8) % 2) return;
            const px = (d.x * TILE - camX) * k;
            const py = (d.y * TILE - camY) * k;
            b.fillStyle = 'rgba(16,24,12,0.25)';
            b.beginPath();
            b.ellipse(Math.round(px), Math.round(py), 3.5 * k, 1.5 * k, 0, 0, Math.PI * 2);
            b.fill();
            // Posée, elle respire un peu : on la repère dans l'herbe.
            const bob = d.h > 0 ? d.h * TILE : Math.max(0, Math.sin(this.clock * 4 + d.x * 3)) * 1.2;
            const s = ICON * k;
            b.drawImage(icon, Math.round(px - s / 2), Math.round(py - s - bob * k), Math.round(s), Math.round(s));
          },
        });
      }
    }
    return out;
  }
}
