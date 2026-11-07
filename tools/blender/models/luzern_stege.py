# Seebrücke und Rathaussteg (Luzern), damit sie über der Reuss sichtbar sind (die Wasserfläche verdeckt das Luftbild).
# Lage aus SWISSIMAGE (LV95), relativ zum Anker der Kapellbrücke; z = 0 = Wasserspiegel.
import math
from mathutils import Vector

SEE = ((110.5, 107.0), (126.5, -36.3), 24.0, 3.0)      # Achse, Breite, Fahrbahnhöhe
STEG = ((-125.2, 5.0), (-106.1, -86.2), 5.0, 2.4)


def build(L):
    m = dict(
        concrete=L.mat('concrete_board', (0.62, 0.64, 0.60), meters=3.0),
        asphalt=L.mat('asphalt', (0.25, 0.25, 0.26), meters=4.0),
        walk=L.mat('granite', (0.5, 0.5, 0.48), meters=3.0),
        iron=L.mat('iron', (0.15, 0.17, 0.16), meters=2.0, metal=0.6),
        green=L.mat('frame_green', (0.17, 0.29, 0.20)),
        lamp=L.mat('glass', (0.8, 0.8, 0.7)),
        white=L.mat('frame_white', (0.9, 0.9, 0.9)),
    )
    root = L.empty('Stege')
    see = L.empty('Seebruecke', root)
    steg = L.empty('Rathaussteg', root)
    seebruecke(L, m, see)
    rathaussteg(L, m, steg)
    L.merge_children(see)
    L.merge_children(steg)


def frame(p0, p1):
    d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0))
    Ln = d.length
    d.normalize()
    q = Vector((-d.y, d.x, 0))
    return Ln, math.atan2(d.y, d.x), d, q


def seebruecke(L, m, par):
    (p0, p1, W, Z) = SEE
    Ln, ang, d, q = frame(p0, p1)
    at = lambda s, o=0.0: tuple(Vector((*p0, 0)) + d * s + q * o)[:2]
    ext = 8.0
    mid = at(Ln / 2)
    L.box('see_slab', (*mid, Z - 0.6), (Ln + 2 * ext, W, 1.2), m['concrete'], par, rot_z=ang)
    L.box('see_road', (*mid, Z + 0.03), (Ln + 2 * ext, W - 8, 0.06), m['asphalt'], par, rot_z=ang)
    for s in (-1, 1):
        c = at(Ln / 2, s * (W / 2 - 2))
        L.box(f'see_walk{s}', (*c, Z + 0.12), (Ln + 2 * ext, 4, 0.24), m['walk'], par, rot_z=ang)
        L.railing(f'see_rail{s}', at(-ext, s * (W / 2 - 0.1)), at(Ln + ext, s * (W / 2 - 0.1)), Z + 0.24, 1.05, 0.14, m['iron'], par, post=0.04)
        for j in range(8):
            c = at(j * Ln / 7, s * (W / 2 - 0.5))
            L.prism(f'see_lamp{s}{j}', (*c, Z + 0.24), 0.09, 8.0, 8, m['iron'], par)
            dd = at(j * Ln / 7, s * (W / 2 - 2.2))
            L.beam_between(f'see_arm{s}{j}', (*c, Z + 8.1), (*dd, Z + 8.3), 0.07, m['iron'], par)
            L.box(f'see_head{s}{j}', (*dd, Z + 8.2), (0.8, 0.35, 0.15), m['lamp'], par, rot_z=ang)
    # Strassenmarkierungen
    for o in (-2, 2):
        c = at(Ln / 2, o)
        L.box(f'see_lane{o}', (*c, Z + 0.07), (Ln + 2 * ext, 0.15, 0.01), m['white'], par, rot_z=ang)
    # Pfeilerreihen
    rows = 6
    for i in range(1, rows):
        s = Ln * i / rows
        for o in (-9, -4.5, 0, 4.5, 9):
            c = at(s, o)
            L.prism(f'see_pier{i}_{o}', (*c, -2.5), 0.55, Z - 1.2 + 2.5, 12, m['concrete'], par)
        L.box(f'see_beam{i}', (*at(s), Z - 1.35), (1.2, W - 2, 0.5), m['concrete'], par, rot_z=ang)


def rathaussteg(L, m, par):
    (p0, p1, W, Z) = STEG
    Ln, ang, d, q = frame(p0, p1)
    at = lambda s, o=0.0: tuple(Vector((*p0, 0)) + d * s + q * o)[:2]
    ext = 3.0
    mid = at(Ln / 2)
    L.box('steg_deck', (*mid, Z - 0.2), (Ln + 2 * ext, W, 0.4), m['concrete'], par, rot_z=ang)
    L.box('steg_floor', (*mid, Z + 0.02), (Ln + 2 * ext, W - 0.4, 0.04), m['walk'], par, rot_z=ang)
    for s in (-1, 1):
        # verziertes Geländer: dichte Stäbe, Ober- und Mittelholm, Zierband
        L.railing(f'steg_rail{s}', at(-ext, s * (W / 2 - 0.08)), at(Ln + ext, s * (W / 2 - 0.08)), Z, 1.1, 0.11, m['green'], par, post=0.03)
        c = at(Ln / 2, s * (W / 2 - 0.08))
        L.box(f'steg_mid{s}', (*c, Z + 0.25), (Ln + 2 * ext, 0.05, 0.06), m['green'], par, rot_z=ang)
        L.box(f'steg_orn{s}', (*c, Z + 0.95), (Ln + 2 * ext, 0.04, 0.2), m['green'], par, rot_z=ang)
        for j in range(6):
            c = at(j * Ln / 5, s * (W / 2 - 0.08))
            L.prism(f'steg_lamp{s}{j}', (*c, Z), 0.07, 4.2, 8, m['green'], par)
            L.prism(f'steg_lhead{s}{j}', (*c, Z + 4.2), 0.22, 0.55, 6, m['lamp'], par, radius_top=0.28)
            L.prism(f'steg_lcap{s}{j}', (*c, Z + 4.75), 0.3, 0.3, 6, m['green'], par, radius_top=0.05)
    for i in range(1, 7):
        s = Ln * i / 7
        for o in (-1.6, 1.6):
            L.prism(f'steg_pier{i}_{o}', (*at(s, o), -2.5), 0.22, Z - 0.4 + 2.5, 10, m['iron'], par)
        L.box(f'steg_beam{i}', (*at(s), Z - 0.5), (0.5, W, 0.3), m['iron'], par, rot_z=ang)
