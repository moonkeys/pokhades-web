import { loadSheet } from '../assets/pmd';
import { DONORS, type DonorId } from '../combat/boons';
import { MERCHANT_SPECIES } from '../data/species';
import { typeColor } from '../render/combatfx';
import type { Reward } from '../run/run';

// Icônes des récompenses de salle : sur l'étiquette des portes (HTML) et
// au-dessus de la récompense posée au centre (canvas). Elles remplacent les
// losanges de couleur du jeu (CombatArena._spawn_boon), qui ne disaient rien
// tant qu'on n'avait pas lu l'étiquette.
//   - butin : la Pièce Rune d'Essentials (Items/AMULETCOIN), la pièce d'or ;
//   - nouvelle attaque : une CT (Items/machine_NORMAL), le disque des jeux ;
//   - don d'un légendaire : sa silhouette en pixels (sa planche PMD), dans une
//     vignette carrée d'encre et de papier à la couleur de son type (retour de
//     test : l'illustration officielle jurait avec le pixel art). En HTML,
//     même au-dessus de la récompense posée ;
//   - boutique : Perrserker, le marchand, dans la même vignette.
// Écart voulu avec le jeu : la porte d'un don annonce déjà son donateur
// (Run.offers le tire), le jeu ne le révélait qu'en prenant la récompense.

const ITEMS = '/game/assets/essentials/items';
const ICON_URL: Record<Exclude<Reward, 'boon'>, string> = {
  loot: `${ITEMS}/AMULETCOIN.png`,
  skill: `${ITEMS}/machine_NORMAL.png`,
};

/**
 * Un Pokémon en pixels : la première image de sa planche PMD (de face), recadrée sur son
 * corps, dans un canvas agrandi sans lissage. Retour de test : les illustrations officielles
 * des badges « ne vont pas avec la DA du jeu », qui est en pixel art.
 */
export function pixelMon(species: number): HTMLElement {
  const box = document.createElement('span');
  box.className = 'rw-px';
  const canvas = document.createElement('canvas');
  box.append(canvas);
  void loadSheet(species).then((sh) => {
    if (!sh) return;
    const half = Math.ceil(Math.max(sh.bodyWidth, sh.footRow + 1 - sh.topRow) / 2) + 1;
    const cx = Math.round(sh.centerCol);
    const cy = Math.round((sh.topRow + sh.footRow + 1) / 2);
    canvas.width = canvas.height = half * 2;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(sh.image, cx - half, cy - half, half * 2, half * 2, 0, 0, half * 2, half * 2);
  });
  return box;
}

/**
 * Le badge d'un légendaire : son illustration, en grand, détourée d'encre, avec un halo à la
 * couleur de son type (retour de test : « le petit sprite qui flotte, c'est pas très beau ;
 * mets le Pokémon plus gros, l'image dessinée »).
 */
export function donorBadge(donor: DonorId): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'rw-badge art';
  badge.style.setProperty('--c', typeColor(DONORS[donor].type));
  const img = document.createElement('img');
  img.alt = DONORS[donor].name;
  img.src = `/game/artwork/${DONORS[donor].dex}.png`;
  img.draggable = false;
  badge.append(img);
  return badge;
}

/** La boutique : Perrserker, le marchand, dans la même vignette. */
export function shopIcon(): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'rw-ico shop';
  const badge = document.createElement('span');
  badge.className = 'rw-badge';
  badge.style.setProperty('--c', '#c8963c');
  badge.append(pixelMon(MERCHANT_SPECIES));
  wrap.append(badge);
  return wrap;
}

/** Images partagées par le canvas : chargées une fois, dessinées dès qu'elles sont prêtes. */
const images = new Map<string, HTMLImageElement>();
function image(url: string): HTMLImageElement {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img;
}

/** L'icône HTML d'une récompense, à glisser devant le texte d'une étiquette. */
/** L'icône d'un objet d'Essentials (Items/<file>.png), au format des icônes de récompense. */
export function itemIcon(file: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'rw-ico';
  const img = document.createElement('img');
  img.alt = '';
  img.src = `${ITEMS}/${file}.png`;
  wrap.append(img);
  return wrap;
}

export function rewardIcon(reward: Reward, donor?: DonorId): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `rw-ico ${reward}`;
  if (reward === 'boon') {
    if (donor) wrap.append(donorBadge(donor));
    return wrap;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.src = ICON_URL[reward];
  wrap.append(img);
  return wrap;
}

/**
 * Dessine l'objet centré en (cx, cy), `size` pixels écran de côté. Les
 * objets d'Essentials (48 px) sont du pixel art : on les agrandit sans
 * lissage. (Le don a son badge HTML, voir donorBadge.)
 */
export function drawRewardIcon(b: CanvasRenderingContext2D, reward: Exclude<Reward, 'boon'>, cx: number, cy: number, size: number): void {
  const img = image(ICON_URL[reward]);
  if (!img.complete || !img.naturalWidth) return;
  const smooth = b.imageSmoothingEnabled;
  b.imageSmoothingEnabled = false;
  b.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), Math.round(size), Math.round(size));
  b.imageSmoothingEnabled = smooth;
}
