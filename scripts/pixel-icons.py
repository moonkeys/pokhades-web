# Icônes en pixel art de l'interface (src/ui/essicon.ts), dans public/game/assets/pixel/.
#
#   python3 scripts/pixel-icons.py        (Pillow ; lit le dépôt Godot voisin, ../pokhades)
#
# Retours du 26 novembre 2026 : « pas de symboles dessinés hors de la DA ; un sprite d'Essentials
# qui correspond vraiment, sinon un symbole pixel art dans la même DA ». Après une planche de
# choix, le joueur a retenu :
#   - le VS des transitions de combat de HeartGold/SoulSilver pour le Duel, le ruban doré du résumé
#     pour l'as et le MVP, le rocher qu'on brise avec Éclate-Roc pour la grotte : des images
#     d'Essentials, recadrées ici (VS et ruban sont dessinés en pixels doublés : ramenés à leur
#     vraie taille, sans perte) ;
#   - un chrono dessiné pour le Défi, des pictogrammes de météo dessinés, et des silhouettes de
#     plusieurs Pokémon pour la Horde (tirées des icônes de menu d'Essentials, en aplats ; trois
#     Pikachu, seule silhouette lisible à cette taille).
#
# Tout est posé sur une case de 48 px, comme les icônes d'objets d'Essentials (l'objet au centre, une
# marge autour) : l'interface les affiche à la même taille (da.css, img.ess-item). Le style suit
# celui des objets : un contour sombre posé automatiquement autour des formes, deux ou trois tons
# par matière, un reflet clair en haut à gauche.

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ESS = ROOT.parent / 'pokhades' / 'Pokemon Essentials v21.1 2023-07-30' / 'Graphics'
OUT = ROOT / 'public' / 'game' / 'assets' / 'pixel'
OUT.mkdir(parents=True, exist_ok=True)

N = 48
INK = (40, 32, 48, 255)


def canvas():
    return Image.new('RGBA', (N, N), (0, 0, 0, 0))


def outline(im, color=INK):
    """Contour d'une case autour de tout ce qui est dessiné (les 4 voisins vides d'un pixel plein)."""
    px = im.load()
    filled = {(x, y) for y in range(N) for x in range(N) if px[x, y][3]}
    for x, y in filled:
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= q[0] < N and 0 <= q[1] < N and q not in filled:
                px[q] = color
    return im


def disc(d, cx, cy, r, fill):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)


def shade_disc(im, cx, cy, r, dark, k=0.45):
    """Assombrit le bas à droite d'un disque (la lumière vient d'en haut à gauche)."""
    px = im.load()
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and (x - cx) + (y - cy) > r * k * 2 and px[x, y][3]:
                px[x, y] = dark


def save(im, name):
    im.save(OUT / f'{name}.png')
    print('✓', name)


# ── Chrono du Défi ──────────────────────────────────────────────────────

def chrono():
    im = canvas()
    d = ImageDraw.Draw(im)
    cx, cy = 24, 26
    SIL, SILD, FACE, RED, REDL, HAND = (214, 220, 232, 255), (150, 160, 182, 255), (252, 252, 255, 255), (226, 64, 64, 255), (255, 150, 150, 255), (48, 40, 56, 255)
    d.rectangle((22, 10, 26, 14), fill=SIL)            # couronne
    d.rectangle((21, 8, 27, 10), fill=RED)             # bouton du dessus
    d.point((22, 8), fill=REDL)
    d.rectangle((33, 14, 35, 16), fill=SIL)            # bouton de côté
    disc(d, cx, cy, 12, SIL)                           # boîtier
    shade_disc(im, cx, cy, 12, SILD)
    disc(d, cx, cy, 9, FACE)                           # cadran
    for x, y in ((cx, cy - 7), (cx + 7, cy), (cx, cy + 7), (cx - 7, cy)):
        d.point((x, y), fill=HAND)                     # repères
    d.line((cx, cy, cx, cy - 6), fill=HAND)            # aiguille des minutes
    d.line((cx, cy, cx + 4, cy - 3), fill=RED)         # trotteuse
    d.point((cx, cy), fill=RED)
    for x, y in ((cx - 8, cy - 6), (cx - 9, cy - 4), (cx - 7, cy - 8)):
        d.point((x, y), fill=(255, 255, 255, 255))      # reflet
    save(outline(im), 'chrono')


# ── Météo ───────────────────────────────────────────────────────────────
#
# Deuxième version (retour : « plus de détails, plus de couleurs, le style pixel art des Pokémon ») :
# chaque forme est un masque ombré sur une gamme de cinq tons (reflet, clair, base, ombre, ombre
# profonde), éclairé d'en haut à gauche comme les objets des jeux DS, et cerné d'un contour de sa
# propre couleur assombrie plutôt que d'encre noire. Les formes se peignent de l'arrière vers
# l'avant : le contour de celle de devant la détache de celle de derrière.

LIGHT = (-0.62, -0.78)


def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def ramp(*hs):
    return [hexc(h) for h in hs]


def m_disc(cx, cy, r):
    return {(x, y) for y in range(int(cy - r) - 1, int(cy + r) + 2) for x in range(int(cx - r) - 1, int(cx + r) + 2) if (x - cx) ** 2 + (y - cy) ** 2 <= r * r}


def m_ellipse(cx, cy, rx, ry):
    return {(x, y) for y in range(int(cy - ry) - 1, int(cy + ry) + 2) for x in range(int(cx - rx) - 1, int(cx + rx) + 2) if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1}


def m_rect(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def m_poly(points):
    img = Image.new('L', (N, N), 0)
    ImageDraw.Draw(img).polygon(points, fill=255)
    px = img.load()
    return {(x, y) for y in range(N) for x in range(N) if px[x, y]}


def paint(im, mask, tones, edge, center=None, radius=None, cut=(-0.5, 0.0, 0.45)):
    """Peint un masque : contour d'abord (les voisins vides), puis les tons selon la lumière."""
    px = im.load()
    mask = {(x, y) for x, y in mask if 0 <= x < N and 0 <= y < N}
    if not mask:
        return mask
    xs, ys = [x for x, _ in mask], [y for _, y in mask]
    cx, cy = center or ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    r = radius or max(max(xs) - min(xs), max(ys) - min(ys)) / 2 or 1
    for x, y in mask:
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if q not in mask and 0 <= q[0] < N and 0 <= q[1] < N:
                px[q] = edge
    for x, y in mask:
        v = ((x - cx) * LIGHT[0] + (y - cy) * LIGHT[1]) / r   # 1 : face à la lumière, -1 : à l'ombre
        # Le bord côté ombre s'assombrit encore d'un cran (le volume tourne).
        rim = any(q not in mask for q in ((x + 1, y), (x, y + 1))) and v < 0.1
        i = 1 if v > -cut[0] else 2 if v > -cut[1] else 3 if v > -cut[2] else 4
        px[x, y] = tones[min(4, i + (1 if rim and i < 4 else 0))]
    return mask


def dots(im, pts, color):
    px = im.load()
    for p in pts:
        if 0 <= p[0] < N and 0 <= p[1] < N:
            px[p] = color


CLOUD = ramp('#ffffff', '#f1f5fc', '#d3dcee', '#a8b5d2', '#7d8bad')
CLOUD_DARK = ramp('#f4f6fb', '#d9e0ee', '#b4c0d8', '#8794b4', '#626e92')


# Les nuages : blancs, l'ombre seulement dessous (seuils de lumière décalés vers le clair).
CLOUD_CUT = (-0.05, 0.45, 0.85)


def cloud(im, cx, cy, tones, edge):
    """Un nuage en bosses : chaque bosse peinte à part, de l'arrière vers l'avant, pour que son contour
    la dessine ; la lumière est celle du nuage entier (centre commun)."""
    c, r = (cx - 2, cy - 3), 13
    for m in (m_disc(cx - 1, cy - 3, 7.5), m_disc(cx + 7, cy - 0.5, 5.5), m_disc(cx - 8, cy + 0.5, 5.5)):
        paint(im, m, tones, edge, center=c, radius=r, cut=CLOUD_CUT)
    paint(im, m_rect(cx - 12, cy + 2, cx + 12, cy + 6) | m_disc(cx - 11, cy + 3.5, 3) | m_disc(cx + 11, cy + 3.5, 3), tones, edge, center=c, radius=r, cut=CLOUD_CUT)


def sun(big):
    im = canvas()
    cx, cy = 24, 24
    if big:   # soleil ardent : un astre rouge orangé, douze flammes autour
        core = ramp('#fff8d6', '#ffd768', '#ff9e2c', '#f2621a', '#c23a10')
        flame = ramp('#fff0a8', '#ffc040', '#ff8020', '#e04818', '#a82810')
        edge, fedge, r, n, r0, r1, w = hexc('#6e1a08'), hexc('#7a2008'), 8.5, 12, 9, 17, 2.6
    else:     # temps clair : un petit soleil jaune, huit rayons courts
        core = ramp('#fffdf0', '#fff39a', '#ffd83e', '#f5ac12', '#d08200')
        flame = ramp('#fffbe0', '#ffef8a', '#ffd23a', '#f0a818', '#c88000')
        edge, fedge, r, n, r0, r1, w = hexc('#8a5000'), hexc('#8a5000'), 7.5, 8, 9.5, 15, 2.2
    import math
    for k in range(n):
        a = k * 2 * math.pi / n + (math.pi / n if big else 0)
        L = r1 if (k % 2 == 0 or not big) else r1 - 3
        tip = (cx + math.cos(a) * L, cy + math.sin(a) * L)
        b1 = (cx + math.cos(a + 0.5 / r0 * w * 2) * r0, cy + math.sin(a + 0.5 / r0 * w * 2) * r0)
        b2 = (cx + math.cos(a - 0.5 / r0 * w * 2) * r0, cy + math.sin(a - 0.5 / r0 * w * 2) * r0)
        paint(im, m_poly([tip, b1, b2]), flame, fedge, center=(cx, cy), radius=r1)
    paint(im, m_disc(cx, cy, r), core, edge, center=(cx, cy), radius=r)
    dots(im, [(cx - 3, cy - 4), (cx - 4, cy - 3), (cx - 3, cy - 3), (cx - 2, cy - 5)], hexc('#ffffff'))
    save(im, 'meteo-soleil' if big else 'meteo-clair')


def rain():
    im = canvas()
    cloud(im, 24, 17, CLOUD, hexc('#4b5676'))
    blue = ramp('#effaff', '#a6dbff', '#4fa6f2', '#2a72d2', '#1a4ca2')
    for x, y in ((15, 29), (24, 32), (33, 29), (20, 37), (29, 37)):
        drop = {(x, y - 3), (x, y - 2), (x - 1, y - 1), (x, y - 1), (x - 1, y), (x, y), (x + 1, y), (x - 1, y + 1), (x, y + 1), (x + 1, y + 1), (x, y + 2)}
        paint(im, drop, blue, hexc('#12306c'), center=(x, y), radius=2.5)
        dots(im, [(x - 1, y)], hexc('#effaff'))
    save(im, 'meteo-pluie')


def hail():
    im = canvas()
    cloud(im, 24, 17, CLOUD_DARK, hexc('#3e4868'))
    ice = ramp('#ffffff', '#e8f7ff', '#b9e1fa', '#86b9e2', '#5a8cc2')
    for x, y, r in ((15, 31, 2.6), (25, 33, 3.2), (34, 30, 2.4), (21, 39, 2.2), (31, 39, 2.6)):
        paint(im, m_disc(x, y, r), ice, hexc('#284a7e'), center=(x, y), radius=r)
        dots(im, [(int(x - r / 2), int(y - r / 2))], hexc('#ffffff'))
    save(im, 'meteo-grele')


def sand():
    """Une tornade de sable : des anneaux qui rétrécissent vers le bas, striés, du gravier qui vole."""
    im = canvas()
    tones = ramp('#fff4cf', '#f3d895', '#dcb366', '#b8893b', '#8b5f1f')
    edge = hexc('#5a3910')
    rings = [(24, 12, 14, 4.2), (25, 18, 12, 3.8), (23, 23.5, 10, 3.6), (24.5, 28.5, 8, 3.2), (23, 33, 6, 2.8), (24, 37, 4.2, 2.4), (23.5, 40.5, 2.6, 2)]
    for cx, cy, rx, ry in reversed(rings):   # du bas vers le haut : chaque anneau recouvre celui du dessous
        paint(im, m_ellipse(cx, cy, rx, ry), tones, edge, center=(24, cy - 2), radius=rx)
    px = im.load()
    # Stries du vent : un trait d'ombre qui court sur chaque anneau, décalé d'un anneau à l'autre.
    for k, (cx, cy, rx, ry) in enumerate(rings[:-1]):
        y = int(cy + 0.5)
        for x in range(int(cx - rx * 0.6) + (k % 2) * 2, int(cx + rx * 0.5)):
            if px[x, y][3] and px[x, y] != edge:
                px[x, y] = tones[3]
        for x in range(int(cx - rx * 0.5), int(cx - rx * 0.1)):
            if px[x, y - 1][3] and px[x, y - 1] != edge:
                px[x, y - 1] = tones[0]
    pebble = ramp('#e8d2a8', '#c8a874', '#a07c48', '#7a5a30', '#5a3e1e')
    for x, y, r in ((8, 20, 1.6), (40, 16, 1.4), (39, 30, 1.8), (10, 33, 1.3), (35, 40, 1.2)):
        paint(im, m_disc(x, y, r), pebble, edge, center=(x, y), radius=r)
    dots(im, [(12, 26), (37, 23), (14, 39), (41, 36), (6, 14)], tones[3])
    save(im, 'meteo-sable')


def fog():
    """Trois nappes de brume, bosselées comme des nuages bas, qui se chevauchent en quinconce."""
    im = canvas()
    back = ramp('#fbfbfe', '#eceef6', '#d6d9e7', '#b9bed2', '#9aa0b8')
    front = ramp('#ffffff', '#f6f7fb', '#e3e6f0', '#c6cada', '#a6abc0')
    edge = hexc('#6c7290')
    cut = (-0.1, 0.4, 0.8)

    def band(x0, x1, y, bumps):
        m = m_rect(x0 + 2, y, x1 - 2, y + 4) | m_disc(x0 + 2, y + 2, 2.6) | m_disc(x1 - 2, y + 2, 2.6)
        for bx, br in bumps:
            m |= m_ellipse(bx, y + 1.5, br * 1.6, br * 0.7)
        return m

    paint(im, band(12, 40, 12, [(19, 3.4), (29, 4)]), back, edge, center=(26, 12), radius=14, cut=cut)
    paint(im, band(6, 34, 21, [(13, 3.6), (24, 4.2)]), front, edge, center=(20, 21), radius=14, cut=cut)
    paint(im, band(14, 42, 30, [(22, 3.4), (33, 3.8)]), back, edge, center=(28, 30), radius=14, cut=cut)
    # Volutes : de petits filets de brume qui s'échappent.
    for x0, y in ((8, 35), (36, 23)):
        paint(im, m_rect(x0, y, x0 + 4, y + 1), front, edge, center=(x0 + 2, y), radius=3, cut=cut)
    dots(im, [(14, 19), (15, 18), (16, 18), (18, 10), (19, 9)], hexc('#ffffff'))
    save(im, 'meteo-brouillard')


# ── Horde : des silhouettes de plusieurs Pokémon ────────────────────────

def silhouette(name, color, scale=0.5):
    """La première image de l'icône de menu d'Essentials, en aplat (ses pixels doublés ramenés à 1)."""
    ico = Image.open(ESS / 'Pokemon' / 'Icons' / f'{name}.png').convert('RGBA').crop((0, 0, 64, 64))
    # Réduire avant de recadrer : recadrer d'abord décalerait la grille des pixels doublés, et la
    # réduction mélangerait des moitiés de pixels (des taches au lieu de silhouettes).
    ico = ico.resize((round(64 * scale), round(64 * scale)), Image.NEAREST)
    ico = ico.crop(ico.getbbox())
    flat = Image.new('RGBA', ico.size, (0, 0, 0, 0))
    fp, ip = flat.load(), ico.load()
    for y in range(ico.height):
        for x in range(ico.width):
            if ip[x, y][3] > 128:
                fp[x, y] = color
    return flat


def horde():
    """Trois silhouettes de la même espèce, deux derrière plus pâles, une devant cernée de papier.
    Pikachu : à 20 px, c'est la seule silhouette qui reste lisible (oreilles, queue) parmi celles
    essayées (Rattata, Roucool, Mystherbe, Nosferapti, Évoli, Miaouss : des taches)."""
    im = canvas()
    BACK, FRONT, PAPER = (128, 118, 144, 255), (52, 44, 62, 255), (239, 230, 210, 255)
    back = silhouette('PIKACHU', BACK)
    for x in (24 - 11, 24 + 11):
        im.alpha_composite(back, (x - back.width // 2, 6))
    front, rim = silhouette('PIKACHU', FRONT), silhouette('PIKACHU', PAPER)
    fx, fy = (N - front.width) // 2, N - front.height - 6
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1)):
        im.alpha_composite(rim, (fx + dx, fy + dy))
    im.alpha_composite(front, (fx, fy))
    save(im, 'horde')


# ── Recadrages d'Essentials ─────────────────────────────────────────────

def from_essentials(rel, box, name, halve):
    src = Image.open(ESS / rel).convert('RGBA')
    if box:
        src = src.crop(box)
    src = src.crop(src.getbbox())
    if halve:   # dessiné en pixels doublés : une image sur deux suffit
        src = src.resize((src.width // 2, src.height // 2), Image.NEAREST)
    w, h = max(N, src.width), max(N, src.height)
    im = Image.new('RGBA', (w, h) if (w, h) != (N, N) else (N, N), (0, 0, 0, 0))
    im.alpha_composite(src, ((im.width - src.width) // 2, (im.height - src.height) // 2))
    save(im, name)


chrono()
sun(False)
sun(True)
rain()
hail()
sand()
fog()
horde()
from_essentials('Transitions/hgss_vs2.png', None, 'vs', True)
from_essentials('UI/Summary/ribbons.png', (0, 0, 64, 64), 'ruban', True)
from_essentials('Characters/Object rock.png', (0, 0, 32, 32), 'rocher', False)
