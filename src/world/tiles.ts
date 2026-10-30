// Catalogue des éléments utilisés dans assets/tilesets/tileset pokemon.png
// (2240×2400, cases de 16 px). Les coordonnées de cases viennent de
// MapGenerator.gd / MapBase.gd quand elles y existent ; les rectangles des
// arbres et décors ont été relevés sur la planche (pixels, ombre portée
// comprise — elle est dessinée dans le tileset).

export const TILE = 16;

/** Case du tileset [colonne, ligne]. */
export type Tile = readonly [number, number];

/**
 * Jeu de bordures « blob » : un bloc 3×3 (coins, bords, centre) et, juste à
 * côté, un bloc 2×2 de coins intérieurs. Le coin intérieur (ic, ir) a l'herbe
 * en bas à droite, (ic+1, ir) en bas à gauche, (ic, ir+1) en haut à droite,
 * (ic+1, ir+1) en haut à gauche.
 * - `fill` absent : le jeu est « cuit » (la tuile centre EST le remplissage).
 * - `fill` présent : le jeu n'est qu'un anneau d'herbe autour d'un trou
 *   transparent ; on pose d'abord le remplissage, puis l'anneau par-dessus.
 */
export interface Blob {
  origin: Tile;
  /** Absent : le jeu n'a pas de coins intérieurs, on retombe sur la tuile centre. */
  inner?: Tile;
  /**
   * Rangement du bloc 2×2 de coins intérieurs, selon le jeu de tuiles :
   * - 'default' (sable, mares…) : encoche en bas-droite, bas-gauche, haut-droite, haut-gauche ;
   * - 'mirror' (îlots) : même chose, gauche et droite inversées ;
   * - 'outer' (rivage) : haut-gauche, haut-droite, bas-gauche, bas-droite.
   */
  corners?: 'default' | 'mirror' | 'outer';
  fill?: Tile;
}

/** Sprite posé dans le monde : rectangle source (px) et ligne du sol dans ce rectangle. */
export interface SpriteDef {
  rect: readonly [x: number, y: number, w: number, h: number];
  /** Distance (px) du haut du rectangle au point où l'objet touche le sol. */
  foot: number;
  /** Largeur bloquante au sol, en cases (0 = traversable). */
  trunk: number;
  /** Profondeur bloquante (px) au-dessus du point de contact ; par défaut, juste le pied. */
  depth?: number;
  /** Herbe : ondule au vent et recouvre les pieds de qui la traverse. */
  grass?: boolean;
  /** Bâtiment : abscisse (px, depuis le bord gauche du rectangle) du milieu de la porte. */
  door?: number;
  /** Lampadaire : s'allume la nuit. */
  light?: boolean;
}

const t = (c: number, r: number): Tile => [c, r];
const sprite = (x: number, y: number, w: number, h: number, foot: number, trunk = 1): SpriteDef => ({
  rect: [x, y, w, h],
  foot,
  trunk,
});
const grass = (sp: SpriteDef): SpriteDef => ({ ...sp, grass: true });
/** Objet aligné sur la grille : (c, r) en cases, w × h cases. */
const gridSprite = (c: number, r: number, w: number, h: number, trunk = 0): SpriteDef =>
  sprite(c * TILE, r * TILE, w * TILE, h * TILE, h * TILE - 1, trunk);

// ── Sols de base ────────────────────────────────────────────────────────
export const GROUND = {
  /** Herbe claire (#b6e2a0) : la seule dont la couleur raccorde avec les anneaux de bordure. */
  grass: t(1, 20),
  grassFlowers: t(2, 20),
  /** Herbe sèche (#cfcc6c), raccorde avec l'anneau RING_DRY. */
  dry: t(15, 20),
  dryVariants: [t(13, 20)],
  sand: t(2, 16),
  /** Sable clair des îlots et du rivage (#fbfbdb), assorti à la berge du jeu « shore ». */
  paleSand: t(2, 26),
  dirt: t(17, 16),
  mud: t(23, 16),
  cobble: t(26, 16),
} as const;

// ── Bordures ────────────────────────────────────────────────────────────
export const BLOB = {
  /** Sable entouré d'herbe claire, déjà cuit (tile_chemin_terre du jeu = son centre). */
  sandPath: { origin: t(1, 15), inner: t(1, 18) },
  /** Anneau d'herbe claire aux bords déchiquetés, à poser sur un remplissage. */
  ringGrass: { origin: t(7, 15), inner: t(7, 18) },
  /** Anneau d'herbe sèche. */
  ringDry: { origin: t(10, 15), inner: t(10, 18) },
  /** Mare bleue à berge de terre ; transparente hors de la berge (se pose sur le sol). */
  pond: { origin: t(45, 25), inner: t(45, 28) },
  /** Lave à berge rocheuse (tile_water du Volcan dans le jeu 3D, ici la vraie lave du tileset). */
  lava: { origin: t(62, 25), inner: t(62, 28) },
  /** Eau croupie du Marais (tile_eau_sale). */
  swamp: { origin: t(66, 25), inner: t(66, 28) },
  /** Îlot de sable clair cerclé d'eau (l'eau est celle de la tuile unie 11,26). */
  island: { origin: t(1, 25), inner: t(1, 28), corners: 'mirror' },
  /** Eau turquoise à berge de sable clair (le sable autour est opaque) : le rivage de la Plage. */
  shore: { origin: t(22, 25), inner: t(22, 28), corners: 'outer' },
  /** Plateau rocheux à dessus brun (tile_cliff_origin du jeu 2D d'origine) : falaises du Volcan. */
  cliff: { origin: t(52, 32), inner: t(52, 35) },
  /** Le même plateau, dessus herbeux : falaises des biomes verts. */
  cliffGrass: { origin: t(55, 32), inner: t(55, 35) },
} satisfies Record<string, Blob>;

export const withFill = (blob: Blob, fill: Tile): Blob => ({ ...blob, fill });

// ── Arbres ──────────────────────────────────────────────────────────────
// Rangées de 4 teintes du même modèle, de la plus claire à la plus sombre.
const row4 = (x: number, step: number, y: number, w: number, h: number, foot: number, trunk = 1) =>
  [0, 1, 2, 3].map((i) => sprite(x + i * step, y, w, h, foot, trunk));

export const TREES = {
  round: row4(22, 48, 3, 36, 45, 41),
  roundB: row4(308, 48, 3, 40, 45, 42),
  conifer: row4(21, 64, 64, 53, 69, 62),
  roundTall: row4(593, 48, 0, 46, 51, 47),
  hollow: row4(1168, 48, 0, 47, 56, 48),
  bigRound: row4(1172, 64, 67, 56, 65, 60, 2),
  bigLeaf: [sprite(405, 67, 54, 70, 57, 2), sprite(469, 67, 54, 70, 57, 2)],
  big: row4(789, 64, 67, 57, 71, 58, 2),
  /** Arbres feuillus en blocs 3×3 alignés (tile_sapin_origin & co.). */
  olive: [gridSprite(1, 9, 3, 3, 1), gridSprite(4, 9, 3, 3, 1), gridSprite(7, 9, 3, 3, 1), gridSprite(10, 9, 3, 3, 1)],
  small: [sprite(260, 146, 40, 46, 44), sprite(310, 147, 36, 45, 43), sprite(355, 147, 42, 45, 43)],
  pineSmall: [sprite(451, 149, 26, 43, 39), sprite(483, 150, 26, 42, 39)],
  palm: [sprite(662, 146, 36, 54, 42), sprite(717, 152, 53, 64, 51)],
  dark: [sprite(787, 146, 42, 49, 45), sprite(564, 147, 40, 47, 43)],
  dead: [sprite(1030, 148, 38, 47, 42)],
  coniferDark: [sprite(1080, 146, 49, 63, 62)],
  /** Géants moussus du Marais (6 cases de large). */
  moss: row4(1136, 96, 149, 83, 126, 107, 3),
  /** Feuillages d'automne : rouge, orange, olive-orangé. */
  autumn: [sprite(1456, 0, 47, 56, 48), sprite(1504, 0, 47, 56, 48), sprite(1552, 0, 47, 56, 48)],
  oliveCone: [sprite(1525, 148, 38, 44, 43)],
} as const;

// ── Décors ──────────────────────────────────────────────────────────────
/** Décors plats, cuits dans le sol (fleurs). */
export const FLOWERS: Tile[] = [t(10, 20), t(11, 20), t(12, 20), t(10, 21), t(11, 21), t(12, 21), t(11, 22), t(12, 22)];

/**
 * Herbe haute, comme dans les jeux GBA : une touffe pleine posée au sol
 * (`base`, qui ondule) et un calque de brins (`overlay`) redessiné PAR-DESSUS
 * le Pokémon qui s'y tient, pour lui cacher les pieds. Ne poser que le calque
 * donnait des brins coupés, sans touffe dessous.
 */
export interface TallGrassDef {
  base: Tile;
  overlay: Tile;
}

// ── Tuiles extraites d'Essentials (Graphics/Tilesets/Outside.png) ──────────
// public/game/assets/essentials/pavements.png ne contient que les revêtements
// utilisés (Outside 3,42 · 3,46 · 1,50 et le centre de l'autotile « White
// path », déjà réduits de moitié). Ils sont recopiés au chargement dans des
// cases VIDES du tileset (ligne 22, colonnes 23-26) : le reste du code parle
// toujours en coordonnées de tileset.
export const EXTRA = {
  brickGrey: { from: [0, 0] as Tile, to: t(23, 22) },
  brickBeige: { from: [1, 0] as Tile, to: t(24, 22) },
  herringLight: { from: [2, 0] as Tile, to: t(25, 22) },
  whitePath: { from: [3, 0] as Tile, to: t(26, 22) },
} as const;

/** Chevrons du tileset principal, pour les places (gris-beige et doré). */
export const PLAZA_TILES = { herringGrey: t(38, 16), herringGold: t(35, 16) } as const;

export const TALL_GRASS = {
  /**
   * Touffe feuillue façon Rouge Feu / Vert Feuille (3,20), sur fond
   * transparent : c'était déjà l'herbe haute du jeu Godot en 2D
   * (MapBase.tile_tg). Même tuile en base et en calque : le calque n'en
   * redessine que le bas, sur les pieds.
   */
  green: { base: t(3, 20), overlay: t(3, 20) },
} satisfies Record<string, TallGrassDef>;

/** Effet de terrain des jeux (Essentials, Graphics/Animations) : planche 4 × 2 cases de 192 px, dessinée en ×2. */
export const FIELD_FX = {
  // Copie suivie par git de Graphics/Animations/Overworld dust and grass.png (dossier Essentials ignoré).
  url: '/game/assets/fx/overworld_dust_grass.png',
  cell: 192,
  cols: 4,
  /** Images de la planche : poussière (0-2), herbe qui gicle (3-5). */
  dust: [0, 1, 2],
  grass: [3, 4, 5],
} as const;

export const ESSENTIALS_PAVEMENTS = '/game/assets/essentials/pavements.png';

export const PROPS = {
  // (3,20) et (3,21) servent d'herbe haute : la fougère décorative n'en garde qu'une autre.
  fern: [gridSprite(7, 22, 1, 1)],
  leafy: [gridSprite(8, 22, 1, 1), gridSprite(9, 22, 1, 1), gridSprite(3, 23, 1, 1), gridSprite(4, 23, 1, 1)],
  mushrooms: [gridSprite(3, 22, 1, 1), gridSprite(4, 22, 1, 1), gridSprite(26, 20, 1, 1)],
  tallMushroom: [gridSprite(4, 12, 1, 2)],
  /** Roseaux sur 2 cases (24-25, 20-21) + une touffe basse (26,21) : n'en poser qu'une case les coupait. */
  reeds: [grass(gridSprite(24, 20, 1, 2)), grass(gridSprite(25, 20, 1, 2)), grass(gridSprite(26, 21, 1, 1))],
  /** Touffes hautes sur 2 cases (verte, olive) : n'en poser qu'une case les coupait. */
  bunches: [grass(gridSprite(16, 20, 1, 2)), grass(gridSprite(17, 20, 1, 2))],
  sprouts: [gridSprite(18, 20, 1, 1), gridSprite(19, 22, 1, 1), gridSprite(19, 23, 1, 1)],
  log: [gridSprite(1, 12, 2, 1, 2)],
  stump: [gridSprite(3, 12, 1, 1, 1), gridSprite(6, 12, 1, 1, 1)],
  // Seulement les rochers « de terre » : les gris cerclés de bleu clair (22-25, 39-42) sont des
  // rochers dans l'eau, et la boule blanche (24,37) est de la neige.
  rockSmall: [gridSprite(22, 37, 1, 1, 1), gridSprite(22, 38, 1, 1, 1)],
  boulder: [gridSprite(22, 41, 2, 2, 2), gridSprite(26, 41, 2, 2, 2)],
  cactus: [sprite(616, 145, 32, 47, 43)],
  /** Rochers qui émergent de l'eau (cerclés d'écume) : gros et petit. */
  waterRocks: [gridSprite(22, 39, 2, 2, 2), gridSprite(23, 38, 1, 1, 1)],
};

/** Mer : eau unie (sous les îlots de l'Océan) et vagues dont la dernière rangée déferle en écume vers le sud. */
export const SEA = {
  calm: t(11, 26),
  /** Eau unie peinte au chargement (cf. atlas.ts), même teinte que l'eau qui cerne les îlots. */
  flat: t(27, 22),
  /** Colonnes 55-56, rangées 25-27 : houle ; rangée 28 : ressac blanc sur le sable. */
  waves: [t(55, 25), t(56, 26), t(55, 27)],
  surf: [t(55, 28), t(56, 28)],
} as const;

// ── Bâtiments ───────────────────────────────────────────────────────────
// Rectangles relevés sur la planche, ombre portée comprise. La base bloque
// sur toute la largeur du mur ; le toit, lui, se traverse par-derrière.
// `door` : position de la porte, relevée à l'œil sur chaque modèle (souvent
// décentrée, à gauche) : c'est elle, pas le milieu du toit, qui fait face à la rue.
const building = (x: number, y: number, w: number, h: number, foot: number, door: number): SpriteDef => ({
  rect: [x, y, w, h],
  foot,
  trunk: Math.max(2, Math.round((w - 18) / TILE)),
  depth: 44,
  door,
});

/** Clôture en cadre 3×3 : coins, côtés horizontaux (haut/bas) et verticaux (gauche/droite). */
export interface FenceSet {
  origin: Tile;
}
export const FENCES = {
  white: { origin: t(74, 62) },
  wood: { origin: t(74, 65) },
} satisfies Record<string, FenceSet>;

/**
 * Styles de village : une famille de maisons de même forme (simple et double,
 * plusieurs couleurs), leur Centre Pokémon et leur Boutique, et l'habillage
 * assorti. Chaque village tire un style : deux villages ne se ressemblent pas,
 * mais les maisons d'un même village vont ensemble.
 */
export interface TownStyle {
  name: string;
  houses: SpriteDef[];
  center: SpriteDef;
  mart: SpriteDef;
  /** Rues (rectangulaires) et place centrale. */
  street: Tile;
  plaza: Tile;
  fence: FenceSet;
}

const CLASSIC_CENTER = building(561, 1090, 88, 118, 94, 40);
const CLASSIC_MART = building(660, 1104, 74, 94, 80, 18);

export const TOWN_STYLES: TownStyle[] = [
  {
    name: 'Chalets',
    // Chalets à cheminée, rouges et bleus, simples et doubles.
    houses: [building(548, 1245, 82, 111, 83, 19), building(548, 1389, 82, 111, 83, 14), building(643, 1253, 106, 98, 89, 22), building(643, 1397, 106, 98, 89, 19)],
    center: CLASSIC_CENTER,
    mart: CLASSIC_MART,
    street: EXTRA.brickGrey.to,
    plaza: PLAZA_TILES.herringGold,
    fence: FENCES.white,
  },
  {
    name: 'Longères',
    // Longères à toit plat, vertes et rouges, simples et doubles.
    houses: [building(765, 1246, 79, 107, 82, 22), building(861, 1246, 97, 107, 82, 41), building(765, 1390, 79, 107, 82, 22), building(861, 1390, 97, 107, 82, 41)],
    center: building(929, 1112, 87, 91, 72, 37),
    mart: building(1024, 1113, 73, 90, 71, 12),
    street: EXTRA.brickBeige.to,
    plaza: PLAZA_TILES.herringGrey,
    fence: FENCES.wood,
  },
  {
    name: 'Pignons',
    // Maisons hautes à pignon, orange, bleues et vertes.
    houses: [
      building(1152, 1230, 72, 130, 98, 22),
      building(1232, 1241, 73, 112, 86, 19),
      building(1312, 1241, 73, 112, 86, 21),
      building(1392, 1245, 73, 106, 82, 22),
      building(1152, 1374, 72, 130, 98, 20),
      building(1232, 1386, 73, 111, 86, 20),
      building(1312, 1386, 73, 111, 86, 20),
      building(1392, 1390, 73, 105, 82, 20),
    ],
    center: building(1280, 1103, 90, 115, 84, 40),
    mart: building(1377, 1124, 69, 81, 63, 22),
    street: EXTRA.whitePath.to,
    plaza: EXTRA.herringLight.to,
    fence: FENCES.white,
  },
  {
    name: 'Cottages',
    // Cottages roses et orange à lucarne.
    houses: [building(1760, 1393, 74, 110, 81, 22), building(1840, 1393, 73, 110, 81, 37), building(1920, 1394, 75, 109, 81, 39), building(2000, 1394, 74, 109, 81, 37)],
    center: CLASSIC_CENTER,
    mart: CLASSIC_MART,
    street: EXTRA.brickGrey.to,
    plaza: EXTRA.herringLight.to,
    fence: FENCES.white,
  },
  {
    name: 'Chaumières',
    // Hameau rustique : chaumières et huttes rondes (la terre battue est réservée aux allées).
    houses: [building(547, 1541, 79, 123, 91, 18), building(648, 1541, 78, 123, 91, 47), building(743, 1540, 125, 124, 92, 64), building(1258, 1559, 66, 85, 71, 29)],
    center: CLASSIC_CENTER,
    mart: CLASSIC_MART,
    street: EXTRA.brickBeige.to,
    plaza: PLAZA_TILES.herringGold,
    fence: FENCES.wood,
  },
];

/** Décor de ville (rectangles relevés sur la planche, ombre comprise). */
export const TOWN_DECOR = {
  /** Massifs fleuris rouges et bleus. */
  bushes: [sprite(1312, 712, 16, 26, 25), sprite(1328, 712, 16, 26, 25)],
  /** Bacs à plantes de 3 cases : garni, en pousses, vide. */
  planters: [sprite(1314, 738, 46, 30, 28, 3), sprite(1362, 777, 46, 23, 21, 3), sprite(1314, 777, 46, 23, 21, 3)],
  pots: [sprite(1362, 738, 14, 30, 28), sprite(1378, 749, 14, 19, 17), sprite(1394, 750, 14, 18, 16)],
  /** Hortensias bleus et roses (3 cases). */
  hydrangeas: [sprite(1410, 706, 44, 29, 29, 0), sprite(1410, 738, 44, 29, 29, 0)],
  /** Massif de tournesols (3 × 3 cases) et tournesol seul (1 × 2,5 cases). */
  sunflowers: sprite(1408, 768, 48, 48, 47, 3),
  sunflower: sprite(1456, 776, 16, 40, 39),
  /** Bac vide, où l'on plante nos fleurs pour en faire un bac fleuri. */
  planterEmpty: sprite(1314, 777, 46, 23, 21, 3),
  /** Panneau d'affichage (place), petit panneau de bois (devant les maisons), grand panneau (entrée du village). */
  board: sprite(1360, 808, 16, 24, 24),
  sign: gridSprite(88, 55, 1, 1, 1),
  townSign: gridSprite(84, 55, 2, 2, 2),
  /** Long banc jaune (3 cases) : le banc vert à dossier se lisait comme un panneau, un « kiosque ». */
  bench: sprite(1425, 850, 47, 13, 12, 3),
  statue: sprite(1357, 998, 23, 41, 40, 2),
};

/**
 * Accessoires du Repaire (planche relevée par composantes connexes) : torche
 * allumée, arche de lierre du départ, auvent rayé du tuteur, ordinateur et
 * borne de soin de l'équipe, stèles des améliorations, tonneaux, panneau
 * d'affichage, rondins et palissade.
 */
export const CAMP_PROPS = {
  torch: { ...sprite(1009, 1007, 14, 48, 47, 1), light: true } as SpriteDef,
  arch: sprite(1040, 1006, 62, 50, 49, 0),
  awning: sprite(496, 960, 64, 64, 62, 4),
  pc: sprite(1410, 947, 29, 29, 28, 2),
  healer: sprite(1393, 963, 15, 29, 28, 1),
  tablet: sprite(912, 896, 39, 60, 59, 2),
  barrels: [sprite(1393, 920, 15, 24, 23, 1), sprite(1409, 920, 15, 24, 23, 1)],
  board: sprite(1344, 888, 32, 24, 23, 2),
  logs: sprite(497, 880, 63, 17, 16, 4),
  palisade: sprite(496, 896, 64, 47, 46, 4),
  /** Tipi des dormeurs, hutte de chaume (l'équipe), hutte de mousse (l'étude d'Alakazam). `depth` : la base bloque sur 2 cases. */
  tepee: { ...sprite(463, 2118, 55, 73 + 17, 73, 3), depth: 26 } as SpriteDef,
  thatchHut: { ...sprite(1258, 1559, 66, 85, 71, 3), depth: 30 } as SpriteDef,
  mossHut: { ...sprite(1340, 1561, 71, 83, 71, 4), depth: 30 } as SpriteDef,
  /** Puits couvert de chaume. */
  well: { ...sprite(466, 1985, 48, 75, 62, 3), depth: 20 } as SpriteDef,
  /** Statue ailée (près de l'étude). */
  statue: sprite(155, 1985, 28, 66, 46, 1),
  /** Ponton de bois sur pilotis, avec son échelle : l'embarcadère du passeur. */
  jetty: { ...sprite(272, 785, 80, 87, 87, 5), depth: 58 } as SpriteDef,
  /** Ruines couvertes de lierre : le temple de l'île du lac. */
  ruins: { ...sprite(669, 2055, 121, 175, 136, 7), depth: 60 } as SpriteDef,
  /** Boîte aux lettres rouge : le poste du messager. */
  mailbox: sprite(1458, 890, 12, 22, 21, 1),
  stump: sprite(264, 197, 32, 30, 27, 2),
  /** Bûche couchée sous le feu de camp (la flamme vient d'Essentials, Animations/fire5). */
  fireLog: sprite(81, 210, 31, 17, 14, 0),
  /** Paillasse : carré de paille de 3 × 3 cases (cases 13-15, rangées 21-23), posée au sol. */
  hay: { col: 13, row: 21, size: 3 },
  /** Terre battue du terrain d'entraînement : 3 × 2 cases (cases 16-18, rangées 22-23). */
  dirt: { col: 16, row: 22, w: 3, h: 2 },
};

/** Flamme du feu de camp : planche d'animation d'Essentials, cases de 192 px, base à 185 px. */
export const CAMPFIRE = { url: '/game/assets/essentials/animations/fire5.png', cell: 192, base: 185, frames: [2, 3, 4, 3] } as const;

/** Lampadaire sur 3 cases (tête, mât, socle). */
export const LAMP: SpriteDef = { ...gridSprite(37, 60, 1, 3, 1), light: true };

/** Coffre fermé (MapBase.tile_chest_closed), posé sur l'île du Lac. */
export const CHEST = gridSprite(88, 61, 1, 1, 1);

/** Monture Surf du jeu (assets/cs/surf.png) : 4 colonnes × 4 directions de 64 px. */
export const SURF = {
  url: '/game/assets/cs/surf.png',
  frame: 64,
  /** Lignes de la planche, cf. HubPlayer._SURF_ROWS. */
  rows: { down: 0, left: 1, right: 2, up: 3 },
  /** Dernière ligne opaque (pieds de la monture) et centre horizontal, mesurés sur la planche. */
  foot: 56,
  center: 32,
} as const;

/** Nénuphars posés sur l'eau (cuits dans le sol). */
// Variantes détourées : celles de la colonne 39-40 portent leur propre fond d'eau, d'une autre teinte.
export const LILIES = { pond: [t(67, 30), t(68, 29), t(68, 30)], swamp: [t(67, 30), t(68, 29)] } as const;
