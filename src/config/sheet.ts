import { BASE_TEAM_LEVEL } from '../combat/pokemon';
import { fillLine, PERSONAS } from '../data/chatter';
import { SWIMMERS, type BiomeId } from '../data/species';
import { typeColor } from '../render/combatfx';
import { BIOME_COLOR, BIOME_ORDER, BIOMES } from '../world/biomes';
import {
  API,
  biomeList,
  biomesOf,
  CLASS_FR,
  commit,
  dex,
  el,
  fold,
  isUsed,
  missingMoves,
  ROLES,
  unplayable,
  sheet,
  STAT_FR,
  store,
  TYPE_FR,
  type Detail,
  type MoveInfo,
} from './shared';
import { animate, playback, speciesScale, thumb } from './sprites';

// La fiche d'une espèce, ouverte à droite de la page : ses biomes et ses
// stats, les attaques qu'on peut lui donner, son caractère et ses répliques,
// son histoire, et toutes ses animations et ses portraits.

type Tab = 'fiche' | 'attaques' | 'caractere' | 'histoire' | 'sprites';
const TABS: [Tab, string][] = [
  ['fiche', 'Fiche'],
  ['attaques', 'Attaques'],
  ['caractere', 'Caractère'],
  ['histoire', 'Histoire'],
  ['sprites', 'Sprites'],
];

/** Actions PMD dont le jeu se sert (assets/pmd.ts, scripts/import-assets.ts). */
const GAME_ANIMS = new Set(['Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Sleep', 'Idle', 'Eat', 'Hop']);
const ANIM_FR: Record<string, string> = {
  Walk: 'Marche', Idle: 'Attente', Attack: 'Attaque', Shoot: 'Tir', Charge: 'Charge', Hurt: 'Touché', Sleep: 'Sommeil',
  Swing: 'Balayage', Double: 'Double coup', Hop: 'Sautille', Rotate: 'Tourne', Strike: 'Frappe', Twirl: 'Pirouette',
  Cringe: 'Recul', Eat: 'Mange', Laying: 'Couché', EventSleep: 'Endormi', Pose: 'Pose', Float: 'Flotte', Wake: 'Réveil',
  LookUp: 'Lève la tête', TumbleBack: 'Culbute arrière', Tumble: 'Culbute', Nod: 'Acquiesce', Faint: 'K.O.',
  DeepBreath: 'Inspire', LeapForth: 'Bond', Head: 'Coup de tête', Sit: 'Assis', Sink: 'S’enfonce', Pull: 'Tire',
  LostBalance: 'Déséquilibre', HitGround: 'Frappe le sol', Trip: 'Trébuche', Pain: 'Douleur', SpAttack: 'Attaque spéciale',
  RearUp: 'Se cabre', Rumble: 'Gronde', QuickStrike: 'Frappe éclair', Appeal: 'Charme', Hover: 'Plane', Shake: 'Secoue',
  Withdraw: 'Se replie', Emit: 'Émet', Dance: 'Danse', MultiStrike: 'Frappes multiples', FlapAround: 'Bat des ailes',
  MultiScratch: 'Griffes', Slam: 'Plaquage', Punch: 'Poing', TailWhip: 'Fouet', Ricochet: 'Ricochet', Swell: 'Gonfle',
  Stomp: 'Piétine', Jab: 'Direct', Bite: 'Morsure', Sound: 'Cri', Kick: 'Coup de pied', Shock: 'Décharge', Slice: 'Tranche',
};
/** Portraits SpriteCollab : toutes les espèces n'ont pas toutes les émotions. */
const EMOTIONS: [string, string][] = [
  ['Normal', 'Normal'], ['Happy', 'Content'], ['Joyous', 'Joyeux'], ['Inspired', 'Inspiré'], ['Determined', 'Déterminé'],
  ['Surprised', 'Surpris'], ['Worried', 'Inquiet'], ['Sad', 'Triste'], ['Teary-Eyed', 'Ému'], ['Crying', 'En pleurs'],
  ['Angry', 'En colère'], ['Shouting', 'Crie'], ['Pain', 'Douleur'], ['Dizzy', 'Étourdi'], ['Sigh', 'Soupir'],
  ['Stunned', 'Sidéré'], ['Special0', 'Spécial 0'], ['Special1', 'Spécial 1'], ['Special2', 'Spécial 2'], ['Special3', 'Spécial 3'],
];
/** Rangées des planches, disposées en rose des vents (cf. sprites.ts). */
const COMPASS: [number, string][] = [[5, '↖'], [4, '↑'], [3, '↗'], [6, '←'], [-1, ''], [2, '→'], [7, '↙'], [0, '↓'], [1, '↘']];
const SAMPLE = { champion: 'Pierre', zone: 'Forêt', lead: 'Pikachu' };
/** Cadre d'une animation, en pixels CSS. */
const ANIM_W = 132;
const ANIM_H = 112;

const details = new Map<number, Promise<Detail | null>>();
export function loadDetail(id: number): Promise<Detail | null> {
  let pending = details.get(id);
  if (!pending) {
    pending = fetch(`${API}/species/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : null))
      .catch(() => null);
    details.set(id, pending);
  }
  return pending;
}
/** Après un import, les fiches disent où sont désormais les fichiers. */
export const forgetDetails = () => details.clear();

let root: HTMLElement;
let head: HTMLElement;
let body: HTMLElement;
let tabs: HTMLElement;
let current: number | null = null;
let tab: Tab = 'fiche';
/** Prévient la page qu'on a ouvert, fermé ou changé d'onglet (surbrillance, état gardé au rechargement). */
let moved: () => void = () => {};

export const currentSheet = () => current;
export const currentTab = () => tab;

export function mountSheet(parent: HTMLElement, changed: () => void) {
  moved = changed;
  root = el('aside', 'sheet', parent);
  head = el('header', 'sheet-head', root);
  tabs = el('nav', 'tabs', root);
  body = el('div', 'sheet-body', root);
  for (const [t, label] of TABS) {
    const b = el('button', 'tab', tabs, label);
    b.dataset.tab = t;
    b.addEventListener('click', () => {
      tab = t;
      renderBody();
      moved();
    });
  }
}

export function openSheet(id: number, t?: Tab) {
  if (current !== id) body.scrollTop = 0;
  current = id;
  if (t) tab = t;
  root.classList.add('open');
  renderHead();
  renderBody();
  moved();
}

export function closeSheet() {
  current = null;
  root.classList.remove('open');
  moved();
}

/** Le bestiaire a changé ailleurs (plateau, liste) : on remet la fiche à jour sans gêner une saisie. */
export function refreshSheet() {
  if (current === null) return;
  renderBadges();
  const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
  if (tab === 'fiche' && !typing) renderBody();
}

function pill(parent: Element, type: string) {
  const p = el('span', 'type', parent, TYPE_FR[type] ?? type);
  p.style.setProperty('--c', typeColor(type));
  return p;
}

let badges: HTMLElement;

/** En-tête de la fiche : construit à l'ouverture, seuls les badges suivent ensuite les changements. */
function renderHead() {
  const id = current;
  if (id === null) return;
  const c = store.catalog.get(id);
  head.replaceChildren();
  const close = el('button', 'close', head, '×');
  close.title = 'Fermer (Échap)';
  close.addEventListener('click', closeSheet);
  const art = el('div', 'art', head);
  art.style.setProperty('--c', typeColor(c?.types[0] ?? 'normal'));
  thumb(art, c?.walk ?? null, 96);
  void loadDetail(id).then((d) => {
    if (!d || current !== id) return;
    const img = new Image();
    img.onload = () => art.replaceChildren(img);
    img.src = d.artwork;
  });
  const ident = el('div', 'ident', head);
  el('div', 'dex', ident, `${dex(id)}${c?.en ? ` · ${c.en}` : ''}`);
  el('h2', '', ident, c?.name ?? dex(id));
  const types = el('div', 'types', ident);
  for (const t of c?.types ?? []) pill(types, t);
  badges = el('div', 'badges', ident);
  renderBadges();
}

function renderBadges() {
  const id = current;
  if (id === null) return;
  const c = store.catalog.get(id);
  badges.replaceChildren();
  if (!isUsed(id)) el('span', 'badge free', badges, 'Pas encore dans le jeu');
  else if (unplayable(id)) el('span', 'badge bad', badges, 'Sans planche : ignorée en jeu');
  else if (!c?.imported && (c?.godot || c?.collab)) el('span', 'badge warn', badges, 'Assets à importer');
  else if (missingMoves(id).length) el('span', 'badge warn', badges, 'Attaques à importer');
  else el('span', 'badge ok', badges, 'Dans le jeu');
  for (const b of biomesOf(id)) {
    const chip = el('span', 'badge biome', badges, BIOMES[b].name);
    chip.style.setProperty('--c', BIOME_COLOR[b]);
  }
}

function renderBody() {
  for (const t of tabs.querySelectorAll<HTMLElement>('.tab')) t.classList.toggle('on', t.dataset.tab === tab);
  body.replaceChildren();
  const id = current;
  if (id === null) return;
  if (tab === 'fiche') renderFiche(id);
  else if (tab === 'caractere') renderPersona(id);
  else if (tab === 'histoire') renderStory(id);
  else {
    const wait = el('p', 'muted pad', body, 'Chargement de la fiche…');
    void loadDetail(id).then((d) => {
      if (current !== id || wait.parentElement !== body) return;
      wait.remove();
      if (!d) {
        el('p', 'muted pad', body, 'Fiche introuvable : le serveur de dev tourne-t-il ?');
        return;
      }
      if (tab === 'attaques') renderMoves(id, d);
      else renderSprites(d);
    });
  }
}

function section(title: string, hint?: string): HTMLElement {
  const s = el('section', 'block', body);
  el('h3', '', s, title);
  if (hint) el('p', 'hint', s, hint);
  return s;
}

// ── Fiche ────────────────────────────────────────────────────────────────

function renderFiche(id: number) {
  const c = store.catalog.get(id);
  if ((isUsed(id) || unplayable(id)) && !c?.imported) {
    const warn = el('p', 'notice warn', body);
    warn.textContent = c?.godot
      ? 'Ses planches sont dans le dépôt Godot mais pas encore dans le jeu : « Importer les assets » les copiera.'
      : c?.collab
        ? 'Ni le jeu ni le dépôt Godot n’ont ses planches : « Importer les assets » les téléchargera de SpriteCollab, avec sa fiche PokéAPI.'
        : 'Aucune planche PMD, ni dans le dépôt Godot ni sur SpriteCollab : le jeu ne saura pas la dessiner.';
  }

  const s = section('Biomes', 'Ajoutée en fin de liste ; l’ordre se règle sur le plateau (les 9 premières peuplent le début de chaque acte).');
  const grid = el('div', 'biome-toggles', s);
  for (const b of BIOME_ORDER) {
    const list = biomeList(b);
    const at = list.indexOf(id);
    const btn = el('button', `biome-toggle${at >= 0 ? ' on' : ''}`, grid);
    btn.style.setProperty('--c', BIOME_COLOR[b]);
    el('span', 'swatch', btn);
    el('span', 'name', btn, BIOMES[b].name);
    el('span', 'pos', btn, at >= 0 ? `n° ${at + 1}${at < 9 ? ' · début d’acte' : ''}` : '');
    btn.addEventListener('click', () => toggleBiome(id, b));
  }

  if (c && Object.keys(c.stats).length) {
    const st = section('Statistiques de base');
    const table = el('div', 'stats', st);
    let total = 0;
    for (const [k, label] of STAT_FR) {
      const v = Math.round(c.stats[k] ?? 0);
      total += v;
      el('span', 'label', table, label);
      el('span', 'value', table, String(v));
      const bar = el('span', 'bar', table);
      const fill = el('i', '', bar);
      fill.style.width = `${Math.min(100, (v / 180) * 100)}%`;
      fill.style.background = v >= 100 ? '#6fd36a' : v >= 70 ? '#ffcb05' : v >= 50 ? '#ffa53a' : '#ff6b5a';
    }
    el('span', 'label total', table, 'Total');
    el('span', 'value total', table, String(total));
    const facts = el('p', 'facts', st);
    const bits = [c.heightM !== undefined ? `${String(c.heightM).replace('.', ',')} m` : '', c.weightKg !== undefined ? `${String(c.weightKg).replace('.', ',')} kg` : '', SWIMMERS.has(id) ? 'nage d’elle-même' : ''];
    facts.textContent = bits.filter(Boolean).join(' · ');
  }

  const roles = ROLES.get(id);
  if (roles?.length) {
    const r = section('Rôles en jeu', 'Tenus par le code (data/species.ts, data/champions.ts), pas par le bestiaire.');
    const chips = el('div', 'chips', r);
    for (const role of roles) el('span', 'chip', chips, role);
  }
}

function toggleBiome(id: number, b: BiomeId) {
  const list = biomeList(b);
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  else list.push(id);
  commit();
}

// ── Attaques ─────────────────────────────────────────────────────────────

/** GameManager.default_loadout (combat/pokemon.ts) : offensives d'abord, les plus faibles en tête. */
function defaultLoadout(d: Detail): string[] {
  const learned = [...new Set((d.pokemon?.level_up_moves ?? []).filter((m) => m.level <= BASE_TEAM_LEVEL).map((m) => m.name))].filter((n) => d.moves[n]);
  const power = (n: string) => d.moves[n].power ?? 0;
  return learned
    .sort((a, b) => {
      if (power(a) > 0 !== power(b) > 0) return power(a) > 0 ? -1 : 1;
      if (power(a) === power(b)) return a < b ? -1 : 1;
      return power(a) - power(b);
    })
    .slice(0, 4);
}

function moveMeta(m: MoveInfo): string {
  const cls = CLASS_FR[m.damage_class ?? ''] ?? '—';
  return m.power ? `${cls} · ${Math.round(m.power)}` : cls;
}

function renderMoves(id: number, d: Detail) {
  const own = sheet(id).moves;
  const imposed = !!own?.length;
  const loadout = imposed ? own! : defaultLoadout(d);

  const s = section(
    'En combat',
    imposed
      ? 'Attaques imposées par le bestiaire : celles des sauvages, des champions, des mercenaires et, tant qu’on n’a rien choisi au Repaire, du Pokémon joué.'
      : `Jeu de départ du jeu : les attaques apprises jusqu’au niveau ${BASE_TEAM_LEVEL}, offensives d’abord, les plus faibles en tête. Ajoute une attaque ci-dessous pour imposer les tiennes.`,
  );
  const slots = el('div', 'slots', s);
  for (let i = 0; i < 4; i++) {
    const name = loadout[i];
    const m = name ? d.moves[name] : undefined;
    const slot = el('div', `slot${name ? '' : ' empty'}`, slots);
    el('span', 'key', slot, String(i + 1));
    if (!name) {
      el('span', 'muted', slot, 'Emplacement libre');
      continue;
    }
    slot.style.setProperty('--c', typeColor(m?.type ?? 'normal'));
    const txt = el('div', 'txt', slot);
    el('strong', '', txt, m?.name_fr ?? name);
    el('small', '', txt, m ? `${TYPE_FR[m.type ?? ''] ?? m.type} · ${moveMeta(m)}` : 'fiche PokéAPI tirée à l’import');
    if (!m?.inGame) el('span', 'badge warn', slot, 'à importer');
    // Retirer une attaque du jeu de départ impose les trois autres : la place se libère pour une nouvelle.
    const x = el('button', 'icon', slot, '×');
    x.title = imposed ? 'Retirer' : 'Retirer (impose les trois autres)';
    x.addEventListener('click', () => {
      sheet(id).moves = loadout.filter((n) => n !== name);
      commit();
      renderBody();
    });
  }
  if (imposed) {
    const reset = el('button', 'ghost', s, 'Revenir au jeu de départ');
    reset.addEventListener('click', () => {
      delete sheet(id).moves;
      commit();
      renderBody();
    });
  }

  const add = (name: string) => {
    const next = [...loadout.filter((n) => n !== name), name].slice(-4);
    sheet(id).moves = next;
    commit();
    renderBody();
  };
  const table = (parent: HTMLElement, rows: { name: string; level?: number }[]) => {
    const t = el('div', 'moves', parent);
    for (const { name, level } of rows) {
      const m = d.moves[name];
      const row = el('div', `move${m ? '' : ' missing'}${loadout.includes(name) ? ' equipped' : ''}`, t);
      const btn = el('button', 'icon add', row, loadout.includes(name) ? '✓' : '+');
      btn.disabled = loadout.includes(name) || loadout.length >= 4;
      btn.title = loadout.includes(name) ? 'Déjà équipée' : loadout.length >= 4 ? 'Les 4 emplacements sont pris : retire d’abord une attaque' : m ? 'Équiper' : 'Équiper (sa fiche sera tirée de PokéAPI à l’import)';
      btn.addEventListener('click', () => add(name));
      el('span', 'lvl', row, level !== undefined ? `N.${level}` : '');
      const txt = el('div', 'txt', row);
      el('strong', '', txt, m?.name_fr ?? name);
      if (m?.desc_fr) el('small', '', txt, m.desc_fr);
      else if (!m) el('small', '', txt, `${name} — fiche tirée de PokéAPI à l’import`);
      if (m?.type) pill(row, m.type);
      else el('span', '', row);
      el('span', 'num', row, m ? moveMeta(m) : '');
      el('span', 'num', row, m?.accuracy ? `${Math.round(m.accuracy)} %` : '—');
    }
    return t;
  };

  const levelUp = [...(d.pokemon?.level_up_moves ?? [])].sort((a, b) => a.level - b.level);
  table(section('Apprises en montant de niveau', 'N.1 à N.10 : le jeu de départ s’y prend.'), levelUp.map((m) => ({ name: m.name, level: m.level })));

  const all = [...new Set([...(d.pokemon?.learnable_moves ?? [])])];
  const sAll = section(`Toutes les attaques qu’il peut apprendre (${all.length})`, 'CT, tuteurs et reproduction compris. Grisées : pas encore de fiche ici ; l’import la tirera de PokéAPI si on l’impose.');
  const filter = el('input', 'search', sAll);
  filter.placeholder = 'Filtrer par nom ou par type…';
  const holder = el('div', '', sAll);
  const draw = () => {
    const q = fold(filter.value.trim());
    const rows = all
      .filter((n) => {
        if (!q) return true;
        const m = d.moves[n];
        return [n, m?.name_fr ?? '', TYPE_FR[m?.type ?? ''] ?? ''].some((s) => fold(s).includes(q));
      })
      .sort((a, b) => (d.moves[a] ? 0 : 1) - (d.moves[b] ? 0 : 1) || (d.moves[a]?.name_fr ?? a).localeCompare(d.moves[b]?.name_fr ?? b, 'fr'))
      .map((name) => ({ name }));
    holder.replaceChildren();
    table(holder, rows);
  };
  filter.addEventListener('input', draw);
  draw();
}

// ── Caractère et répliques ───────────────────────────────────────────────

function renderPersona(id: number) {
  const sh = sheet(id);
  const c = store.catalog.get(id);
  const s = section('Caractère', 'Sans répliques propres, l’espèce dit celles de son caractère ; sans caractère, elle en tire un au hasard à chaque visite (boutique, Repaire).');
  const grid = el('div', 'personas', s);
  const choices: [string | undefined, string, string][] = [[undefined, 'Au hasard', 'Un caractère différent à chaque visite.'], ...PERSONAS.map((p): [string, string, string] => [p.name, p.name, p.lines[0]])];
  for (const [value, label, sample] of choices) {
    const b = el('button', `persona${sh.persona === value ? ' on' : ''}`, grid);
    el('strong', '', b, label);
    el('small', '', b, sample);
    b.addEventListener('click', () => {
      if (value) sh.persona = value;
      else delete sh.persona;
      commit();
      renderBody();
    });
  }
  const persona = PERSONAS.find((p) => p.name === sh.persona);
  if (persona) {
    const q = el('ul', 'quotes', s);
    for (const l of persona.lines) el('li', '', q, l);
  }

  const own = section('Répliques propres', 'Elles passent avant celles du caractère. {champion}, {zone} et {lead} (le Pokémon joué) sont remplacés en jeu.');
  const list = el('div', 'lines', own);
  let focused: HTMLTextAreaElement | null = null;
  const lines = (sh.lines ??= []);
  const grow = (t: HTMLTextAreaElement) => {
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 2}px`;
  };
  lines.forEach((line, i) => {
    const row = el('div', 'line', list);
    const t = el('textarea', '', row);
    t.rows = 1;
    t.value = line;
    t.placeholder = 'Ce qu’il dit…';
    t.addEventListener('focus', () => (focused = t));
    t.addEventListener('input', () => {
      lines[i] = t.value;
      grow(t);
      commit();
      preview();
    });
    requestAnimationFrame(() => grow(t));
    const x = el('button', 'icon', row, '×');
    x.title = 'Supprimer la réplique';
    x.addEventListener('click', () => {
      lines.splice(i, 1);
      commit();
      renderBody();
    });
  });
  const tools = el('div', 'row-tools', own);
  const addBtn = el('button', 'ghost', tools, '+ Ajouter une réplique');
  addBtn.addEventListener('click', () => {
    lines.push('');
    renderBody();
    body.querySelector<HTMLTextAreaElement>('.lines .line:last-child textarea')?.focus();
  });
  for (const v of ['{champion}', '{zone}', '{lead}']) {
    const b = el('button', 'ghost small', tools, v);
    b.title = 'Insérer dans la réplique en cours';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const t = focused;
      if (!t) return;
      t.setRangeText(v, t.selectionStart, t.selectionEnd, 'end');
      t.dispatchEvent(new Event('input'));
    });
  }

  const pv = section('Aperçu', `Avec ${SAMPLE.champion} pour champion, la ${SAMPLE.zone} pour zone et ${SAMPLE.lead} en tête.`);
  const bubble = el('div', 'bubble', pv);
  const face = el('div', 'face', bubble);
  void loadDetail(id).then((d) => {
    if (!d) return;
    const img = new Image();
    img.onload = () => face.replaceChildren(img);
    img.src = `${d.portraits}/Normal.png`;
  });
  thumb(face, c?.walk ?? null, 48);
  const said = el('div', 'said', bubble);
  const who = el('strong', '', said, c?.name ?? dex(id));
  const text = el('p', '', said);
  const next = el('button', 'ghost small', pv, 'Autre réplique →');
  let n = 0;
  const preview = () => {
    const pool = lines.map((l) => l.trim()).filter(Boolean);
    const from = pool.length ? pool : (persona?.lines ?? []);
    who.textContent = c?.name ?? dex(id);
    text.textContent = from.length ? fillLine(from[n % from.length], SAMPLE) : 'Pas de réplique : il tirera un caractère au hasard.';
    next.disabled = from.length < 2;
  };
  next.addEventListener('click', () => {
    n++;
    preview();
  });
  preview();
}

// ── Histoire ─────────────────────────────────────────────────────────────

function renderStory(id: number) {
  const sh = sheet(id);
  const s = section('Histoire', 'Pas encore affichée en jeu : c’est la référence pour écrire ses répliques, ses scènes et sa place dans la rébellion.');
  const t = el('textarea', 'story', s);
  t.placeholder = 'D’où vient-il ? Qu’a-t-il vécu avec les Dresseurs, la Ligue, les Poké Balls ? Que pense-t-il de la rébellion ? Qui connaît-il au Repaire ?';
  t.value = sh.story ?? '';
  const count = el('p', 'hint right', s);
  const update = () => (count.textContent = `${t.value.trim().split(/\s+/).filter(Boolean).length} mots`);
  t.addEventListener('input', () => {
    sh.story = t.value;
    update();
    commit();
  });
  update();
}

// ── Sprites ──────────────────────────────────────────────────────────────

let onlyGame = false;

function renderSprites(d: Detail) {
  const bar = el('div', 'sprite-bar', body);
  const compass = el('div', 'compass', bar);
  for (const [dir, arrow] of COMPASS) {
    const b = el('button', `dir${dir === playback.dir ? ' on' : ''}`, compass, arrow);
    if (dir < 0) {
      b.disabled = true;
      continue;
    }
    b.title = 'Direction';
    b.addEventListener('click', () => {
      playback.dir = dir;
      for (const x of compass.querySelectorAll('.dir')) x.classList.remove('on');
      b.classList.add('on');
    });
  }
  const speeds = el('div', 'seg', bar);
  for (const sp of [0.25, 0.5, 1, 2]) {
    const b = el('button', sp === playback.speed ? 'on' : '', speeds, `×${String(sp).replace('.', ',')}`);
    b.addEventListener('click', () => {
      playback.speed = sp;
      for (const x of speeds.children) x.classList.remove('on');
      b.classList.add('on');
    });
  }
  const only = el('label', 'check', bar);
  const box = el('input', '', only);
  box.type = 'checkbox';
  box.checked = onlyGame;
  el('span', '', only, 'Seulement celles du jeu');
  box.addEventListener('change', () => {
    onlyGame = box.checked;
    renderBody();
  });

  const anims = d.anims.filter((a) => !onlyGame || GAME_ANIMS.has(a.name));
  const s = section(
    `Animations (${anims.length})`,
    'Planches PMD SpriteCollab. « Jeu » : copiée dans public/game ; « Godot » : dans le dépôt Godot ; « En ligne » : lue sur SpriteCollab, le jeu ne l’a pas.',
  );
  if (!d.anims.length) el('p', 'muted', s, 'Aucune planche PMD connue pour cette espèce.');
  const grid = el('div', 'anims', s);
  const walk = d.anims.find((a) => a.name === 'Walk');
  const scale = walk ? speciesScale(walk.url, walk.fw, walk.fh, ANIM_W, ANIM_H) : Promise.resolve(4);
  for (const a of anims) {
    const card = el('figure', 'anim', grid);
    const canvas = el('canvas', '', card);
    const cap = el('figcaption', '', card);
    el('strong', '', cap, ANIM_FR[a.name] ?? a.name);
    el('small', '', cap, `${a.name} · ${a.durations.length} fr. · ${(a.durations.reduce((x, y) => x + y, 0) / 60).toFixed(2).replace('.', ',')} s`);
    const tags = el('div', 'tags', cap);
    el('span', `src ${a.src}`, tags, a.src === 'jeu' ? 'Jeu' : a.src === 'godot' ? 'Godot' : 'En ligne');
    if (GAME_ANIMS.has(a.name)) el('span', 'src used', tags, 'utilisée');
    if (a.file !== a.name) el('span', 'src', tags, `= ${a.file}`);
    void scale
      .then((max) => animate(canvas, a.url, a.fw, a.fh, a.durations, ANIM_W, ANIM_H, max))
      .then((ok) => {
        if (!ok) card.classList.add('broken');
      });
  }

  const p = section('Portraits', 'Émotions SpriteCollab (en ligne) : pour les bulles de dialogue. Toutes les espèces ne les ont pas toutes.');
  const faces = el('div', 'portraits', p);
  for (const [file, label] of EMOTIONS) {
    const f = el('figure', 'portrait', faces);
    const img = el('img', '', f);
    img.alt = label;
    img.loading = 'lazy';
    img.onerror = () => {
      f.remove();
      if (!faces.childElementCount) faces.replaceWith(el('p', 'muted', null, 'Pas de portrait sur SpriteCollab.'));
    };
    img.src = `${d.portraits}/${file}.png`;
    el('figcaption', '', f, label);
  }

  const art = section('Illustration officielle');
  const img = el('img', 'artwork', art);
  img.src = d.artwork;
  img.alt = store.catalog.get(d.id)?.name ?? '';
}
