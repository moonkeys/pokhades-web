// Icônes d'interface tirées de Pokémon Essentials (retour du 26 novembre 2026 : « je veux pas de
// symboles dessinés qui n'ont pas la DA du jeu, je veux un truc pixelisé, des sprites
// d'Essentials, pour que tout soit cohérent » ; puis « se débarrasser de ces symboles : un sprite
// qui correspond vraiment, sinon un symbole pixel art dessiné dans le même style »). Elles
// remplacent les caractères ◈ ⚖ ✦ ★ ☠ ⛰ ⚔ ✚ ✊ ❀ ❖ ⏱ ⚠ ¤ ◆ ⚑ ✎ ✧ ⚡ et ceux de la météo.
//
// Chaque icône est choisie pour son sens dans les jeux : Chrono Ball pour le Défi chronométré,
// Piquants pour le Piège, Pièce Rune pour le marchand, Eau Fraîche pour la Source, Rune Sort pour
// les pactes, Ceinture Noire pour le Dojo, Œuf Chance pour la Pension, Miel (il attire les hordes)
// pour la Horde, Corde Sortie pour la grotte, Nœud Destin pour les dons duo, les Roches de météo
// pour la météo, l'étoile chromatique pour l'as et le MVP, la Poké Ball « possédé » du Pokédex
// pour un Pokémon débloqué. Un seul manque, le Duel : deux épées dessinées en pixel art
// (public/game/assets/pixel/duel.png), au contour et aux tons des objets d'Essentials.
//
// Les fichiers viennent de npm run import-assets (scripts/import-assets.ts), sauf assets/pixel/.
// Affichées à la hauteur du texte, agrandies sans flou (da.css, .ess-ico).

const item = (name: string): string => `/game/assets/essentials/items/${name}.png`;

const SRC = {
  mega: '/game/assets/essentials/ui/icon_mega.png',
  weight: item('POWERWEIGHT'),
  shard: item('COMETSHARD'),
  /** L'as d'un champion, le MVP de la run, un vœu exaucé. */
  star: '/game/assets/essentials/ui/shiny.png',
  /** Un Pokémon débloqué (« possédé » au Pokédex d'Essentials). */
  own: '/game/assets/essentials/ui/icon_own.png',
  /** Un Pokémon perdu (Nuzlocke) : la Poké Ball éteinte du combat. */
  faint: '/game/assets/essentials/ui/icon_ball_faint.png',
  // Salles spéciales (run/run.ts, SPECIALS).
  challenge: item('TIMERBALL'),
  trap: item('STICKYBARB'),
  merchant: item('AMULETCOIN'),
  spring: item('FRESHWATER'),
  curse: item('SPELLTAG'),
  dojo: item('BLACKBELT'),
  pension: item('LUCKYEGG'),
  horde: item('HONEY'),
  duel: '/game/assets/pixel/duel.png',
  cave: item('ESCAPEROPE'),
  // Fiches de Pokémon et du Repaire.
  talent: item('ABILITYURGE'),
  nature: item('MENTALHERB'),
  origin: item('TOWNMAP'),
  contract: item('AIRMAIL'),
  feat: item('STARPIECE'),
  league: item('RELICCROWN'),
  berry: item('ORANBERRY'),
  damage: item('MUSCLEBAND'),
  duo: item('DESTINYKNOT'),
  // Météo (world/weather.ts).
  clear: item('SUNSTONE'),
  rain: item('DAMPROCK'),
  sun: item('HEATROCK'),
  sand: item('SMOOTHROCK'),
  hail: item('ICYROCK'),
  fog: item('SMOKEBALL'),
} as const;

export type EssIconKind = keyof typeof SRC;

/** Les icônes d'objets (48 × 48, l'objet au centre) : affichées plus grandes, leur marge rognée (da.css). */
const ITEM_SIZED = new Set<EssIconKind>(Object.keys(SRC).filter((k) => SRC[k as EssIconKind].includes('/items/') || k === 'duel') as EssIconKind[]);

export const isEssIcon = (s: string | undefined): s is EssIconKind => !!s && s in SRC;

/** L'icône, ajoutée à `parent` s'il est donné. Décorative : le texte à côté (ou l'info-bulle) dit ce qu'elle veut dire. */
export function essIcon(kind: EssIconKind, parent?: HTMLElement, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `ess-ico ess-${kind}${ITEM_SIZED.has(kind) ? ' ess-item' : ''}${cls ? ` ${cls}` : ''}`;
  img.src = SRC[kind];
  img.alt = '';
  img.draggable = false;
  parent?.append(img);
  return img;
}

/** Un élément `tag.cls` qui contient l'icône puis le texte (« ⚖ 12 » devient [Poids Pouvoir] 12). */
export function iconText<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement | null, kind: EssIconKind, text: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  essIcon(kind, e);
  if (text) e.append(text);
  parent?.append(e);
  return e;
}

/**
 * Les légendaires donateurs (combat/boons.ts, DONORS) : leur icône de menu d'Essentials
 * (Graphics/Pokemon/Icons, deux images de 64 px côte à côte : on montre la première), à la place de
 * leur ancien signe (⚡ Électhor, ✧ Mew…).
 */
const DONOR_ICON: Record<number, string> = {
  144: 'ARTICUNO',
  145: 'ZAPDOS',
  146: 'MOLTRES',
  151: 'MEW',
  250: 'HOOH',
  251: 'CELEBI',
  383: 'GROUDON',
  384: 'RAYQUAZA',
  385: 'JIRACHI',
  491: 'DARKRAI',
};

/** Les fichiers d'icônes des donateurs, pour scripts/import-assets.ts. */
export const DONOR_ICON_FILES = Object.values(DONOR_ICON);

export function donorIcon(dex: number, parent?: HTMLElement, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `ess-ico ess-mon${cls ? ` ${cls}` : ''}`;
  img.src = `/game/assets/essentials/icons/${DONOR_ICON[dex] ?? 'MEW'}.png`;
  img.alt = '';
  img.draggable = false;
  parent?.append(img);
  return img;
}
