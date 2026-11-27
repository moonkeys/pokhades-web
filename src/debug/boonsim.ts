import { Boons, BOONS, RARITY_NAME, type DonorId } from '../combat/boons';
import { Rng } from '../core/rng';
import { ACTS, ROOMS_PER_ACT } from '../run/run';

// Banc des dons (retour du 27 novembre 2026 : « on a des dons épiques et rares très vite ; il
// faudrait plus de communs, une montée logique, et retrouver facilement un légendaire déjà
// rencontré, comme Poséidon dans Hades »). Joue des runs entières sans combat : à chaque salle,
// une porte de don une fois sur `boonShare`, le donateur de la porte (pickDonor), l'offre de trois
// cartes, et un joueur qui prend la carte la plus rare. Mesure, par acte, la rareté des cartes
// proposées et de celle prise, et sur la run, combien de légendaires différents ont donné.
//
// Console du serveur de dev : (await import('/src/debug/boonsim.ts')).simulate()

export interface SimOptions {
  runs?: number;
  /** Part des salles qui mènent à un don (les autres : Baies, soin, boutique, champion…). */
  boonShare?: number;
  /** Chance de finir une salle sans encaisser un coup, au premier acte puis au dernier. */
  flawless?: [number, number];
  seed?: number;
}

export function simulate(o: SimOptions = {}) {
  const runs = o.runs ?? 2000;
  const share = o.boonShare ?? 0.4;
  const [f0, f1] = o.flawless ?? [0.45, 0.2];
  const rng = new Rng(o.seed ?? 12345);
  const offered = Array.from({ length: ACTS }, () => [0, 0, 0, 0]);
  const taken = Array.from({ length: ACTS }, () => [0, 0, 0, 0]);
  const donorsPerRun: number[] = [];
  const firstDonorShare: number[] = [];
  let duos = 0;
  for (let r = 0; r < runs; r++) {
    const b = new Boons();
    const gave: DonorId[] = [];
    for (let room = 0; room < ACTS * ROOMS_PER_ACT; room++) {
      const act = Math.floor(room / ROOMS_PER_ACT);
      if (room % ROOMS_PER_ACT === ROOMS_PER_ACT - 1 || rng.next() > share) continue;
      b.enterRoom();
      const p = f0 + ((f1 - f0) * room) / (ACTS * ROOMS_PER_ACT);
      b.roomHurts = rng.next() < p ? 0 : 1;
      const offer = b.offer(rng, room, act, b.pickDonor(rng) ?? undefined);
      if (!offer) continue;
      const cards = offer.cards.filter((c) => !c.id.startsWith('__ult__'));
      if (!cards.length) continue;
      for (const c of cards) offered[act][c.result]++;
      const best = cards.reduce((a, c) => (c.result > a.result ? c : a));
      taken[act][b.grant(best.id, best.rarity)]++;
      if (BOONS[best.id]?.duo) duos++;
      gave.push(offer.donor);
    }
    donorsPerRun.push(new Set(gave).size);
    if (gave.length) firstDonorShare.push(gave.filter((g) => g === gave[0]).length / gave.length);
  }
  const pct = (row: number[]) => {
    const t = row.reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(RARITY_NAME.map((n, i) => [n, `${Math.round((row[i] / t) * 100)} %`]));
  };
  const avg = (l: number[]) => Math.round((l.reduce((a, b) => a + b, 0) / (l.length || 1)) * 100) / 100;
  return {
    cartesProposees: offered.map((row, a) => ({ acte: a + 1, ...pct(row) })),
    donsPris: taken.map((row, a) => ({ acte: a + 1, ...pct(row) })),
    legendairesParRun: avg(donorsPerRun),
    partDuPremierLegendaire: `${Math.round(avg(firstDonorShare) * 100)} %`,
    duosParRun: Math.round((duos / runs) * 100) / 100,
  };
}
