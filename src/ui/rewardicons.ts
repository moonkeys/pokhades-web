import { DONORS, type DonorId } from '../combat/boons';
import { typeColor } from '../render/combatfx';
import type { Reward } from '../run/run';

// Icônes des récompenses de salle : sur l'étiquette des portes (HTML) et
// au-dessus de la récompense posée au centre (canvas). Elles remplacent les
// losanges de couleur du jeu (CombatArena._spawn_boon), qui ne disaient rien
// tant qu'on n'avait pas lu l'étiquette.
//   - butin : la Pièce Rune d'Essentials (Items/AMULETCOIN), la pièce d'or ;
//   - nouvelle attaque : une CT (Items/machine_NORMAL), le disque des jeux ;
//   - don d'un légendaire : un badge rond à sa tête (son illustration
//     officielle, public/game/artwork), cerclé de papier et d'encre comme les
//     pastilles de la DA, sur la couleur de son type. Toujours en HTML, même
//     au-dessus de la récompense posée : dessinée dans le tampon du canvas
//     (270 px de haut), l'illustration sortait pixellisée (retour de test).
// Écart voulu avec le jeu : la porte d'un don annonce déjà son donateur
// (Run.offers le tire), le jeu ne le révélait qu'en prenant la récompense.

const ITEMS = '/game/assets/essentials/items';
const ICON_URL: Record<Exclude<Reward, 'boon'>, string> = {
  loot: `${ITEMS}/AMULETCOIN.png`,
  skill: `${ITEMS}/machine_NORMAL.png`,
};
const artUrl = (donor: DonorId) => `/game/artwork/${DONORS[donor].dex}.png`;

/**
 * Cadrage de la tête dans chaque illustration (475 px de côté, la pose varie
 * tout le temps : Sulfura file vers la droite, Rayquaza se tord) : centre de
 * la tête et largeur de la fenêtre, en fraction de l'image. Relevé à l'œil.
 */
const FACES: Record<DonorId, [x: number, y: number, w: number]> = {
  electhor: [0.46, 0.34, 0.36],
  sulfura: [0.73, 0.64, 0.32],
  artikodin: [0.33, 0.32, 0.3],
  mew: [0.43, 0.3, 0.4],
  darkrai: [0.38, 0.42, 0.4],
  groudon: [0.8, 0.38, 0.4],
  celebi: [0.42, 0.55, 0.6],
  hooh: [0.71, 0.37, 0.32],
  rayquaza: [0.2, 0.3, 0.34],
  jirachi: [0.5, 0.47, 0.52],
};

/** Le badge d'un légendaire : pastille à la couleur de son type, sa tête cadrée dedans, un reflet. */
export function donorBadge(donor: DonorId): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'rw-badge';
  badge.style.setProperty('--c', typeColor(DONORS[donor].type));
  const img = document.createElement('img');
  img.alt = '';
  img.src = artUrl(donor);
  const [x, y, face] = FACES[donor];
  // Un peu plus serré que la fenêtre relevée : liseré et reflet mangent le bord.
  const w = face * 0.82;
  img.style.width = `${100 / w}%`;
  img.style.left = `${50 - (x * 100) / w}%`;
  img.style.top = `${50 - (y * 100) / w}%`;
  badge.append(img);
  return badge;
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
    wrap.append(donorBadge(donor ?? 'mew'));
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
