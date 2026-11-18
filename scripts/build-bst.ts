// Recalcule src/data/bst.json : le total des stats de base de chaque espèce et forme dont le
// projet a la fiche PokéAPI (public/game/data/pokeapi/pokemon/<id>.json). Le poids d'équipe
// (src/meta/weight.ts) le lit pour peser un Pokémon selon sa force, pas seulement son stade.
//
//   npx tsx scripts/build-bst.ts      (après import-assets, quand de nouvelles espèces arrivent)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(WEB, 'public/game/data/pokeapi/pokemon');
const out: Record<number, number> = {};
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const stats = (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { stats?: Record<string, number> }).stats;
  if (stats) out[Number(f.slice(0, -5))] = Math.round(Object.values(stats).reduce((a, b) => a + b, 0));
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => Number(a) - Number(b)));
fs.writeFileSync(path.join(WEB, 'src/data/bst.json'), JSON.stringify(sorted));
console.log(`${Object.keys(sorted).length} espèces`);
