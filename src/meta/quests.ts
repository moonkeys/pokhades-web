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
