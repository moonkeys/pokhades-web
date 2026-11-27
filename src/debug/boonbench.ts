import { BOONS, STAT_BOONS } from '../combat/boons';
import type { FightResult, FightSetup } from './balance';

// Banc des dons en combat (revue du 27 novembre 2026 : « j'ai l'impression que plein de dons ne
// marchent pas, le gel par exemple ; à vérifier tous, et à équilibrer, il y en a d'abusés et de
// trop basiques »). Pour chaque don proposable, quelques combats réels joués par le pilote du banc
// d'équilibrage (debug/balance.ts) avec ce seul don, comparés à des combats sans don :
// - `fired` : combien de fois le don a agi (Boons.fire). Zéro : il ne marche pas, ou la situation
//   ne s'est pas présentée (un don de dash quand le pilote n'a pas eu à esquiver) ;
// - le temps pour libérer la salle et les PV perdus par le Pokémon joué, en écart à la référence.
//
// Le pilote joue comme un joueur moyen (il fonce, enchaîne ses attaques, esquive au dash les zones
// marquées) : les chiffres comparent les dons entre eux, ils ne disent pas tout de leur effet en
// main. Lancé en tâche de fond, il range sa progression dans `window.boonBench` :
//
//   (await import('/src/debug/boonbench.ts')).start()            // tous les dons, au Rare
//   (await import('/src/debug/boonbench.ts')).start({ ids: ['glace_freeze'], rarity: 3, n: 4 })
//   window.boonBench   // { done, total, rows, base }

export interface BenchOptions {
  ids?: string[];
  /** Rareté des dons testés (0 Commun … 3 Prismatique). */
  rarity?: number;
  /** Combats par don, et pour la référence (sans don). */
  n?: number;
  base?: number;
  setup?: Partial<FightSetup>;
}

export interface BenchRow {
  id: string;
  name: string;
  /** Déclenchements moyens par combat. */
  fired: number;
  /** Temps de la salle en % de la référence, PV perdus en fin de combat en points d'écart (négatif : mieux). */
  time: number;
  taken: number;
  wins: string;
}

interface BenchState {
  done: number;
  total: number;
  base: { secs: number; taken: number; wins: string } | null;
  rows: BenchRow[];
  running: boolean;
}

type Host = { balance: { fight(s: FightSetup): Promise<FightResult> } };

/** Une salle de sauvages du 3ᵉ acte, l'équipe un peu juste : de quoi encaisser et voir les effets de zone. */
const DEFAULT: FightSetup = { room: 24, team: [6, 9], level: 22, secs: 150 };

export function start(o: BenchOptions = {}): BenchState {
  const P = (window as unknown as { pokhades: Host }).pokhades;
  const ids = o.ids ?? Object.values(BOONS).filter((d) => d.solo).map((d) => d.id);
  const n = o.n ?? 3;
  const nBase = o.base ?? 10;
  const setup = { ...DEFAULT, ...o.setup };
  const state: BenchState = { done: 0, total: nBase + ids.length * n, base: null, rows: [], running: true };
  (window as unknown as { boonBench: BenchState }).boonBench = state;
  const avg = (l: number[]) => l.reduce((a, b) => a + b, 0) / (l.length || 1);
  void (async () => {
    const series = async (boons: [string, number][], k: number) => {
      const out: FightResult[] = [];
      for (let i = 0; i < k; i++) {
        out.push(await P.balance.fight({ ...setup, boons }));
        state.done++;
      }
      return out;
    };
    const base = await series([], nBase);
    const bSecs = avg(base.map((r) => r.secs));
    const bTaken = avg(base.map((r) => r.taken));
    state.base = { secs: Math.round(bSecs), taken: Math.round(bTaken), wins: `${base.filter((r) => r.won).length}/${nBase}` };
    for (const id of ids) {
      // Un duo demande deux légendaires : le banc le donne seul, son effet ne dépend que de lui.
      const res = await series([[id, o.rarity ?? 1]], n);
      state.rows.push({
        id,
        name: BOONS[id]?.name ?? id,
        fired: Math.round(avg(res.map((r) => r.fired[id] ?? 0)) * 10) / 10,
        time: Math.round((avg(res.map((r) => r.secs)) / bSecs - 1) * 100),
        taken: Math.round(avg(res.map((r) => r.taken)) - bTaken),
        wins: `${res.filter((r) => r.won).length}/${n}`,
      });
    }
    state.running = false;
  })();
  return state;
}

/** Le tableau, trié par écart de temps (les dons qui accélèrent le plus en tête). */
export function table(): string {
  const s = (window as unknown as { boonBench?: BenchState }).boonBench;
  if (!s) return 'pas de banc lancé';
  const head = `référence : ${s.base?.secs ?? '?'} s, ${s.base?.taken ?? '?'} % de PV perdus, ${s.base?.wins ?? '?'} victoires — ${s.done}/${s.total}`;
  const rows = [...s.rows]
    .sort((a, b) => a.time - b.time)
    .map((r) => `${r.id.padEnd(20)} ${String(r.fired).padStart(6)}×  temps ${String(r.time).padStart(4)} %  PV perdus ${String(r.taken).padStart(4)} pts  ${r.wins}${STAT_BOONS[r.id] ? '  (stat)' : ''}`);
  return [head, ...rows].join('\n');
}
