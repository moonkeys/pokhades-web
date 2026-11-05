import { fbm } from '../core/noise';
import { Rng } from '../core/rng';
import type { BiomeId } from '../data/species';
import { Renderer } from '../render/renderer';
import { BLOB, EXTRA, FLOWERS, GROUND, PROPS, TALL_GRASS, TILE, TOWN_STYLES, TREES, withFill, type Blob, type SpriteDef, type Tile } from '../world/tiles';

// Le plan du monde, peint avec les tuiles du jeu (ui/journal.ts l'affiche sur le
// panneau de l'arche). Troisième version : la composition reprend une image de
// référence faite par le joueur (générée par IA dans la DA du jeu) — « ça
// correspond presque à tous mes assets, reproduis-la avec les bons assets ».
//
//   - au nord, une chaîne de falaises en terrasses sur toute la largeur : roche
//     brune à l'ouest (le Volcan et sa coulée de lave, ses arbres morts) et au
//     centre (les Rocailleux, une mesa et des rochers), enneigée à l'est (la
//     Montagne glacée, ses sapins, ses mares de glace), et au milieu le sommet
//     enneigé de la Route Victoire, avec son escalier ;
//   - à l'ouest, une longue plage de sable et ses palmiers, et la mer de l'Océan
//     qui s'élargit vers le bas ;
//   - au centre, le Village au pied des falaises, le Marais boueux et ses géants
//     moussus, le Lac cerné d'arbres ronds ;
//   - à l'est, les bois d'Automne, puis la Forêt de conifères en bas à droite ;
//   - en bas au centre, la Prairie d'où part chaque run, ses herbes hautes et
//     ses fleurs.
// Les positions des biomes (PLACES) ne servent qu'au plan : le sens des portes
// en run suit toujours world/worldmap.ts.

/** Le plan, en cases du tileset (proportions de l'image de référence). */
export const MW = 44;
export const MH = 30;

export type Region = BiomeId | 'victoire';

/** Où chaque biome porte son nom sur le plan (cases) : sur un coin de sol dégagé. */
const PLACES: Record<Region, { x: number; y: number }> = {
  victoire: { x: 22, y: 2.4 },
  volcan: { x: 7.5, y: 7.6 },
  rocailleux: { x: 27, y: 9.2 },
  glace: { x: 37.5, y: 6.6 },
  plage: { x: 5.5, y: 12.2 },
  village: { x: 22, y: 19.2 },
  ocean: { x: 3.6, y: 21 },
  marais: { x: 13, y: 22.6 },
  lac: { x: 29.5, y: 25.2 },
  automne: { x: 39.5, y: 15.6 },
  foret: { x: 38.5, y: 27.6 },
  prairie: { x: 21.5, y: 27.4 },
};

/** Rangement des coins intérieurs selon le jeu de tuiles (comme generate.ts, CORNER_ORDER). */
const CORNERS = {
  default: { se: [0, 0], sw: [1, 0], ne: [0, 1], nw: [1, 1] },
  mirror: { se: [1, 0], sw: [0, 0], ne: [1, 1], nw: [0, 1] },
  outer: { nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] },
} as const;

/** La tuile d'un jeu « blob » pour une case du masque (generate.ts, blobTile, sur la grille du plan). */
function blob(mask: Uint8Array, x: number, y: number, b: Blob): Tile {
  const m = (dx: number, dy: number) => mask[Math.min(MH - 1, Math.max(0, y + dy)) * MW + Math.min(MW - 1, Math.max(0, x + dx))] !== 0;
  const row = !m(0, -1) ? 0 : !m(0, 1) ? 2 : 1;
  const col = !m(-1, 0) ? 0 : !m(1, 0) ? 2 : 1;
  if (row === 1 && col === 1 && b.inner) {
    const [ic, ir] = b.inner;
    const o = CORNERS[b.corners ?? 'default'];
    if (!m(1, 1)) return [ic + o.se[0], ir + o.se[1]];
    if (!m(-1, 1)) return [ic + o.sw[0], ir + o.sw[1]];
    if (!m(1, -1)) return [ic + o.ne[0], ir + o.ne[1]];
    if (!m(-1, -1)) return [ic + o.nw[0], ir + o.nw[1]];
  }
  return [b.origin[0] + col, b.origin[1] + row];
}

/** Retire les bandes d'une case et les pincements (les jeux blob ne les dessinent pas), jusqu'à stabilité. */
function cleanThin(mask: Uint8Array): void {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MW || y >= MH ? 1 : mask[y * MW + x]);
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (!mask[i]) continue;
        const n = at(x, y - 1), s = at(x, y + 1), w = at(x - 1, y), e = at(x + 1, y);
        const pinch = n && s && e && w && ((!at(x + 1, y + 1) && !at(x - 1, y - 1)) || (!at(x - 1, y + 1) && !at(x + 1, y - 1)));
        if ((!n && !s) || (!w && !e) || pinch) {
          mask[i] = 0;
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

/** Un bruit doux centré sur 0, pour que les bords ne soient jamais droits. */
const nz = (x: number, y: number, seed: number, f = 0.18) => fbm(x * f, y * f, seed) - 0.5;
/** Une ellipse au bord bruité (centre, rayons en cases). */
const blobAt = (cx: number, cy: number, rx: number, ry: number, seed: number, rough = 0.5) => (x: number, y: number) =>
  Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) + nz(x, y, seed, 0.35) * rough < 1;

/** Ce que le plan dessine, pour que journal.ts pose noms et flèches au même endroit. */
export interface Plan {
  nodes: { id: Region; x: number; y: number }[];
  roads: { from: Region; to: Region; cs: boolean; pts: { x: number; y: number }[] }[];
  /** Les cases de la mer de l'Océan : seul son rivage reçoit le ressac (journal.ts). */
  sea: Uint8Array;
}

/**
 * Peint le plan. `seen` : les biomes atteints — seuls leurs chemins de sortie sont tracés
 * (retour de test : « ne pas afficher les chemins tant qu'on n'est pas arrivé devant »).
 */
export function paintPlan(g: CanvasRenderingContext2D, atlas: CanvasImageSource, seen: (r: Region) => boolean = () => true, top: CanvasRenderingContext2D = g): Plan {
  const N = MW * MH;
  const put = (t: Tile, x: number, y: number) => g.drawImage(atlas, t[0] * TILE, t[1] * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
  const maskOf = (pred: (x: number, y: number) => boolean, clean = true) => {
    const m = new Uint8Array(N);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (pred(x, y)) m[y * MW + x] = 1;
    if (clean) cleanThin(m);
    return m;
  };
  const layer = (mask: Uint8Array, b: Blob) => {
    for (let i = 0; i < N; i++) {
      if (!mask[i]) continue;
      if (b.fill) put(b.fill, i % MW, (i / MW) | 0);
      put(blob(mask, i % MW, (i / MW) | 0, b), i % MW, (i / MW) | 0);
    }
  };
  const nodes = (Object.keys(PLACES) as Region[]).map((id) => ({ id, ...PLACES[id] }));
  const rng = new Rng(4711);

  // 1) Le fond d'herbe, ses fleurs et, à la Prairie, ses herbes hautes.
  for (let i = 0; i < N; i++) put(GROUND.grass, i % MW, (i / MW) | 0);
  const tall = maskOf((x, y) => [blobAt(18, 25.4, 3.2, 1.6, 7), blobAt(25.2, 26.6, 2.6, 1.4, 9), blobAt(19.5, 28.8, 2.4, 1.1, 13)].some((f) => f(x, y)), false);
  for (let i = 0; i < N; i++) if (tall[i]) put(TALL_GRASS.green.base, i % MW, (i / MW) | 0);
  for (let i = 0; i < N; i++) {
    const x = i % MW;
    const y = (i / MW) | 0;
    if (y > 12 && !tall[i] && rng.chance(0.035)) put(rng.pick(FLOWERS), x, y);
  }

  // 2) Les sols : la plage à l'ouest, la boue du Marais, la terre sèche de l'Automne.
  // (Une plage large : les palmiers y tiennent sans déborder sur l'herbe.)
  const sand = maskOf((x, y) => y > 7 && x < 13.2 + nz(0, y, 21) * 3.5 + Math.max(0, 14 - y) * 0.3);
  layer(sand, withFill(BLOB.ringGrass, GROUND.paleSand));
  const mud = maskOf(blobAt(14.5, 22, 5.4, 4, 31, 0.6));
  layer(mud, withFill(BLOB.ringGrass, GROUND.mud));
  const dry = maskOf((x, y) => x > 34 + nz(x, y, 41) * 3 && y > 10 && y < 21.5 + nz(x, 0, 43) * 3);
  layer(dry, withFill(BLOB.ringGrass, GROUND.dry));

  // 2b) Le Village (retour de test : « un sol de ville », puis « un seul type de sol et une
  //     petite fontaine ») : des briques le long des maisons et sur la petite place au
  //     milieu, bordées de l'herbe déchiquetée du jeu, et la fontaine des villages de run.
  const town = maskOf((x, y) => (x > 13 && x < 31 && y > 12.4 + nz(x, 0, 111) && y < 15.8 + nz(x, 1, 113)) || (Math.abs(x + 0.5 - 22) < 2.8 && y > 14 && y < 18));
  layer(town, withFill(BLOB.ringGrass, EXTRA.brickBeige.to));
  // (Le bassin rond d'Essentials, 3 × 3 cases, jet immobile compris : posé en grand puis
  // réduit de moitié, comme les maisons.)
  const basin = document.createElement('canvas');
  basin.width = 48;
  basin.height = 48;
  Renderer.paintFountain(basin.getContext('2d')!, 0, 0, atlas);
  g.drawImage(basin, Math.round(22 * TILE - 12), Math.round(16.1 * TILE - 12), 24, 24);

  // 3) La mer de l'Océan, qui s'élargit vers le bas, bordée de sable.
  const sea = maskOf((x, y) => y > 12.5 && x < 6.2 + (y - 12.5) * 0.14 + nz(0, y, 51) * 2.2);
  for (let i = 0; i < N; i++) if (sea[i]) put(GROUND.paleSand, i % MW, (i / MW) | 0);
  layer(sea, BLOB.shore);

  // 4) Les eaux : le Lac, la mare croupie du Marais.
  // Le Lac et son îlot au milieu (retour de test) : un trou dans l'eau, que la berge de la mare borde.
  // (Un lac plus grand et plus rond, l'îlot d'herbe nu au milieu : retour de test, « un vrai lac avec une île ».)
  // (L'eau fait le tour de l'îlot sur deux cases au moins : sinon la berge le soudait à la rive.)
  const islet = blobAt(29.6, 20.6, 1.9, 1.05, 62, 0.1);
  const lake = maskOf((x, y) => Math.hypot((x + 0.5 - 29.5) / 5.8, (y + 0.5 - 20.5) / 4.3) + nz(x, y, 61, 0.3) * 0.15 < 1 && !islet(x, y));
  layer(lake, BLOB.pond);
  const pool = maskOf(blobAt(16.2, 22.6, 2.4, 1.5, 63, 0.4));
  layer(pool, BLOB.swamp);

  // 5) La chaîne de falaises, en terrasses : chaque étage un peu plus haut, plus étroit.
  //    Roche brune à l'ouest et au centre, enneigée à l'est (au-delà de `snowLine`).
  const snowLine = (y: number) => 30.5 + nz(0, y, 71) * 3;
  const tiers = [
    (x: number, y: number) => y < 10.6 + nz(x, 0, 81) * 2.4,
    (x: number, y: number) => y < 8 + nz(x, 1, 83) * 2 && x > 0 && x < MW - 1,
    // (Pas de troisième terrasse sur le Volcan : son plateau reste assez large pour la lave.)
    (x: number, y: number) => y < 5.4 + nz(x, 2, 85) * 1.6 && x > 28,
  ];
  const cliffs: Uint8Array[] = [];
  for (const tier of tiers) {
    const brown = maskOf((x, y) => tier(x, y) && x < snowLine(y) && !sea[y * MW + x]);
    const white = maskOf((x, y) => tier(x, y) && x >= snowLine(y));
    layer(brown, BLOB.cliff);
    layer(white, BLOB.cliffSnow);
    cliffs.push(brown, white);
  }
  // La mesa des Rocailleux, sur la deuxième terrasse.
  const mesa = maskOf(blobAt(26.5, 6, 4.4, 2, 91, 0.3));
  layer(mesa, BLOB.cliff);
  cliffs.push(mesa);
  // Le sommet de la Route Victoire : un massif enneigé qui s'évase vers le bas, au centre.
  const summit = maskOf((x, y) => Math.abs(x + 0.5 - 22) < 2.6 + y * 0.45 + nz(x, y, 93) && y < 5.4);
  layer(summit, BLOB.cliffSnow);
  cliffs.push(summit);
  /** Le bord d'une falaise (sa face, ses arêtes) : rien n'y pousse. */
  const cliffEdge = new Uint8Array(N);
  for (const m of cliffs) {
    for (let i = 0; i < N; i++) {
      if (!m[i]) continue;
      const x = i % MW;
      const y = (i / MW) | 0;
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!m[Math.min(MH - 1, Math.max(0, y + dy)) * MW + Math.min(MW - 1, Math.max(0, x + dx))]) cliffEdge[i] = 1;
      }
    }
  }
  // La lave du Volcan, les mares de glace de la Montagne : au milieu des plateaux, jamais sur
  // une arête ni contre une face (retour de test : la lave tombait « entre deux falaises, sur
  // le bord d'une falaise »). La grande coulée est sur la terrasse du haut, la plus large.
  const nearEdge = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r + 1; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = Math.min(MW - 1, Math.max(0, x + dx));
      const ny = Math.min(MH - 1, Math.max(0, y + dy));
      if (cliffEdge[ny * MW + nx]) return true;
    }
    return false;
  };
  const lava = maskOf((x, y) => [blobAt(7.4, 3.3, 4.8, 2, 95, 0.35), blobAt(14.2, 3.2, 2, 1.4, 98, 0.3)].some((f) => f(x, y)) && !nearEdge(x, y, 1));
  layer(lava, BLOB.lava);
  const ice = maskOf((x, y) => (blobAt(36.5, 2.6, 2, 1.2, 97)(x, y) || blobAt(41, 2.2, 1.6, 1.1, 99)(x, y)) && !nearEdge(x, y, 1));
  layer(ice, BLOB.ice);

  // Les escaliers, taillés dans une face droite de falaise (deux cases de large, une paroi qui
  // continue de chaque côté), au plus près de là où arrive le chemin. Rien ne pousse dessus
  // ni devant (retour de test : un arbre était posé sur l'un, un autre juste devant).
  const reserved = new Uint8Array(N);
  const stair = Renderer.paintStairs(1);
  const tierMask = (k: number) => cliffs[k * 2].map((v, i) => v | cliffs[k * 2 + 1][i]);
  const placeStair = (m: Uint8Array, want: number): { x: number; y: number } | null => {
    const face = (x: number, y: number) => x >= 0 && x < MW && m[y * MW + x] === 1 && (y + 1 >= MH || m[(y + 1) * MW + x] === 0) && y > 0 && m[(y - 1) * MW + x] === 1;
    for (let d = 0; d < 6; d++) {
      for (const x of [Math.round(want) - d, Math.round(want) + d]) {
        for (let y = 1; y < MH - 1; y++) {
          if (!face(x - 1, y) || !face(x, y) || !face(x + 1, y) || !face(x + 2, y)) continue;
          g.drawImage(stair, x * TILE, y * TILE);
          for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < MW && ny < MH) reserved[ny * MW + nx] = 1;
          }
          return { x: x + 1, y: y + 1.6 };
        }
      }
    }
    return null;
  };
  const low = tierMask(0);
  /** Le pied de l'escalier où finit le chemin qui monte vers chaque biome des falaises. */
  const foot: Partial<Record<Region, { x: number; y: number }>> = {
    volcan: placeStair(low, 11.5) ?? undefined,
    rocailleux: placeStair(low, 22) ?? undefined,
    glace: placeStair(low, 38.5) ?? undefined,
  };
  // Et d'une terrasse à l'autre : au Volcan, et sous le sommet de la Route Victoire.
  placeStair(tierMask(1), 13);
  // La montée vers la Route Victoire : un escalier par étage, de la terrasse du bas au sommet.
  placeStair(tierMask(1), 22);
  placeStair(summit, 22);
  const water = (i: number) => sea[i] || lake[i] || pool[i] || lava[i] || ice[i];

  // 6) Les chemins : de petits chemins de terre, tracés à la main sur le paysage (retour de
  //    test : les pointillés « partaient dans tous les sens »). Ils partent de la Prairie et
  //    mènent à la suite, se rejoignent comme des sentiers, s'arrêtent au pied des escaliers
  //    des falaises et sur le sable. Seuls ceux qui partent d'un biome atteint sont tracés.
  const road = new Uint8Array(N);
  const trail = new Uint8Array(N);
  const roads: Plan['roads'] = [];
  for (const t of TRAILS) {
    if (!seen(t.from)) continue;
    // Un chemin vers les falaises finit au pied de son escalier.
    const end = foot[t.to];
    const via = end && !t.sea ? [...t.via.slice(0, -1), [end.x, end.y] as [number, number]] : t.via;
    const pts = smoothPath(via);
    roads.push({ from: t.from, to: t.to, cs: Boolean(t.cs), pts });
    if (t.sea) continue;
    for (const pt of pts) {
      for (let y = Math.floor(pt.y - 1); y <= pt.y + 1; y++) for (let x = Math.floor(pt.x - 1); x <= pt.x + 1; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const d = Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y);
        if (d < 1.5) road[y * MW + x] = 1;
        if (d < 0.75) trail[y * MW + x] = 1;
      }
    }
  }
  // Sur l'herbe seulement : le sable, la boue et la neige sont déjà du sol où l'on marche.
  const onGrass = (i: number) => !sand[i] && !mud[i] && !dry[i] && !town[i] && !water(i) && !cliffs.some((m) => m[i]);
  for (let i = 0; i < N; i++) if (trail[i] && !onGrass(i)) trail[i] = 0;
  grow(trail);
  for (let i = 0; i < N; i++) if (trail[i] && !onGrass(i)) trail[i] = 0;
  layer(trail, withFill(BLOB.ringGrass, GROUND.dirt));

  // 7) Le décor : des arbres et des rochers par zone, les maisons du Village, triés du haut vers le bas.
  type Thing = { sp: SpriteDef; x: number; y: number; scale?: number };
  const things: Thing[] = [];
  const nearLabel = (x: number, y: number) => nodes.some((n) => Math.abs(x - n.x) < 3.4 && y - n.y > -1.4 && y - n.y < 2.2);
  /** Libre pour un objet dont le pied est en (x, y) : pas d'eau, ni route, ni bord de falaise, ni nom, ni voisin trop proche. */
  const free = (x: number, y: number, gap: number) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y - 0.5);
    if (cx < 0 || cy < 1 || cx >= MW || cy >= MH) return false;
    const i = cy * MW + cx;
    if (road[i] || town[i] || cliffEdge[i] || reserved[i] || nearLabel(x, y)) return false;
    // Ni dans l'eau ni la lave, ni sur leur berge.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = Math.min(MH - 1, Math.max(0, cy + dy)) * MW + Math.min(MW - 1, Math.max(0, cx + dx));
      if (water(j)) return false;
    }
    return !things.some((t) => Math.abs(t.x - x) < gap && Math.abs(t.y - y) < gap * 0.8);
  };
  /** Sème des objets dans une zone : `tries` essais, `gap` cases d'écart au moins. */
  const scatter = (inZone: (x: number, y: number) => boolean, sprites: readonly SpriteDef[], tries: number, gap: number, scale?: number) => {
    for (let k = 0; k < tries; k++) {
      const x = rng.range(0.5, MW - 0.5);
      const y = rng.range(1.5, MH);
      if (!inZone(x, y) || !free(x, y, gap)) continue;
      things.push({ sp: rng.pick(sprites), x, y, scale });
    }
  };
  const level = (k: number) => (x: number, y: number) => {
    const i = Math.floor(y - 0.5) * MW + Math.floor(x);
    return cliffs[k * 2][i] === 1 || cliffs[k * 2 + 1][i] === 1;
  };
  // Les maisons du Village, au pied des falaises (à demi-taille, comme des icônes de carte).
  const homes = TOWN_STYLES[3].houses;
  for (const [hx, hy, k] of [[15.5, 13.6, 0], [19.4, 14.2, 2], [24.6, 14.2, 1], [28.8, 13.6, 3], [17.4, 17.6, 0]] as const) {
    things.push({ sp: homes[k % homes.length], x: hx, y: hy, scale: 0.5 });
  }
  // Les géants moussus du Marais, à demi-taille, et ses arbres morts.
  for (const [mx, my, k] of [[10.6, 20.6, 0], [17.4, 20.4, 2], [15.2, 25.6, 1]] as const) things.push({ sp: TREES.moss[k], x: mx, y: my, scale: 0.5 });
  scatter((x, y) => mud[Math.floor(y - 0.5) * MW + Math.floor(x)] === 1, TREES.dead, 60, 2.2);
  // Les palmiers de la plage.
  scatter((x, y) => y > 10 && x < 16 && !mud[Math.floor(y - 0.5) * MW + Math.floor(x)] && !sea[Math.floor(y - 0.5) * MW + Math.floor(x)], TREES.palm, 700, 1.6);
  // La Forêt, dense, en bas à droite.
  scatter((x, y) => x > 31 + nz(x, y, 101) * 3 && y > 22.8 + nz(x, 0, 103) * 2 && !dry[Math.floor(y - 0.5) * MW + Math.floor(x)], [...TREES.conifer, ...TREES.conifer, ...TREES.big], 900, 1.25);
  // Les bois d'Automne.
  scatter((x, y) => dry[Math.floor(y - 0.5) * MW + Math.floor(x)] === 1, TREES.autumn, 300, 1.7);
  // Des arbres ronds autour du Lac, et quelques-uns dans la Prairie.
  scatter((x, y) => !lake[Math.floor(y - 0.5) * MW + Math.floor(x)] && Math.hypot((x - 29.5) / 7.8, (y - 20.4) / 5.3) < 1 && Math.hypot((x - 29.5) / 6, (y - 20.4) / 3.9) > 1, TREES.roundB, 500, 1.6);
  scatter((x, y) => y > 22 && x > 12 && x < 31 && !mud[Math.floor(y - 0.5) * MW + Math.floor(x)] && !tall[Math.floor(y - 0.5) * MW + Math.floor(x)], [...TREES.small, ...TREES.round.slice(0, 2)], 160, 3);
  // Le Volcan : arbres morts et rochers sombres ; les Rocailleux : rochers et petits pins ;
  // la Montagne : sapins enneigés, rochers de neige, cristaux.
  // Des arbres morts autour de la coulée (retour de test : « plus d'arbres morts »), plantés à la
  // main au bord du plateau, puis semés ailleurs sur les terrasses.
  for (const [dx, dy] of [[1.4, 6.6], [3.4, 6.3], [12.4, 6.5], [14.8, 6.1], [15.6, 3.4], [0.9, 3.4], [12.8, 0.9], [2.6, 0.9], [15.2, 9.6], [1.2, 9.8], [2.4, 5.4], [13.6, 4.6], [15.4, 1.6], [11.4, 6.6], [4.2, 9.8], [13.2, 9.8], [0.8, 0.9], [6, 0.9], [9.4, 0.9]] as const) {
    // (Jamais sur ni devant un escalier, ni sur la lave.)
    let clear = true;
    for (let oy = -2; oy <= 0; oy++) for (let ox = -1; ox <= 1; ox++) {
      const j = Math.min(MH - 1, Math.max(0, Math.floor(dy - 0.5) + oy)) * MW + Math.min(MW - 1, Math.max(0, Math.floor(dx) + ox));
      if (reserved[j] || lava[j]) clear = false;
    }
    if (clear) things.push({ sp: TREES.dead[0], x: dx, y: dy });
  }
  // (Surtout des arbres morts au Volcan : trois pour un rocher.)
  scatter((x, y) => (level(0)(x, y) || level(1)(x, y)) && x < 16, [...TREES.dead, ...TREES.dead, ...TREES.dead, ...PROPS.boulder], 900, 1.5);
  scatter((x, y) => level(0)(x, y) && x > 15 && x < 30, [...PROPS.boulder, ...PROPS.boulder, ...TREES.pineSmall, ...PROPS.rockSmall], 500, 1.6);
  scatter((x, y) => level(0)(x, y) && x >= snowLine(y) + 1, [...TREES.snowy, ...TREES.snowy, ...PROPS.snowBoulder, ...PROPS.iceCrystals], 260, 1.7);

  // Arbres, rochers et maisons sur `top` : journal.ts le pose au-dessus des vagues et des
  // particules animées (retour de test : le ressac passait sur un palmier au lieu de dessous).
  things.sort((a, b) => a.y - b.y);
  for (const t of things) {
    const [sx, sy, sw, sh] = t.sp.rect;
    const k = t.scale ?? 1;
    const dx = Math.round(t.x * TILE - (sw * k) / 2);
    const dy = Math.round(t.y * TILE - t.sp.foot * k);
    top.drawImage(atlas, sx, sy, sw, sh, dx, dy, Math.round(sw * k), Math.round(sh * k));
    if (t.sp.cap) top.drawImage(atlas, t.sp.cap[0], t.sp.cap[1], sw, sh, dx, dy, Math.round(sw * k), Math.round(sh * k));
  }
  // 8) L'ambiance de chaque zone, peinte par-dessus (journal.ts y anime fumée, brume, neige) :
  //    le Volcan rougeoie, le Marais s'assombrit, la Montagne bleuit sous la neige.
  for (const z of ZONES) {
    if (!z.tint) continue;
    const grad = g.createRadialGradient(z.x * TILE, z.y * TILE, 0, z.x * TILE, z.y * TILE, z.r * TILE);
    grad.addColorStop(0, z.tint);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    top.fillStyle = grad;
    top.fillRect(0, 0, MW * TILE, MH * TILE);
  }
  return { nodes, roads, sea };
}

/**
 * Les ambiances (ajout, retour de test : « un shader par zone : le Volcan plus rouge, le
 * Marais du brouillard, la Montagne de la grêle ») : une teinte peinte sur le plan, et des
 * particules que journal.ts anime par-dessus, dans le disque de la zone (cases).
 */
export const ZONES: { kind: 'embers' | 'fog' | 'snow' | 'leaves' | 'sparkle'; x: number; y: number; r: number; tint?: string; count: number; maxY?: number }[] = [
  { kind: 'embers', x: 7.5, y: 5, r: 10, tint: 'rgba(255, 60, 10, 0.42)', count: 55 },
  { kind: 'fog', x: 14.5, y: 22, r: 7, tint: 'rgba(30, 50, 25, 0.32)', count: 10 },
  { kind: 'snow', x: 37.5, y: 4.5, r: 8.5, tint: 'rgba(180, 210, 255, 0.38)', count: 110, maxY: 10.5 },
  { kind: 'leaves', x: 39.5, y: 14, r: 5.2, count: 24 },
  { kind: 'sparkle', x: 29.5, y: 20.2, r: 4.5, count: 14 },
];

/**
 * Les chemins du plan, tracés à la main (cases) : `via`, les points par où ils passent.
 * Ils suivent les routes de la carte du monde (world/worldmap.ts) ; `sea` : une traversée en
 * mer (journal.ts la pointille d'écume) ; les chemins des falaises finissent au pied d'un
 * escalier.
 */
const TRAILS: { from: Region; to: Region; via: [number, number][]; cs?: boolean; sea?: boolean }[] = [
  { from: 'prairie', to: 'village', via: [[21.5, 26.2], [21.2, 22.5], [22, 19.5], [22, 16.6]] },
  { from: 'prairie', to: 'plage', via: [[19.5, 27.6], [14, 28.2], [10.5, 26], [9.6, 20], [8.2, 14.2]] },
  { from: 'prairie', to: 'foret', via: [[23.6, 27.6], [28, 28], [32, 27], [36, 27.6]] },
  { from: 'plage', to: 'ocean', via: [[5, 13.6], [3.6, 16.5], [3.4, 19.6]], cs: true, sea: true },
  { from: 'plage', to: 'marais', via: [[7.8, 14.4], [9.8, 17.4], [11.6, 20.6]] },
  { from: 'village', to: 'marais', via: [[20.4, 16.8], [17.6, 18.6], [14.6, 20.4]] },
  { from: 'village', to: 'lac', via: [[23.6, 16.8], [25, 18.4], [25.4, 21.6], [27.4, 23.8]] },
  { from: 'foret', to: 'lac', via: [[36, 26.4], [33.4, 25.4], [31.6, 24.6]] },
  { from: 'foret', to: 'automne', via: [[38.6, 25.8], [38.8, 22], [39.4, 17.4]] },
  { from: 'ocean', to: 'volcan', via: [[3.4, 19.4], [2.8, 15], [4.4, 11.4]], sea: true },
  { from: 'marais', to: 'volcan', via: [[12.4, 20.6], [12.2, 16], [11.8, 11.2]] },
  { from: 'marais', to: 'rocailleux', via: [[14.6, 20.4], [17.6, 18.6], [20.4, 16.8], [21.6, 13.6], [22, 11]] },
  { from: 'lac', to: 'rocailleux', via: [[27.4, 23.8], [25.4, 21.6], [25, 18.4], [23.6, 15.6], [22.4, 11]] },
  { from: 'automne', to: 'rocailleux', via: [[37.8, 14.6], [33, 13], [27, 12.4], [23, 11.2]] },
  { from: 'automne', to: 'glace', via: [[39.4, 14.2], [38.8, 12]] },
];

/** Une polyligne lissée (Chaikin, deux passes), échantillonnée tous les quarts de case. */
function smoothPath(via: [number, number][]): { x: number; y: number }[] {
  let pts = via.map(([x, y]) => ({ x, y }));
  for (let pass = 0; pass < 2; pass++) {
    const next = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let j = 0; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Épaissit les passages d'une case (au lieu de les ronger : un chemin rongé disparaît),
 * comme generate.ts, cleanThin en mode « grow ».
 */
function grow(mask: Uint8Array): void {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MW || y >= MH ? 0 : mask[y * MW + x]);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= MW || y >= MH || mask[y * MW + x]) return false;
    mask[y * MW + x] = 1;
    return true;
  };
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (!at(x, y)) continue;
        const n = at(x, y - 1), s = at(x, y + 1), w = at(x - 1, y), e = at(x + 1, y);
        if (!n && !s) changed = set(x, y + 1) || changed;
        if (!w && !e) changed = set(x + 1, y) || changed;
        if (n && s && e && w && !at(x + 1, y + 1) && !at(x - 1, y - 1)) changed = set(x + 1, y + 1) || changed;
        if (n && s && e && w && !at(x - 1, y + 1) && !at(x + 1, y - 1)) changed = set(x - 1, y + 1) || changed;
      }
    }
    if (!changed) return;
  }
}
