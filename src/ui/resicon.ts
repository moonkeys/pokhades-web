import { RESOURCES, type ResourceId } from '../meta/catalog';

/**
 * L'icône d'une ressource de construction : un objet d'Essentials, ou pour
 * le Bois (Essentials n'en a pas) la souche du tileset, découpée en fond.
 * Partagée par les écrans du Repaire (campscreen.ts) et le HUD (runhud.ts).
 */
export function resIcon(id: ResourceId, parent: HTMLElement, cls = 'cs-res-ico'): HTMLElement {
  const r = RESOURCES[id];
  if (r.icon) {
    const img = document.createElement('img');
    img.className = cls;
    img.src = `/game/assets/essentials/items/${r.icon}.png`;
    img.alt = '';
    img.draggable = false;
    parent.append(img);
    return img;
  }
  const [x, y, w, h] = r.tile!;
  // Tileset de 2240 × 2400 px : le morceau se cale en pourcentages de l'élément.
  const node = document.createElement('span');
  node.className = `${cls} tile`;
  node.style.aspectRatio = `${w} / ${h}`;
  node.style.backgroundSize = `${(2240 / w) * 100}% ${(2400 / h) * 100}%`;
  node.style.backgroundPosition = `${(x / (2240 - w)) * 100}% ${(y / (2400 - h)) * 100}%`;
  node.title = r.name;
  parent.append(node);
  return node;
}
