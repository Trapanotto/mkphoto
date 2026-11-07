# Kapellbrücke mit Wasserturm, Luzern (Detailstufe 3).
# Verlauf + Turm aus SWISSIMAGE / swissBUILDINGS3D (LV95), Querschnitt aus swissBUILDINGS3D,
# Details nach Referenzfotos (Luft, Ufer, Innenansicht). Koordinaten relativ zum Anker, z = 0 = Wasserspiegel.
import math
from mathutils import Vector

PATH = [(49.5, 77.8), (-22.1, -33.9), (-70.3, -65.8), (-68.3, -81.5)]
TOWER = (-19.3, -44.6)
R_TOWER = 6.5          # Umkreisradius des Achtecks (swisstopo-Grundriss)

DECK = 1.75            # Gehfläche über Wasser
RAIL = DECK + 1.0      # Oberkante Brüstung
PLATE = DECK + 2.55    # Pfette / Wandoberkante
EAVE = 4.8             # Traufe (Dachrand)
RIDGE = 6.6            # First
WALL = 1.6             # halbe Breite bis Wand
ROOF_HW = 3.0          # halbe Dachbreite


def build(L):
    m = dict(
        stone=L.mat('stone_wasserturm', (0.62, 0.60, 0.56), meters=4.0),
        stone_l=L.mat('sandstone_old', (0.65, 0.62, 0.55), meters=3.0),
        roof=L.mat('roof_kapellbruecke', (0.36, 0.30, 0.22), meters=2.0),
        roof_t=L.mat('roof_tower', (0.45, 0.28, 0.20), meters=2.0),
        roof_o=L.mat('roof_red', (0.65, 0.35, 0.22), meters=2.0),
        boards=L.mat('wood_interior', (0.50, 0.36, 0.24), meters=2.0),
        deck=L.mat('wood_deck', (0.42, 0.33, 0.24), meters=2.5),
        beam=L.mat('wood_dark', (0.30, 0.20, 0.12), meters=1.5),
        pile=L.mat('wood_rough', (0.20, 0.17, 0.14), meters=2.0),
        paint=L.mat('gable_painting', (0.55, 0.42, 0.28), meters=2.0),
        flowers=L.mat('flower_cards', (0.5, 0.2, 0.1)),
        fl_r=L.mat('flowers_red', (0.8, 0.08, 0.06)),
        fl_p=L.mat('flowers_pink', (0.85, 0.3, 0.5)),
        fl_y=L.mat('flowers_yellow', (0.95, 0.75, 0.1)),
        leaves=L.mat('leaves', (0.15, 0.32, 0.10)),
        glass=L.mat('glass', (0.05, 0.06, 0.08), rough=0.1),
        dark=L.mat('dark', (0.03, 0.03, 0.035)),
        gold=L.mat('gold', (0.7, 0.55, 0.25), rough=0.3, metal=1.0),
        band=L.mat('wood_band', (0.40, 0.28, 0.18), meters=1.5),
        wet=L.mat('rock', (0.2, 0.2, 0.18), meters=3.0),
    )
    bridge = L.empty('Bruecke')
    tower = L.empty('Wasserturm')

    for si in range(len(PATH) - 1):
        segment(L, m, bridge, si, PATH[si], PATH[si + 1], end_house=(si == len(PATH) - 2))
    link(L, m, bridge)
    water_tower(L, m, tower)
    L.merge_children(bridge)
    L.merge_children(tower)


def roof_uv(obj, along, across, meters=2.0):
    """Ziegelreihen entlang des Firsts, unabhängig von der Weltdrehung."""
    uv = obj.data.uv_layers.active.data
    for face in obj.data.polygons:
        # Nur die Dachoberseite; Holz an Traufen und Unterseite bleibt unverändert.
        if face.material_index != 0 or face.normal.z < 0.1:
            continue
        for li in face.loop_indices:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv[li].uv = (p.dot(along) / meters, p.dot(across) / meters)


def tower_roof_uv(obj, meters=2.0):
    """Jede Dachfläche erhält waagrechte Ziegelreihen und senkrechte Fugen."""
    uv = obj.data.uv_layers.active.data
    for face in obj.data.polygons:
        n = face.normal
        horizontal = Vector((n.x, n.y, 0))
        if horizontal.length < 0.01:
            continue
        horizontal.normalize()
        tangent = Vector((-horizontal.y, horizontal.x, 0))
        slope = tangent.cross(n).normalized()
        if slope.z < 0:
            slope.negate()
        for li in face.loop_indices:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv[li].uv = (p.dot(tangent) / meters, p.dot(slope) / meters)


def segment(L, m, parent, si, p0, p1, end_house=False):
    Ls, ang = L.frame_along(p0, p1)
    d = Vector((math.cos(ang), math.sin(ang), 0))
    q = Vector((-d.y, d.x, 0))
    at = lambda s, o=0.0: (p0[0] + d.x * s + q.x * o, p0[1] + d.y * s + q.y * o)
    ext = 0.3
    n = f'S{si}'
    mid = at(Ls / 2)
    wall = WALL + (0.6 if end_house else 0)
    roof_hw = ROOF_HW + (0.6 if end_house else 0)
    # Gehweg (Bohlen) + Unterzüge
    L.box(f'{n}_deck', (*mid, DECK - 0.08), (Ls + 2 * ext, 2 * wall, 0.16), m['deck'], parent, rot_z=ang)
    for o in (-wall + 0.25, 0, wall - 0.25):
        c = at(Ls / 2, o)
        L.box(f'{n}_joist{o}', (*c, DECK - 0.35), (Ls + 2 * ext, 0.25, 0.36), m['beam'], parent, rot_z=ang)
    for side in (-1, 1):
        # Brüstung: liegende Bretter aussen, Handlauf
        c = at(Ls / 2, side * wall)
        L.box(f'{n}_rail{side}', (*c, (DECK + RAIL) / 2), (Ls + 2 * ext, 0.08, RAIL - DECK), m['boards'], parent, rot_z=ang)
        c = at(Ls / 2, side * (wall - 0.05))
        L.box(f'{n}_handrail{side}', (*c, RAIL + 0.05), (Ls + 2 * ext, 0.26, 0.1), m['beam'], parent, rot_z=ang)
        # Blumenkisten aussen auf der Brüstung, Blumen hängen über
        cb = at(Ls / 2, side * (wall + 0.24))
        L.box(f'{n}_fbox{side}', (*cb, RAIL - 0.1), (Ls - 0.6, 0.36, 0.3), m['beam'], parent, rot_z=ang)
        # Geranien als Bildkarten (Textur aus baeume.py), aussen an der Kiste
        pa, pb = (at(0.3, side * (wall + 0.1)), at(Ls - 0.3, side * (wall + 0.1))) if side < 0 else (at(Ls - 0.3, side * (wall + 0.1)), at(0.3, side * (wall + 0.1)))
        L.flower_strip(f'{n}_flowers{side}', pa, pb, RAIL - 0.02, 0.2, m['flowers'], parent, seed=si * 11 + side)
        # Pfosten mit Kopfbändern (beidseitig, bilden Bögen), Pfette
        c = at(Ls / 2, side * (wall - 0.05))
        L.box(f'{n}_plate{side}', (*c, PLATE + 0.09), (Ls + 2 * ext, 0.2, 0.18), m['beam'], parent, rot_z=ang)
        k = max(2, int(Ls / 1.85))
        for i in range(k + 1):
            s = Ls * i / k
            c = at(s, side * (wall - 0.05))
            L.box(f'{n}_post{side}_{i}', (*c, (RAIL + PLATE) / 2), (0.16, 0.16, PLATE - RAIL), m['beam'], parent, rot_z=ang)
            for dd in (-1, 1):
                if 0 < s + dd * 0.6 < Ls:
                    L.beam_between(f'{n}_kb{side}_{i}{dd}', (*at(s, side * (wall - 0.05)), PLATE - 0.75),
                                   (*at(s + dd * 0.6, side * (wall - 0.05)), PLATE), 0.08, m['beam'], parent)
    # Zugbalken mit bemalten Giebeldreiecken
    k = max(1, int(Ls / 3.7))
    under = lambda o: EAVE + (roof_hw - abs(o)) / roof_hw * (RIDGE - EAVE) - 0.18
    for i in range(k + 1):
        s = Ls * i / k
        c = at(s)
        L.box(f'{n}_tie{i}', (*c, PLATE + 0.08), (0.16, 2 * wall + 0.1, 0.18), m['beam'], parent, rot_z=ang)
        if 0 < i < k:
            L.gable_wall(f'{n}_paint{i}', c, 2 * wall - 0.3, PLATE + 0.18, PLATE + 0.18, under(0) - 0.05, 0.04, ang, m['paint'], parent)
        L.box(f'{n}_kingpost{i}', (*c, (PLATE + under(0)) / 2), (0.12, 0.12, under(0) - PLATE), m['beam'], parent, rot_z=ang)
    # Dach mit weitem Überstand, Sparren sichtbar, Firstziegel
    if end_house:
        L.hip_roof(f'{n}_roof', (*mid, 0), Ls + 1.6, 2 * roof_hw, EAVE - 0.2, RIDGE + 0.6 - EAVE, m['roof_o'], parent,
                   rot=ang, ridge_frac=0.45, overhang=0.0)
    else:
        roof = L.gable_roof(f'{n}_roof', at(-ext), at(Ls + ext), 2 * roof_hw, EAVE, RIDGE, m['roof'], m['beam'], parent, overhang=0.15, thick=0.12)
        roof_uv(roof, d, q)
        L.box(f'{n}_ridge', (*mid, RIDGE + 0.04), (Ls + 2 * ext, 0.26, 0.12), m['roof_t'], parent, rot_z=ang)
    k = int(Ls / 0.85)
    for i in range(k + 1):
        s = Ls * i / k
        for side in (-1, 1):
            a3 = (*at(s, side * (wall - 0.1)), PLATE + 0.2)
            b3 = (*at(s, side * (roof_hw - 0.1)), EAVE - 0.06)
            L.beam_between(f'{n}_raft{side}_{i}', a3, b3, 0.09, m['beam'], parent)
    # Pfahljoche: 3 Pfähle, Holm, Kreuzstreben, Eisbrecher stromaufwärts
    k = max(1, int(Ls / 6.2))
    for i in range(k + 1):
        s = Ls * i / k
        for o in (-1.35, 0.0, 1.35):
            c = at(s, o)
            L.prism(f'{n}_pile{i}_{o}', (*c, -2.5), 0.17, DECK - 0.55 + 2.5, 8, m['pile'], parent)
            L.prism(f'{n}_pilewet{i}_{o}', (*c, -0.3), 0.18, 0.5, 8, m['wet'], parent)
        c = at(s)
        L.box(f'{n}_cap{i}', (*c, DECK - 0.62), (0.3, 2 * wall + 0.5, 0.25), m['pile'], parent, rot_z=ang)
        a, b = at(s, -1.35), at(s, 1.35)
        L.beam_between(f'{n}_xa{i}', (*a, 0.0), (*b, DECK - 0.75), 0.12, m['pile'], parent)
        L.beam_between(f'{n}_xb{i}', (*b, 0.0), (*a, DECK - 0.75), 0.12, m['pile'], parent)
        L.beam_between(f'{n}_ice{i}', (*at(s, -2.6), -0.6), (*at(s, -1.35), DECK - 0.8), 0.16, m['pile'], parent)
    L.hide_box(f'Hide_{n}', (*mid, 6), (Ls + 3, 2 * roof_hw + 2.5, 20), rot_z=ang)


def link(L, m, parent):
    """Kurzer gedeckter Anschluss zwischen Brücke und Turm."""
    k0 = PATH[1]
    Lc, angc = L.frame_along(k0, TOWER)
    d = Vector((math.cos(angc), math.sin(angc), 0))
    c0 = Vector((*k0, 0)) + d * 1.6
    c1 = Vector((*TOWER, 0)) - d * (R_TOWER * 0.9)
    if (c1 - c0).length < 0.5:
        return
    Lp = (c1 - c0).length
    mid = (c0 + c1) / 2
    L.box('link_deck', (mid.x, mid.y, DECK - 0.08), (Lp, 2.4, 0.16), m['deck'], parent, rot_z=angc)
    q = Vector((-d.y, d.x, 0))
    for side in (-1, 1):
        cc = mid + q * (side * 1.15)
        L.box(f'link_wall{side}', (cc.x, cc.y, (DECK + PLATE) / 2), (Lp, 0.12, PLATE - DECK), m['boards'], parent, rot_z=angc)
    roof = L.gable_roof('link_roof', (c0.x, c0.y), (c1.x, c1.y), 3.6, EAVE - 0.3, RIDGE - 0.6, m['roof'], m['beam'], parent, overhang=0.3, thick=0.12)
    roof_uv(roof, d, q)


def water_tower(L, m, parent):
    T = TOWER
    rot8 = math.radians(22.5)
    shaft_top = 19.0
    # Sockel / Wasserlinie, Schaft leicht verjüngt
    L.prism('wt_found', (*T, -2.0), R_TOWER * 1.04, 2.6, 8, m['wet'], parent, rot=rot8)
    L.prism('wt_shaft', (*T, 0.6), R_TOWER, shaft_top - 0.6, 8, m['stone'], parent, radius_top=R_TOWER * 0.95, rot=rot8)
    # Holzaufsatz (Wehrgang) mit Fensterreihe
    rb = R_TOWER * 0.95 + 0.35
    L.prism('wt_band_floor', (*T, shaft_top), rb + 0.15, 0.35, 8, m['beam'], parent, rot=rot8)
    L.prism('wt_band', (*T, shaft_top + 0.35), rb, 2.5, 8, m['band'], parent, rot=rot8)
    L.prism('wt_band_top', (*T, shaft_top + 2.85), rb + 0.12, 0.25, 8, m['beam'], parent, rot=rot8)
    ap_b = rb * math.cos(math.pi / 8)
    for k in range(8):
        a = k * math.pi / 4
        nrm = Vector((math.cos(a), math.sin(a), 0))
        tang = a + math.pi / 2
        for off in (-1.3, 1.3):
            base = Vector((*T, 0)) + nrm * (ap_b + 0.01) + Vector((math.cos(tang), math.sin(tang), 0)) * off
            L.box(f'wt_bwin{k}_{off}', (base.x, base.y, shaft_top + 1.55), (0.06, 0.8, 0.9), m['glass'], parent, rot_z=a)
            L.box(f'wt_bwinf{k}_{off}', (base.x, base.y, shaft_top + 1.55), (0.05, 0.95, 1.05), m['boards'], parent, rot_z=a)
    # Dach: Glockenform (Aufschiebling) + steiler Helm
    z0 = shaft_top + 3.1
    flare = L.prism('wt_roof_flare', (*T, z0 - 0.4), R_TOWER * 1.42, 1.3, 8, m['roof_t'], parent, radius_top=R_TOWER * 1.16, rot=rot8)
    roof = L.prism('wt_roof', (*T, z0 + 0.9), R_TOWER * 1.16, 10.5, 8, m['roof_t'], parent, radius_top=0.35, rot=rot8)
    tower_roof_uv(flare)
    tower_roof_uv(roof)
    for k in range(8):  # Gratziegel
        a = k * math.pi / 4 + rot8
        pb = (T[0] + math.cos(a) * R_TOWER * 1.42, T[1] + math.sin(a) * R_TOWER * 1.42, z0 - 0.4)
        pm = (T[0] + math.cos(a) * R_TOWER * 1.16, T[1] + math.sin(a) * R_TOWER * 1.16, z0 + 0.9)
        pt = (T[0] + math.cos(a) * 0.35, T[1] + math.sin(a) * 0.35, z0 + 11.4)
        L.beam_between(f'wt_hipa{k}', pb, pm, 0.16, m['roof_t'], parent)
        L.beam_between(f'wt_hipb{k}', pm, pt, 0.16, m['roof_t'], parent)
    L.prism('wt_cap', (*T, z0 + 11.4), 0.45, 0.5, 8, m['roof_t'], parent, radius_top=0.2)
    L.prism('wt_finial', (*T, z0 + 11.9), 0.06, 1.3, 6, m['gold'], parent)
    L.prism('wt_knob', (*T, z0 + 12.5), 0.2, 0.3, 8, m['gold'], parent)
    # Schlitzfenster + kleine Fenster im Schaft, Tür zur Brücke
    ap = R_TOWER * math.cos(math.pi / 8)
    for k in range(8):
        a = k * math.pi / 4
        nrm = Vector((math.cos(a), math.sin(a), 0))
        for j, (z, w, h) in enumerate(((5.0, 0.25, 1.1), (9.5, 0.25, 1.2), (13.5, 0.5, 0.7), (16.5, 0.25, 1.0))):
            if (k + j) % 3:
                continue
            r = ap * (1 - 0.05 * z / shaft_top) + 0.03
            p = Vector((*T, 0)) + nrm * r
            L.box(f'wt_slit{k}_{j}', (p.x, p.y, z), (0.08, w, h), m['dark'], parent, rot_z=a)
            L.box(f'wt_slitf{k}_{j}', (p.x - nrm.x * 0.02, p.y - nrm.y * 0.02, z), (0.06, w + 0.25, h + 0.25), m['stone_l'], parent, rot_z=a)
    a = math.atan2(PATH[1][1] - T[1], PATH[1][0] - T[0])
    nrm = Vector((math.cos(a), math.sin(a), 0))
    p = Vector((*T, 0)) + nrm * (ap + 0.04)
    L.box('wt_door', (p.x, p.y, DECK + 1.05), (0.1, 1.1, 2.1), m['dark'], parent, rot_z=a)
    L.box('wt_doorf', (p.x - nrm.x * 0.02, p.y - nrm.y * 0.02, DECK + 1.15), (0.08, 1.5, 2.5), m['stone_l'], parent, rot_z=a)
    L.hide_box('Hide_tower', (*T, 18), (17, 17, 40))
