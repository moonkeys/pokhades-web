// Importe dans public/game/ les SEULS assets du jeu Godot dont le prototype
// se sert : le projet web devient autonome (on peut le pousser seul), et
// reste synchronisable avec la base Godot en relançant ce script.
//
//   npm run import-assets            (dépôt Godot dans ../pokhades)
//   POKHADES_GODOT=/chemin npm run import-assets
//
// Ce que le dépôt Godot n'a pas (espèce ajoutée par la page de config,
// action PMD qu'il n'a pas copiée, fiche d'attaque) est tiré de SpriteCollab
// et de PokéAPI, et gardé dans .cache/remote/ (scripts/remote.ts).
//
// Exception : public/game/assets/essentials/pavements.png contient les
// revêtements extraits d'Essentials (Graphics/Tilesets/Outside.png, cases
// 3,42 · 3,46 · 1,50 · 4,50, réduites de moitié). Il est versionné tel quel :
// Node ne sait pas découper un PNG sans dépendance, inutile d'en ajouter une
// pour quatre tuiles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attackSheetFiles } from '../src/data/attackanims.ts';
import { CHAMPIONS, championSpecies } from '../src/data/champions.ts';
import { DONOR_SPECIES, MERC_SPECIES, PLAYER_SPECIES, allSpecies } from '../src/data/species.ts';
import { CANDY, HELD_ITEMS, TMS, UPGRADES } from '../src/meta/catalog.ts';
import bestiary from '../src/data/bestiary.json' with { type: 'json' };
import { cacheDir, fetchRemote } from './remote.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..');
const GODOT = path.resolve(process.env.POKHADES_GODOT ?? path.join(WEB, '..', 'pokhades'));
if (!fs.existsSync(path.join(GODOT, 'project.godot'))) {
  console.error(`Dépôt Godot introuvable : ${GODOT} (définir POKHADES_GODOT)`);
  process.exit(1);
}

const CACHE = cacheDir(WEB);
/** Un fichier du dépôt Godot, sinon sa copie tirée d'Internet ; null s'il n'existe nulle part. */
async function source(rel: string): Promise<string | null> {
  const local = path.join(GODOT, rel);
  return fs.existsSync(local) ? local : fetchRemote(CACHE, rel);
}

const files = ['assets/tilesets/tileset pokemon.png', 'assets/cs/surf.png', 'assets/fx/overworld_dust_grass.png'];
/** Copies dont le nom de destination diffère de la source (assets d'Essentials). */
const renamed: [string, string][] = [];

/**
 * Planche réellement utilisée par une animation PMD : <CopyOf> renvoie à
 * celle d'une autre action (lecture par expressions régulières, comme
 * PMDSprites.gd, pour ne pas ajouter de parseur XML côté Node).
 */
function animFile(xml: string, name: string): string | null {
  for (let hop = 0; hop < 4; hop++) {
    const block = xml.match(new RegExp(`<Anim>\\s*<Name>${name}</Name>([\\s\\S]*?)</Anim>`));
    if (!block) return null;
    const copy = block[1].match(/<CopyOf>(\w+)<\/CopyOf>/);
    if (!copy) return name;
    name = copy[1];
  }
  return null;
}

/** Actions de combat : le joueur attaque, tire, charge ; tout le monde encaisse ; un membre K.O. dort (couché). */
const PLAYER_ACTIONS = ['Attack', 'Shoot', 'Charge', 'Hurt', 'Sleep'];
/** Les autres encaissent ; à la boutique, ils dorment, attendent, mangent ou sautillent (poses des figurants). */
const WILD_ACTIONS = ['Hurt', 'Sleep', 'Idle', 'Eat', 'Hop'];
/**
 * Poses du Repaire (camp.ts) pour les Pokémon jouables qu'on laisse au camp :
 * assis sur un rondin, couché sur une paillasse, au repos, un petit bond. Le
 * dépôt Godot ne les a pas : elles viennent de SpriteCollab (remote.ts).
 */
const CAMP_POSES = ['Sit', 'Laying', 'Idle', 'Hop'];
/** Planches de pose attendues, et leurs dimensions selon notre AnimData.xml (vérifiées après copie). */
const poseSheets: { out: string; width: number; fh: number }[] = [];
const isPlayer = new Set(PLAYER_SPECIES.map((p) => p.id));
// Les mercenaires se battent dans l'équipe : ils ont besoin des mêmes actions que les Pokémon jouables.
const playable = new Set([...PLAYER_SPECIES.map((p) => p.id), ...MERC_SPECIES]);
// Espèces jouées, sauvages, légendaires donateurs et Pokémon des champions.
const species = [...new Set([...allSpecies(), ...championSpecies()])].sort((a, b) => a - b);
for (const id of species) {
  const dir = `data/pmd/${String(id).padStart(4, '0')}`;
  files.push(`${dir}/AnimData.xml`, `${dir}/Walk-Anim.png`, `data/pokeapi/pokemon/${id}.json`);
  const xmlPath = await source(`${dir}/AnimData.xml`);
  if (!xmlPath) continue;
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const sheets = new Set<string>();
  for (const action of playable.has(id) ? PLAYER_ACTIONS : WILD_ACTIONS) {
    const file = animFile(xml, action);
    if (file && file !== 'Walk') sheets.add(file);
  }
  for (const file of sheets) files.push(`${dir}/${file}-Anim.png`);
  if (!isPlayer.has(id)) continue;
  for (const pose of CAMP_POSES) {
    const file = animFile(xml, pose);
    if (!file || file === 'Walk' || sheets.has(file)) continue;
    sheets.add(file);
    files.push(`${dir}/${file}-Anim.png`);
    // Une planche PMD : une colonne par image de l'animation, une rangée par direction — 8, ou
    // une seule pour les poses vues de face (Sit) : le rendu prend alors toujours celle-là.
    const block = xml.match(new RegExp(`<Anim>\\s*<Name>${file}</Name>([\\s\\S]*?)</Anim>`))?.[1] ?? '';
    const fw = Number(block.match(/<FrameWidth>(\d+)/)?.[1]);
    const fh = Number(block.match(/<FrameHeight>(\d+)/)?.[1]);
    const frames = block.match(/<Duration>/g)?.length ?? 0;
    if (fw && fh && frames) poseSheets.push({ out: `${dir}/${file}-Anim.png`, width: fw * frames, fh });
  }
}

// Planches d'attaque par type et par capacité (src/data/attackanims.ts) et barre de PV du HUD.
const ESSENTIALS = 'Pokemon Essentials v21.1 2023-07-30/Graphics';
for (const name of attackSheetFiles()) {
  renamed.push([`${ESSENTIALS}/Animations/${name}.png`, `assets/essentials/animations/${name}.png`]);
}
renamed.push([`${ESSENTIALS}/UI/Party/overlay_hp.png`, 'assets/essentials/ui/overlay_hp.png']);
// Champions d'arène (PokePools.CHAMPION_SPRITE) et Poké Ball de leurs envois (PokeballFX.gd).
// Le portrait de combat (Graphics/Trainers, 128 px) sert au dialogue et à l'affiche.
for (const c of Object.values(CHAMPIONS)) {
  renamed.push([`${ESSENTIALS}/Characters/${c.sprite}`, `assets/essentials/trainers/${c.sprite}`]);
  renamed.push([`${ESSENTIALS}/Trainers/${c.sprite.replace(/^trainer_/, '')}`, `assets/essentials/trainers/battle/${c.sprite.replace(/^trainer_/, '')}`]);
}
// Illustrations officielles des légendaires donateurs (data/artwork, PMDSprites.get_artwork) : l'écran des dons.
for (const dex of DONOR_SPECIES) files.push(`data/artwork/${dex}.png`);
// Icônes de l'étal de la boutique (ShopStock.gd, Graphics/Items).
for (const f of ['POTION', 'SUPERPOTION', 'HYPERPOTION', 'MAXPOTION', 'REVIVE', 'MAXREVIVE', 'machine_NORMAL', 'COINCASE']) {
  renamed.push([`${ESSENTIALS}/Items/${f}.png`, `assets/essentials/items/${f}.png`]);
}
// Repaire : les CT (une icône par type), les objets tenus et les améliorations (src/meta/catalog.ts).
const TYPES = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'];
for (const f of [...TYPES.map((t) => `machine_${t}`), ...HELD_ITEMS.map((i) => i.icon), ...UPGRADES.map((u) => u.icon), CANDY.icon]) {
  renamed.push([`${ESSENTIALS}/Items/${f}.png`, `assets/essentials/items/${f}.png`]);
}
for (const f of ['ball_BEASTBALL', 'ball_BEASTBALL_open', 'ballBurst_particle', 'ballBurst_particle_s', 'ballBurst_dazzle']) {
  renamed.push([`${ESSENTIALS}/Battle animations/${f}.png`, `assets/essentials/battle/${f}.png`]);
}

// Capacités apprises par montée de niveau, jouables comme sauvages : leurs
// fiches (type, puissance, classe) alimentent le combat, et celles des
// sauvages décident de leur archétype (un tireur a une attaque spéciale).
const moves = new Set<string>();
for (const id of species) {
  const src = await source(`data/pokeapi/pokemon/${id}.json`);
  if (!src) continue;
  const data = JSON.parse(fs.readFileSync(src, 'utf8')) as { level_up_moves?: { name: string }[] };
  for (const m of data.level_up_moves ?? []) moves.add(m.name);
}
// Attaques fortes offertes par la récompense « ✦ Nouvelle attaque » (CombatArena.STRONG_MOVES).
for (const name of ['flamethrower', 'thunderbolt', 'ice-beam', 'surf', 'earthquake', 'psychic', 'shadow-ball', 'energy-ball', 'brick-break', 'rock-slide']) moves.add(name);
// CT du tuteur du Repaire.
for (const tm of TMS) moves.add(tm.api);
// Attaques imposées par la page de config du bestiaire.
for (const sheet of Object.values(bestiary.species) as { moves?: string[] }[]) for (const name of sheet.moves ?? []) moves.add(name);
for (const name of moves) files.push(`data/pokeapi/move/${name}.json`);

const OUT = path.join(WEB, 'public', 'game');
// On repart de zéro (sauf le fichier extrait à la main) : une espèce retirée de la liste disparaît aussi.
for (const sub of ['assets/tilesets', 'assets/cs', 'assets/fx', 'assets/essentials/animations', 'assets/essentials/ui', 'assets/essentials/trainers', 'assets/essentials/battle', 'assets/essentials/items', 'data']) fs.rmSync(path.join(OUT, sub), { recursive: true, force: true });

let copied = 0;
let remote = 0;
const missing: string[] = [];
const copy = (src: string, out: string) => {
  const dst = path.join(OUT, out);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};
const absent: [string, string][] = [];
for (const [rel, out] of [...files.map((f): [string, string] => [f, f]), ...renamed]) {
  const src = path.join(GODOT, rel);
  if (!fs.existsSync(src)) {
    absent.push([rel, out]);
    continue;
  }
  copy(src, out);
  copied++;
}
// Le reste, depuis le cache ou Internet, huit à la fois.
for (let i = 0; i < absent.length; i += 8) {
  await Promise.all(
    absent.slice(i, i + 8).map(async ([rel, out]) => {
      const src = await fetchRemote(CACHE, rel);
      if (!src) return void missing.push(rel);
      copy(src, out);
      remote++;
    }),
  );
}
// Les poses tirées de SpriteCollab doivent coller à notre AnimData.xml : une planche redessinée
// depuis (autres dimensions) se lirait de travers. Celles qui ne collent pas sont écartées.
const rejected: string[] = [];
for (const sheet of poseSheets) {
  const file = path.join(OUT, sheet.out);
  if (!fs.existsSync(file)) continue;
  const png = fs.readFileSync(file);
  const isPng = png.subarray(1, 4).toString('latin1') === 'PNG';
  if (isPng && png.readUInt32BE(16) === sheet.width && [sheet.fh, sheet.fh * 8].includes(png.readUInt32BE(20))) continue;
  fs.rmSync(file);
  rejected.push(sheet.out);
}
console.log(`${copied} fichiers importés depuis ${GODOT}, ${remote} depuis SpriteCollab et PokéAPI (cache : ${CACHE})`);
console.log(`Poses du Repaire : ${poseSheets.length - rejected.length}/${poseSheets.length}${rejected.length ? ` (écartées, dimensions différentes : ${rejected.join(', ')})` : ''}`);
if (missing.length) console.log(`Introuvables (ignorés) : ${missing.join(', ')}`);

// Illustrations officielles de toutes les espèces (écrans de récompense, notifications,
// affiche) dans public/game/artwork/. Le dépôt Godot n'a que celles des légendaires :
// les autres sont téléchargées une fois depuis PokéAPI puis réduites à 256 px (sips,
// macOS). Ce dossier n'est pas vidé : c'est un cache, seules les absentes sont tirées.
const ART = path.join(OUT, 'artwork');
const ART_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
fs.mkdirSync(ART, { recursive: true });
const toFetch: number[] = [];
for (const id of species) {
  const dst = path.join(ART, `${id}.png`);
  const local = path.join(GODOT, `data/artwork/${id}.png`);
  if (fs.existsSync(local)) fs.copyFileSync(local, dst);
  else if (!fs.existsSync(dst)) toFetch.push(id);
}
const { execFileSync } = await import('node:child_process');
let fetched = 0;
const failed: number[] = [];
for (let i = 0; i < toFetch.length; i += 8) {
  await Promise.all(
    toFetch.slice(i, i + 8).map(async (id) => {
      const res = await fetch(`${ART_URL}/${id}.png`).catch(() => null);
      if (!res?.ok) return void failed.push(id);
      const dst = path.join(ART, `${id}.png`);
      fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
      try {
        execFileSync('sips', ['-Z', '256', dst], { stdio: 'ignore' });
      } catch {
        // Pas de sips (hors macOS) : on garde l'image en 475 px.
      }
      fetched++;
    }),
  );
}
console.log(`Illustrations : ${species.length - toFetch.length} déjà là, ${fetched} téléchargées${failed.length ? `, échec pour ${failed.join(', ')}` : ''}`);
