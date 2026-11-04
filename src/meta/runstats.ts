import type { Actor } from '../entities/actor';

// Bilan d'une run, montré à sa fin (ui/runsummary.ts). Écart voulu : le jeu
// Godot repart au Repaire sur un simple toast ; ici on voit ce qu'a donné la
// run (jusqu'où, contre qui, quel Pokémon a porté l'équipe) avant d'y rentrer.
//
// Rien n'est sauvegardé : le bilan vit le temps de la run. Les membres sont
// suivis par Actor (ils durent toute la run, évolutions comprises) : on lit
// leur espèce à la fin, forme évoluée comprise.

export interface MemberStats {
  dealt: number;
  taken: number;
}

export class RunStats {
  /** Temps de jeu en run (s), écrans et dialogues figés exclus. */
  time = 0;
  kos = 0;
  dealt = 0;
  taken = 0;
  baies = 0;
  shards = 0;
  /** Champions vaincus, dans l'ordre. */
  readonly champions: string[] = [];
  readonly members = new Map<Actor, MemberStats>();

  reset(): void {
    this.time = this.kos = this.dealt = this.taken = this.baies = this.shards = 0;
    this.champions.length = 0;
    this.members.clear();
  }

  private of(a: Actor): MemberStats {
    let m = this.members.get(a);
    if (!m) this.members.set(a, (m = { dealt: 0, taken: 0 }));
    return m;
  }

  /** PV ôtés à un ennemi ; `by` null (brûlure, contrecoup…) compte pour l'équipe sans auteur. */
  dealtBy(by: Actor | null, amount: number): void {
    if (amount <= 0) return;
    this.dealt += amount;
    if (by) this.of(by).dealt += amount;
  }

  takenBy(member: Actor, amount: number): void {
    if (amount <= 0) return;
    this.taken += amount;
    this.of(member).taken += amount;
  }

  /** Le membre qui a infligé le plus de dégâts (null si personne n'a frappé). */
  mvp(team: readonly Actor[]): Actor | null {
    let best: Actor | null = null;
    for (const a of team) if ((this.members.get(a)?.dealt ?? 0) > (best ? this.members.get(best)!.dealt : 0)) best = a;
    return best;
  }
}

/** 754 s → « 12 min 34 s ». */
export function formatDuration(s: number): string {
  const t = Math.round(s);
  const m = Math.floor(t / 60);
  return m ? `${m} min ${String(t % 60).padStart(2, '0')} s` : `${t} s`;
}
