// L'invite [E] d'une salle (boutique, coffre, source…), en HTML à envoyer à un invité en ligne
// (main.ts, sendPrompt). Le balisage seul ne suffit pas : l'icône de l'article est dessinée dans
// un canvas, que outerHTML rend vide. On la remplace par une image de son contenu, gardée en
// mémoire par canvas (l'invite se recalcule à chaque pas, l'icône ne change pas).

const urls = new WeakMap<HTMLCanvasElement, string>();

/** `el` tel qu'il s'affiche, canvas compris ; vide s'il est masqué. */
export function promptHtml(el: HTMLElement): string {
  if (el.hidden) return '';
  const canvases = el.querySelectorAll('canvas');
  if (!canvases.length) return el.outerHTML;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('canvas').forEach((c, i) => {
    const src = canvases[i];
    let url = urls.get(src);
    if (!url) urls.set(src, (url = src.toDataURL()));
    const img = document.createElement('img');
    img.src = url;
    img.className = 'prompt-icon';
    c.replaceWith(img);
  });
  return clone.outerHTML;
}
