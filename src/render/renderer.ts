import { sizeMult } from '../assets/pmd';
import { WEATHERS, type WeatherId } from '../world/weather';
import { hash2 } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { Options } from '../ui/options';
import { blobTile, useGrid, type WorldMap, type WorldObject } from '../world/generate';
import { BLOB, FOUNTAIN, SEA, TILE, type Blob, type Tile } from '../world/tiles';
import type { FieldFx } from './fieldfx';
import type { Combat } from '../combat/combat';
import type { RoomDirector } from '../run/room';
import { STATUS } from '../combat/pokemon';
import { typeColor, type Projector } from './combatfx';
import type { Footprints } from './footprints';
import type { Particles } from './particles';
import { ShoreWaves } from './shorewaves';

// Rendu Canvas 2D au pixel près :
// - tout est dessiné dans un petit tampon (la « résolution interne »), puis
//   agrandi d'un facteur ENTIER à l'écran, sans lissage : aucun pixel n'est
//   ré-échantillonné de travers (la règle de DA_bible.md, en 2D) ;
// - le sol (herbe, chemins, eau, fleurs) est cuit une fois par carte ;
// - arbres, herbe haute et Pokémon sont triés par la ligne où ils touchent le sol.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** '#rrggbb' → 'r,g,b' (pour composer un rgba). */
const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16},${(n >> 8) & 255},${n & 255}`;
};

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class Renderer {
  private readonly sctx: CanvasRenderingContext2D;
  private readonly buf = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private ground: HTMLCanvasElement | null = null;
  private glowMap: HTMLCanvasElement | null = null;
  private surfCenters: number[] | null = null;
  private readonly waves = new ShoreWaves();
  /** Pixels du sol à l'ombre d'un bâtiment ou d'un arbre (1 octet par px de décor). */
  private shadowMask: Uint8Array | null = null;
  private shadowW = 0;
  private atlasPixels: Uint8ClampedArray | null = null;
  private atlasW = 0;
  /** Toile de travail pour assombrir un Pokémon à l'ombre. */
  private readonly tint = document.createElement('canvas');
  /** Marches taillées dans la paroi (2 cases × 1), dessinées une fois au démarrage. */
  private readonly stairs = Renderer.paintStairs(1);
  private readonly stairsTall = Renderer.paintStairs(2);
  /** Vue en px de décor. */
  viewW = 480;
  viewH = 270;
  /** Px de tampon par px de décor : 2 en « pixels mixtes ». */
  k = 1;
  /** Agrandissement entier tampon → écran. */
  scale = 1;
  camX = 0;
  camY = 0;

  constructor(
    private readonly screen: HTMLCanvasElement,
    private readonly tileset: CanvasImageSource,
    private readonly surf: HTMLImageElement,
    private readonly fieldSheet: HTMLImageElement | null,
  ) {
    this.sctx = screen.getContext('2d')!;
    this.bctx = this.buf.getContext('2d')!;
  }

  /**
   * Le tileset n'a pas d'escalier taillé dans la roche brune (ses marches de
   * pierre blanche vont avec des ruines) : on les peint au pixel, avec la
   * palette exacte de la paroi des plateaux (relevée sur les cases 52-53,32-34).
   */
  private static paintStairs(rows: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = TILE * 2;
    c.height = TILE * rows;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    // 3 marches de 5 px : giron clair, arête, puis contremarche en deux tons.
    // Plus franches que 4 marches de 4 px, qui se lisaient comme des lattes.
    const h = TILE * rows;
    px(0, h - 1, 32, 1, '#613b2b');
    for (let step = 0; step < 3 * rows; step++) {
      const y = step * 5;
      px(0, y, 32, 2, '#dcb88a');
      px(0, y + 2, 32, 1, '#cda778');
      px(0, y + 3, 32, 1, '#996f41');
      px(0, y + 4, 32, 1, '#613b2b');
    }
    // Joues de part et d'autre, dans le ton de la paroi, avec un liseré clair.
    px(0, 0, 3, h, '#613b2b');
    px(3, 0, 1, h, '#b68d5f');
    px(29, 0, 3, h, '#613b2b');
    px(28, 0, 1, h, '#b68d5f');
    return c;
  }

  resize(opts: Options): void {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.floor(innerWidth * dpr);
    const ph = Math.floor(innerHeight * dpr);
    this.k = opts.density === 'mixel' ? 2 : 1;
    // Échelle entière la plus proche de la hauteur visée, puis vue élargie
    // juste assez pour couvrir la fenêtre : pas de bandes noires, et la
    // hauteur réelle reste à ±1 facteur de la résolution choisie.
    this.scale = Math.max(1, Math.round(ph / (opts.viewHeight * this.k)));
    // Plancher : une fenêtre momentanément à 0 px (onglet replié, panneau
    // redimensionné) donnerait un tampon vide, que drawImage refuse net.
    this.viewH = Math.max(90, Math.ceil(ph / (this.scale * this.k)));
    this.viewW = Math.max(160, Math.ceil(pw / (this.scale * this.k)));
    this.buf.width = this.viewW * this.k;
    this.buf.height = this.viewH * this.k;
    this.screen.width = this.buf.width * this.scale;
    this.screen.height = this.buf.height * this.scale;
    this.screen.style.width = `${this.screen.width / dpr}px`;
    this.screen.style.height = `${this.screen.height / dpr}px`;
    // Redimensionner un canvas remet son contexte à zéro : on recoupe le lissage.
    this.sctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;
  }

  /** Cuit le sol de la carte (une fois) et, au Volcan, la carte des halos de lave. */
  bake(world: WorldMap): void {
    // Les bordures en blob lisent la grille de cette carte (le Repaire est plus grand qu'une salle).
    useGrid(world.w, world.h);
    const canvas = document.createElement('canvas');
    canvas.width = world.w * TILE;
    canvas.height = world.h * TILE;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const put = (tile: Tile, x: number, y: number) =>
      g.drawImage(this.tileset, tile[0] * TILE, tile[1] * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
    const { biome } = world;

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const { base, variants, variantRate } = biome.ground;
        const roll = hash2(x, y, world.seed);
        put(variants.length && roll < variantRate ? variants[Math.floor((roll / variantRate) * variants.length)] : base, x, y);
      }
    }
    const layer = (mask: Uint8Array, blob: NonNullable<WorldMap['biome']['path']>['blob'], skip?: Uint8Array) => {
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          const i = y * world.w + x;
          if (!mask[i] || skip?.[i]) continue;
          if (blob.fill) put(blob.fill, x, y);
          put(blobTile(mask, x, y, blob), x, y);
        }
      }
    };
    // Chemin et plaques du même sol (même jeu, même remplissage) : un seul
    // masque, sinon un liseré d'herbe sépare deux zones de terre qui se touchent.
    const sameGround = (a: Blob, b: Blob) =>
      a.origin[0] === b.origin[0] && a.origin[1] === b.origin[1] && a.fill?.[0] === b.fill?.[0] && a.fill?.[1] === b.fill?.[1];
    if (biome.patch && biome.path && sameGround(biome.patch.blob, biome.path.blob)) {
      const union = world.path.map((v, i) => (v || world.patch[i] ? 1 : 0));
      layer(union, biome.path.blob, world.water);
    } else {
      if (biome.patch) layer(world.patch, biome.patch.blob);
      if (biome.path) layer(world.path, biome.path.blob, world.water);
    }
    // Les allées du Repaire : leur sol, puis leur liseré d'herbe (hors de l'eau).
    for (const lane of world.lanes ?? []) {
      // Le bord se calcule avec le chemin de terre : l'allée s'y raccorde sans liseré d'herbe.
      const edge = lane.mask.map((v, i) => (v || world.path[i] ? 1 : 0));
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          const i = y * world.w + x;
          if (!lane.mask[i] || world.water[i] || world.path[i]) continue;
          put(lane.fill.length === 4 ? lane.fill[(y % 2) * 2 + (x % 2)] : lane.fill[0], x, y);
          put(blobTile(edge, x, y, BLOB.ringGrass), x, y);
        }
      }
    }
    if (world.paving.length) this.drawPaving(g, world, put);
    for (const f of world.fountains) Renderer.paintFountain(g, f.x * TILE, f.y * TILE, this.tileset);
    if (biome.water?.render === 'waves') {
      // Mer : houle partout, et sur la rangée qui touche le sable, le ressac d'écume.
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          if (!world.water[y * world.w + x]) continue;
          const shore = y + 1 < world.h && !world.water[(y + 1) * world.w + x];
          put(shore ? SEA.surf[x % 2] : SEA.waves[(x + y) % SEA.waves.length], x, y);
        }
      }
    } else if (biome.water && biome.water.render !== 'none') {
      layer(world.water, biome.water.blob);
    }
    const cliffBlob = biome.cliffs?.blob ?? biome.mesas?.blob;
    if (world.cliff && cliffBlob) layer(world.cliff, cliffBlob);
    // Second étage : le même plateau, posé sur le dessus du premier.
    if (world.cliff2 && cliffBlob) {
      layer(world.cliff2, cliffBlob);
      // Paroi haute : sous le rebord sud du second étage, on prolonge la
      // roche avec la bande « paroi » de la tuile de rebord elle-même (même
      // palette, mêmes bords gauche/droite), répétée pour remplir la case.
      for (let y = 1; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          if (!world.face[y * world.w + x]) continue;
          const [tc, tr] = blobTile(world.cliff2, x, y - 1, cliffBlob);
          g.drawImage(this.tileset, tc * TILE, tr * TILE + 6, TILE, 10, x * TILE, y * TILE, TILE, 10);
          g.drawImage(this.tileset, tc * TILE, tr * TILE + 10, TILE, 6, x * TILE, y * TILE + 10, TILE, 6);
        }
      }
    }
    for (const st of world.stairs) g.drawImage(st.rows === 2 ? this.stairsTall : this.stairs, st.x * TILE, st.y * TILE);
    if (world.cliff) this.shadeElevation(g, world);
    // Les fleurs ne sont plus cuites : elles ondulent, cf. draw().
    this.ground = canvas;
    this.shadowMask = this.buildShadowMask(world);
    this.waves.bake(world, canvas);

    this.glowMap = null;
    if (biome.ambiance.lavaGlow && biome.water) {
      const glow = document.createElement('canvas');
      glow.width = canvas.width;
      glow.height = canvas.height;
      const gg = glow.getContext('2d')!;
      gg.globalCompositeOperation = 'lighter';
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          if (!world.water[y * world.w + x] || hash2(x, y, 77) > 0.45) continue;
          const cx = x * TILE + TILE / 2;
          const cy = y * TILE + TILE / 2;
          const grad = gg.createRadialGradient(cx, cy, 0, cx, cy, 34);
          grad.addColorStop(0, 'rgba(255,120,40,0.20)');
          grad.addColorStop(1, 'rgba(255,80,20,0)');
          gg.fillStyle = grad;
          gg.fillRect(cx - 34, cy - 34, 68, 68);
        }
      }
      this.glowMap = glow;
    }
  }

  /**
   * Nage : seule la monture Surf est affichée, comme dans le jeu 3D (le
   * Pokémon posé dessus se lisait mal). La planche est dessinée en ×2 : on la
   * réduit de moitié, sans perte, pour retrouver le sprite 32 px d'origine.
   */
  private drawSurfer(a: Actor, x: number, y: number, s: number, time: number): void {
    const row = [SURF.rows.down, SURF.rows.right, SURF.rows.up, SURF.rows.left][a.surfFacing];
    const frame = Math.floor(time * 6) % 4;
    const half = s / 2;
    const bob = Math.round(Math.sin(time * 3.2) * this.k);
    const F = SURF.frame;
    // Enfoncée de 2 px : la monture touche l'eau au lieu de la survoler.
    this.bctx.drawImage(
      this.surf,
      frame * F,
      row * F,
      F,
      F,
      Math.round((x - this.camX) * this.k - this.surfCenter(row) * half),
      Math.round((y - this.camY) * this.k - (SURF.foot - 4) * half) + bob,
      Math.round(F * half),
      Math.round(F * half),
    );
  }

  /**
   * Centre horizontal du corps de la monture, ligne par ligne. Les profils
   * ne sont pas centrés dans leur case de 64 px (la queue déborde d'un côté) :
   * avec un centre fixe, la monture sautait de 2-3 px à chaque demi-tour.
   */
  private surfCenter(row: number): number {
    if (!this.surfCenters) {
      const F = SURF.frame;
      const c = document.createElement('canvas');
      c.width = F;
      c.height = F * 4;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(this.surf, 0, 0, F, F * 4, 0, 0, F, F * 4);
      this.surfCenters = [0, 1, 2, 3].map((r) => {
        const px = g.getImageData(0, r * F, F, F).data;
        let sum = 0;
        let n = 0;
        // Centroïde des pixels opaques : la queue, fine, pèse peu face au corps.
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] > 128) {
            sum += ((i - 3) / 4) % F;
            n++;
          }
        }
        return n ? sum / n : SURF.center;
      });
    }
    return this.surfCenters[row];
  }

  /**
   * Gerbe d'eau à la mise à l'eau / à la sortie : deux ronds qui s'élargissent
   * à la surface et une poignée de gouttes en cloche. Deux tiers de seconde.
   */
  private drawSplash(a: Actor): void {
    const t = a.splashAge / 0.65;
    if (t >= 1) return;
    const b = this.bctx;
    const k = this.k;
    const cx = (a.splashX * TILE - this.camX) * k;
    const cy = (a.splashY * TILE - 2 - this.camY) * k;
    b.strokeStyle = `rgba(236,248,255,${0.85 * (1 - t)})`;
    b.lineWidth = k;
    for (const [delay, size] of [[0, 11], [0.25, 7]] as const) {
      const u = (t - delay) / (1 - delay);
      if (u <= 0) continue;
      const rx = (4 + size * u) * k;
      b.beginPath();
      b.ellipse(Math.round(cx), Math.round(cy), rx, rx * 0.38, 0, 0, Math.PI * 2);
      b.stroke();
    }
    b.fillStyle = `rgba(240,250,255,${1 - t})`;
    for (let i = 0; i < 7; i++) {
      const ang = -Math.PI / 2 + (i - 3) * 0.42;
      const v = 7 + (i % 3) * 2.5;
      const px = cx + Math.cos(ang) * v * t * 2.2 * k;
      const py = cy + (Math.sin(ang) * v * t * 2.2 + 26 * t * t) * k;
      b.fillRect(Math.round(px), Math.round(py), k, k);
    }
  }

  /**
   * Ombre portée sur les Pokémon : les ombres des arbres et des bâtiments sont
   * peintes dans le tileset (pixels sombres semi-transparents). On les relève
   * une fois par carte dans un masque au pixel près ; un Pokémon dont les pieds
   * y tombent est assombri, comme s'il passait dans l'ombre du bâtiment.
   */
  private buildShadowMask(world: WorldMap): Uint8Array {
    if (!this.atlasPixels) {
      const src = this.tileset as HTMLCanvasElement;
      this.atlasW = src.width;
      this.atlasPixels = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    }
    const d = this.atlasPixels;
    const mw = world.w * TILE;
    const mh = world.h * TILE;
    const mask = new Uint8Array(mw * mh);
    for (const o of world.objects) {
      const [sx, sy, sw, sh] = o.sprite.rect;
      if (o.sprite.grass || sh < 24) continue;
      const ox = Math.round(o.x - sw / 2);
      const oy = Math.round(o.y - o.sprite.foot);
      for (let y = 0; y < sh; y++) {
        const wy = oy + y;
        if (wy < 0 || wy >= mh) continue;
        for (let x = 0; x < sw; x++) {
          const wx = ox + x;
          if (wx < 0 || wx >= mw) continue;
          const i = ((sy + y) * this.atlasW + sx + x) * 4;
          const a = d[i + 3];
          // Pixel d'ombre : semi-transparent et sombre (le sprite opaque, lui, n'en est pas).
          if (a > 20 && a < 235 && d[i] + d[i + 1] + d[i + 2] < 260) mask[wy * mw + wx] = 1;
        }
      }
    }
    this.shadowW = mw;
    return mask;
  }

  /** Part d'ombre (0..1) sous les pieds d'un Pokémon : trois points sur la largeur du corps. */
  private shadeAt(x: number, y: number): number {
    const m = this.shadowMask;
    if (!m) return 0;
    let n = 0;
    for (const dx of [-4, 0, 4]) {
      const px = Math.round(x + dx);
      const py = Math.round(y - 2);
      if (px >= 0 && py >= 0 && px < this.shadowW && m[py * this.shadowW + px]) n++;
    }
    return n / 3;
  }

  /**
   * Fontaine de place (3 × 3 cases) : le bassin rond d'Essentials, recopié dans
   * l'atlas (FOUNTAIN, world/tiles.ts). Il porte déjà un jet immobile : c'est
   * lui que montre le plan du monde ; en salle, drawJet l'anime par-dessus.
   * (Remplace la fontaine peinte au pixel, « trop chelou » au retour de test.)
   */
  static paintFountain(g: CanvasRenderingContext2D, x: number, y: number, tileset: CanvasImageSource): void {
    const [c, r] = FOUNTAIN.basin;
    g.drawImage(tileset, c * TILE, r * TILE, FOUNTAIN.w * TILE, FOUNTAIN.h * TILE, x, y, FOUNTAIN.w * TILE, FOUNTAIN.h * TILE);
  }

  /**
   * Village : revêtements posés à angle droit (rues, place, allées de terre).
   * Une bordure d'un pixel les détache de l'herbe, comme un trottoir ; entre
   * deux revêtements différents (rue / place), un joint plus discret.
   */
  private drawPaving(g: CanvasRenderingContext2D, world: WorldMap, put: (tile: Tile, x: number, y: number) => void): void {
    const { w, h } = world;
    const layerAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return -2;
      return world.paving.findIndex((p) => p.mask[y * w + x] === 1);
    };
    for (const p of world.paving) for (let i = 0; i < w * h; i++) if (p.mask[i]) put(p.tile, i % w, (i / w) | 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const me = layerAt(x, y);
        if (me < 0) continue;
        const px = x * TILE;
        const py = y * TILE;
        const edge = (nx: number, ny: number, draw: (color: string) => void) => {
          const other = layerAt(nx, ny);
          if (other === me || other === -2) return;
          draw(other < 0 ? 'rgba(48,40,30,0.45)' : 'rgba(48,40,30,0.18)');
        };
        edge(x, y - 1, (c) => ((g.fillStyle = c), g.fillRect(px, py, TILE, 1)));
        edge(x, y + 1, (c) => ((g.fillStyle = c), g.fillRect(px, py + TILE - 1, TILE, 1)));
        edge(x - 1, y, (c) => ((g.fillStyle = c), g.fillRect(px, py, 1, TILE)));
        edge(x + 1, y, (c) => ((g.fillStyle = c), g.fillRect(px + TILE - 1, py, 1, TILE)));
      }
    }
  }

  /**
   * Lisibilité des étages. Le dessus d'un plateau est de la même herbe que le
   * sol : sans indice, ses rebords semblaient flotter. Deux indices :
   * - chaque étage est un peu plus clair (plus près du soleil) ;
   * - la falaise jette une ombre courte sur le sol en contrebas.
   */
  private shadeElevation(g: CanvasRenderingContext2D, world: WorldMap): void {
    const { w, h } = world;
    const level = (x: number, y: number) => {
      const i = Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x));
      return (world.cliff?.[i] ?? 0) + (world.cliff2?.[i] ?? 0);
    };
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lv = level(x, y);
        if (!lv || !world.inside[y * w + x]) continue;
        g.fillStyle = `rgba(255,248,225,${0.07 * lv})`;
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        // Bas de paroi : un rebord sud (étage au-dessus d'un étage plus bas) ou une paroi haute.
        const top = world.face[y * w + x] ? 2 : level(x, y);
        // (pas d'ombre sur la paroi haute elle-même, sous le rebord du second étage)
        if (top <= level(x, y + 1) || world.face[(y + 1) * w + x] || world.stairs.some((st) => x >= st.x && x < st.x + 2 && y >= st.y && y < st.y + st.rows)) continue;
        g.fillStyle = 'rgba(30,24,16,0.20)';
        g.fillRect(x * TILE, (y + 1) * TILE, TILE, 3);
        g.fillStyle = 'rgba(30,24,16,0.10)';
        g.fillRect(x * TILE, (y + 1) * TILE + 3, TILE, 3);
      }
    }
    g.restore();
  }

  /**
   * Jet de la fontaine : l'image courante de l'autotile Fountain1 (FOUNTAIN.jet,
   * 1 × 2 cases), posée sur la colonne du milieu du bassin cuit au sol.
   */
  private drawJet(x: number, y: number, time: number): void {
    const k = this.k;
    const [c, r] = FOUNTAIN.jet[Math.floor(time / FOUNTAIN.frameTime) % FOUNTAIN.jet.length];
    const dx = Math.round((x + FOUNTAIN.jetDx * TILE - this.camX) * k);
    const dy = Math.round((y - this.camY) * k);
    this.bctx.drawImage(this.tileset, c * TILE, r * TILE, TILE, 2 * TILE, dx, dy, TILE * k, 2 * TILE * k);
  }

  /**
   * Anneau de portée de la capacité sélectionnée, au sol (TeamMember.gd:1009-1032) :
   * doré si elle est prête, rouge sinon ; il s'avive au lancer. Anneau rouge
   * intérieur pour la portée minimale des grosses attaques spéciales.
   */
  private drawRangeRing(player: Actor, combat: Combat, alpha: number): void {
    if (!player.pokemon?.moves.length || player.swimming) return;
    const b = this.bctx;
    const k = this.k;
    const cx = (lerp(player.prevX, player.x, alpha) * TILE - this.camX) * k;
    const cy = (lerp(player.prevY, player.y, alpha) * TILE - this.camY) * k;
    const slot = combat.selected;
    const ready = combat.ready(slot);
    const a = 0.16 + combat.ringFlash * 0.45;
    b.lineWidth = k;
    b.strokeStyle = ready ? `rgba(242,194,79,${a})` : `rgba(217,89,64,${a})`;
    b.beginPath();
    b.arc(Math.round(cx) + 0.5, Math.round(cy) + 0.5, combat.reach(player, slot) * TILE * k, 0, Math.PI * 2);
    b.stroke();
    const rmin = combat.minReach(player, slot);
    if (rmin > 0) {
      b.strokeStyle = `rgba(217,89,64,${a})`;
      b.beginPath();
      b.arc(Math.round(cx) + 0.5, Math.round(cy) + 0.5, rmin * TILE * k, 0, Math.PI * 2);
      b.stroke();
    }
  }

  /**
   * Anneau d'anticipation sous un sauvage qui prépare son coup (EnemyAI._start_windup) :
   * rouge, il grandit de ×0,4 à ×1,4 (rayon 0,18 → 0,62 case) sur toute l'anticipation.
   */
  private drawTelegraphs(actors: readonly Actor[]): void {
    const b = this.bctx;
    const k = this.k;
    for (const a of actors) {
      if (a.hidden || a.trapped || a.deathT >= 0) continue;
      if (a.role !== 'wild') {
        // Anneau permanent d'un champion (rouge) ou de son as (doré), EnemyAI.gd:236-240, 280-294.
        const cx = Math.round((a.x * TILE - this.camX) * k);
        const cy = Math.round((a.y * TILE - this.camY) * k);
        const outer = 0.85 * TILE * k;
        const inner = 0.72 * TILE * k;
        b.fillStyle = a.role === 'boss' ? 'rgba(255,199,38,0.65)' : 'rgba(255,64,38,0.55)';
        b.beginPath();
        b.ellipse(cx, cy, outer, outer * 0.55, 0, 0, Math.PI * 2);
        b.ellipse(cx, cy, inner, inner * 0.55, 0, 0, Math.PI * 2, true);
        b.fill('evenodd');
      }
      if (a.windup.dur <= 0) continue;
      const u = Math.min(1, a.windup.t / a.windup.dur);
      const scale = 0.4 + u * (a.windup.ring - 0.4);
      const outer = 0.44 * scale * TILE * k;
      const inner = 0.3 * scale * TILE * k;
      const cx = Math.round((a.x * TILE - this.camX) * k);
      const cy = Math.round((a.y * TILE - this.camY) * k);
      b.fillStyle = 'rgba(255,56,38,0.55)';
      b.beginPath();
      // Vu de dessus mais au ras du sol : un anneau aplati, comme les ombres.
      b.ellipse(cx, cy, outer, outer * 0.55, 0, 0, Math.PI * 2);
      b.ellipse(cx, cy, inner, inner * 0.55, 0, 0, Math.PI * 2, true);
      b.fill('evenodd');
    }
  }

  /**
   * Barres de vie au-dessus des sauvages touchés et des Pokémon de champion.
   * Le jeu les avait retirées ; pixel art, 18 × 2 px (24 pour un champion),
   * verte, jaune sous 50 %, rouge sous 25 %. La part qui vient d'être perdue
   * s'efface en clair, et des points marquent les barres restantes d'un champion.
   */
  private drawHpBars(placed: readonly { a: Actor; x: number; y: number }[], player: Actor, opts: Options): void {
    const b = this.bctx;
    const k = this.k;
    for (const { a, x, y } of placed) {
      const mon = a.pokemon;
      if (a === player || !mon || !a.sheet || a.deathT >= 0 || a.hidden || a.trapped) continue;
      const ratio = mon.hp / mon.maxHp;
      // Sans perte (ni barre entamée), un sauvage n'affiche rien : la salle reste lisible.
      a.hpShown = ratio > a.hpShown ? ratio : a.hpShown + (ratio - a.hpShown) * 0.08;
      if (a.role === 'wild' && ratio >= 1 && a.hpShown >= 0.999) continue;
      const w = a.role === 'wild' ? 18 : 24;
      const s = this.spriteScale(a, opts);
      const top = Math.round((y - this.camY) * k - (a.sheet.footRow + 1 - a.sheet.topRow) * s) - 6 * k;
      const left = Math.round((x - this.camX) * k) - (w / 2 + 1) * k;
      b.fillStyle = '#1a1008';
      b.fillRect(left, top, (w + 2) * k, 4 * k);
      b.fillStyle = '#3b2a1c';
      b.fillRect(left + k, top + k, w * k, 2 * k);
      b.fillStyle = '#f5e6c7';
      b.fillRect(left + k, top + k, Math.round(w * Math.max(0, a.hpShown)) * k, 2 * k);
      b.fillStyle = ratio > 0.5 ? '#58d858' : ratio > 0.25 ? '#f8d030' : '#f85838';
      b.fillRect(left + k, top + k, Math.round(w * ratio) * k, 2 * k);
      if (a.bars > 1) {
        b.fillStyle = a.role === 'boss' ? '#f2c24f' : '#e5594a';
        for (let i = 0; i < a.barsLeft; i++) b.fillRect(left + k + i * 3 * k, top - 3 * k, 2 * k, 2 * k);
      }
    }
  }

  /** Projection monde (cases) → px CSS de la page, pour les éléments HTML posés sur le jeu. */
  projector(): Projector {
    const rect = this.screen.getBoundingClientRect();
    const css = rect.width / this.buf.width;
    return {
      perTile: TILE * this.k * css,
      toCss: (x, y) => ({
        x: rect.left + (x * TILE - this.camX) * this.k * css,
        y: rect.top + (y * TILE - this.camY) * this.k * css,
      }),
    };
  }

  /** Px de tampon par px de planche PMD, selon le mode d'échelle choisi. */
  spriteScale(a: Actor, opts: Options): number {
    return this.baseSpriteScale(a, opts) * (a.role === 'boss' ? 1.7 : a.role === 'champion' ? 1.35 : 1) * introScale(a);
  }

  /**
   * Échelle sans le rôle. Un champion est 1,35 fois plus grand, son as 1,7 fois
   * (EnemyAI.gd:322) : facteurs non entiers, pixels légèrement inégaux, comme
   * l'effet de hauteur. Le jeu bornait la taille finale à 1,8, ce qui gommait le
   * rôle chez les grandes espèces : ici pas de borne.
   */
  private baseSpriteScale(a: Actor, opts: Options): number {
    if (!a.sheet) return 1;
    // En hauteur, le Pokémon grandit de 8 % par étage : on « monte vers la
    // caméra ». Facteur non entier, donc pixels légèrement inégaux : désactivable.
    const lift = opts.heightScale ? 1 + 0.08 * a.height : 1;
    switch (opts.size) {
      case 'pmd':
        return lift;
      case 'big2':
        return (a.info && a.info.heightM >= 1.5 ? 2 : 1) * lift;
      case 'game':
        // Comme le jeu 3D : la frame occupe 1,75 case de large (Billboard3D.CHAR_WIDTH), × size_mult.
        return ((1.75 * TILE * this.k) / a.sheet.fw) * (a.info ? sizeMult(a.info) : 1) * lift;
    }
  }

  /** Boîte (px de décor) du corps visible d'un Pokémon : sert à savoir s'il passe derrière un arbre. */
  private bodyRect(a: Actor, ax: number, ay: number, opts: Options): Rect {
    const s = this.spriteScale(a, opts) / this.k;
    const sheet = a.sheet!;
    const w = sheet.bodyWidth * s;
    const h = sheet.fh * 0.7 * s;
    return { x: ax - w / 2, y: ay - h, w, h };
  }

  /**
   * Dessine une tuile qui ondule : découpée en bandes horizontales, chacune
   * décalée d'autant plus qu'elle est haute (le pied reste ancré). Les
   * décalages, arrondis bande par bande, changent à des instants différents :
   * le mouvement paraît bien plus continu qu'une moitié haute qui saute d'un
   * pixel. En pixels mixtes, on gagne en plus le demi-pixel.
   */
  private drawSwaying(src: Tile, wx: number, wy: number, sway: number, band: number): void {
    this.drawSwayingRect(src[0] * TILE, src[1] * TILE, TILE, TILE, wx, wy, sway, band);
  }

  /** Même chose pour un sprite de taille quelconque (touffes et roseaux sur 2 cases). */
  private drawSwayingRect(sx: number, sy: number, sw: number, sh: number, wx: number, wy: number, sway: number, band: number, fromRow = 0): void {
    const b = this.bctx;
    const k = this.k;
    const dx = Math.round((wx - this.camX) * k);
    const dy = Math.round((wy - this.camY) * k);
    for (let y = fromRow; y < sh; y += band) {
      const lift = 1 - (y + band / 2) / sh;
      const off = Math.round(sway * lift * lift * k);
      const bh = Math.min(band, sh - y);
      b.drawImage(this.tileset, sx, sy + y, sw, bh, dx + off, dy + y * k, sw * k, bh * k);
    }
  }

  draw(
    world: WorldMap,
    player: Actor,
    actors: readonly Actor[],
    particles: Particles,
    footprints: Footprints,
    fieldFx: FieldFx,
    combat: Combat,
    director: RoomDirector,
    /** Sprites hors Pokémon triés avec eux (le dresseur d'un champion) : y = ligne de sol en px. */
    extras: readonly { y: number; draw(b: CanvasRenderingContext2D, camX: number, camY: number, k: number): void }[],
    opts: Options,
    alpha: number,
    time: number,
    /** Météo de la salle (world/weather.ts) et ses particules, sur leur propre couche. */
    sky: { weather: WeatherId; particles: Particles } | null = null,
  ): void {
    const b = this.bctx;
    const k = this.k;
    const ground = this.ground;
    if (!ground) return;

    // Caméra : suit le joueur (position interpolée), bornée à la carte.
    const px = lerp(player.prevX, player.x, alpha) * TILE;
    const py = lerp(player.prevY, player.y, alpha) * TILE;
    const mapW = world.w * TILE;
    const mapH = world.h * TILE;
    const clampCam = (v: number, view: number, size: number) => (size <= view ? (size - view) / 2 : Math.min(size - view, Math.max(0, v)));
    this.camX = Math.round(clampCam(px - this.viewW / 2, this.viewW, mapW) * k) / k;
    this.camY = Math.round(clampCam(py - 10 - this.viewH / 2, this.viewH, mapH) * k) / k;
    // Secousse (CombatArena.gd:628-631) : décalage uniforme dans ±shake case, tiré à chaque image.
    if (combat.shake > 0) {
      this.camX += Math.round((Math.random() * 2 - 1) * combat.shake * TILE * k) / k;
      this.camY += Math.round((Math.random() * 2 - 1) * combat.shake * TILE * k) / k;
    }
    const camX = this.camX;
    const camY = this.camY;

    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#10140f';
    b.fillRect(0, 0, this.buf.width, this.buf.height);
    b.drawImage(ground, camX, camY, this.viewW, this.viewH, 0, 0, this.viewW * k, this.viewH * k);
    this.waves.draw(b, camX, camY, this.viewW, this.viewH, k, time);

    // Reflets sur l'eau (pas sur la lave) : quelques pixels qui scintillent.
    if (world.biome.water && !world.biome.ambiance.lavaGlow) {
      const tick = Math.floor(time * 3);
      b.fillStyle = 'rgba(255,255,255,0.85)';
      for (let cy = Math.floor(camY / TILE); cy <= Math.floor((camY + this.viewH) / TILE); cy++) {
        for (let cx = Math.floor(camX / TILE); cx <= Math.floor((camX + this.viewW) / TILE); cx++) {
          if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || !world.water[cy * world.w + cx]) continue;
          if (hash2(cx, cy, tick) > 0.12) continue;
          const sx = cx * TILE + 3 + Math.floor(hash2(cx, cy, tick + 1) * 10);
          const sy = cy * TILE + 3 + Math.floor(hash2(cx, cy, tick + 2) * 10);
          b.fillRect((sx - camX) * k, (sy - camY) * k, 2 * k, k);
        }
      }
    }

    const put = (tile: Tile, wx: number, wy: number) =>
      b.drawImage(this.tileset, tile[0] * TILE, tile[1] * TILE, TILE, TILE, Math.round((wx - camX) * k), Math.round((wy - camY) * k), TILE * k, TILE * k);
    const cx0 = Math.max(0, Math.floor(camX / TILE));
    const cy0 = Math.max(0, Math.floor(camY / TILE));
    const cx1 = Math.min(world.w - 1, Math.floor((camX + this.viewW) / TILE));
    const cy1 = Math.min(world.h - 1, Math.floor((camY + this.viewH) / TILE));

    // Nénuphars : ils dérivent d'un pixel sur une lente houle, chacun à son rythme.
    for (const l of world.lilies) {
      const phase = hash2(l.x, l.y, 5) * Math.PI * 2;
      put(l.tile, l.x * TILE + Math.round(Math.sin(time * 0.9 + phase) * 1.4), l.y * TILE + Math.round(Math.cos(time * 0.7 + phase)));
    }

    // Pokémon : positions interpolées (servent à l'herbe haute, aux ombres et au tri).
    const placed = actors
      .filter((a) => a.sheet && !a.hidden && !a.trapped)
      .map((a) => ({ a, x: lerp(a.prevX, a.x, alpha) * TILE, y: lerp(a.prevY, a.y, alpha) * TILE }));
    const tallDef = world.biome.tallGrass?.def;
    // Case d'herbe haute -> Pokémon qui s'y tient (ses pieds).
    const inGrass = new Map<number, number>();
    if (tallDef) {
      for (const p of placed) {
        const gx = Math.floor(p.x / TILE);
        const gy = Math.floor((p.y - 1) / TILE);
        if (gx >= 0 && gy >= 0 && gx < world.w && gy < world.h && world.tall[gy * world.w + gx]) inGrass.set(gy * world.w + gx, p.y);
      }
      // Herbe haute immobile, comme dans les jeux : c'est l'effet de terrain
      // (FieldFx) qui anime le passage, pas le vent.
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (world.tall[cy * world.w + cx]) put(tallDef.base, cx * TILE, cy * TILE);
        }
      }
    }

    // Fleurs : même vent, plus doux.
    for (const f of world.flat) {
      if (f.x < cx0 || f.x > cx1 || f.y < cy0 || f.y > cy1) continue;
      this.drawSwaying(f.tile, f.x * TILE, f.y * TILE, Math.sin(time * 1.6 - f.x * 0.45 - f.y * 0.2) * 1.2, 4);
    }

    footprints.draw(b, camX, camY, k);
    this.drawRangeRing(player, combat, alpha);
    this.drawTelegraphs(actors);
    // Nappes des dons (Grêle, Continent, Vide) : portées du jeu mais jamais dessinées jusqu'ici.
    combat.hooks.drawZones(b, camX, camY, k, time);
    combat.drawStrikes(b, camX, camY, k);
    director.drawGround(b, camX, camY, k);

    if (opts.shadows) {
      b.fillStyle = 'rgba(16,24,12,0.28)';
      for (const p of placed) {
        if (p.a.swimming || p.a.swimBlend > 0.5) continue;
        // Couché (endormi, ou juché sur un rondin) : une ombre ronde sous lui ferait un trou au sol.
        if (p.a.perch > 0 || p.a.pose === 'Sleep' || p.a.pose === 'Laying') continue;
        const rx = Math.max(4, Math.round(p.a.sheet!.bodyWidth * 0.42 * this.spriteScale(p.a, opts)));
        const ry = Math.max(2, Math.round(rx * 0.4));
        const cx = Math.round((p.x - camX) * k);
        const cy = Math.round((p.y - camY) * k) - 1;
        for (let dy = -ry; dy <= ry; dy++) {
          const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
          b.fillRect(cx - half, cy + dy, half * 2, 1);
        }
      }
    }

    // Tri par ligne de sol : objets du décor visibles + Pokémon.
    type Item = {
      y: number;
      obj?: WorldObject;
      actor?: (typeof placed)[number];
      grass?: number;
      grassOver?: WorldObject;
      jet?: { x: number; y: number };
      extra?: (typeof extras)[number];
    };
    const items: Item[] = [];
    for (const o of world.objects) {
      const [, , w, h] = o.sprite.rect;
      const top = o.y - o.sprite.foot;
      if (o.x + w / 2 < camX || o.x - w / 2 > camX + this.viewW || top > camY + this.viewH || top + h < camY) continue;
      items.push({ y: o.y, obj: o });
    }
    for (const p of placed) items.push({ y: p.y, actor: p });
    for (const e of extras) items.push({ y: e.y, extra: e });
    for (const f of world.fountains) items.push({ y: (f.y + 3) * TILE - 1, jet: f });
    // Touffes et roseaux traversés : leur bas est redessiné par-dessus le Pokémon.
    const trampled = new Set<WorldObject>();
    for (const it of items) {
      const o = it.obj;
      if (!o?.sprite.grass) continue;
      const half = o.sprite.rect[2] / 2 - 2;
      for (const p of placed) {
        if (Math.abs(p.x - o.x) < half && p.y > o.y - 14 && p.y <= o.y + 2) {
          trampled.add(o);
          items.push({ y: p.y + 0.01, grassOver: o });
          break;
        }
      }
    }
    // Calque de brins redessiné juste après le Pokémon qui se tient dans la touffe : il lui cache les pieds.
    for (const [i, footY] of inGrass) items.push({ y: footY + 0.01, grass: i });
    items.sort((a, c) => a.y - c.y);

    const playerPlaced = placed.find((p) => p.a === player);
    const playerBody = playerPlaced ? this.bodyRect(player, playerPlaced.x, playerPlaced.y, opts) : null;

    for (const it of items) {
      if (it.obj) {
        const o = it.obj;
        const [sx, sy, sw, sh] = o.sprite.rect;
        const dx = o.x - sw / 2;
        const dy = o.y - o.sprite.foot;
        if (o.sprite.grass) {
          // Vent commun aux herbes ; la touffe qu'on traverse s'agite.
          const wind = Math.sin(time * 1.6 - (o.x / TILE) * 0.45 - (o.y / TILE) * 0.2) * 1.6;
          const shake = trampled.has(o) ? Math.sin(time * 16) * 1.8 : 0;
          // Joueur derrière la touffe (pieds au-dessus de sa base) : on l'éclaircit, comme les arbres.
          const behind = playerBody && playerPlaced!.y < o.y - 12 && overlap(playerBody, { x: dx, y: dy, w: sw, h: sh });
          b.globalAlpha = behind ? 0.5 : 1;
          this.drawSwayingRect(sx, sy, sw, sh, dx, dy, wind + shake, 2);
          b.globalAlpha = 1;
          continue;
        }
        // Arbre devant le joueur qui le cache : translucide, comme l'« x-ray » du jeu 3D.
        // Pareil pour tout grand décor (hutte, maison, tipi, étal… au moins deux cases de haut),
        // même posé sans `fades` : derrière, le Pokémon disparaîtrait.
        const hides = opts.treeFade && (o.fades || sh >= 2 * TILE) && playerBody && o.y > playerPlaced!.y && overlap(playerBody, { x: dx, y: dy, w: sw, h: sh * 0.85 });
        b.globalAlpha = hides ? 0.45 : 1;
        b.drawImage(this.tileset, sx, sy, sw, sh, Math.round((dx - camX) * k), Math.round((dy - camY) * k), sw * k, sh * k);
        // Chapeau de neige (Montagne glacée), du même cadre que l'arbre.
        if (o.sprite.cap) b.drawImage(this.tileset, o.sprite.cap[0], o.sprite.cap[1], sw, sh, Math.round((dx - camX) * k), Math.round((dy - camY) * k), sw * k, sh * k);
        b.globalAlpha = 1;
      } else if (it.jet) {
        this.drawJet(it.jet.x * TILE, it.jet.y * TILE, time);
      } else if (it.grassOver) {
        const o = it.grassOver;
        const [sx, sy, sw, sh] = o.sprite.rect;
        // Seuls les 12 px du bas : le haut du Pokémon reste visible.
        this.drawSwayingRect(sx, sy, sw, sh, o.x - sw / 2, o.y - o.sprite.foot, Math.sin(time * 16) * 1.8, 2, sh - 12);
      } else if (it.grass !== undefined && tallDef) {
        const cx = it.grass % world.w;
        const cy = Math.floor(it.grass / world.w);
        const [tc, tr] = tallDef.overlay;
        // Seule la moitié basse : elle cache les pieds, le haut du Pokémon reste visible.
        b.drawImage(this.tileset, tc * TILE, tr * TILE + 8, TILE, 8, Math.round((cx * TILE - camX) * k), Math.round((cy * TILE + 8 - camY) * k), TILE * k, 8 * k);
      } else if (it.extra) {
        it.extra.draw(b, camX, camY, k);
      } else if (it.actor) {
        const { a, x, y } = it.actor;
        const sheet = a.sheet!;
        const s = this.spriteScale(a, opts);
        const row = sheet.rows >= 8 ? a.dir : 0;
        if (a.swimming && a.nativeSwimmer) {
          // Pokémon aquatique : il nage lui-même, le bas du corps sous la surface.
          const visible = Math.max(1, sheet.footRow + 1 - 7);
          const bob = Math.round(Math.sin(time * 3 + x * 0.1) * k);
          b.drawImage(
            sheet.image,
            a.frame() * sheet.fw,
            row * sheet.fh,
            sheet.fw,
            visible,
            Math.round((x - camX) * k - sheet.centerCol * s),
            Math.round((y - camY) * k - visible * s) + bob,
            Math.round(sheet.fw * s),
            Math.round(visible * s),
          );
          continue;
        }
        this.drawSplash(a);
        // Passage terre ↔ eau : la monture apparaît pendant que le Pokémon
        // bondit dessus en s'effaçant (et l'inverse à la sortie).
        // (Un nageur natif n'a pas de monture : il plonge, il ne la quitte pas.)
        const blend = a.nativeSwimmer ? 0 : a.swimBlend;
        if (blend > 0) {
          b.globalAlpha = Math.min(1, blend * 1.6);
          this.drawSurfer(a, x, y, s, time);
          b.globalAlpha = 1;
          if (blend >= 1) continue;
        }
        const hop = Math.round(Math.sin(Math.PI * blend) * 6 * k);
        // K.O. : fondu en 0,5 s pendant qu'il s'enfonce de 0,45 case en 0,4 s — sauf un membre
        // de l'équipe, qui reste couché, grisé, en attendant d'être ranimé.
        const dying = a.deathT >= 0 && !a.downed ? Math.min(1, a.deathT / 0.5) : 0;
        b.globalAlpha = (1 - blend) * (1 - dying);
        // Ombre des bâtiments et des arbres : on y entre et on en sort en douceur.
        a.shade += (this.shadeAt(x, y) - a.shade) * 0.2;

        // Case de marche, ou case d'action : plus grande, centrée au même point du corps.
        let src: CanvasImageSource = sheet.image;
        let fw = sheet.fw;
        let fh = sheet.fh;
        let fx = a.frame() * fw;
        let fy = row * fh;
        let dx = (x - camX) * k - sheet.centerCol * s;
        let dy = (y - camY) * k - (sheet.footRow + 1) * s;
        let footRow = sheet.footRow;
        const act = a.action;
        if (act) {
          const cx = dx + (sheet.fw / 2) * s;
          const cy = dy + (sheet.fh / 2) * s;
          src = act.anim.image;
          fw = act.anim.fw;
          fh = act.anim.fh;
          fx = a.actionFrame() * fw;
          fy = (act.anim.rows >= 8 ? a.dir : 0) * fh;
          dx = cx - (fw / 2) * s;
          dy = cy - (fh / 2) * s;
          footRow += (fh - sheet.fh) / 2;
        }
        // Fente vers la cible : 0,9 case en 0,07 s, retour en 0,14 s.
        const lt = a.lunge.t;
        const lunge = lt < 0.07 ? 1 - (1 - lt / 0.07) ** 2 : lt < 0.21 ? 1 - smooth((lt - 0.07) / 0.14) : 0;
        dx += a.lunge.dx * TILE * k * lunge;
        dy += a.lunge.dy * TILE * k * lunge;

        // Teintes empilées : ombre portée, statut, flash du coup, rougeur du K.O.
        const layers: [string, number][] = [];
        if (a.shade > 0.02) layers.push(['24,26,44', 0.4 * a.shade]);
        const status = a.pokemon?.status;
        if (status) layers.push([hexRgb(STATUS[status].color), 0.3 + 0.16 * Math.sin(time * 6)]);
        if (a.protectT > 0) layers.push(['140,217,255', 0.35 + 0.15 * Math.sin(time * 14)]);
        if (a.flash.t > 0) layers.push([hexRgb(a.flash.color), a.flash.alpha * (a.flash.t / a.flash.dur)]);
        // Entrée en puissance : il pulse à la couleur de son type, de plus en plus vite jusqu'à la libération.
        if (a.intro && a.pokemon) {
          const { t, burst, dur } = a.intro;
          const al = t < burst ? 0.25 + 0.35 * Math.abs(Math.sin(t * (8 + 14 * (t / burst)))) : 0.7 * Math.max(0, 1 - (t - burst) / Math.min(0.5, dur - burst));
          layers.push([hexRgb(typeColor(a.pokemon.types[0])), al]);
        }
        // Évolution : il blanchit en pulsant de plus en plus vite jusqu'à l'échange
        // de forme (silhouette pleine), puis la nouvelle forme reprend ses couleurs.
        if (a.evolve) {
          const { t, swapAt, dur } = a.evolve;
          const al = t < swapAt ? Math.min(1, (t / swapAt) * (0.6 + 0.4 * Math.abs(Math.sin(t * (6 + 22 * (t / swapAt)))))) : Math.max(0, 1 - (t - swapAt) / (dur - swapAt));
          layers.push(['255,255,255', al]);
        }
        if (dying > 0) layers.push(['255,60,60', 0.6 * dying]);
        if (a.downed) layers.push(['70,72,96', 0.5]);
        if (layers.length) {
          const t = this.tint;
          if (t.width !== fw || t.height !== fh) {
            t.width = fw;
            t.height = fh;
          }
          const tc = t.getContext('2d')!;
          tc.globalCompositeOperation = 'copy';
          tc.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
          tc.globalCompositeOperation = 'source-atop';
          for (const [rgb, al] of layers) {
            tc.fillStyle = `rgba(${rgb},${al})`;
            tc.fillRect(0, 0, fw, fh);
          }
          src = t;
          fx = 0;
          fy = 0;
        }
        // Anticipation : le Pokémon s'écrase (×1,14 en largeur, ×0,82 en hauteur) et blanchit.
        let sqx = 1;
        let sqy = 1;
        if (a.windup.dur > 0) {
          const u = Math.min(1, a.windup.t / (a.windup.dur * 0.8));
          sqx = 1 + 0.14 * u;
          sqy = 1 - 0.18 * u;
          if (src !== this.tint) {
            const t = this.tint;
            if (t.width !== fw || t.height !== fh) {
              t.width = fw;
              t.height = fh;
            }
            const tc = t.getContext('2d')!;
            tc.globalCompositeOperation = 'copy';
            tc.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
            src = t;
            fx = 0;
            fy = 0;
          }
          const tc = this.tint.getContext('2d')!;
          tc.globalCompositeOperation = 'source-atop';
          tc.fillStyle = `rgba(255,243,217,${0.55 * u})`;
          tc.fillRect(0, 0, fw, fh);
          const footY = dy + (footRow + 1) * s;
          const midX = dx + (fw / 2) * s;
          dx = midX - (midX - dx) * sqx;
          dy = footY - (footY - dy) * sqy;
        }
        // Glissade sur la glace : accroupi (plus encore au départ, l'élan), il tangue d'un
        // côté à l'autre comme un patineur. Ajout (retour de test).
        if (a.slideT > 0) {
          const lunge = Math.max(0, 1 - a.slideT / 0.15);
          const gx = 1.07 + 0.08 * lunge;
          const gy = 0.92 - 0.08 * lunge;
          const footY = dy + (footRow + 1) * s;
          const midX = dx + (fw / 2) * s;
          dx = midX - (midX - dx) * gx + Math.sin(a.slideT * 16) * 0.8 * k;
          dy = footY - (footY - dy) * gy;
          sqx *= gx;
          sqy *= gy;
        }
        // Enfoncement : la case descend et sa partie sous la ligne des pieds disparaît.
        const sink = a.deathT >= 0 && !a.downed ? Math.min(1, a.deathT / 0.4) * 0.45 * TILE * k : 0;
        const rows = sink > 0 ? Math.max(1, Math.min(fh, footRow + 1 - sink / s)) : fh;
        b.drawImage(
          src,
          fx,
          fy,
          fw,
          rows,
          Math.round(dx),
          // Dans les marches, un pixel de rebond à chaque pas.
          Math.round(dy + sink) - (a.onStairs && a.moving ? (Math.floor(a.animT * 8) % 2) * k : 0) - hop - Math.round(a.perch * k),
          Math.round(fw * s * sqx),
          Math.round(rows * s * sqy),
        );
        b.globalAlpha = 1;
      }
    }

    if (this.fieldSheet) fieldFx.draw(b, this.fieldSheet, camX, camY, k);
    director.drawOverlay(b, camX, camY, k, time);
    if (opts.particles) particles.draw(b, camX, camY, k);

    // Étalonnage par biome + progression clair → sombre.
    const amb = world.biome.ambiance;
    const d = opts.danger;
    const W = this.buf.width;
    const H = this.buf.height;
    if (opts.grading) {
      const desat = Math.min(1, amb.desat + d * 0.35);
      if (desat > 0) {
        b.globalCompositeOperation = 'saturation';
        b.fillStyle = `rgba(128,128,128,${desat})`;
        b.fillRect(0, 0, W, H);
      }
      if (amb.tintAlpha > 0) {
        b.globalCompositeOperation = 'multiply';
        b.fillStyle = rgba(amb.tint, amb.tintAlpha);
        b.fillRect(0, 0, W, H);
      }
      const dusk = Math.max(d, amb.night ?? 0);
      if (dusk > 0) {
        b.globalCompositeOperation = 'multiply';
        b.fillStyle = `rgba(52,44,110,${dusk * 0.6})`;
        b.fillRect(0, 0, W, H);
      }
      if (amb.lightAlpha > 0) {
        b.globalCompositeOperation = 'screen';
        b.fillStyle = rgba(amb.light, amb.lightAlpha * (1 - d));
        b.fillRect(0, 0, W, H);
      }
      // Météo : un ciel couvert (multiply) ou un soleil ardent (screen) par-dessus celui du biome.
      const wx = sky ? WEATHERS[sky.weather] : null;
      if (wx?.tint) {
        b.globalCompositeOperation = 'multiply';
        b.fillStyle = rgba(wx.tint[0], wx.tint[1]);
        b.fillRect(0, 0, W, H);
      }
      if (wx?.light) {
        b.globalCompositeOperation = 'screen';
        b.fillStyle = rgba(wx.light[0], wx.light[1]);
        b.fillRect(0, 0, W, H);
      }
      b.globalCompositeOperation = 'source-over';
    }
    // La pluie, la neige et le sable passent après l'étalonnage : ils restent visibles sous un ciel sombre.
    if (sky && opts.particles) sky.particles.draw(b, camX, camY, k);
    const haze = sky ? (WEATHERS[sky.weather].haze ?? 0) : 0;
    if (haze > 0) {
      // Brouillard : un voile laiteux, presque clair autour du joueur, épais sur les bords.
      const fog = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.12, W / 2, H / 2, Math.max(W, H) * 0.6);
      fog.addColorStop(0, `rgba(226,232,236,${haze * 0.35})`);
      fog.addColorStop(1, `rgba(226,232,236,${Math.min(0.92, haze * 2.1)})`);
      b.fillStyle = fog;
      b.fillRect(0, 0, W, H);
    }

    // Lampadaires : ils s'allument quand la nuit tombe (curseur clair → sombre).
    const night = Math.min(1, Math.max(0, (Math.max(d, amb.night ?? 0) - 0.3) / 0.3));
    if (night > 0) {
      b.globalCompositeOperation = 'lighter';
      for (const o of world.objects) {
        const glow = o.sprite.glow;
        if (glow) {
          // Cristaux de grotte (et sortie au jour) : une lueur froide qui respire
          // lentement, au cœur du sprite, sans flaque au sol (ils ne pendent pas en l'air).
          const gx = (o.x - camX) * k;
          const [, , sw, sh] = o.sprite.rect;
          const gy = (o.y - o.sprite.foot + sh / 2 - camY) * k;
          const r = Math.max(sw, sh) * 1.1 * k;
          if (gx < -r || gx > W + r || gy < -r || gy > H + r) continue;
          const pulse = 0.8 + 0.2 * Math.sin(time * 1.6 + o.x * 0.37);
          const g = b.createRadialGradient(gx, gy, 0, gx, gy, r);
          g.addColorStop(0, `rgba(${glow},${0.45 * night * pulse})`);
          g.addColorStop(1, `rgba(${glow},0)`);
          b.fillStyle = g;
          b.fillRect(gx - r, gy - r, r * 2, r * 2);
          continue;
        }
        if (!o.sprite.light) continue;
        const hx = (o.x - camX) * k;
        const hy = (o.y - o.sprite.foot + 7 - camY) * k;
        if (hx < -60 * k || hx > W + 60 * k || hy < -60 * k || hy > H + 60 * k) continue;
        const flicker = 0.92 + 0.08 * Math.sin(time * 9 + o.x);
        const halo = (cx: number, cy: number, r: number, a: number) => {
          const g = b.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(255,214,130,${a * night * flicker})`);
          g.addColorStop(1, 'rgba(255,190,90,0)');
          b.fillStyle = g;
          b.fillRect(cx - r, cy - r, r * 2, r * 2);
        };
        halo(hx, hy, 26 * k, 0.55);
        // Flaque de lumière au sol, sous le lampadaire. Pas d'ampoule peinte
        // par-dessus : ses deux pixels se voyaient, seule la diffusion reste.
        halo(hx, (o.y - camY) * k, 34 * k, 0.22);
      }
      b.globalCompositeOperation = 'source-over';
    }

    // Feux de camp (le Repaire) : un grand halo orangé qui palpite, la place s'éclaire autour.
    if (world.fires?.length) {
      b.globalCompositeOperation = 'lighter';
      for (const f of world.fires) {
        const hx = (f.x * TILE - camX) * k;
        const hy = (f.y * TILE - 6 - camY) * k;
        const flicker = 0.85 + 0.1 * Math.sin(time * 7.3) + 0.05 * Math.sin(time * 17.1 + 1.3);
        for (const [r, a] of [
          [110, 0.32],
          [44, 0.42],
        ] as const) {
          const rr = r * k * (0.97 + 0.03 * flicker);
          const g = b.createRadialGradient(hx, hy, 0, hx, hy, rr);
          g.addColorStop(0, `rgba(255,170,80,${a * flicker})`);
          g.addColorStop(0.5, `rgba(255,120,50,${a * 0.35 * flicker})`);
          g.addColorStop(1, 'rgba(255,90,30,0)');
          b.fillStyle = g;
          b.fillRect(hx - rr, hy - rr, rr * 2, rr * 2);
        }
      }
      b.globalCompositeOperation = 'source-over';
    }

    if (opts.glow) {
      const strength = 1 + d * 0.8;
      if (this.glowMap) {
        b.globalCompositeOperation = 'lighter';
        b.globalAlpha = Math.min(1, (0.75 + 0.12 * Math.sin(time * 2.1)) * strength);
        b.drawImage(this.glowMap, camX, camY, this.viewW, this.viewH, 0, 0, W, H);
        b.globalAlpha = 1;
        b.globalCompositeOperation = 'source-over';
      }
      if (opts.particles) particles.drawGlow(b, camX, camY, k, strength);
    }

    // Combat : effets, au-dessus de l'étalonnage (ils émettent leur propre lumière).
    combat.fx.draw(b, camX, camY, k);
    combat.powerUps.draw(b, camX, camY, k);
    this.drawHpBars(placed, player, opts);

    if (opts.vignette) {
      const v = Math.min(0.9, amb.vignette + d * 0.35);
      const grad = b.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(8,6,16,${v})`);
      b.fillStyle = grad;
      b.fillRect(0, 0, W, H);
    }

    if (opts.debug) {
      b.fillStyle = 'rgba(255,40,40,0.35)';
      for (let cy = Math.floor(camY / TILE); cy <= Math.floor((camY + this.viewH) / TILE); cy++) {
        for (let cx = Math.floor(camX / TILE); cx <= Math.floor((camX + this.viewW) / TILE); cx++) {
          if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || !world.blocked[cy * world.w + cx]) continue;
          b.fillRect((cx * TILE - camX) * k, (cy * TILE - camY) * k, TILE * k, TILE * k);
        }
      }
      if (playerPlaced) {
        b.strokeStyle = '#40e0d1';
        b.strokeRect((playerPlaced.x - 0.4 * TILE - camX) * k + 0.5, (playerPlaced.y - 0.5 * TILE - camY) * k + 0.5, 0.8 * TILE * k, 0.5 * TILE * k);
      }
    }

    this.sctx.drawImage(this.buf, 0, 0, this.screen.width, this.screen.height);
  }
}

/**
 * Taille pendant l'entrée en puissance d'un Pokémon de champion : il se
 * ramasse en concentrant son énergie, gonfle d'un coup à la libération, puis
 * revient à sa taille.
 */
function introScale(a: Actor): number {
  if (!a.intro) return 1;
  const { t, burst } = a.intro;
  if (t < burst) return 0.9 + 0.05 * (t / burst) ** 2;
  return 1 + 0.18 * Math.exp(-(t - burst) * 7);
}
