import { contractGain, itemName, rollContract, type Contract, type ContractKind, type QuestEvent } from './quests';
import type { Save } from './save';

// Services des habitants des salles calmes (retour de test du 16 novembre
// 2026 : « les Pokémon à qui tu parles dans les zones spéciales peuvent te
// donner des quêtes… il faudra les retrouver dans les endroits spéciaux pour
// valider »). Un habitant (une Mélofée de la Source, un Machoc du Dojo…)
// propose parfois un service : un contrat comme ceux de Kangourex (quests.ts,
// même tirage, même progression). Rempli, il faut retrouver l'habitant dans une
// salle de son genre pour être payé ; on ne l'y croise pas à coup sûr, mais il
// y revient souvent tant qu'on lui doit une réponse (run/residents.ts).
// Module pur : main.ts lui passe les événements de run.

export type CalmRoom = 'spring' | 'altar' | 'dojo' | 'pension';

export interface Errand {
  /** Espèce de l'habitant qui l'a confié. */
  npc: number;
  /** Où le retrouver. */
  room: CalmRoom;
  contract: Contract;
}

/** Services en cours à la fois. */
export const MAX_ERRANDS = 3;

/** Où se trouve chaque genre de salle, en clair (« à la Source »). */
export const ROOM_AT: Record<CalmRoom, string> = { spring: 'à la Source', altar: 'à l’Autel maudit', dojo: 'au Dojo', pension: 'à la Pension' };

/** Un service, tiré de la graine `seed` (les primes en Baies un peu plus fortes : il faut revenir). */
export function rollErrand(seed: number, npc: number, room: CalmRoom): Errand {
  const c = rollContract(seed * 7919 + 13);
  return { npc, room, contract: { ...c, reward: { ...c.reward, baies: Math.round(c.reward.baies * 1.3) } } };
}

/** Le service confié par `npc`, s'il y en a un. */
export const errandOf = (save: Save, npc: number): Errand | undefined => save.errands.list.find((e) => e.npc === npc);
export const errandDone = (e: Errand): boolean => e.contract.n >= e.contract.goal;

/** Fait avancer les services ; rend ceux que l'événement vient de remplir. */
export function errandEvent(save: Save, ev: QuestEvent): Errand[] {
  const filled: Errand[] = [];
  for (const e of save.errands.list) {
    const c = e.contract;
    if (c.n >= c.goal) continue;
    const g = contractGain(c, ev);
    if (g <= 0) continue;
    c.n = Math.min(c.goal, c.n + g);
    if (c.n >= c.goal) filled.push(e);
  }
  return filled;
}

/** Paie le service rempli de `npc` et le retire ; rend le contrat payé. */
export function claimErrand(save: Save, npc: number): Contract | null {
  const i = save.errands.list.findIndex((e) => e.npc === npc && errandDone(e));
  if (i < 0) return null;
  const c = save.errands.list[i].contract;
  save.baies += c.reward.baies;
  save.resources.wood += c.reward.wood ?? 0;
  save.resources.stone += c.reward.stone ?? 0;
  save.resources.food += c.reward.food ?? 0;
  save.shards += c.reward.shards ?? 0;
  if (c.reward.item) save.items[c.reward.item] = (save.items[c.reward.item] ?? 0) + 1;
  save.errands.list.splice(i, 1);
  return c;
}

/** Nettoie les services d'une sauvegarde. */
export function sanitizeErrands(raw: Partial<Save['errands']> | undefined): Save['errands'] {
  const kinds: ContractKind[] = ['kill_type', 'kill', 'berry', 'clean', 'challenge', 'champion'];
  const rooms: CalmRoom[] = ['spring', 'altar', 'dojo', 'pension'];
  const list = (Array.isArray(raw?.list) ? raw.list : [])
    .filter((e): e is Errand => !!e && rooms.includes(e.room) && Number(e.npc) > 0 && !!e.contract && kinds.includes(e.contract.kind) && Number(e.contract.goal) > 0)
    .slice(0, MAX_ERRANDS)
    .map((e) => ({ ...e, contract: { ...e.contract, n: Math.max(0, Math.min(e.contract.goal, Math.floor(Number(e.contract.n) || 0))) } }));
  return { list, seed: Math.max(0, Math.floor(Number(raw?.seed) || 0)) };
}

/** Ce que paie un service, en clair (« 52 Baies, 4 Bois et un Super Bonbon »). */
export function rewardOf(c: Contract): string {
  const r = c.reward;
  const parts = [`${r.baies} Baies`, ...(r.wood ? [`${r.wood} Bois`] : []), ...(r.stone ? [`${r.stone} Pierre`] : []), ...(r.food ? [`${r.food} Nourriture`] : []), ...(r.shards ? [`${r.shards} Éclat${r.shards > 1 ? 's' : ''}`] : []), ...(r.item ? [itemName(r.item)] : [])];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts[0];
}
