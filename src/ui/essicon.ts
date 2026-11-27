// Icônes d'interface tirées de Pokémon Essentials (retour du 26 novembre 2026 : « je veux pas de
// symboles dessinés qui n'ont pas la DA du jeu, je veux un truc pixelisé, des sprites
// d'Essentials, pour que tout soit cohérent » ; puis « se débarrasser de ces symboles : un sprite
// qui correspond vraiment, sinon un symbole pixel art dessiné dans le même style »). Elles
// remplacent les caractères ◈ ⚖ ✦ ★ ☠ ⛰ ⚔ ✚ ✊ ❀ ❖ ⏱ ⚠ ¤ ◆ ⚑ ✎ ✧ ⚡ et ceux de la météo.
//
// Chaque icône est choisie pour son sens dans les jeux : Piquants pour le Piège, Pièce Rune pour le
// marchand, Eau Fraîche pour la Source, Rune Sort pour les pactes, Ceinture Noire pour le Dojo, Œuf
// Chance pour la Pension, la Poké Ball « possédé » du Pokédex pour un Pokémon débloqué ; un don duo
// montre ses deux légendaires (duoIcon). Puis, sur une planche de choix (même jour) : le VS des transitions de combat pour
// le Duel, le ruban doré pour l'as et le MVP, le rocher d'Éclate-Roc pour la grotte ; et, dessinés en
// pixel art faute de mieux, un chrono pour le Défi, trois silhouettes de Pikachu pour la Horde et les
// pictogrammes de météo (public/game/assets/pixel/, scripts/pixel-icons.py).
//
// Les fichiers viennent de npm run import-assets (scripts/import-assets.ts), sauf ceux d'assets/pixel/,
// faits par scripts/pixel-icons.py.
// Affichées à la hauteur du texte, agrandies sans flou (da.css, .ess-ico).

const item = (name: string): string => `/game/assets/essentials/items/${name}.png`;

const SRC = {
  mega: '/game/assets/essentials/ui/icon_mega.png',
  weight: item('POWERWEIGHT'),
  shard: item('COMETSHARD'),
  /** L'as d'un champion, le MVP de la run : le ruban doré du résumé de Pokémon. */
  star: '/game/assets/pixel/ruban.png',
  /** Un Pokémon débloqué (« possédé » au Pokédex d'Essentials). */
  own: '/game/assets/essentials/ui/icon_own.png',
  /** Un Pokémon perdu (Nuzlocke) : la Poké Ball éteinte du combat. */
  faint: '/game/assets/essentials/ui/icon_ball_faint.png',
  // Salles spéciales (run/run.ts, SPECIALS).
  challenge: '/game/assets/pixel/chrono.png',
  trap: item('STICKYBARB'),
  merchant: item('AMULETCOIN'),
  spring: item('FRESHWATER'),
  curse: item('SPELLTAG'),
  dojo: item('BLACKBELT'),
  pension: item('LUCKYEGG'),
  horde: '/game/assets/pixel/horde.png',
  duel: '/game/assets/pixel/vs.png',
  cave: '/game/assets/pixel/rocher.png',
  // Fiches de Pokémon et du Repaire.
  talent: item('ABILITYURGE'),
  nature: item('MENTALHERB'),
  origin: item('TOWNMAP'),
  contract: item('AIRMAIL'),
  feat: item('STARPIECE'),
  league: item('RELICCROWN'),
  berry: item('ORANBERRY'),
  damage: item('MUSCLEBAND'),
  // Météo (world/weather.ts) : des pictogrammes dessinés en pixel art (scripts/pixel-icons.py).
  clear: '/game/assets/pixel/meteo-clair.png',
  rain: '/game/assets/pixel/meteo-pluie.png',
  sun: '/game/assets/pixel/meteo-soleil.png',
  sand: '/game/assets/pixel/meteo-sable.png',
  hail: '/game/assets/pixel/meteo-grele.png',
  fog: '/game/assets/pixel/meteo-brouillard.png',
} as const;

export type EssIconKind = keyof typeof SRC;

/** Les icônes d'objets (48 × 48, l'objet au centre) : affichées plus grandes, leur marge rognée (da.css). */
const ITEM_SIZED = new Set<EssIconKind>(Object.keys(SRC).filter((k) => /\/(items|pixel)\//.test(SRC[k as EssIconKind])) as EssIconKind[]);

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
const DONOR_ICON: Record<number, [file: string, dx: number, dy: number]> = {
  // [fichier, décalage horizontal et vertical en % de la case] : chaque Pokémon est posé bas dans sa
  // case de 64 px, et pas au même endroit selon l'espèce. Mesuré sur la zone dessinée de la première
  // image (retour du 26 novembre 2026 : « qu'ils soient centrés dans leur carré »).
  144: ['ARTICUNO', 0, -9.4],
  145: ['ZAPDOS', 0, -9.4],
  146: ['MOLTRES', 0, -10.9],
  151: ['MEW', -1.6, -14.1],
  250: ['HOOH', 1.6, -14.1],
  251: ['CELEBI', 0, -14.1],
  383: ['GROUDON', -1.6, -12.5],
  384: ['RAYQUAZA', -1.6, -12.5],
  385: ['JIRACHI', -1.6, -14.1],
  491: ['DARKRAI', 1.6, -12.5],
};

/** Les fichiers d'icônes des donateurs, pour scripts/import-assets.ts. */
export const DONOR_ICON_FILES = Object.values(DONOR_ICON).map(([f]) => f);

/**
 * Un don duo (deux légendaires à la fois) : leurs deux icônes, l'une devant l'autre (retour du 26
 * novembre 2026 : le Nœud Destin, « peut-être qu'on peut trouver un truc plus sympa »).
 */
export function duoIcon(dexA: number, dexB: number, parent?: HTMLElement, cls = ''): HTMLElement {
  const box = document.createElement('span');
  box.className = `ess-duo${cls ? ` ${cls}` : ''}`;
  donorIcon(dexA, box);
  donorIcon(dexB, box);
  parent?.append(box);
  return box;
}

export function donorIcon(dex: number, parent?: HTMLElement, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `ess-ico ess-mon${cls ? ` ${cls}` : ''}`;
  const [file, dx, dy] = DONOR_ICON[dex] ?? DONOR_ICON[151];
  img.src = `/game/assets/essentials/icons/${file}.png`;
  // Recentré sur le Pokémon lui-même (le % se rapporte à la case affichée, carrée comme l'image).
  img.style.translate = `${dx}% ${dy}%`;
  img.alt = '';
  img.draggable = false;
  parent?.append(img);
  return img;
}
