// Le logo « POKHADES — Libérez-les tous ! » : l'illustration fournie par le joueur
// (public/game/brand/logo.webp, exportée avec sa vraie transparence).
// Elle remplace l'ancien lettrage HTML/SVG. Le favicon et l'icône d'écran d'accueil
// (public/favicon-*.png, apple-touch-icon.png) reprennent sa Poké Ball enchaînée
// (public/game/brand/ball.webp) : s'ils changent, les changer ensemble.

export interface LogoOptions {
  cls?: string;
}

/**
 * Le logo, prêt à poser : l'illustration fournie par le joueur (public/game/brand/logo.webp,
 * avec sa transparence d’origine). Elle remplace le lettrage SVG d'origine
 * (retour de test : « là, c'est très moche »). Il « claque » sous un `.play .title-wrap`.
 */
export function logo(o: LogoOptions = {}): HTMLElement {
  const root = document.createElement('div');
  root.className = `logo logo-art ${o.cls ?? ''}`;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Pokhades — Libérez-les tous !');
  const img = document.createElement('img');
  img.src = '/game/brand/logo.webp';
  img.alt = 'Pokhades — Libérez-les tous !';
  img.draggable = false;
  // Ne le montrer (et le faire « claquer », cf. da.css) qu'une fois l'image décodée : animé
  // avant, sous le flou de l'écran titre, Chromium gardait le calque rastérisé vide et le
  // logo restait invisible sur petit écran.
  const show = () => root.classList.add('ready');
  img.decode().then(show, show);
  root.append(img);
  return root;
}
