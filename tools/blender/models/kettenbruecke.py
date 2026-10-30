# Kettenbrücke Aarau (heutige Brücke «Pont Neuf», 2013): flache Betonbogenbrücke in Brettschalung.
# Lage aus SWISSIMAGE: Achse 122° ab Ost (Süd -> Nord), Ufer zu Ufer ~128 m. z = 0 = Wasserspiegel.
# Spannweiten nach Foto: kleiner Uferbogen, drei grosse flache Bögen, kleiner Uferbogen.
import bmesh

AXIS_DEG = 122.0
WIDTH = 18.0          # Fahrbahn + Trottoirs
DECK = 6.4            # Oberkante Fahrbahn über Wasser
SPRING = 0.3          # Kämpfer knapp über Wasser
PIER = 2.4            # Pfeilerbreite am Wasser
# (Start, Ende, Bogenstich) entlang der Achse, Süd -> Nord
SPANS = [(-64.0, -49.0, 3.0), (-49.0, -16.0, 4.8), (-16.0, 17.0, 4.9), (17.0, 50.0, 4.8), (50.0, 64.0, 2.9)]


def span_profile(a0, a1, rise, first, last):
    """Ansichtsprofil (a, z) eines Feldes von Pfeilermitte zu Pfeilermitte."""
    half = PIER / 2
    s0 = a0 + (0 if first else half)
    s1 = a1 - (0 if last else half)
    pts = [(a0, -2.0)]
    if not first:
        pts.append((s0, -2.0))
    n = 18
    under = []
    for i in range(n + 1):
        t = i / n
        a = s0 + (s1 - s0) * t
        z = SPRING + rise * (1 - (2 * t - 1) ** 2) ** 0.62
        under.append((a, z))
    if first:
        under[0] = (s0, SPRING + 0.8)
    if last:
        under[-1] = (s1, SPRING + 0.8)
    pts += under
    if not last:
        pts.append((s1, -2.0))
    pts += [(a1, -2.0), (a1, DECK), (a0, DECK)]
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) > 1e-4 or abs(out[-1][1] - p[1]) > 1e-4:
            out.append(p)
    return out


def extrude_profile(L, name, prof, width, ax, mat_, parent):
    """Profil in der (a, z)-Ebene quer zur Achse auf 'width' extrudieren."""
    bm = bmesh.new()
    rings = []
    for b in (-width / 2, width / 2):
        rings.append([bm.verts.new((*ax.p(a, b), z)) for a, z in prof])
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[1])))
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L._finish(name, bm, [mat_], parent)


def build(L):
    concrete = L.mat('concrete_board', (0.62, 0.64, 0.60), meters=3.0)
    asphalt = L.mat('asphalt', (0.25, 0.25, 0.26), meters=4.0)
    metal = L.mat('iron', (0.30, 0.31, 0.32), meters=2.0, metal=0.6)
    lamp = L.mat('glass', (0.8, 0.8, 0.7))
    white = L.mat('frame_white', (0.9, 0.9, 0.9))

    ax = L.Axis(0.0, 0.0, AXIS_DEG)
    root = L.empty('Kettenbruecke')

    for i, (a0, a1, rise) in enumerate(SPANS):
        g = L.empty(f'Bogen{i}', root)
        prof = span_profile(a0, a1, rise, i == 0, i == len(SPANS) - 1)
        extrude_profile(L, f'span{i}', prof, WIDTH, ax, concrete, g)
        if i < len(SPANS) - 1:
            L.abox(f'pierfoot{i}', ax, a1, 0, -0.6, (PIER + 0.8, WIDTH + 0.4, 2.2), concrete, g)
        L.merge_children(g)

    deck = L.empty('Fahrbahn', root)
    a_min, a_max = SPANS[0][0], SPANS[-1][1]
    ln = a_max - a_min
    for sgn, a in ((-1, a_min), (1, a_max)):
        L.abox(f'abut{sgn}', ax, a + sgn * 6, 0, (DECK - 14) / 2, (12, WIDTH + 1, DECK + 14), concrete, deck)
    L.abox('road', ax, 0, 0, DECK + 0.02, (ln + 24, WIDTH - 6.0, 0.06), asphalt, deck)
    L.abox('lane', ax, 0, 0, DECK + 0.06, (ln + 24, 0.15, 0.01), white, deck)
    for s in (-1, 1):
        L.abox(f'walk{s}', ax, 0, s * (WIDTH / 2 - 1.6), DECK + 0.12, (ln + 24, 3.2, 0.24), concrete, deck)
        L.abox(f'edge{s}', ax, 0, s * (WIDTH / 2 - 0.15), DECK + 0.25, (ln + 24, 0.3, 0.5), concrete, deck)
        L.railing(f'rail{s}', ax.p(a_min - 12, s * (WIDTH / 2 - 0.2)), ax.p(a_max + 12, s * (WIDTH / 2 - 0.2)),
                  DECK + 0.5, 1.0, 0.15, metal, deck, post=0.035)
        k = 6
        for j in range(k + 1):
            a = a_min + ln * j / k
            c = ax.p(a, s * (WIDTH / 2 - 0.7))
            L.prism(f'lamp{s}_{j}', (*c, DECK + 0.25), 0.08, 7.5, 8, metal, deck)
            d = ax.p(a, s * (WIDTH / 2 - 1.6))
            L.beam_between(f'lamparm{s}_{j}', (*c, DECK + 7.6), (*d, DECK + 7.8), 0.07, metal, deck)
            L.box(f'lamphead{s}_{j}', (*d, DECK + 7.7), (0.7, 0.3, 0.12), lamp, deck, rot_z=ax.ang)
    L.merge_children(deck)

    c = ax.p(0, 0)
    L.hide_box('Hide_bridge', (*c, 10), (ln + 30, WIDTH + 8, 40), rot_z=ax.ang)
