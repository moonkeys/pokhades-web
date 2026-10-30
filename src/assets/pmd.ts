// Planches PMD SpriteCollab (data/pmd/NNNN/), lues directement depuis le
// dépôt du jeu : AnimData.xml, Walk-Anim.png et les actions de combat
// (Attack, Shoot, Charge, Hurt) que scripts/import-assets.ts a copiées.
//
// Format : une colonne par frame, une ligne par direction, dans l'ordre
// bas, bas-droite, droite, haut-droite, haut, haut-gauche, gauche, bas-gauche.
// Comme PMDSprites.gd, on calcule une fois par espèce la ligne des pieds
// (pixel opaque le plus bas sur toute la planche) et le centre horizontal
// opaque de la première frame de face : c'est ce qui ancre le sprite au sol.

export interface PmdSheet {
  id: number;
  image: HTMLImageElement;
  fw: number;
  fh: number;
  frames: number;
  rows: number;
  /** Images par seconde : 60 / première durée, comme PMDSprites.gd:473-478 (choix de parité). */
  fps: number;
  /** Ligne du pixel opaque le plus bas, dans le repère d'une frame. */
  footRow: number;
  /** Centre horizontal des pixels opaques de la frame de face. */
  centerCol: number;
  /** Largeur opaque de la frame de face (sert à dimensionner l'ombre). */
  bodyWidth: number;
  /** Ligne du pixel opaque le plus haut de la frame de face : le sommet de la tête. */
  topRow: number;
  /** Actions de combat chargées, par nom PMD (Attack, Shoot…). */
  actions: Map<string, ActionAnim>;
}

/**
 * Action jouée une fois. Ses cases n'ont pas la taille de la marche : on
 * aligne les centres de case, qui marquent le même point du corps dans
 * toutes les planches SpriteCollab.
 */
export interface ActionAnim {
  /** Nom PMD de l'action (Attack, Sleep…). */
  name: string;
  image: HTMLImageElement;
  fw: number;
  fh: number;
  rows: number;
  /** Durée de chaque frame, en secondes (les durées PMD sont en 1/60 s). */
  durations: number[];
  total: number;
}

/** Actions de combat : le joueur a les quatre, les sauvages seulement Hurt (cf. import-assets). */
export const PLAYER_ACTIONS = ['Attack', 'Shoot', 'Charge', 'Hurt', 'Sleep'] as const;
export const WILD_ACTIONS = ['Hurt'] as const;

export interface SpeciesInfo {
  id: number;
  name: string;
  heightM: number;
  weightKg: number;
}

const sheetCache = new Map<string, Promise<PmdSheet | null>>();
const infoCache = new Map<number, Promise<SpeciesInfo>>();

const pad4 = (id: number) => String(id).padStart(4, '0');

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable : ${url}`));
    img.src = url;
  });
}

interface AnimEntry {
  fw: number;
  fh: number;
  durations: number[];
  copyOf: string | null;
}

function parseAnims(xmlText: string): Map<string, AnimEntry> {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const anims = new Map<string, AnimEntry>();
  for (const el of doc.querySelectorAll('Anims > Anim')) {
    const name = el.querySelector('Name')?.textContent ?? '';
    const num = (tag: string) => Number(el.querySelector(tag)?.textContent ?? 0);
    anims.set(name, {
      fw: num('FrameWidth'),
      fh: num('FrameHeight'),
      durations: [...el.querySelectorAll('Durations > Duration')].map((d) => Number(d.textContent)),
      copyOf: el.querySelector('CopyOf')?.textContent ?? null,
    });
  }
  return anims;
}

function measure(image: HTMLImageElement, fw: number, fh: number) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  const alpha = (x: number, y: number) => data[(y * image.width + x) * 4 + 3];

  let footRow = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (alpha(x, y) > 0) footRow = Math.max(footRow, y % fh);
    }
  }
  let minX = fw;
  let maxX = 0;
  let minY = fh;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      if (alpha(x, y) > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
      }
    }
  }
  if (minX > maxX) return { footRow: fh - 1, centerCol: fw / 2, bodyWidth: fw / 2, topRow: 0 };
  return { footRow, centerCol: (minX + maxX + 1) / 2, bodyWidth: maxX - minX + 1, topRow: minY };
}

/** Résout <CopyOf> : l'animation peut réutiliser la planche d'une autre. */
function resolve(anims: Map<string, AnimEntry>, name: string): { file: string; anim: AnimEntry } | null {
  let anim = anims.get(name);
  let file = name;
  for (let hop = 0; anim?.copyOf && hop < 4; hop++) {
    file = anim.copyOf;
    anim = anims.get(anim.copyOf);
  }
  return anim && anim.fw > 0 ? { file, anim } : null;
}

export function loadSheet(id: number, actions: readonly string[] = []): Promise<PmdSheet | null> {
  const key = `${id}:${actions.join(',')}`;
  let pending = sheetCache.get(key);
  if (!pending) {
    pending = (async () => {
      const dir = `/game/data/pmd/${pad4(id)}`;
      try {
        const res = await fetch(`${dir}/AnimData.xml`);
        if (!res.ok) throw new Error(`AnimData.xml absent pour ${id}`);
        const anims = parseAnims(await res.text());
        const found = resolve(anims, 'Walk');
        if (!found) throw new Error(`Pas d'animation Walk pour ${id}`);
        const walk = found.anim;
        const image = await loadImage(`${dir}/${found.file}-Anim.png`);
        const loaded = new Map<string, ActionAnim>();
        await Promise.all(
          actions.map(async (name) => {
            const a = resolve(anims, name);
            if (!a) return;
            const img = a.file === found.file ? image : await loadImage(`${dir}/${a.file}-Anim.png`).catch(() => null);
            if (!img) return;
            const durations = a.anim.durations.map((d) => d / 60);
            loaded.set(name, {
              name,
              image: img,
              fw: a.anim.fw,
              fh: a.anim.fh,
              rows: Math.max(1, Math.floor(img.height / a.anim.fh)),
              durations,
              total: durations.reduce((t, d) => t + d, 0),
            });
          }),
        );
        const frames = Math.max(1, Math.floor(image.width / walk.fw));
        const rows = Math.max(1, Math.floor(image.height / walk.fh));
        const firstDuration = walk.durations[0] || 8;
        return {
          id,
          image,
          fw: walk.fw,
          fh: walk.fh,
          frames,
          rows,
          fps: 60 / firstDuration,
          ...measure(image, walk.fw, walk.fh),
          actions: loaded,
        };
      } catch (err) {
        console.warn(err);
        return null;
      }
    })();
    sheetCache.set(key, pending);
  }
  return pending;
}

export function loadInfo(id: number): Promise<SpeciesInfo> {
  let pending = infoCache.get(id);
  if (!pending) {
    pending = fetch(`/game/data/pokeapi/pokemon/${id}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d: { name_fr?: string; height_m?: number; weight_kg?: number }) => ({
        id,
        name: d.name_fr ?? `#${id}`,
        heightM: d.height_m ?? 0,
        weightKg: d.weight_kg ?? 0,
      }));
    infoCache.set(id, pending);
  }
  return pending;
}

/** Multiplicateur de taille de PokemonData.size_mult (scripts/pokemon/PokemonData.gd:59-66). */
export function sizeMult(info: SpeciesInfo): number {
  if (info.heightM <= 0) return 1;
  let effective = info.heightM;
  if (info.weightKg > 0) effective = Math.sqrt(info.heightM * Math.cbrt(info.weightKg));
  return Math.min(1.8, Math.max(0.6, Math.sqrt(effective / 1.0)));
}
