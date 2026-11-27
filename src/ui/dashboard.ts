import type { AdminPlayer, AdminStats } from '../net/cloud';

// Tableau de bord des données (demande du 27 novembre 2026 : « dans mes stats, un truc pour voir
// toutes les stats de jeu, les gens, leur avancement, pour améliorer le jeu s'il y a besoin,
// autour des bugs »). Ouvert depuis l'écran Compte, pour un administrateur seulement
// (supabase/admin.sql, admin_stats) ; les autres ne voient pas le bouton.
//
// Ce qu'il montre, de quoi décider quoi corriger :
//   • les chiffres du jeu (joueurs, actifs, runs, victoires) ;
//   • l'entonnoir : où les joueurs s'arrêtent (partie commencée → une run → un champion → une
//     victoire → le temple). Une marche qui chute fort, c'est là qu'il faut regarder ;
//   • jusqu'où vont les runs (le record de chacun, par acte) ;
//   • chaque joueur (identifiant court, jamais l'e-mail) et son avancement ;
//   • les erreurs du jeu, regroupées, les plus récentes d'abord.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
};

const DAY = 86_400_000;
/** Une salle par acte de 9 (run.ts, ROOMS_PER_ACT) : le record d'un joueur, en acte atteint. */
const ACTS = ['Acte 1', 'Acte 2', 'Acte 3', 'Acte 4', 'Route Victoire'];
const actOf = (room: number) => Math.min(ACTS.length - 1, Math.floor(Math.max(0, room - 1) / 9));

const when = (iso: string): string => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  if (days < 1) return 'aujourd’hui';
  if (days < 2) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR');
};

/** Une rangée de barres : libellé, barre à la part du plus grand, valeur. */
function bars(parent: HTMLElement, rows: readonly [string, number, string?][]): void {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const box = el('div', 'dash-bars', parent);
  for (const [label, v, note] of rows) {
    const r = el('div', 'dash-bar', box);
    el('span', '', r, label);
    el('i', '', r).style.setProperty('--w', `${(v / max) * 100}%`);
    el('b', '', r, note ?? String(v));
  }
}

export function renderDashboard(body: HTMLElement, stats: AdminStats, refresh: () => void): void {
  const ps = stats.players;
  const now = Date.now();
  const active = (days: number) => ps.filter((p) => now - new Date(p.updated_at).getTime() < days * DAY).length;
  const sum = (f: (p: AdminPlayer) => number) => ps.reduce((s, p) => s + f(p), 0);

  const top = el('div', 'dash-top', body);
  el('small', 'dash-when', top, `Données du ${new Date(stats.at).toLocaleString('fr-FR')}`);
  el('button', 'opt-switch', top, 'ACTUALISER').addEventListener('click', refresh);

  // Les chiffres du jeu.
  const cards = el('div', 'dash-cards', body);
  for (const [v, label] of [
    [ps.length, 'joueurs'],
    [active(7), 'actifs (7 j)'],
    [active(30), 'actifs (30 j)'],
    [sum((p) => p.runs), 'runs'],
    [sum((p) => p.wins), 'victoires'],
    [stats.errors.reduce((s, e) => s + e.count, 0), 'erreurs'],
  ] as const) {
    const c = el('div', 'dash-card da-paper', cards);
    el('b', '', c, String(v));
    el('small', '', c, label);
  }

  // L'entonnoir : la part des joueurs qui franchit chaque étape.
  el('h4', 'dash-h', body, 'Où les joueurs s’arrêtent');
  const n = Math.max(1, ps.length);
  const step = (label: string, k: number): [string, number, string] => [label, k, `${k} · ${Math.round((k / n) * 100)} %`];
  bars(body, [
    step('Compte créé', ps.length),
    step('Partie commencée', ps.filter((p) => p.started).length),
    step('Au moins une run', ps.filter((p) => p.runs > 0).length),
    step('Un champion battu', ps.filter((p) => p.beaten > 0).length),
    step('Une run gagnée', ps.filter((p) => p.wins > 0).length),
    step('Le temple essayé', ps.filter((p) => p.temple > 0).length),
  ]);

  // Jusqu'où vont les runs : le record de chacun, par acte.
  el('h4', 'dash-h', body, 'Jusqu’où vont les runs (record de chacun)');
  const byAct = ACTS.map(() => 0);
  for (const p of ps) if (p.best_room > 0) byAct[actOf(p.best_room)]++;
  bars(body, ACTS.map((a, i) => [a, byAct[i]] as [string, number]));

  // Les joueurs.
  el('h4', 'dash-h', body, 'Les joueurs');
  const wrap = el('div', 'dash-table-wrap', body);
  const table = el('table', 'dash-table', wrap);
  const head = el('tr', '', el('thead', '', table));
  for (const h of ['Joueur', 'Vu', 'Runs', 'Vict.', 'Record', 'Champ.', 'Pokémon', 'Vus', 'Bâti', 'Temple']) el('th', '', head, h);
  const tb = el('tbody', '', table);
  for (const p of ps) {
    const r = el('tr', '', tb);
    for (const v of [p.id, when(p.updated_at), p.runs, p.wins, p.best_room ? `salle ${p.best_room}` : '—', p.beaten, p.mons, p.seen, p.built, p.temple || '—']) el('td', '', r, String(v));
  }
  if (!ps.length) el('p', 'acct-fine', body, 'Aucun joueur avec un compte pour l’instant.');

  // Les erreurs.
  el('h4', 'dash-h', body, 'Erreurs du jeu');
  if (!stats.errors.length) el('p', 'acct-fine', body, 'Aucune erreur signalée.');
  for (const e of stats.errors) {
    const d = el('details', 'dash-err da-paper', body);
    const s = el('summary', '', d);
    el('b', '', s, `×${e.count}`);
    s.append(` ${e.message}`);
    el('small', '', d, `Version ${e.version || '?'} · vue ${when(e.last_at)} (la première ${when(e.first_at)})`);
    if (e.stack) el('pre', '', d, e.stack);
  }
}
