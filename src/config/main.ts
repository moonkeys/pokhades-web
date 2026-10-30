import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/bebas-neue';
import './config.css';
import type { Bestiary } from '../data/bestiary';
import { typeColor } from '../render/combatfx';
import { BIOME_COLOR, BIOME_ORDER, BIOMES } from '../world/biomes';
import type { BiomeId } from '../data/species';
import { closeSheet, currentSheet, currentTab, forgetDetails, mountSheet, openSheet, refreshSheet } from './sheet';
import {
  API,
  biomeList,
  biomesOf,
  commit,
  dex,
  dropDraft,
  el,
  fold,
  isDirty,
  isUsed,
  needsImport,
  onChange,
  problem,
  setSaved,
  snapshot,
  store,
  takeDraft,
  TYPE_FR,
  type CatalogEntry,
} from './shared';
import { thumb } from './sprites';

// Page de config du bestiaire (config.html, `npm run dev`) : toutes les
// espèces que le jeu embarque ou que le dépôt Godot permet d'ajouter, les
// biomes où on les croise, et pour chacune ses attaques, son caractère, ses
// répliques, son histoire et ses sprites. On enregistre dans
// src/data/bestiary.json, que le jeu lit (species.ts, data/bestiary.ts).

type Filter = 'all' | 'used' | 'free' | 'import';
const FILTERS: [Filter, string][] = [
  ['all', 'Toutes'],
  ['used', 'Dans le jeu'],
  ['free', 'À ajouter'],
  ['import', 'À régler'],
];
/** Les 9 premières espèces d'un biome peuplent le début de chaque acte (run.ts, fauna). */
const ACT_START = 9;
const UI_KEY = 'pokhades-bestiary-ui';

const ui = { filter: 'all' as Filter, type: '', biome: '' as BiomeId | '', q: '', sheet: null as number | null, tab: undefined as string | undefined };
try {
  Object.assign(ui, JSON.parse(sessionStorage.getItem(UI_KEY) ?? '{}'));
} catch {
  // Rien à reprendre.
}
const keepUi = () => {
  ui.sheet = currentSheet();
  ui.tab = currentTab();
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // Tant pis : la page repartira de zéro.
  }
};

const app = document.getElementById('app')!;

// ── En-tête ──────────────────────────────────────────────────────────────

const top = el('header', 'top', app);
const brand = el('div', 'brand', top);
el('span', 'tape', brand, 'Pokhades');
el('h1', '', brand, 'Bestiaire');
el('p', 'tagline', top, 'Qui vit dans quel biome, ce qu’il sait faire, ce qu’il dit, d’où il vient.');
const actions = el('div', 'actions', top);
const status = el('span', 'status', actions);
const importBtn = el('button', 'ghost', actions, 'Importer les assets');
importBtn.title = 'Copie dans public/game les planches et les fiches des espèces ajoutées (npm run import-assets)';
const saveBtn = el('button', 'primary', actions, 'Enregistrer');
saveBtn.title = 'Écrit src/data/bestiary.json (⌘S) ; le jeu ouvert se recharge';
const gameLink = el('a', 'ghost link', actions, 'Ouvrir le jeu ↗');
gameLink.href = '/';
gameLink.target = 'pokhades-game';

function refreshStatus() {
  const dirty = isDirty();
  const pending = [...store.catalog.keys()].filter(needsImport).length;
  status.textContent = dirty ? 'Changements non enregistrés' : 'Tout est enregistré';
  status.classList.toggle('dirty', dirty);
  saveBtn.disabled = !dirty;
  importBtn.textContent = pending ? `Importer les assets (${pending})` : 'Importer les assets';
  importBtn.classList.toggle('hot', pending > 0);
  importBtn.disabled = !store.godot;
  if (!store.godot) importBtn.title = 'Dépôt Godot introuvable (../pokhades ou POKHADES_GODOT)';
}

// ── Liste des espèces ────────────────────────────────────────────────────

const main = el('div', 'main', app);
const side = el('aside', 'list', main);
const search = el('input', 'search', side);
search.placeholder = 'Nom, n° ou nom anglais…';
search.value = ui.q;
const segs = el('div', 'seg wide', side);
const filterBtns = new Map<Filter, HTMLButtonElement>();
for (const [f, label] of FILTERS) {
  const b = el('button', '', segs, label);
  filterBtns.set(f, b);
  b.addEventListener('click', () => {
    ui.filter = f;
    renderList();
  });
}
const selects = el('div', 'selects', side);
const typeSel = el('select', '', selects);
el('option', '', typeSel, 'Tous les types').value = '';
for (const [t, label] of Object.entries(TYPE_FR)) el('option', '', typeSel, label).value = t;
typeSel.value = ui.type;
const biomeSel = el('select', '', selects);
el('option', '', biomeSel, 'Tous les biomes').value = '';
for (const b of BIOME_ORDER) el('option', '', biomeSel, BIOMES[b].name).value = b;
biomeSel.value = ui.biome;
const count = el('p', 'count', side);
const rows = el('div', 'rows', side);
const rowUpdates = new Map<number, () => void>();

search.addEventListener('input', () => {
  ui.q = search.value;
  renderList();
});
typeSel.addEventListener('change', () => {
  ui.type = typeSel.value;
  renderList();
});
biomeSel.addEventListener('change', () => {
  ui.biome = biomeSel.value as BiomeId | '';
  renderList();
});

function matches(c: CatalogEntry): boolean {
  if (ui.filter === 'used' && !isUsed(c.id)) return false;
  if (ui.filter === 'free' && isUsed(c.id)) return false;
  if (ui.filter === 'import' && !problem(c.id)) return false;
  if (ui.type && !c.types.includes(ui.type)) return false;
  if (ui.biome && !biomeList(ui.biome).includes(c.id)) return false;
  const q = fold(ui.q.trim());
  if (!q) return true;
  if (/^#?\d+$/.test(q)) return String(c.id).startsWith(q.replace('#', '').replace(/^0+/, ''));
  return fold(c.name).includes(q) || c.en.includes(q);
}

function renderList() {
  for (const [f, b] of filterBtns) b.classList.toggle('on', f === ui.filter);
  rows.replaceChildren();
  rowUpdates.clear();
  const shown = [...store.catalog.values()].filter(matches);
  count.textContent = `${shown.length} espèce${shown.length > 1 ? 's' : ''} sur ${store.catalog.size}`;
  for (const c of shown) {
    const row = el('div', 'row', rows);
    row.draggable = true;
    row.dataset.id = String(c.id);
    thumb(row, c.walk, 40);
    const txt = el('div', 'txt', row);
    el('strong', '', txt, c.name);
    const sub = el('small', '', txt);
    el('span', 'num', sub, dex(c.id));
    for (const t of c.types) {
      const dot = el('i', 'tdot', sub);
      dot.style.background = typeColor(t);
      dot.title = TYPE_FR[t] ?? t;
    }
    const marks = el('div', 'marks', row);
    const update = () => {
      marks.replaceChildren();
      for (const b of biomesOf(c.id)) {
        const m = el('i', 'bdot', marks);
        m.style.background = BIOME_COLOR[b];
        m.title = BIOMES[b].name;
      }
      const pb = problem(c.id);
      if (pb) el('span', `flag ${pb.kind}`, marks, pb.kind === 'bad' ? '✕' : '!').title = pb.text;
      row.classList.toggle('used', isUsed(c.id));
      row.classList.toggle('active', currentSheet() === c.id);
    };
    update();
    rowUpdates.set(c.id, update);
    row.addEventListener('click', () => open(c.id));
    row.addEventListener('dragstart', (e) => startDrag(e, { id: c.id }));
  }
  keepUi();
}

// ── Plateau des biomes ───────────────────────────────────────────────────

const board = el('section', 'board', main);
const boardHead = el('div', 'board-head', board);
el('h2', '', boardHead, 'Biomes');
el(
  'p',
  'hint',
  boardHead,
  'Glisse une espèce de la liste vers un biome. L’ordre compte : les 9 premières peuplent le début de chaque acte, les suivantes s’y ajoutent ensuite. Glisser d’un biome à l’autre déplace (⌥ pour copier) ; vers la liste, retire.',
);
const bands = el('div', 'bands', board);
let boardKey = '';

interface Drag {
  id: number;
  from?: BiomeId;
}
let drag: Drag | null = null;

function startDrag(e: DragEvent, d: Drag) {
  drag = d;
  e.dataTransfer?.setData('text/plain', String(d.id));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  document.body.classList.add('dragging');
}
document.addEventListener('dragend', () => {
  drag = null;
  document.body.classList.remove('dragging');
  for (const x of document.querySelectorAll('.drop-before, .drop-after, .drop-on')) x.classList.remove('drop-before', 'drop-after', 'drop-on');
});

/** Où lâcher dans une bande : avant ou après la vignette survolée, sinon à la fin. */
function dropIndex(band: HTMLElement, e: DragEvent): { at: number; tile: HTMLElement | null; after: boolean } {
  const tile = (e.target as HTMLElement).closest<HTMLElement>('.tile');
  const len = band.querySelectorAll('.tile').length;
  if (!tile) return { at: len, tile: null, after: false };
  const r = tile.getBoundingClientRect();
  const after = e.clientX > r.left + r.width / 2;
  return { at: Number(tile.dataset.index) + (after ? 1 : 0), tile, after };
}

function renderBoard(force = false) {
  // Le plateau ne dépend que des biomes et de l'état d'import : une réplique tapée ne le redessine pas.
  const key = JSON.stringify([store.data.biomes, [...store.catalog.keys()].filter(problem), currentSheet()]);
  if (key === boardKey && !force) return;
  boardKey = key;
  bands.replaceChildren();
  for (const b of BIOME_ORDER) {
    const list = biomeList(b);
    const band = el('div', 'band', bands);
    band.style.setProperty('--c', BIOME_COLOR[b]);
    const label = el('div', 'band-label', band);
    el('strong', '', label, BIOMES[b].name);
    el('small', '', label, `${list.length} espèce${list.length > 1 ? 's' : ''}`);
    const tiles = el('div', 'tiles', band);
    list.forEach((id, i) => {
      if (i === ACT_START) el('div', 'act-split', tiles).title = 'Après la 9ᵉ : seulement à partir de la 3ᵉ salle de l’acte';
      const c = store.catalog.get(id);
      const tile = el('div', `tile${i < ACT_START ? ' early' : ''}${currentSheet() === id ? ' active' : ''}`, tiles);
      tile.draggable = true;
      tile.dataset.index = String(i);
      el('span', 'idx', tile, String(i + 1));
      thumb(tile, c?.walk ?? null, 44);
      el('span', 'name', tile, c?.name ?? dex(id));
      const pb = problem(id);
      if (pb) el('span', `flag ${pb.kind}`, tile, pb.kind === 'bad' ? '✕' : '!').title = pb.text;
      const x = el('button', 'remove', tile, '×');
      x.title = `Retirer de ${BIOMES[b].name}`;
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        list.splice(list.indexOf(id), 1);
        commit();
      });
      tile.addEventListener('click', () => open(id));
      tile.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        startDrag(e, { id, from: b });
      });
    });
    if (!list.length) el('span', 'empty', tiles, 'Glisse des espèces ici');

    band.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      const copy = e.altKey || !drag.from;
      if (e.dataTransfer) e.dataTransfer.dropEffect = copy ? 'copy' : 'move';
      for (const x of bands.querySelectorAll('.drop-before, .drop-after, .drop-on')) x.classList.remove('drop-before', 'drop-after', 'drop-on');
      const { tile, after } = dropIndex(band, e);
      if (tile) tile.classList.add(after ? 'drop-after' : 'drop-before');
      else band.classList.add('drop-on');
    });
    band.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      let { at } = dropIndex(band, e);
      const { id, from } = drag;
      if (from && from !== b && !e.altKey) {
        const src = biomeList(from);
        src.splice(src.indexOf(id), 1);
      }
      const cur = list.indexOf(id);
      if (cur >= 0) {
        list.splice(cur, 1);
        if (cur < at) at--;
      }
      list.splice(at, 0, id);
      drag = null;
      commit();
    });
  }
}

// Lâcher une vignette du plateau sur la liste : elle quitte son biome.
side.addEventListener('dragover', (e) => {
  if (!drag?.from) return;
  e.preventDefault();
  side.classList.add('drop-on');
});
side.addEventListener('dragleave', () => side.classList.remove('drop-on'));
side.addEventListener('drop', (e) => {
  side.classList.remove('drop-on');
  if (!drag?.from) return;
  e.preventDefault();
  const list = biomeList(drag.from);
  list.splice(list.indexOf(drag.id), 1);
  drag = null;
  commit();
});

// ── Fiche, enregistrement, import ────────────────────────────────────────

mountSheet(app, () => {
  for (const u of rowUpdates.values()) u();
  renderBoard();
  keepUi();
});

const open = (id: number) => openSheet(id);

const toasts = el('div', 'toasts', document.body);
function toast(text: string, kind = '') {
  const t = el('div', `toast ${kind}`, toasts, text);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4700);
}

async function save(): Promise<boolean> {
  if (!isDirty()) return true;
  saveBtn.disabled = true;
  const res = await fetch(`${API}/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: snapshot() }).catch(() => null);
  if (!res?.ok) {
    toast('Échec de l’enregistrement : le serveur de dev tourne-t-il ?', 'bad');
    refreshStatus();
    return false;
  }
  setSaved(await res.text());
  dropDraft();
  toast('Bestiaire enregistré dans src/data/bestiary.json');
  commit();
  return true;
}

async function loadCatalog() {
  const res = await fetch(`${API}/catalog`);
  const cat = (await res.json()) as { godot: string | null; species: CatalogEntry[]; webMoves: string[] };
  store.catalog = new Map(cat.species.map((c) => [c.id, c]));
  store.webMoves = new Set(cat.webMoves);
  store.godot = cat.godot;
}

async function runImport() {
  if (!(await save())) return;
  const veil = el('div', 'veil', document.body);
  const box = el('div', 'dialog', veil);
  el('h3', '', box, 'Import des assets');
  el('p', 'hint', box, 'npm run import-assets : copie depuis le dépôt Godot les planches, fiches et illustrations de tout ce que le jeu utilise…');
  const log = el('pre', 'log', box, '…');
  const res = await fetch(`${API}/import`, { method: 'POST' })
    .then((r) => r.json() as Promise<{ ok: boolean; log: string }>)
    .catch(() => ({ ok: false, log: 'Le serveur de dev ne répond pas.' }));
  log.textContent = res.log || '(rien à signaler)';
  await loadCatalog();
  forgetDetails();
  commit();
  renderList();
  if (currentSheet() !== null) openSheet(currentSheet()!);
  toast(res.ok ? 'Assets importés' : 'L’import a échoué : voir le journal', res.ok ? '' : 'bad');
  const close = el('button', 'primary', box, 'Fermer');
  close.addEventListener('click', () => veil.remove());
  close.focus();
}

saveBtn.addEventListener('click', () => void save());
importBtn.addEventListener('click', () => void runImport());
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void save();
  } else if (e.key === 'Escape' && currentSheet() !== null && !document.querySelector('.veil')) closeSheet();
});
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) e.preventDefault();
});

onChange(() => {
  for (const u of rowUpdates.values()) u();
  renderBoard();
  refreshSheet();
  refreshStatus();
  if (ui.filter !== 'all' || ui.biome) renderList();
});

// Le fichier a changé sur le disque (enregistrement, ou édité à la main) : on le relit si rien n'est en cours.
import.meta.hot?.on('bestiary:changed', async () => {
  const text = await fetch(`${API}/data`).then((r) => r.text());
  if (text === store.saved) return;
  if (isDirty()) {
    toast('bestiary.json a changé sur le disque : enregistrer écrasera cette version.', 'bad');
    return;
  }
  setSaved(text);
  store.data = JSON.parse(text) as Bestiary;
  commit();
  toast('bestiary.json relu depuis le disque');
});

async function boot() {
  // renderList garde l'état de la page : on note d'abord la fiche à rouvrir.
  const { sheet: reopen, tab: reopenTab } = ui;
  try {
    const [text] = await Promise.all([fetch(`${API}/data`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))), loadCatalog()]);
    setSaved(text);
    store.data = JSON.parse(text) as Bestiary;
  } catch {
    app.replaceChildren(el('p', 'notice warn pad', null, 'Le bestiaire ne se charge qu’avec le serveur de dev : lance « npm run dev » puis ouvre /config.html.'));
    return;
  }
  const draft = takeDraft();
  if (draft) {
    store.data = draft;
    toast('Brouillon non enregistré restauré');
  }
  renderList();
  renderBoard(true);
  refreshStatus();
  if (reopen !== null && store.catalog.has(reopen)) openSheet(reopen, reopenTab as Parameters<typeof openSheet>[1]);
}
void boot();
