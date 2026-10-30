// Planches PMD de la page de config : chargées une fois, recadrées sur leurs
// pixels opaques (les cases PMD sont souvent bien plus grandes que le
// Pokémon), puis animées par une seule boucle pour toute la page.
//
// Format SpriteCollab : une colonne par frame, une ligne par direction, dans
// l'ordre bas, bas-droite, droite, haut-droite, haut, haut-gauche, gauche,
// bas-gauche (cf. assets/pmd.ts).

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
const loaded = new Map<string, HTMLImageElement>();

export function image(url: string): Promise<HTMLImageElement | null> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      // SpriteCollab sert ses fichiers avec CORS : on peut lire leurs pixels pour les recadrer.
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loaded.set(url, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, pending);
  }
  return pending;
}

const pixels = new WeakMap<HTMLImageElement, Uint8ClampedArray | null>();
function alphaOf(img: HTMLImageElement): Uint8ClampedArray | null {
  if (!pixels.has(img)) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    try {
      ctx?.drawImage(img, 0, 0);
      pixels.set(img, ctx ? ctx.getImageData(0, 0, c.width, c.height).data : null);
    } catch {
      pixels.set(img, null);
    }
  }
  return pixels.get(img) ?? null;
}

const boxes = new Map<string, Box>();
/**
 * Rectangle opaque, dans le repère d'une case : de toutes les cases de la
 * planche (`frame0` faux), ou de la première case de face seulement.
 */
function opaqueBox(url: string, img: HTMLImageElement, fw: number, fh: number, frame0: boolean): Box {
  const key = `${url}|${fw}|${fh}|${frame0}`;
  const known = boxes.get(key);
  if (known) return known;
  const data = alphaOf(img);
  const W = img.naturalWidth;
  const maxX = frame0 ? Math.min(fw, W) : W;
  const maxY = frame0 ? Math.min(fh, img.naturalHeight) : img.naturalHeight;
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  if (data) {
    for (let y = 0; y < maxY; y++) {
      const fy = y % fh;
      for (let x = 0; x < maxX; x++) {
        if (data[(y * W + x) * 4 + 3] < 8) continue;
        const fx = x % fw;
        if (fx < x0) x0 = fx;
        if (fx > x1) x1 = fx;
        if (fy < y0) y0 = fy;
        if (fy > y1) y1 = fy;
      }
    }
  }
  const box = x1 < 0 ? { x: 0, y: 0, w: fw, h: fh } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  boxes.set(key, box);
  return box;
}

/** Prépare un canvas net à la taille CSS donnée (écrans haute densité compris). */
function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Échelle entière quand le sprite tient au moins une fois, pour garder le pixel art net. */
function fit(box: Box, w: number, h: number, maxScale: number): number {
  const s = Math.min(w / box.w, h / box.h, maxScale);
  return s >= 1 ? Math.floor(s) : s;
}

function drawThumb(canvas: HTMLCanvasElement, url: string, img: HTMLImageElement, fw: number, fh: number) {
  const size = Number(canvas.dataset.size) || 40;
  const ctx = sizeCanvas(canvas, size, size);
  if (!ctx) return;
  const box = opaqueBox(url, img, fw, fh, true);
  const dpr = canvas.width / size;
  const s = fit(box, size, size, 3) * dpr;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, (canvas.width - box.w * s) / 2, (canvas.height - box.h * s) / 2, box.w * s, box.h * s);
}

const lazy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      lazy.unobserve(e.target);
      const c = e.target as HTMLCanvasElement;
      const { url, fw, fh } = c.dataset;
      if (url) void image(url).then((img) => img && drawThumb(c, url, img, Number(fw), Number(fh)));
    }
  },
  { rootMargin: '200px' },
);

/** Vignette : la première case de face de la marche, recadrée ; dessinée quand elle approche de l'écran. */
export function thumb(parent: Element, walk: { url: string; fw: number; fh: number } | null, size = 40): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'thumb';
  c.dataset.size = String(size);
  c.style.width = c.style.height = `${size}px`;
  parent.appendChild(c);
  if (!walk) return c;
  c.dataset.url = walk.url;
  c.dataset.fw = String(walk.fw);
  c.dataset.fh = String(walk.fh);
  // Déjà chargée : tout de suite, sans attendre l'observateur (le plateau se redessine souvent).
  const img = loaded.get(walk.url);
  if (img) drawThumb(c, walk.url, img, walk.fw, walk.fh);
  else lazy.observe(c);
  return c;
}

/** Réglages communs à toutes les animations de la page. */
export const playback = { dir: 0, speed: 1 };

interface Player {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  fw: number;
  fh: number;
  durations: number[];
  total: number;
  box: Box;
  scale: number;
}
const players = new Set<Player>();
let clock = 0;
let last = performance.now();

function tick(now: number) {
  clock += ((now - last) / 1000) * 60 * playback.speed;
  last = now;
  for (const p of players) {
    if (!p.canvas.isConnected) {
      players.delete(p);
      continue;
    }
    const ctx = p.canvas.getContext('2d');
    if (!ctx) continue;
    let t = clock % p.total;
    let frame = 0;
    while (frame < p.durations.length - 1 && t >= p.durations[frame]) t -= p.durations[frame++];
    const rows = Math.max(1, Math.floor(p.img.naturalHeight / p.fh));
    const row = rows > 1 ? Math.min(rows - 1, playback.dir) : 0;
    const { box, scale: s } = p;
    ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    // Ancré en bas : les Pokémon gardent les pieds au même endroit d'une animation à l'autre.
    ctx.drawImage(p.img, frame * p.fw + box.x, row * p.fh + box.y, box.w, box.h, (p.canvas.width - box.w * s) / 2, p.canvas.height - box.h * s - 4, box.w * s, box.h * s);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/**
 * Échelle d'une espèce : sa marche occupe les trois quarts du cadre. Les
 * autres animations ne la dépassent pas, pour qu'un Pokémon endormi ne
 * paraisse pas deux fois plus gros qu'en attaque.
 */
export async function speciesScale(url: string, fw: number, fh: number, w: number, h: number): Promise<number> {
  const img = await image(url);
  return img ? fit(opaqueBox(url, img, fw, fh, false), w * 0.75, h * 0.75, 4) : 4;
}

/** Anime une planche dans un canvas (cadré sur toutes ses cases) ; faux si l'image ne charge pas. */
export async function animate(canvas: HTMLCanvasElement, url: string, fw: number, fh: number, durations: number[], w: number, h: number, maxScale = 4): Promise<boolean> {
  const img = await image(url);
  if (!img) return false;
  const ctx = sizeCanvas(canvas, w, h);
  if (!ctx) return false;
  const box = opaqueBox(url, img, fw, fh, false);
  const dpr = canvas.width / w;
  const durs = durations.length ? durations : [8];
  players.add({ canvas, img, fw, fh, durations: durs, total: durs.reduce((a, b) => a + b, 0), box, scale: fit(box, w, h - 4, maxScale) * dpr });
  return true;
}
