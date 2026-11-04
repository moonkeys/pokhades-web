// Ce que l'hôte dessine de la salle, rejoué chez l'invité (jeu en ligne).
//
// Arbres à baies, coffres, portes et récompense, boutique, dresseurs, zones des
// dons… : une dizaine de systèmes, dont l'état naît de tirages faits pendant la
// run, chez l'hôte seul. Plutôt que de recopier chacun, l'hôte les fait dessiner
// dans un contexte qui enregistre (DrawRecorder), avec une caméra neutre
// (camX = camY = 0, k = 1) : les ordres sont alors en pixels du monde. Tous ces
// dessins sont affines en (camX, camY, k), si bien que l'invité les rejoue avec
// sa propre caméra par une simple transformation (replay).

export type Cmd = unknown[];

const r2 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/** Une image dessinée : son chemin (planche servie par le jeu) ou un canvas fabriqué, transmis une fois. */
export type ImageRef = string;

export class DrawRecorder {
  private cmds: Cmd[] = [];
  private readonly real: CanvasRenderingContext2D;
  private readonly grads = new Map<unknown, number>();
  private nextGrad = 0;
  private readonly canvasIds = new WeakMap<object, string>();
  private nextCanvas = 0;
  /** Canvas fabriqués (icônes de la boutique…) vus depuis le dernier envoi : id → image en data URL. */
  defs: Record<string, string> = {};
  readonly ctx: CanvasRenderingContext2D;

  constructor() {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    this.real = c.getContext('2d')!;
    const self = this;
    this.ctx = new Proxy(this.real, {
      get(t, p) {
        const v = (t as unknown as Record<string | symbol, unknown>)[p];
        if (typeof v !== 'function') return v;
        const fn = v as (...a: unknown[]) => unknown;
        return (...args: unknown[]) => {
          if (p === 'drawImage') {
            const id = self.imageRef(args[0]);
            if (id) self.cmds.push(['drawImage', id, ...args.slice(1).map(r2)]);
            return;
          }
          if (p === 'createRadialGradient' || p === 'createLinearGradient') {
            const g = fn.apply(t, args) as CanvasGradient;
            const id = self.nextGrad++;
            self.cmds.push([p, id, ...args.map(r2)]);
            const wrapped = new Proxy(g, {
              get(gt, gp) {
                if (gp === 'addColorStop') {
                  return (o: number, color: string) => {
                    self.cmds.push(['stop', id, r2(o), color]);
                    gt.addColorStop(o, color);
                  };
                }
                return (gt as unknown as Record<string | symbol, unknown>)[gp];
              },
            });
            self.grads.set(wrapped, id);
            return wrapped;
          }
          self.cmds.push([p as string, ...args.map(r2)]);
          return fn.apply(t, args);
        };
      },
      set(t, p, val) {
        const g = self.grads.get(val);
        self.cmds.push(['=', p as string, g !== undefined ? { g } : r2(val)]);
        // Un dégradé enveloppé n'est pas un vrai CanvasGradient : le contexte réel n'en a pas besoin.
        if (g === undefined) (t as unknown as Record<string | symbol, unknown>)[p] = val;
        return true;
      },
    });
  }

  private imageRef(src: unknown): string | null {
    if (src instanceof HTMLImageElement) {
      if (!src.complete || !src.naturalWidth) return null;
      try {
        return new URL(src.src).pathname;
      } catch {
        return null;
      }
    }
    if (src instanceof HTMLCanvasElement) {
      let id = this.canvasIds.get(src);
      if (!id) {
        id = `#${this.nextCanvas++}`;
        this.canvasIds.set(src, id);
        this.defs[id] = src.toDataURL();
      }
      return id;
    }
    return null;
  }

  /** Enregistre ce que `draw` dessine, contexte remis à neuf. */
  record(draw: (b: CanvasRenderingContext2D) => void): Cmd[] {
    this.cmds = [];
    this.real.reset?.();
    try {
      draw(this.ctx);
    } catch {
      // Un dessin qui échoue ici (lecture d'un état du canvas non pris en charge) est simplement omis.
    }
    return this.cmds;
  }

  /** Les canvas fabriqués à transmettre, une fois chacun. */
  takeDefs(): Record<string, string> {
    const d = this.defs;
    this.defs = {};
    return d;
  }
}

/** Invité : les images citées par les ordres, chargées à la demande. */
export class ImageBank {
  private readonly images = new Map<string, HTMLImageElement>();

  define(defs: Record<string, string>): void {
    for (const [id, url] of Object.entries(defs)) this.load(id, url);
  }

  private load(id: string, url: string): HTMLImageElement {
    const img = new Image();
    img.src = url;
    this.images.set(id, img);
    return img;
  }

  get(id: string): HTMLImageElement | null {
    // Les chemins du jeu s'entendent depuis la racine du site de l'hôte : on garde celle d'ici.
    const img = this.images.get(id) ?? (id.startsWith('#') ? null : this.load(id, id));
    return img && img.complete && img.naturalWidth ? img : null;
  }
}

/** Rejoue des ordres enregistrés en pixels du monde, vus par la caméra (camX, camY, k). */
export function replay(b: CanvasRenderingContext2D, cmds: readonly Cmd[], camX: number, camY: number, k: number, bank: ImageBank): void {
  const grads = new Map<number, CanvasGradient>();
  b.save();
  b.transform(k, 0, 0, k, -camX * k, -camY * k);
  const ctx = b as unknown as Record<string, unknown>;
  for (const c of cmds) {
    const op = c[0] as string;
    if (op === '=') {
      const v = c[2] as unknown;
      ctx[c[1] as string] = v && typeof v === 'object' && 'g' in v ? grads.get((v as { g: number }).g) : v;
    } else if (op === 'drawImage') {
      const img = bank.get(c[1] as string);
      if (img) (b.drawImage as (...a: unknown[]) => void).apply(b, [img, ...c.slice(2)]);
    } else if (op === 'createRadialGradient' || op === 'createLinearGradient') {
      grads.set(c[1] as number, (b[op] as (...a: number[]) => CanvasGradient).apply(b, c.slice(2) as number[]));
    } else if (op === 'stop') {
      grads.get(c[1] as number)?.addColorStop(c[2] as number, c[3] as string);
    } else if (op === 'setTransform' || op === 'resetTransform') {
      // Une remise à zéro du repère casserait la caméra de l'invité : ignorée.
    } else {
      const fn = ctx[op];
      if (typeof fn === 'function') (fn as (...a: unknown[]) => void).apply(b, c.slice(1));
    }
  }
  b.restore();
}
