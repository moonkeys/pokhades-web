import { EXTRA, ESSENTIALS_PAVEMENTS, SEA, TILE } from '../world/tiles';
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
