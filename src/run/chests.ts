import { sfx } from '../audio/audio';
import { loadImage } from '../assets/pmd';
import { hash2 } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { InputSample } from '../input/input';
import { CS_LIST, type CsId, type ResourceId } from '../meta/catalog';
import { rollMaterials } from '../meta/crafting';
import type { CombatFx } from '../render/combatfx';
import type { WorldMap } from '../world/generate';
import { CHEST, CHEST_OPEN, TILE } from '../world/tiles';
import type { Run } from './run';

// Coffre des salles de run (A-FAIRE 1.5 ; Chest.gd et les déclencheurs de CS
// de CombatArena). La génération le pose dans deux salles sur trois
// (WorldMap.chest), le plus souvent au fond d'une alcôve de rochers dont un
// obstacle est la seule entrée : un arbuste à couper (CS Coupe) ou un rocher
// fissuré (CS Éclate-Roc), selon le biome. Devant, [E] le lève si l'on a la
// CS : la planche Essentials (Characters/Object tree 1.png, Object rock.png ;
// 4 × 4 cases de 32 px, colonne 0, rangées 0 → 3 : intact, frappé, qui
// éclate, débris) se joue à 0,12 s l'image, un nuage, et la case se libère.
// Puis [E] devant le coffre l'ouvre.
//
// Écarts voulus :
// - Le coffre ne donne pas d'objet tenu (le Repaire en vend déjà) mais des
//   Baies et des ressources de construction — Bois, Pierre, Nourriture —
//   qui paient les aménagements du bâtisseur (catalog.ts, BUILDINGS) ; et
//   (ajout, retour de test : « chaque biome a ses matériaux ») le matériau du
//   biome, pour l'atelier
//   (meta/crafting.ts).
// - [E] sert aussi pour la CS (Godot avait une touche à part), et sans la
//   CS l'invite dit ce qui manque (Godot n'affichait rien).
// - Éclate-Roc brise les rochers que Godot faisait casser par Force.

/** Portée de l'invite, en cases (comme le coffre de grotte). */
const REACH = 1.4;
/** CombatArena._CS_BREAK_FRAME_TIME */
const FRAME_TIME = 0.12;
const CELL = 32;
const SCALE = 0.5;

/** Le contenu d'un coffre : des Baies, des ressources, et des matériaux d'artisan. */
export interface Loot {
  baies: number;
  res: Partial<Record<ResourceId, number>>;
  mats: Record<string, number>;
}

/**
 * Tirage déterministe d'un coffre (Godot : graine « chest:zone:x:y ») : un
 * coffre gardé rapporte plus qu'un coffre à découvert. La ressource
 * principale suit la garde du biome — du bois derrière un arbuste, de la
 * pierre derrière un rocher — et la nourriture vient en plus.
 */
export function rollLoot(seed: number, x: number, y: number, act: number, guarded: boolean, main: 'wood' | 'stone'): Omit<Loot, 'mats'> {
  let n = 0;
  const r = (k: number) => Math.floor(hash2(x, y, seed + 977 * ++n) * k);
  return guarded
    ? { baies: 10 + 4 * act + r(6), res: { [main]: 8 + r(7), food: 3 + r(4) } }
    : { baies: 6 + 2 * act + r(5), res: { [main]: 4 + r(4), food: r(3) } };
}

export interface ChestHost {
  /** Crédite le contenu du coffre (sauvegarde comprise) et l'annonce. */
  loot(loot: Loot): void;
}

const OBSTACLE: Record<'cut' | 'rock-smash', { file: string; verb: string; what: string }> = {
  cut: { file: 'Object tree 1.png', verb: 'Couper l’arbuste', what: 'Un arbuste barre l’alcôve' },
  'rock-smash': { file: 'Object rock.png', verb: 'Briser le rocher', what: 'Un rocher fissuré barre l’alcôve' },
};

export class ChestSite {
  private world: WorldMap | null = null;
  private chest: NonNullable<WorldMap['chest']> | null = null;
  /** Ressource principale du coffre (garde du biome). */
  private main: 'wood' | 'stone' = 'wood';
  /** Obstacle : null s'il n'y en a pas (ou plus) ; `t` ≥ 0 pendant qu'il éclate. */
  private obstacle: { kind: 'cut' | 'rock-smash'; t: number } | null = null;
  private opened = false;
  private near: 'obstacle' | 'chest' | null = null;
  private readonly sheets = new Map<string, HTMLImageElement>();
  private readonly prompt: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly fx: CombatFx,
    private readonly host: ChestHost,
  ) {
    this.prompt = document.createElement('div');
    this.prompt.className = 'shop-prompt da-paper';
    this.prompt.hidden = true;
    parent.append(this.prompt);
    for (const { file } of Object.values(OBSTACLE)) {
      void loadImage(`/game/assets/essentials/objects/${encodeURIComponent(file)}`).then((img) => this.sheets.set(file, img), () => {});
    }
  }

  /** Coffre de la salle qu'on vient de générer (une sur trois n'en a pas, la boutique jamais). */
  build(world: WorldMap): void {
    this.clear();
    if (!world.chest) return;
    this.world = world;
    this.chest = world.chest;
    this.main = world.biome.guard === 'cut' ? 'wood' : 'stone';
    this.obstacle = world.chest.guard ? { kind: world.chest.guard, t: -1 } : null;
  }

  clear(): void {
    this.world = this.chest = this.obstacle = null;
    this.opened = false;
    this.near = null;
    this.renderPrompt(null);
  }

  /** Masque l'invite (grotte, Repaire, écran ouvert) sans rien oublier de la salle. */
  hide(): void {
    this.near = null;
    this.renderPrompt(null);
  }

  update(dt: number, input: InputSample, player: Actor, run: Run): void {
    const c = this.chest;
    if (!c || !this.world) return this.hide();
    const ob = this.obstacle;
    if (ob && ob.t >= 0) {
      const before = ob.t;
      ob.t += dt;
      // Le nuage part quand il éclate (CombatArena._play_cs_effect).
      if (before < FRAME_TIME * 2 && ob.t >= FRAME_TIME * 2) this.fx.poof(c.x + 0.5, c.y + 1.6);
      // Dernière image (les débris) tenue le temps du nuage, puis la case est libre.
      if (ob.t >= FRAME_TIME * 4 + 0.25) this.obstacle = null;
    }
    // L'obstacle s'aborde depuis la case au sud de la sienne ; le coffre, depuis la sienne une fois levée.
    const front = { x: c.x + 0.5, y: c.y + (this.obstacle ? 2.5 : 1.5) };
    const close = Math.hypot(player.x - front.x, player.y - front.y) < REACH;
    this.near = !close ? null : this.obstacle ? (this.obstacle.t < 0 ? 'obstacle' : null) : this.opened ? null : 'chest';
    const missing = this.obstacle && !run.cs.includes(this.obstacle.kind) ? this.obstacle.kind : null;
    this.renderPrompt(this.near === 'obstacle' && this.obstacle ? (missing ? `${OBSTACLE[this.obstacle.kind].what} — il faut la CS ${csName(missing)} (Étude d’Alakazam)` : `[E] ${OBSTACLE[this.obstacle.kind].verb} (CS ${csName(this.obstacle.kind)})`) : this.near === 'chest' ? '[E] Ouvrir le coffre' : null);
    if (!input.interact || !this.near) return;
    if (this.near === 'obstacle' && this.obstacle && !missing) this.breakObstacle(this.obstacle);
    else if (this.near === 'chest') this.open(run);
  }

  private breakObstacle(ob: { kind: 'cut' | 'rock-smash'; t: number }): void {
    const { x, y } = this.chest!;
    const W = this.world!;
    ob.t = 0;
    sfx(ob.kind === 'cut' ? 'cut' : 'rockSmash');
    this.fx.impact(x + 0.5, y + 1.6, ob.kind === 'cut' ? '#7cc24a' : '#b8a888');
    // La case se libère tout de suite : on n'attend pas la fin de l'animation pour avancer.
    const i = (y + 1) * W.w + x;
    W.blocked[i] = W.solid[i] = 0;
    W.reachable[i] = 1;
  }

  private open(run: Run): void {
    const c = this.chest!;
    this.opened = true;
    const obj = this.world!.objects.find((o) => o.sprite === CHEST && Math.floor(o.x / TILE) === c.x && Math.round(o.y / TILE) === c.y + 1);
    if (obj) obj.sprite = CHEST_OPEN;
    sfx('chest');
    this.fx.attackAnim('fx_boost', c.x + 0.5, c.y + 0.9);
    const guarded = c.guard !== null;
    this.host.loot({ ...rollLoot(run.mapSeed, c.x, c.y, run.act, guarded, this.main), mats: rollMaterials(run.mapSeed, c.x, c.y, this.world!.biome.id, guarded) });
  }

  /** L'obstacle, trié avec les acteurs et le décor. */
  extras(): { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[] {
    const c = this.chest;
    const ob = this.obstacle;
    const sheet = ob && this.sheets.get(OBSTACLE[ob.kind].file);
    if (!c || !ob || !sheet) return [];
    return [
      {
        y: (c.y + 2) * TILE,
        draw: (b, camX, camY, k) => {
          const row = ob.t < 0 ? 0 : Math.min(3, Math.floor(ob.t / FRAME_TIME));
          const s = CELL * SCALE * k;
          const cx = (c.x + 0.5) * TILE;
          const foot = (c.y + 2) * TILE;
          b.drawImage(sheet, 0, row * CELL, CELL, CELL, Math.round((cx - camX) * k - s / 2), Math.round((foot - camY) * k - s + 1 * k), Math.round(s), Math.round(s));
        },
      },
    ];
  }

  private renderPrompt(hint: string | null): void {
    const key = hint ?? '';
    if (this.prompt.dataset.key === key && this.prompt.hidden === !hint) return;
    this.prompt.dataset.key = key;
    this.prompt.hidden = !hint;
    if (hint) this.prompt.replaceChildren(Object.assign(document.createElement('div'), { className: 'shop-hint', textContent: hint }));
  }
}

const csName = (id: CsId) => CS_LIST.find((c) => c.id === id)?.name ?? id;
