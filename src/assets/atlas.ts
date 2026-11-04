import { BLOB, EXTRA, ESSENTIALS_PAVEMENTS, SEA, TILE } from '../world/tiles';
import { loadImage } from './pmd';

// Atlas de travail : le tileset Pokémon, complété des tuiles extraites
// d'Essentials (cf. EXTRA), recopiées dans des cases vides.

export async function buildAtlas(tileset: HTMLImageElement): Promise<HTMLCanvasElement> {
  const atlas = document.createElement('canvas');
  atlas.width = tileset.width;
  atlas.height = tileset.height;
  const g = atlas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(tileset, 0, 0);
  paintFlatSea(g);
  paintIce(g);

  let extras: HTMLImageElement;
  try {
    extras = await loadImage(ESSENTIALS_PAVEMENTS);
  } catch (err) {
    // Sans ce fichier, on garde le tileset seul (les cases restent vides).
    console.warn(err);
    return atlas;
  }
  for (const extra of Object.values(EXTRA)) {
    const [fc, fr] = extra.from;
    const [tc, tr] = extra.to;
    g.drawImage(extras, fc * TILE, fr * TILE, TILE, TILE, tc * TILE, tr * TILE, TILE, TILE);
  }
  return atlas;
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
