import { BLOB, EXTRA, ESSENTIALS_BLOCKS, ESSENTIALS_PAVEMENTS, ESSENTIALS_SHEETS, FOUNTAIN, GYM, SEA, TILE } from '../world/tiles';
import { loadImage } from './pmd';

// Atlas de travail : le tileset Pokémon, complété des tuiles extraites
// d'Essentials (cf. EXTRA, et ESSENTIALS_BLOCKS pour la fontaine et l'arène
// du Village), recopiées dans des cases vides.

export async function buildAtlas(tileset: HTMLImageElement): Promise<HTMLCanvasElement> {
  const atlas = document.createElement('canvas');
  atlas.width = tileset.width;
  atlas.height = tileset.height;
  const g = atlas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(tileset, 0, 0);
  paintFlatSea(g);
  paintIce(g);

  // Les planches se chargent ensemble ; une absente laisse ses cases vides (sans planter).
  const load = (url: string) =>
    loadImage(url).catch((err: unknown) => {
      console.warn(err);
      return null;
    });
  const [extras, outside, gym, fountain] = await Promise.all([
    load(ESSENTIALS_PAVEMENTS),
    load(ESSENTIALS_SHEETS.outside),
    load(ESSENTIALS_SHEETS.gym),
    load(ESSENTIALS_SHEETS.fountain),
  ]);
  if (extras) {
    for (const extra of Object.values(EXTRA)) {
      const [fc, fr] = extra.from;
      const [tc, tr] = extra.to;
      g.drawImage(extras, fc * TILE, fr * TILE, TILE, TILE, tc * TILE, tr * TILE, TILE, TILE);
    }
  }
  // Blocs d'Essentials, réduits de moitié au plus proche (lissage coupé plus haut) : leurs
  // pixels étant doublés, on retombe exactement sur l'original en 16 px.
  const sheets = { outside, gym };
  for (const b of ESSENTIALS_BLOCKS) {
    const src = sheets[b.sheet];
    if (!src) continue;
    const [w, h] = b.size;
    g.drawImage(src, b.from[0] * 32, b.from[1] * 32, w * 32, h * 32, b.to[0] * TILE, b.to[1] * TILE, w * TILE, h * TILE);
  }
  if (fountain) composeJet(g, fountain);
  if (gym) composeMidLine(g);
  paintVoid(g);
  return atlas;
}

/**
 * Le jet de la fontaine (FOUNTAIN.jet) : chaque image de l'autotile Fountain1
 * (96 × 128 px) se lit comme un autotile de RPG Maker XP posé en colonne d'une
 * case de large sur deux de haut. La case du haut prend les quarts gauche et
 * droit de la rangée « bord haut » (y 32-64), celle du bas ceux de la rangée
 * « bord bas » (y 96-128) ; le reste de la planche (croix rouges) ne sert pas.
 * Chaque quart de 16 × 32 px devient 8 × 16 px une fois réduit.
 */
function composeJet(g: CanvasRenderingContext2D, sheet: HTMLImageElement): void {
  const frames = Math.min(FOUNTAIN.jet.length, Math.floor(sheet.width / 96));
  for (let f = 0; f < frames; f++) {
    const [c, r] = FOUNTAIN.jet[f];
    for (const [sy, row] of [[32, 0], [96, 1]]) {
      const dy = (r + row) * TILE;
      g.drawImage(sheet, f * 96, sy, 16, 32, c * TILE, dy, TILE / 2, TILE);
      g.drawImage(sheet, f * 96 + 80, sy, 16, 32, c * TILE + TILE / 2, dy, TILE / 2, TILE);
    }
  }
}

/**
 * Ligne médiane du terrain d'arène sur le sol nu (GYM.mid) : Essentials ne la
 * dessine qu'aux bords du terrain (GYM.midL), sur une rangée de pixels de part
 * et d'autre de la limite des cases. On reprend le sol nu et on y recopie
 * cette rangée de pixels du bord gauche, toute blanche.
 */
function composeMidLine(g: CanvasRenderingContext2D): void {
  const copy = (from: readonly number[], to: readonly number[], fy: number, ty: number, h: number) =>
    g.putImageData(g.getImageData(from[0] * TILE, from[1] * TILE + fy, TILE, h), to[0] * TILE, to[1] * TILE + ty);
  const [up, down] = GYM.mid;
  copy(GYM.floor, up, 0, 0, TILE);
  copy(GYM.floor, down, 0, 0, TILE);
  copy(GYM.midL[0], up, TILE - 1, TILE - 1, 1);
  copy(GYM.midL[1], down, 0, 0, 1);
}

/** Le noir hors des murs de l'arène (GYM.void), comme autour des salles d'intérieur des jeux. */
function paintVoid(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#000';
  g.fillRect(GYM.void[0] * TILE, GYM.void[1] * TILE, TILE, TILE);
}

/**
 * Eau unie de l'Océan : la tuile d'eau du tileset porte un maillage de reflets
 * qui, répété sur toute une carte, chargeait l'image. Ici : le bleu de l'eau
 * des îlots (#5191af) et quelques pixels de reflet épars.
 */
function paintFlatSea(g: CanvasRenderingContext2D): void {
  const [c, r] = SEA.flat;
  const x0 = c * TILE;
  const y0 = r * TILE;
  g.fillStyle = '#5191af';
  g.fillRect(x0, y0, TILE, TILE);
  g.fillStyle = '#6aa6c4';
  for (const [x, y] of [[2, 3], [3, 3], [10, 6], [11, 6], [12, 6], [6, 11], [7, 11], [13, 13], [14, 13]]) g.fillRect(x0 + x, y0 + y, 1, 1);
}

/**
 * Glace de la Montagne glacée (BLOB.ice) : le tileset n'en a pas. On recopie
 * la plaque de neige (3×3 de bords, 28-30,15-17, et ses coins intérieurs,
 * 28-29,18-19) en recolorant chaque teinte en bleu glacier : la neige devient
 * la glace, son liseré sombre un bord plus profond. Puis deux traits de
 * reflet en biais, que la répétition des cases aligne en stries : c'est eux
 * qui disent « on glisse » (les jeux Pokémon marquent la glace ainsi).
 * Ajout : absent du jeu Godot.
 */
function paintIce(g: CanvasRenderingContext2D): void {
  const [ic, ir] = BLOB.ice.origin;
  const [nc, nr] = BLOB.ice.inner;
  // Teintes de la plaque de neige → glace (rgb exacts relevés sur la planche).
  const MAP: Record<string, [number, number, number]> = {
    '233,240,240': [156, 220, 238],
    '211,227,227': [184, 234, 248],
    '178,204,204': [118, 190, 222],
    '132,160,171': [86, 156, 200],
    '79,112,112': [52, 110, 152],
  };
  const BASE = MAP['233,240,240'].join();
  // Reflets : deux traits en biais par case, en coordonnées locales.
  const GLINT = new Set<string>();
  for (let i = 0; i < 5; i++) GLINT.add(`${2 + i},${7 - i}`);
  for (let i = 0; i < 3; i++) GLINT.add(`${10 + i},${14 - i}`);
  const copy = (sc: number, sr: number, dc: number, dr: number, w: number, h: number) => {
    const img = g.getImageData(sc * TILE, sr * TILE, w * TILE, h * TILE);
    const d = img.data;
    for (let y = 0; y < h * TILE; y++) {
      for (let x = 0; x < w * TILE; x++) {
        const i = (y * w * TILE + x) * 4;
        if (d[i + 3] === 0) continue;
        const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
        // Teinte imprévue (anticrénelage) : la plus proche par la luminosité.
        let rgb = MAP[key];
        if (!rgb) {
          const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
          rgb = l > 225 ? MAP['233,240,240'] : l > 200 ? MAP['211,227,227'] : l > 170 ? MAP['178,204,204'] : l > 120 ? MAP['132,160,171'] : MAP['79,112,112'];
        }
        if (rgb.join() === BASE && GLINT.has(`${x % TILE},${y % TILE}`)) rgb = [232, 250, 255];
        [d[i], d[i + 1], d[i + 2]] = rgb;
      }
    }
    g.putImageData(img, dc * TILE, dr * TILE);
  };
  copy(28, 15, ic, ir, 3, 3);
  copy(28, 18, nc, nr, 2, 2);
}
