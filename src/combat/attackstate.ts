// État d'attaque d'un Pokémon de l'équipe (TeamMember.gd : _move_cd, verrous,
// chaîne de combo) : chacun a le sien, le Pokémon joué comme ses compagnons,
// et le garde quand on change de Pokémon. Combat lit celui de l'attaquant.

export class AttackState {
  /** Recharge propre à chaque emplacement ; elles tournent en parallèle. */
  readonly moveCd = [0, 0, 0, 0];
  /** Recharge totale du dernier lancer, pour le voile du HUD. */
  readonly moveCdMax = [1, 1, 1, 1];
  globalLock = 0;
  actionLock = 0;
  /** Emplacement sélectionné (dernière touche pressée, ou choix de l'IA) : son anneau de portée est affiché. */
  selected = 0;
  comboStep = 0;
  comboT = 0;

  tick(dt: number): void {
    for (let i = 0; i < 4; i++) this.moveCd[i] = Math.max(0, this.moveCd[i] - dt);
    this.globalLock = Math.max(0, this.globalLock - dt);
    this.actionLock = Math.max(0, this.actionLock - dt);
    if (this.comboStep > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.comboStep = 0;
    }
  }

  /** Prêt si les trois verrous sont levés (TeamMember._move_ready). */
  ready(slot: number): boolean {
    return this.moveCd[slot] <= 0 && this.globalLock <= 0 && this.actionLock <= 0;
  }

  reset(): void {
    this.moveCd.fill(0);
    this.globalLock = this.actionLock = 0;
    this.comboStep = 0;
    this.comboT = 0;
  }
}
