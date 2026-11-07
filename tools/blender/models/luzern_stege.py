# Seebrücke und Rathaussteg (Luzern), damit sie über der Reuss sichtbar sind (die Wasserfläche verdeckt das Luftbild).
# Lage aus SWISSIMAGE (LV95), relativ zum Anker der Kapellbrücke; z = 0 = Wasserspiegel.
import math
from mathutils import Vector

SEE = ((110.5, 107.0), (126.5, -36.3), 24.0, 1.95)     # Achse, Breite, Fahrbahnhöhe (= Quaihöhe laut DEM)
STEG = ((-125.2, 5.0), (-106.1, -86.2), 5.0, 1.6)


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


# Fahrbahnhöhe entlang der Achse (s, z): über dem Wasser eben, an den Ufern knapp über dem höchsten Gelände (aus dem DEM, tools/bake)
SEE_PROFILE = [[-30, 2.08], [-28, 2.1], [-26, 2.13], [-24, 2.16], [-22, 2.2], [-20, 2.23], [-18, 2.25], [-16, 2.27], [-14, 2.29], [-12, 2.29], [-10, 2.28], [-8, 2.17], [-6, 2.1], [-4, 2.04], [-2, 1.97], [0, 1.95], [2, 1.95], [4, 1.95], [6, 1.95], [8, 1.95], [10, 1.95], [12, 1.95], [14, 1.95], [16, 1.95], [18, 1.95], [20, 1.95], [22, 1.95], [24, 1.95], [26, 1.95], [28, 1.95], [30, 1.95], [32, 1.95], [34, 1.95], [36, 1.95], [38, 1.95], [40, 1.95], [42, 1.95], [44, 1.95], [46, 1.95], [48, 1.95], [50, 1.95], [52, 1.95], [54, 1.95], [56, 1.95], [58, 1.95], [60, 1.95], [62, 1.95], [64, 1.95], [66, 1.95], [68, 1.95], [70, 1.95], [72, 1.95], [74, 1.95], [76, 1.95], [78, 1.95], [80, 1.95], [82, 1.95], [84, 1.95], [86, 1.95], [88, 1.95], [90, 1.95], [92, 1.95], [94, 1.95], [96, 1.95], [98, 1.95], [100, 1.95], [102, 1.95], [104, 1.95], [106, 1.95], [108, 1.95], [110, 1.95], [112, 1.95], [114, 1.95], [116, 1.95], [118, 1.95], [120, 1.95], [122, 1.95], [124, 1.95], [126, 1.95], [128, 1.95], [130, 1.95], [132, 1.95], [134, 1.95], [136, 1.95], [138, 1.95], [140, 1.95], [142, 1.95], [144, 1.95], [146, 1.95], [148, 1.95], [150, 1.95], [152, 1.95], [154, 1.95], [156, 1.99], [158, 2.06], [160, 2.12], [162, 2.19], [164, 2.29], [166, 2.28], [168, 2.26], [170, 2.23], [172, 2.21], [174, 2.19]]


def zat(prof, s):
    if s <= prof[0][0]:
        return prof[0][1]
    for (s0, z0), (s1, z1) in zip(prof, prof[1:]):
        if s <= s1:
            return z0 + (z1 - z0) * (s - s0) / max(s1 - s0, 1e-6)
    return prof[-1][1]


def strip(L, name, prof, p0, d, q, o0, o1, dz, th, mat, par):
    """Band entlang der Achse zwischen den Querversätzen o0..o1, Oberkante = Profil + dz, Dicke th."""
    import bmesh
    bm = bmesh.new()
    rows = []
    for (s, z) in prof:
        c = Vector((*p0, 0)) + d * s
        a, b = c + q * o0, c + q * o1
        rows.append([bm.verts.new((a.x, a.y, z + dz)), bm.verts.new((b.x, b.y, z + dz)),
                     bm.verts.new((b.x, b.y, z + dz - th)), bm.verts.new((a.x, a.y, z + dz - th))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L._finish(name, bm, [mat], par)


def seebruecke(L, m, par):
    (p0, p1, W, Z) = SEE
    Ln, ang, d, q = frame(p0, p1)
    at = lambda s, o=0.0: tuple(Vector((*p0, 0)) + d * s + q * o)[:2]
    P = SEE_PROFILE
    s0, s1 = P[0][0], P[-1][0]
    strip(L, 'see_slab', P, p0, d, q, -W / 2, W / 2, 0.0, 1.4, m['concrete'], par)
    strip(L, 'see_road', P, p0, d, q, -(W / 2 - 4), W / 2 - 4, 0.03, 0.06, m['asphalt'], par)
    for sg in (-1, 1):
        o0, o1 = sorted((sg * (W / 2 - 4), sg * W / 2))
        strip(L, f'see_walk{sg}', P, p0, d, q, o0, o1, 0.15, 0.2, m['walk'], par)
        # Geländer abschnittsweise, damit es dem Profil folgt
        seg = 6.0
        s = s0
        i = 0
        while s < s1 - 0.1:
            e = min(s + seg, s1)
            z = max(zat(P, s), zat(P, e))
            L.railing(f'see_rail{sg}_{i}', at(s, sg * (W / 2 - 0.1)), at(e, sg * (W / 2 - 0.1)), z + 0.15, 1.05, 0.14, m['iron'], par, post=0.04)
            s = e
            i += 1
        for j in range(8):
            sj = j * Ln / 7
            zj = zat(P, sj) + 0.15
            c = at(sj, sg * (W / 2 - 0.5))
            L.prism(f'see_lamp{sg}{j}', (*c, zj), 0.09, 8.0, 8, m['iron'], par)
            dd = at(sj, sg * (W / 2 - 2.2))
            L.beam_between(f'see_arm{sg}{j}', (*c, zj + 7.9), (*dd, zj + 8.1), 0.07, m['iron'], par)
            L.box(f'see_head{sg}{j}', (*dd, zj + 8.0), (0.8, 0.35, 0.15), m['lamp'], par, rot_z=ang)
    # Strassenmarkierungen
    for o in (-2, 2):
        strip(L, f'see_lane{o}', P, p0, d, q, o - 0.075, o + 0.075, 0.075, 0.02, m['white'], par)
    # Pfeilerreihen
    rows = 6
    for i in range(1, rows):
        s = Ln * i / rows
        for o in (-9, -4.5, 0, 4.5, 9):
            c = at(s, o)
            L.prism(f'see_pier{i}_{o}', (*c, -2.5), 0.55, Z - 1.4 + 2.5, 12, m['concrete'], par)
        L.box(f'see_beam{i}', (*at(s), Z - 1.55), (1.2, W - 2, 0.5), m['concrete'], par, rot_z=ang)


def rathaussteg(L, m, par):
    (p0, p1, W, Z) = STEG
    Ln, ang, d, q = frame(p0, p1)
    at = lambda s, o=0.0: tuple(Vector((*p0, 0)) + d * s + q * o)[:2]
    ext = 10.0
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
