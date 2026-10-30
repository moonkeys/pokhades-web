// Bombe de peinture de la DA « Tag sacré » (R4) : un trait, son halo, des
// postillons et des coulures qui descendent à vitesse de goutte une fois le
// trait passé. Le SVG rendu ne s'anime que sous un parent `.play` (cf. les
// règles `.spr` de la feuille). Tout est tiré d'une graine : chaque ouverture
// coule pareil.
//
// Les longueurs sont en unités du viewBox. Le SVG est étiré sans garder ses
// proportions (`preserveAspectRatio="none"`) : il faut donc le poser dans une
// boîte de même rapport que son viewBox, sinon gouttes et traits se déforment.

export interface Curve {
  /** Tracé SVG. */
  d: string;
  /** Point de la courbe en t ∈ [0, 1]. */
  at(t: number): [number, number];
  /** Longueur, pour les tirets de l'animation du trait. */
  len: number;
}

export interface SprayOptions extends Curve {
  color: string;
  width: number;
  drips?: number;
  /** Longueur maximale d'une coulure, en largeurs de trait (au-delà de 1,5). */
  dripMax?: number;
  dots?: number;
  seed?: number;
  /** Secondes avant que la bombe ne passe. */
  delay?: number;
  /** Durée du passage du trait, en secondes. */
  draw?: number;
  viewBox?: string;
  cls?: string;
}

const rand = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const f = (n: number) => n.toFixed(2);

/** Courbe de Bézier cubique [x0, y0, x1, y1, x2, y2, x3, y3]. */
export function curve(p: readonly number[]): Curve {
  const at = (t: number): [number, number] => {
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map((o) => k.reduce((s, c, i) => s + c * p[i * 2 + o], 0)) as [number, number];
  };
  let len = 0;
  for (let i = 1; i <= 40; i++) {
    const [ax, ay] = at((i - 1) / 40);
    const [bx, by] = at(i / 40);
    len += Math.hypot(bx - ax, by - ay);
  }
  return { d: `M${p[0]} ${p[1]} C${p.slice(2).join(' ')}`, at, len };
}

export function spray(o: SprayOptions): string {
  const { at, width, drips = 0, dripMax = 9, dots = 0, delay = 0, draw = 0.55 } = o;
  const r = rand(o.seed ?? 7);
  let out = '';
  for (let i = 0; i < dots; i++) {
    const t = r();
    const [x, y] = at(t);
    const a = r() * Math.PI * 2;
    const dist = width * (0.7 + r() * 1.8);
    out += `<circle class="dot" cx="${f(x + Math.cos(a) * dist)}" cy="${f(y + Math.sin(a) * dist)}" r="${f(width * (0.04 + r() * 0.12))}" style="--w:${f(delay + t * draw)}s"/>`;
  }
  for (let i = 0; i < drips; i++) {
    const t = 0.04 + r() * 0.92;
    const [x0, y] = at(t);
    const x = x0 + (r() - 0.5) * width * 0.5;
    const l = width * (1.5 + r() ** 2 * dripMax); // beaucoup de courtes, quelques longues
    const w = width * (0.22 + r() * 0.28);
    const vars = `--w:${f(delay + t * draw + 0.05 + r() * 0.5)}s;--d:${f(0.4 + (l / width) * 0.18)}s;--len:${f(l)}`;
    out += `<line class="drip" x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y + l)}" stroke-width="${f(w)}" style="${vars}"/>`;
    out += `<circle class="bulb" cx="${f(x)}" cy="${f(y)}" r="${f(w * 0.8)}" style="${vars};--ty:${f(l)}px"/>`;
  }
  return `<svg class="spr ${o.cls ?? ''}" viewBox="${o.viewBox ?? '0 0 160 90'}" preserveAspectRatio="none" style="--c:${o.color};--len:${f(o.len)};--w0:${delay}s;--draw:${draw}s"><path class="halo" d="${o.d}" stroke-width="${f(width * 2)}"/><path class="main" d="${o.d}" stroke-width="${width}"/>${out}</svg>`;
}

/** Polygones `clip-path` des deux moitiés de part et d'autre d'une courbe (repère 160 × 90). */
export function halves(p: readonly number[]): { left: string; left0: string; right: string } {
  const { at } = curve(p);
  const s = Array.from({ length: 13 }, (_, i) => at(i / 12)).map(([x, y]) => [f(x / 1.6), f(y / 0.9)]);
  const poly = (edge: string, pts: string[][]) => `polygon(${[[edge, s[0][1]], ...pts, [edge, s[12][1]]].map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
  return { left: poly('0', s), left0: poly('0', s.map(([, y]) => ['0', y])), right: poly('100', s) };
}
