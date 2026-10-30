import type { WorldMap } from '../world/generate';

// Vagues qui s'échouent sur le rivage (Plage, îlots de l'Océan). On travaille
// au pixel du tileset, pas à la case : la ligne d'eau des tuiles de rivage
// passe au milieu des cases, et c'est elle que la vague doit lécher.
//
// Au bake, on relève sur le sol cuit quels pixels sont de l'eau (teinte
// bleue dominante), puis une distance signée à cette ligne : négative au
// large, positive sur le sable. À chaque image, chaque pixel de la bande
// littorale compare sa distance au front de la vague, qui monte du large,
// déborde sur le sable puis se retire en laissant du sable mouillé.

/** Largeur de la bande animée, en pixels : côté large et côté sable. */
const SEA_BAND = 14;
const LAND_BAND = 12;
/** Durée d'une vague, en secondes : lente, c'est un ressac de plage, pas une tempête. */
const PERIOD = 7.5;
/** Part du cycle passée à monter (le reste : retrait, puis repos sous l'eau). */
const RISE = 0.42;
const RETREAT = 0.9;
/** D'où part la houle, côté large (px) : plus près du bord, elle n'occupe pas tout l'écran. */
const SWELL_START = 12;

const smooth = (t: number) => t * t * (3 - 2 * t);

export class ShoreWaves {
  /** Pixels de la bande : coordonnées monde et distance signée au bord de l'eau. */
  private xs = new Int16Array(0);
  private ys = new Int16Array(0);
  private ds = new Float32Array(0);
  /** Déphasage de la vague, par pixel (calculé au bake : trois sinus par pixel et par image, c'était trop). */
  private phases = new Float32Array(0);
  private img: ImageData | null = null;
  private readonly canvas = document.createElement('canvas');

  /** Relève la ligne d'eau sur le sol cuit. Rien hors des biomes côtiers. */
  bake(world: WorldMap, ground: HTMLCanvasElement): void {
    this.xs = new Int16Array(0);
    this.ys = new Int16Array(0);
    this.ds = new Float32Array(0);
    this.phases = new Float32Array(0);
    if (!world.biome.coast) return;
    const W = ground.width;
    const H = ground.height;
    const px = ground.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
    // Eau : le bleu domine nettement le rouge. Le sable pâle, l'écume du
    // tileset et l'herbe n'y répondent pas.
    const water = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) water[i] = px[i * 4 + 2] > px[i * 4] + 25 ? 1 : 0;

    // Distance (chanfrein 3-4, ÷3 ≈ pixels) au pixel de l'autre camp le plus proche.
    const INF = 1e4;
    const dist = (inside: number) => {
      const d = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) d[i] = water[i] === inside ? INF : 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (d[i] === 0) continue;
          let v = d[i];
          if (x > 0) v = Math.min(v, d[i - 1] + 3);
          if (y > 0) {
            v = Math.min(v, d[i - W] + 3);
            if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
            if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
          }
          d[i] = v;
        }
      }
      for (let y = H - 1; y >= 0; y--) {
        for (let x = W - 1; x >= 0; x--) {
          const i = y * W + x;
          if (d[i] === 0) continue;
          let v = d[i];
          if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
          if (y < H - 1) {
            v = Math.min(v, d[i + W] + 3);
            if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
            if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
          }
          d[i] = v;
        }
      }
      return d;
    };
    const toWater = dist(0);
    const toLand = dist(1);

    const xs: number[] = [];
    const ys: number[] = [];
    const ds: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = water[i] ? -toLand[i] / 3 : toWater[i] / 3 - 1;
        if (d < -SEA_BAND || d > LAND_BAND) continue;
        xs.push(x);
        ys.push(y);
        ds.push(d);
      }
    }
    this.xs = Int16Array.from(xs);
    this.ys = Int16Array.from(ys);
    this.ds = Float32Array.from(ds);
    // Déphasage lent le long du rivage : la vague déferle de proche en
    // proche au lieu d'arriver partout à la fois.
    this.phases = Float32Array.from(xs, (x, n) => {
      const y = ys[n];
      // Fréquences basses : de longs pans de côte bougent ensemble, sans frémir.
      return 0.5 + 0.3 * Math.sin(x * 0.009 + y * 0.006) + 0.2 * Math.sin(x * 0.0035 - y * 0.008 + 1.3);
    });
  }

  draw(b: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number, k: number, time: number): void {
    if (!this.ds.length) return;
    const ox = Math.floor(camX);
    const oy = Math.floor(camY);
    const w = Math.ceil(viewW) + 1;
    const h = Math.ceil(viewH) + 1;
    if (!this.img || this.img.width !== w || this.img.height !== h) {
      this.img = new ImageData(w, h);
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const out = this.img.data;
    out.fill(0);
    const put = (i: number, r: number, g: number, bl: number, a: number) => {
      // Mélange sur ce qu'on a déjà posé dans ce pixel (écume sur nappe d'eau).
      const o = i * 4;
      const a0 = out[o + 3] / 255;
      const na = a + a0 * (1 - a);
      if (na <= 0) return;
      out[o] = (r * a + out[o] * a0 * (1 - a)) / na;
      out[o + 1] = (g * a + out[o + 1] * a0 * (1 - a)) / na;
      out[o + 2] = (bl * a + out[o + 2] * a0 * (1 - a)) / na;
      out[o + 3] = na * 255;
    };

    for (let n = 0; n < this.ds.length; n++) {
      const x = this.xs[n] - ox;
      const y = this.ys[n] - oy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const wx = this.xs[n];
      const d = this.ds[n];
      const c = time / PERIOD + this.phases[n];
      const u = c - Math.floor(c);
      // Portée de chaque vague, variable d'une vague à l'autre.
      const reach = 5 + 4 * (0.5 + 0.5 * Math.sin(Math.floor(c) * 2.39 + wx * 0.004));
      let front: number;
      // Montée et retrait en douceur aux deux bouts : la vague ralentit en
      // arrivant au plus haut au lieu de s'y cogner.
      if (u < RISE) front = -SWELL_START + (reach + SWELL_START) * smooth(u / RISE);
      else if (u < RETREAT) front = reach - (reach + 2) * smooth((u - RISE) / (RETREAT - RISE));
      else front = -2;
      const retreating = u >= RISE;
      const fade = retreating ? 1 - smooth((u - RISE) / (RETREAT - RISE)) : 1;
      const i = y * w + x;

      // Sable mouillé : là où la vague est passée, le temps de sécher.
      if (d > 0 && retreating && d < reach && d > front) put(i, 168, 146, 98, 0.24 * (1 - (u - RISE) / (1 - RISE)));
      // Nappe d'eau qui recouvre le sable.
      if (d > -1 && d < front) put(i, 128, 200, 218, 0.55 * (0.4 + 0.6 * fade));
      // Front d'écume : une ligne d'un à deux pixels, qui s'amincit au retrait.
      const foam = retreating ? 1 : 1.5;
      if (d <= front && d > front - foam) {
        // Au large, la houle naît transparente et se lève en approchant :
        // sinon elle surgissait d'un coup en arc isolé au bord de la bande.
        put(i, 248, 252, 255, d < -1 ? 0.28 * smooth(Math.min(1, Math.max(0, 1 + front / SWELL_START))) : 0.75 * (0.3 + 0.7 * fade));
      }
    }

    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.img, 0, 0);
    b.drawImage(this.canvas, Math.round((ox - camX) * k), Math.round((oy - camY) * k), w * k, h * k);
  }
}
