import { evolutionsOf } from './evolutions';
import { megaFormsOf, type MegaForm } from './megas';

// Les Méga-évolutions d'une lignée, pour le Pokédex et la fiche d'un Pokémon (retour de test du
// 25 novembre 2026 : « pouvoir filtrer les Pokémon qui ont une méga-évolution, et que ce soit
// affiché sur la fiche »). Seulement celles qu'on peut prendre en run (megaFormsOf : planches de
// SpriteCollab complètes), à part de data/megas.ts, que scripts/import-assets.ts lit seul.

export interface MegaInLine {
  form: MegaForm;
  /** L'espèce qui méga-évolue (Dracaufeu pour Méga-Dracaufeu X). */
  species: number;
  /** Niveau où cette espèce arrive dans la lignée (0 : l'espèce elle-même). */
  level: number;
}

/** Les formes Méga jouables de `id` et de ses évolutions, de la plus proche à la plus lointaine. */
export function megaInLine(id: number): MegaInLine[] {
  const out: MegaInLine[] = [];
  const seen = new Set<number>();
  const walk = (sp: number, level: number) => {
    if (seen.has(sp)) return;
    seen.add(sp);
    for (const form of megaFormsOf(sp)) out.push({ form, species: sp, level });
    for (const step of evolutionsOf(sp)) walk(step.next, Math.max(level, step.level));
  };
  walk(id, 0);
  return out;
}

/** Le texte de la fiche : « Méga-Dracaufeu X (une fois en Dracaufeu, niveau 36) ». */
export function megaText(m: MegaInLine, speciesName?: string): string {
  return m.level ? `${m.form.name} (une fois évolué${speciesName ? ` en ${speciesName}` : ''}, dès le niveau ${m.level})` : m.form.name;
}
