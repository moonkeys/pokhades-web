import qrcode from 'qrcode-generator';

/**
 * Un QR code en SVG (netteté parfaite à toute taille), encre sur papier avec la marge blanche
 * dont les lecteurs ont besoin. Niveau de correction « M » : un lien court tient en peu de modules,
 * donc lisible même petit, à l'écran d'un ordinateur.
 */
export function qrSvg(text: string, cls = ''): SVGSVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + quiet * 2} ${n + quiet * 2}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code pour rejoindre la partie');
  if (cls) svg.setAttribute('class', cls);
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#14100e');
  svg.append(bg, path);
  return svg;
}
