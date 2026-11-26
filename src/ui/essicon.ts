// Icônes d'interface tirées de Pokémon Essentials (retour du 26 novembre 2026 : « je veux pas de
// symboles dessinés qui n'ont pas la DA du jeu, je veux un truc pixelisé, des sprites
// d'Essentials, pour que tout soit cohérent »). Elles remplacent les caractères ◈ (Méga), ⚖ (poids)
// et ✦ (Éclats de Champion) qui tenaient lieu d'icônes dans le texte.
//
// Les fichiers viennent de npm run import-assets (scripts/import-assets.ts) : le symbole Méga de
// l'interface de combat, le Poids Pouvoir, et la Comète (l'icône des Éclats, catalog.ts SHARDS).
// Affichées à la hauteur du texte, agrandies sans flou (da.css, .ess-ico).

export type EssIconKind = 'mega' | 'weight' | 'shard';

const SRC: Record<EssIconKind, string> = {
  mega: '/game/assets/essentials/ui/icon_mega.png',
  weight: '/game/assets/essentials/items/POWERWEIGHT.png',
  shard: '/game/assets/essentials/items/COMETSHARD.png',
};

export const isEssIcon = (s: string): s is EssIconKind => s in SRC;

/** L'icône, ajoutée à `parent` s'il est donné. Décorative : le texte à côté (ou l'info-bulle) dit ce qu'elle veut dire. */
export function essIcon(kind: EssIconKind, parent?: HTMLElement, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `ess-ico ess-${kind}${cls ? ` ${cls}` : ''}`;
  img.src = SRC[kind];
  img.alt = '';
  img.draggable = false;
  parent?.append(img);
  return img;
}

/** Un élément `tag.cls` qui contient l'icône puis le texte (« ⚖ 12 » devient [Poids Pouvoir] 12). */
export function iconText<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, kind: EssIconKind, text: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  essIcon(kind, e);
  if (text) e.append(text);
  parent.append(e);
  return e;
}
