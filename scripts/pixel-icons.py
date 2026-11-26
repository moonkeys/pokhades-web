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

def cloud(d, cx, cy, fill, dark):
    for (x, y, r) in ((cx - 7, cy + 1, 5), (cx, cy - 3, 7), (cx + 7, cy + 1, 5)):
        disc(d, x, y, r, fill)
    d.rectangle((cx - 11, cy + 1, cx + 11, cy + 6), fill=fill)
    d.rectangle((cx - 10, cy + 5, cx + 10, cy + 6), fill=dark)   # ventre ombré


def sun(big):
    im = canvas()
    d = ImageDraw.Draw(im)
    cx, cy = 24, 24
    if big:   # soleil ardent : un astre orange, de longs rayons rouges
        rays, core, light, r, r0, r1 = (240, 84, 24, 255), (255, 140, 32, 255), (255, 200, 72, 255), 7, 10, 15
        dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    else:     # temps clair : un petit soleil jaune, des rayons courts
        rays, core, light, r, r0, r1 = (248, 192, 32, 255), (255, 216, 56, 255), (255, 244, 160, 255), 6, 9, 12
        dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    for dx, dy in dirs:
        f = 0.72 if dx and dy else 1
        d.line((cx + dx * r0 * f, cy + dy * r0 * f, cx + dx * r1 * f, cy + dy * r1 * f), fill=rays, width=2)
    disc(d, cx, cy, r, core)
    disc(d, cx - 2, cy - 2, r // 2, light)
    save(outline(im), 'meteo-soleil' if big else 'meteo-clair')


def rain():
    im = canvas()
    d = ImageDraw.Draw(im)
    cloud(d, 24, 19, (226, 232, 244, 255), (176, 186, 206, 255))
    for x, y in ((17, 30), (24, 32), (31, 30)):
        d.line((x, y, x - 2, y + 5), fill=(60, 140, 240, 255), width=2)
    save(outline(im), 'meteo-pluie')


def hail():
    im = canvas()
    d = ImageDraw.Draw(im)
    cloud(d, 24, 19, (214, 222, 236, 255), (160, 172, 196, 255))
    for x, y in ((17, 31), (24, 34), (31, 31)):
        d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=(232, 246, 255, 255))
        d.point((x - 1, y - 1), fill=(255, 255, 255, 255))
    save(outline(im), 'meteo-grele')


def sand():
    im = canvas()
    d = ImageDraw.Draw(im)
    S, SD = (222, 176, 88, 255), (170, 124, 48, 255)
    # Trois bourrasques qui s'enroulent, plus courtes vers le bas (une tornade de sable couchée).
    d.arc((9, 12, 39, 26), 200, 360, fill=S, width=3)
    d.arc((13, 20, 37, 32), 190, 360, fill=SD, width=3)
    d.arc((16, 27, 34, 37), 180, 360, fill=S, width=3)
    for x, y in ((12, 33), (36, 30), (9, 25)):
        d.point((x, y), fill=SD)
    save(outline(im), 'meteo-sable')


def fog():
    im = canvas()
    d = ImageDraw.Draw(im)
    for (x0, y0, x1, c) in ((10, 15, 34, (226, 226, 234, 255)), (15, 22, 39, (196, 196, 210, 255)), (8, 29, 32, (226, 226, 234, 255))):
        d.rounded_rectangle((x0, y0, x1, y0 + 4), radius=2, fill=c)
    save(outline(im), 'meteo-brouillard')


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
