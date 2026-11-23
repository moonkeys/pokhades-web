import { sfx } from '../audio/audio';
import { BIOME_CHAMPIONS } from '../data/champions';
import { leagueOpen } from '../meta/feats';
import type { Save } from '../meta/save';
import { CS_LIST } from '../meta/catalog';
import { BIOMES } from '../world/biomes';
import { TILE } from '../world/tiles';
import { VICTORY_ROAD } from '../world/worldmap';
import { MW, MH, ZONES, paintPlan, type Region } from './worldplan';
import { ShoreWaves } from '../render/shorewaves';
import type { WorldMap } from '../world/generate';
import { hint } from './hints';

// Le plan du monde et le carnet des exploits (ajout), au Repaire.
// Retour de test : « je ne vais pas ajouter encore une touche » ; « un panneau
// avec un plan, juste avant de partir » ; « le carnet est trop chargé, illisible ».
// Il n'y a donc plus de touche : on lit le plan sur le panneau à côté de
// l'arche du départ (camp.ts, `board`), et l'on réclame les exploits à Xatu,
// le chroniqueur, juste à côté. (Le carnet est depuis un écran du Repaire comme les autres,
// avec Xatu sur le côté : ui/campscreen.ts, renderFeats.)
//
// Le plan est peint avec les tuiles du jeu (retour de test : « l'image est un
// peu basique ») : chaque biome a sa région, son sol et ses arbres, comme une
// carte d'overworld vue de haut ; les routes sont des chemins de terre, une
// flèche dit dans quel sens on les prend, et les biomes qu'on n'a pas encore
// atteints restent dans l'ombre.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

export class Journal {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;
  private ctx: { save: Save } | null = null;

  constructor(
    parent: HTMLElement,
    /** Le tileset (atlas.ts) : le plan est peint avec ses tuiles. */
    private readonly atlas: CanvasImageSource,
  ) {
    this.root = el('div', 'reward journal', parent);
    this.root.hidden = true;
    addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') this.close();
      },
      { capture: true },
    );
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** L'animation de l'ambiance du plan, arrêtée à la fermeture. */
  private frame = 0;

  /**
   * Anime l'ambiance des zones : des braises qui montent du Volcan, une brume qui traîne sur
   * le Marais, de la neige (et de la grêle) sur la Montagne, des feuilles qui tombent en
   * Automne, des reflets sur le Lac. Des pixels nets, dans la DA du plan.
   */
  private animate(fx: HTMLCanvasElement, surf: ShoreWaves | null = null): void {
    cancelAnimationFrame(this.frame);
    const g = fx.getContext('2d')!;
    const rng = () => Math.random();
    type P = { z: (typeof ZONES)[number]; x: number; y: number; v: number; t: number };
    const parts: P[] = [];
    const spawn = (z: (typeof ZONES)[number]): P => {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * z.r;
      return { z, x: (z.x + Math.cos(a) * r) * TILE, y: (z.y + Math.sin(a) * r * 0.8) * TILE, v: 0.5 + rng(), t: rng() * 6 };
    };
    for (const z of ZONES) for (let k = 0; k < z.count; k++) parts.push(spawn(z));
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      g.clearRect(0, 0, fx.width, fx.height);
      // Les vagues qui s'échouent sur le sable (retour de test : « le même effet que dans le biome
      // Plage / Océan ») : montée, déferlement, sable mouillé, retrait.
      surf?.draw(g, 0, 0, fx.width, fx.height, 1, now / 1000);
      for (const p of parts) {
        p.t += dt;
        const z = p.z;
        // (La neige s'arrête au pied des falaises : elle ne tombe pas sur l'Automne.)
        const out = Math.hypot(p.x / TILE - z.x, (p.y / TILE - z.y) / 0.8) > z.r || (z.maxY !== undefined && p.y / TILE > z.maxY);
        if (z.kind === 'embers') {
          p.y -= 14 * p.v * dt;
          p.x += Math.sin(p.t * 2 + p.v * 5) * 6 * dt;
          const a = Math.max(0, Math.sin(p.t * 1.3));
          g.fillStyle = `rgba(255, ${120 + Math.round(80 * p.v) % 100}, 40, ${0.8 * a})`;
          g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
        } else if (z.kind === 'fog') {
          p.x += 5 * p.v * dt;
          const r = 34 + 22 * p.v;
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, `rgba(230, 240, 225, ${0.34 + 0.1 * Math.sin(p.t * 0.7)})`);
          grad.addColorStop(1, 'rgba(230, 240, 225, 0)');
          g.fillStyle = grad;
          g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        } else if (z.kind === 'snow') {
          // De la neige, et de temps en temps un grêlon plus gros qui tombe plus vite.
          const hail = p.v > 1.35;
          p.y += (hail ? 60 : 18) * p.v * dt;
          p.x += (hail ? 8 : Math.sin(p.t * 1.7 + p.v * 3) * 10) * dt;
          g.fillStyle = hail ? 'rgba(225, 240, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)';
          g.fillRect(Math.round(p.x), Math.round(p.y), hail ? 3 : 2, hail ? 4 : 2);
        } else if (z.kind === 'leaves') {
          p.y += 12 * p.v * dt;
          p.x += Math.sin(p.t * 2.2 + p.v * 4) * 14 * dt;
          g.fillStyle = p.v > 1 ? '#e8602a' : '#f0b030';
          g.fillRect(Math.round(p.x), Math.round(p.y), 3, 2);
        } else {
          const a = Math.max(0, Math.sin(p.t * 2.5));
          g.fillStyle = `rgba(255, 255, 255, ${0.85 * a})`;
          g.fillRect(Math.round(p.x), Math.round(p.y), 3, 1);
          if (a <= 0.01 && rng() < 0.05) Object.assign(p, spawn(z));
        }
        if (out) Object.assign(p, spawn(z), { t: 0 });
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  close(): void {
    if (this.root.hidden) return;
    cancelAnimationFrame(this.frame);
    sfx('menuClose');
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onClose;
    this.onClose = null;
    this.ctx = null;
    done?.();
  }

  show(save: Save, onClose: () => void): void {
    sfx('menuOpen');
    this.ctx = { save };
    this.onClose = onClose;
    this.root.hidden = false;
    this.render();
  }

  private render(): void {
    this.root.replaceChildren();
    el('div', 'poster-dim', this.root).addEventListener('click', () => this.close());
    const card = el('div', 'jr-card map', this.root);
    const head = el('div', 'jr-head', card);
    el('span', 'da-tape', head, 'PLAN DU MONDE');
    this.renderMap(card);
    el('p', 'jr-keys', card, hint('Entrée, E ou Échap : fermer', 'Touche en dehors pour fermer'));
  }

  /** Le plan : peint aux tuiles du jeu (ui/worldplan.ts), puis noms, flèches et traversées par-dessus. */
  private renderMap(card: HTMLElement): void {
    const save = this.ctx!.save;
    const open = leagueOpen(save);
    const wrap = el('div', 'jr-plan', card);
    const canvas = el('canvas', 'jr-plan-art', wrap);
    canvas.width = MW * TILE;
    canvas.height = MH * TILE;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const seen = (r: Region) => (r === 'victoire' ? open : r === 'prairie' || save.visited.includes(r));
    // Trois couches : le sol, l'ambiance animée (vagues, braises, brume, neige…), puis par-dessus
    // les arbres, rochers et maisons (et les teintes de zone) — les vagues passent dessous.
    const fx = el('canvas', 'jr-plan-fx', wrap);
    fx.width = MW * TILE;
    fx.height = MH * TILE;
    const over = el('canvas', 'jr-plan-fx', wrap);
    over.width = MW * TILE;
    over.height = MH * TILE;
    const og = over.getContext('2d')!;
    og.imageSmoothingEnabled = false;
    const plan = paintPlan(g, this.atlas, seen, og);
    // Le ressac de la Plage et de l'Océan (render/shorewaves.ts), le même qu'en run : il lit la
    // ligne d'eau au pixel sur le plan peint. On ne lui montre que la mer de l'Océan et deux
    // cases de son rivage (retour de test : de l'eau apparaissait ailleurs — la mare du Marais,
    // le Lac, les glaces passaient pour de la mer).
    const coast = document.createElement('canvas');
    coast.width = canvas.width;
    coast.height = canvas.height;
    const cg = coast.getContext('2d')!;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          near = nx >= 0 && ny >= 0 && nx < MW && ny < MH && plan.sea[ny * MW + nx] === 1;
        }
        if (near) cg.drawImage(canvas, x * TILE, y * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
    const surf = new ShoreWaves();
    surf.bake({ biome: { coast: 'beach' } } as unknown as WorldMap, coast);
    this.animate(fx, surf);

    // Par-dessus, en vectoriel net.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${MW * TILE} ${MH * TILE}`);
    svg.setAttribute('class', 'jr-plan-over');
    const add = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      parent.append(n);
      return n;
    };
    // Les chemins sont peints sur le plan ; ceux qu'on a déjà pris s'y pointillent d'encre (retour de
    // test du 17 novembre 2026 : « une fois qu'on a fait les chemins, ils apparaissent en pointillé
    // entre les zones ») ; la traversée en mer (vers l'Océan) se pointille d'écume, plus pâle tant
    // qu'on ne l'a pas faite.
    const walked = new Set(save.trails);
    for (const r of plan.roads) {
      const done = walked.has(`${r.from}>${r.to}`);
      const sea = r.from === 'ocean' || r.to === 'ocean';
      const csName = r.cs && CS_LIST.find((c) => c.id === r.cs)?.name;
      // Une route gardée qu'on n'a pas encore prise : rien de tracé, mais la CS qu'il faudra,
      // écrite à mi-chemin (on prépare sa run au Repaire, devant ce plan).
      if (!done && !sea) {
        if (csName && !save.cs.includes(r.cs!)) {
          const m = r.pts[Math.floor(r.pts.length / 2)];
          add('text', { x: m.x * TILE, y: m.y * TILE, class: 'jr-cs' }).textContent = `CS ${csName}`;
        }
        continue;
      }
      const d = `M ${r.pts.map((p) => `${(p.x * TILE).toFixed(1)} ${(p.y * TILE).toFixed(1)}`).join(' L ')}`;
      if (!sea) add('path', { d, class: 'jr-trail-under' });
      add('path', { d, class: `jr-trail${sea ? ' sea' : ''}${sea && !done ? ' shut' : ''}` });
      if (csName) {
        const m = r.pts[Math.floor(r.pts.length / 2)];
        add('text', { x: m.x * TILE + (sea ? 26 : 0), y: m.y * TILE, class: 'jr-cs' }).textContent = `CS ${csName}`;
      }
    }
    for (const n of plan.nodes) {
      const x = n.x * TILE;
      const y = n.y * TILE;
      const known = seen(n.id);
      const name = n.id === 'victoire' ? VICTORY_ROAD.name : BIOMES[n.id].name;
      const champs =
        n.id === 'victoire'
          ? open
            ? 'Le Conseil · le Maître'
            : 'Bats les onze champions'
          : (BIOME_CHAMPIONS[n.id] ?? []).map((c) => (save.beaten.includes(c) ? `${c} ✓` : save.met.includes(c) ? c : 'Champion ?')).join(' · ');
      // Un biome pas encore atteint ne dit pas son nom (retour de test) : un « ? », à découvrir.
      const g2 = add('g', { class: `jr-place${known ? '' : ' fog'}${n.id === 'prairie' ? ' start' : ''}` });
      add('text', { x, y: y + 4, class: 'jr-label' }, g2).textContent = known ? name : '?';
      if (known) add('text', { x, y: y + 18, class: 'jr-sub' }, g2).textContent = champs;
    }
    wrap.append(svg);
  }
}
