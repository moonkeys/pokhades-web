import { QUEST_REWARDS } from '../data/species';
import type { WeatherId } from '../world/weather';
import type { Save } from './save';

// Quêtes bonus de Kangourex, la doyenne du Repaire (ajout : le jeu Godot n'en
// a pas). On en accepte chez elle, trois au plus à la fois ; chacune compte
// un exploit de run — des K.O., des Baies ramassées, des salles spéciales,
// des champions — à partir du moment où on l'a acceptée, pas avant. Remplie,
// elle se réclame chez la doyenne : le Pokémon promis rejoint la rébellion
// (débloqué, comme au 20ᵉ K.O. d'une espèce). Ces Pokémon-là ne se croisent
// nulle part ailleurs (species.ts, QUEST_REWARDS) ; les deux dernières
// quêtes promettent des légendaires.
//
// Le module est pur (ni DOM ni rendu) : main.ts lui passe les événements de
// run (questEvent), campscreen.ts l'affiche.

export type QuestId = keyof typeof QUEST_REWARDS;

/** Événements de run qui font avancer les quêtes (branchés dans main.ts). */
export type QuestEvent =
  | { kind: 'kill'; types: readonly string[]; weather: WeatherId }
  | { kind: 'berry'; n: number }
  | { kind: 'room'; hurt: boolean }
  | { kind: 'special'; special: 'challenge' | 'trap'; success: boolean }
  | { kind: 'champion' }
  /** Acte atteint (0 : le premier). */
  | { kind: 'act'; act: number }
  | { kind: 'victory' };

export interface Quest {
  id: QuestId;
  name: string;
  desc: string;
  goal: number;
  /** Ce que vaut l'événement pour cette quête (0 : rien). */
  gain(ev: QuestEvent): number;
  /** Progression au plus haut atteint (un acte), plutôt qu'en cumul. */
  best?: boolean;
  reward: number;
  /** Récompense légendaire (annoncée comme telle, la silhouette reste cachée). */
  legendary?: boolean;
}

/** Quêtes actives à la fois. */
export const MAX_ACTIVE = 3;

export const QUESTS: readonly Quest[] = [
  { id: 'first_steps', name: 'Premiers pas', desc: 'Mets 50 sauvages K.O. en run.', goal: 50, gain: (e) => (e.kind === 'kill' ? 1 : 0), reward: QUEST_REWARDS.first_steps },
  { id: 'gatherer', name: 'Cueilleur', desc: 'Ramasse 60 Baies tombées des arbres.', goal: 60, gain: (e) => (e.kind === 'berry' ? e.n : 0), reward: QUEST_REWARDS.gatherer },
  { id: 'untouched', name: 'Sans une égratignure', desc: 'Libère 5 salles sans que ton meneur encaisse un coup.', goal: 5, gain: (e) => (e.kind === 'room' && !e.hurt ? 1 : 0), reward: QUEST_REWARDS.untouched },
  { id: 'speedrun', name: 'Contre la montre', desc: 'Réussis 3 salles Défi avant la fin du chrono.', goal: 3, gain: (e) => (e.kind === 'special' && e.special === 'challenge' && e.success ? 1 : 0), reward: QUEST_REWARDS.speedrun },
  { id: 'trapbreaker', name: 'Brise-pièges', desc: 'Survis à 3 salles Piège.', goal: 3, gain: (e) => (e.kind === 'special' && e.special === 'trap' ? 1 : 0), reward: QUEST_REWARDS.trapbreaker },
  { id: 'downpour', name: 'Sous l’averse', desc: 'Mets 30 sauvages K.O. sous la pluie.', goal: 30, gain: (e) => (e.kind === 'kill' && e.weather === 'rain' ? 1 : 0), reward: QUEST_REWARDS.downpour },
  { id: 'sleeper', name: 'Gros dormeur', desc: 'Atteins le troisième acte d’une run.', goal: 3, best: true, gain: (e) => (e.kind === 'act' ? e.act + 1 : 0), reward: QUEST_REWARDS.sleeper },
  { id: 'storm', name: 'Œil de la tempête', desc: 'Mets 20 sauvages K.O. dans le sable ou la grêle.', goal: 20, gain: (e) => (e.kind === 'kill' && (e.weather === 'sand' || e.weather === 'hail') ? 1 : 0), reward: QUEST_REWARDS.storm },
  { id: 'champions', name: 'Briseur de champions', desc: 'Vaincs 5 champions d’arène.', goal: 5, gain: (e) => (e.kind === 'champion' ? 1 : 0), reward: QUEST_REWARDS.champions, legendary: true },
  { id: 'victory', name: 'La rébellion triomphe', desc: 'Gagne une run : bats le Dresseur final.', goal: 1, gain: (e) => (e.kind === 'victory' ? 1 : 0), reward: QUEST_REWARDS.victory, legendary: true },
];

export const quest = (id: QuestId): Quest => QUESTS.find((q) => q.id === id)!;

/** La quête qui promet cette espèce, s'il y en a une (le Pokédex le dit). */
export const questFor = (species: number): Quest | undefined => QUESTS.find((q) => q.reward === species);

export type QuestState = 'open' | 'active' | 'ready' | 'done';

export function questState(save: Save, id: QuestId): QuestState {
  if (save.quests.done.includes(id)) return 'done';
  if (!save.quests.active.includes(id)) return 'open';
  return (save.quests.progress[id] ?? 0) >= quest(id).goal ? 'ready' : 'active';
}

/** Accepte une quête : rend false si elle est déjà prise, faite, ou si trois sont en cours. */
export function acceptQuest(save: Save, id: QuestId): boolean {
  if (questState(save, id) !== 'open' || save.quests.active.length >= MAX_ACTIVE) return false;
  save.quests.active.push(id);
  save.quests.progress[id] = 0;
  return true;
}

/** Abandonne une quête : sa progression est perdue (on repartira de zéro). */
export function abandonQuest(save: Save, id: QuestId): void {
  save.quests.active = save.quests.active.filter((q) => q !== id);
  delete save.quests.progress[id];
}

/** Réclame une quête remplie : rend l'espèce gagnée (à débloquer), ou null si elle ne l'est pas. */
export function claimQuest(save: Save, id: QuestId): number | null {
  if (questState(save, id) !== 'ready') return null;
  abandonQuest(save, id);
  save.quests.done.push(id);
  return quest(id).reward;
}

/** Fait avancer les quêtes actives ; rend celles que l'événement vient de remplir. */
export function questEvent(save: Save, ev: QuestEvent): QuestId[] {
  const filled: QuestId[] = [];
  for (const id of save.quests.active) {
    const q = quest(id);
    const was = save.quests.progress[id] ?? 0;
    if (was >= q.goal) continue;
    const g = q.gain(ev);
    if (g <= 0) continue;
    const now = Math.min(q.goal, q.best ? Math.max(was, g) : was + g);
    save.quests.progress[id] = now;
    if (now >= q.goal) filled.push(id);
  }
  return filled;
}

/** Nettoie les quêtes d'une sauvegarde (ids inconnus, doublons, trop d'actives, progression hors bornes). */
export function sanitizeQuests(raw: Partial<Save['quests']> | undefined): Save['quests'] {
  const known = (v: unknown): v is QuestId => QUESTS.some((q) => q.id === v);
  const done = [...new Set((Array.isArray(raw?.done) ? raw.done : []).filter(known))];
  const active = [...new Set((Array.isArray(raw?.active) ? raw.active : []).filter(known))].filter((id) => !done.includes(id)).slice(0, MAX_ACTIVE);
  const progress: Save['quests']['progress'] = {};
  for (const id of active) {
    const n = Number(raw?.progress?.[id]);
    progress[id] = Number.isFinite(n) ? Math.max(0, Math.min(quest(id).goal, Math.floor(n))) : 0;
  }
  return { active, progress, done };
}

// ── Contrats de Kangourex (ajout : A-FAIRE 2.5, « des quêtes qui se renouvellent ») ──
//
// À côté des dix quêtes, qui ne se font qu'une fois, la doyenne tient
// CONTRACT_SLOTS contrats : de petits objectifs de run (des K.O. d'un type,
// des Baies, des salles sans coup, un Défi, un champion) qui comptent dès
// qu'ils sont affichés, sans les accepter. Rempli, un contrat se réclame
// contre des Baies, des ressources ou un Éclat, et un nouveau le remplace.
// Tirage déterministe sur un compteur de la sauvegarde (`seed`), pour qu'un
// rechargement ne rebatte pas les cartes.

export type ContractKind = 'kill_type' | 'kill' | 'berry' | 'clean' | 'challenge' | 'champion';

export interface Contract {
  kind: ContractKind;
  /** Type visé (K.O. d'un type). */
  type?: string;
  goal: number;
  n: number;
  reward: { baies: number; wood?: number; stone?: number; food?: number; shards?: number };
}

export const CONTRACT_SLOTS = 3;

const CONTRACT_TYPES = ['fire', 'water', 'grass', 'electric', 'rock', 'ground', 'bug', 'flying', 'psychic', 'ice', 'poison', 'normal', 'dark', 'ghost', 'fighting'];
const TYPE_FR: Record<string, string> = {
  fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', rock: 'Roche', ground: 'Sol', bug: 'Insecte', flying: 'Vol',
  psychic: 'Psy', ice: 'Glace', poison: 'Poison', normal: 'Normal', dark: 'Ténèbres', ghost: 'Spectre', fighting: 'Combat',
};

/** Hachage entier → [0, 1[ (mulberry32 en une passe). */
function unit(seed: number, salt: number): number {
  let t = (seed * 0x9e3779b1 + salt * 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Le contrat n° `seed`. */
export function rollContract(seed: number): Contract {
  const r = (salt: number, n: number) => Math.floor(unit(seed, salt) * n);
  const pick = r(1, 10);
  const res = r(2, 2) ? 'wood' : 'stone';
  if (pick < 4) {
    const type = CONTRACT_TYPES[r(3, CONTRACT_TYPES.length)];
    return { kind: 'kill_type', type, goal: 8 + r(4, 8), n: 0, reward: { baies: 30 + r(5, 20), [res]: 4 + r(6, 4) } };
  }
  if (pick < 6) return { kind: 'kill', goal: 30 + 5 * r(4, 5), n: 0, reward: { baies: 40 + r(5, 20), food: 3 + r(6, 3) } };
  if (pick < 7) return { kind: 'berry', goal: 15 + 5 * r(4, 3), n: 0, reward: { baies: 25, wood: 3 + r(6, 3), stone: 3 + r(7, 3) } };
  if (pick < 8) return { kind: 'clean', goal: 2 + r(4, 2), n: 0, reward: { baies: 50 + r(5, 20) } };
  if (pick < 9) return { kind: 'challenge', goal: 1, n: 0, reward: { baies: 40, [res]: 6 } };
  return { kind: 'champion', goal: 1, n: 0, reward: { baies: 40, shards: 1 } };
}

/** Ce que demande le contrat, en clair. */
export function contractText(c: Contract): string {
  switch (c.kind) {
    case 'kill_type':
      return `Mets ${c.goal} sauvages de type ${TYPE_FR[c.type!] ?? c.type} K.O.`;
    case 'kill':
      return `Mets ${c.goal} sauvages K.O.`;
    case 'berry':
      return `Ramasse ${c.goal} Baies tombées des arbres.`;
    case 'clean':
      return `Libère ${c.goal} salles sans que ton meneur encaisse un coup.`;
    case 'challenge':
      return 'Réussis une salle Défi.';
    case 'champion':
      return 'Vaincs un champion d’arène.';
  }
}

/** Complète la liste à CONTRACT_SLOTS contrats. */
export function refillContracts(save: Save): void {
  while (save.contracts.list.length < CONTRACT_SLOTS) save.contracts.list.push(rollContract(++save.contracts.seed));
}

function contractGain(c: Contract, ev: QuestEvent): number {
  switch (c.kind) {
    case 'kill_type':
      return ev.kind === 'kill' && ev.types.includes(c.type!) ? 1 : 0;
    case 'kill':
      return ev.kind === 'kill' ? 1 : 0;
    case 'berry':
      return ev.kind === 'berry' ? ev.n : 0;
    case 'clean':
      return ev.kind === 'room' && !ev.hurt ? 1 : 0;
    case 'challenge':
      return ev.kind === 'special' && ev.special === 'challenge' && ev.success ? 1 : 0;
    case 'champion':
      return ev.kind === 'champion' ? 1 : 0;
  }
}

/** Fait avancer les contrats ; rend ceux que l'événement vient de remplir. */
export function contractEvent(save: Save, ev: QuestEvent): Contract[] {
  const filled: Contract[] = [];
  for (const c of save.contracts.list) {
    if (c.n >= c.goal) continue;
    const g = contractGain(c, ev);
    if (g <= 0) continue;
    c.n = Math.min(c.goal, c.n + g);
    if (c.n >= c.goal) filled.push(c);
  }
  return filled;
}

/** Réclame le contrat `i` s'il est rempli : sa récompense est versée, un nouveau le remplace. */
export function claimContract(save: Save, i: number): Contract | null {
  const c = save.contracts.list[i];
  if (!c || c.n < c.goal) return null;
  save.baies += c.reward.baies;
  save.resources.wood += c.reward.wood ?? 0;
  save.resources.stone += c.reward.stone ?? 0;
  save.resources.food += c.reward.food ?? 0;
  save.shards += c.reward.shards ?? 0;
  save.contracts.list[i] = rollContract(++save.contracts.seed);
  return c;
}

/** Nettoie les contrats d'une sauvegarde, et complète la liste. */
export function sanitizeContracts(raw: Partial<Save['contracts']> | undefined): Save['contracts'] {
  const kinds: ContractKind[] = ['kill_type', 'kill', 'berry', 'clean', 'challenge', 'champion'];
  const list = (Array.isArray(raw?.list) ? raw.list : [])
    .filter((c): c is Contract => !!c && kinds.includes(c.kind) && Number(c.goal) > 0 && !!c.reward)
    .slice(0, CONTRACT_SLOTS)
    .map((c) => ({ ...c, n: Math.max(0, Math.min(c.goal, Math.floor(Number(c.n) || 0))) }));
  const out = { list, seed: Math.max(0, Math.floor(Number(raw?.seed) || 0)) };
  while (out.list.length < CONTRACT_SLOTS) out.list.push(rollContract(++out.seed));
  return out;
}
