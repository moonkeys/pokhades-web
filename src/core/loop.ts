// Boucle à pas fixe (60 Hz, comme le tick physique par défaut de Godot) :
// la simulation avance par pas réguliers quel que soit l'écran (60, 120,
// 144 Hz), le rendu interpole entre les deux derniers états.
export const STEP = 1 / 60;

export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number, frameDt: number) => void,
): void {
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    // Plafond : un onglet resté en arrière-plan ne doit pas rejouer 10 s de simulation.
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render(acc / STEP, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
