# Kapellbrücke mit Wasserturm, Luzern (Detailstufe 2).
# Verlauf aus SWISSIMAGE ausgemessen, Turm aus swissBUILDINGS3D. z = 0 = Wasserspiegel.
import math

PATH = [(51.0, 77.8), (-23.9, -30.7), (-69.6, -64.8), (-71.1, -80.5)]
TOWER = (-19.4, -44.2)

DECK_TOP = 2.6
RAIL_TOP = DECK_TOP + 1.05
EAVE = DECK_TOP + 2.45
RIDGE = DECK_TOP + 3.75
WIDTH = 3.4


def build(L):
    stone = L.mat('stone_wasserturm', (0.55, 0.42, 0.30), meters=4.0)
    stone_l = L.mat('sandstone_old', (0.65, 0.58, 0.45), meters=3.0)
    roof = L.mat('roof_red', (0.55, 0.30, 0.20), meters=2.2)
    roof_t = L.mat('roof_clay', (0.45, 0.22, 0.15), meters=2.2)
    boards = L.mat('wood_weathered', (0.30, 0.22, 0.15), meters=2.0)
    deck = L.mat('wood_deck', (0.40, 0.32, 0.24), meters=2.5)
    beam = L.mat('wood_dark', (0.22, 0.14, 0.08), meters=1.5)
    pile = L.mat('wood_rough', (0.20, 0.17, 0.14), meters=2.0)
    flowers = L.mat('flowers_red', (0.75, 0.06, 0.06), meters=1.0)
    leaves = L.mat('leaves', (0.12, 0.30, 0.08), meters=1.0)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    dark = L.mat('dark', (0.03, 0.03, 0.035))
    metal = L.mat('gold', (0.7, 0.55, 0.25), rough=0.3, metal=1.0)

    bridge = L.empty('Bruecke')
    tower = L.empty('Wasserturm')

    for si in range(len(PATH) - 1):
        p0, p1 = PATH[si], PATH[si + 1]
        Ls, ang = L.frame_along(p0, p1)
        dx, dy = math.cos(ang), math.sin(ang)
        px, py = -dy, dx
        at = lambda s, o=0.0: (p0[0] + dx * s + px * o, p0[1] + dy * s + py * o)
        mid = at(Ls / 2)
        ext = 0.25
        n = f'S{si}'
        # Gehweg + Unterbau
        L.box(f'{n}_deck', (*mid, DECK_TOP - 0.1), (Ls + 2 * ext, WIDTH, 0.2), deck, bridge, rot_z=ang)
        L.box(f'{n}_deck_under', (*mid, DECK_TOP - 0.35), (Ls + 2 * ext, WIDTH - 0.2, 0.3), beam, bridge, rot_z=ang)
        for side in (-1, 1):
            c = at(Ls / 2, side * (WIDTH / 2 - 0.3))
            L.box(f'{n}_stringer{side}', (*c, DECK_TOP - 0.75), (Ls + 2 * ext, 0.32, 0.5), beam, bridge, rot_z=ang)
            # Brüstung: senkrechte Bretter
            c = at(Ls / 2, side * (WIDTH / 2))
            L.box(f'{n}_rail{side}', (*c, (DECK_TOP + RAIL_TOP) / 2), (Ls + 2 * ext, 0.1, RAIL_TOP - DECK_TOP), boards, bridge, rot_z=ang)
            c = at(Ls / 2, side * (WIDTH / 2 + 0.02))
            L.box(f'{n}_railcap{side}', (*c, RAIL_TOP + 0.04), (Ls + 2 * ext, 0.24, 0.08), beam, bridge, rot_z=ang)
            # Blumenkisten mit Geranien (das Markenzeichen der Brücke)
            c = at(Ls / 2, side * (WIDTH / 2 + 0.26))
            L.box(f'{n}_flowerbox{side}', (*c, RAIL_TOP - 0.2), (Ls - 0.8, 0.34, 0.3), beam, bridge, rot_z=ang)
            a_ = at(0.5, side * (WIDTH / 2 + 0.26)); b_ = at(Ls - 0.5, side * (WIDTH / 2 + 0.26))
            L.blobs(f'{n}_leaves{side}', a_, b_, RAIL_TOP + 0.02, int(Ls * 3.2), 0.16, leaves, bridge, jitter=0.3, seed=si * 7 + side)
            L.blobs(f'{n}_flowers{side}', a_, b_, RAIL_TOP + 0.14, int(Ls * 2.6), 0.12, flowers, bridge, jitter=0.32, seed=si * 13 + side)
            # Pfette + Pfosten mit Kopfbändern
            c = at(Ls / 2, side * (WIDTH / 2 - 0.05))
            L.box(f'{n}_plate{side}', (*c, EAVE - 0.1), (Ls + 2 * ext, 0.2, 0.2), beam, bridge, rot_z=ang)
            k = max(2, int(Ls / 1.8))
            for i in range(k + 1):
                s = Ls * i / k
                c = at(s, side * (WIDTH / 2 - 0.05))
                L.box(f'{n}_post{side}_{i}', (*c, (RAIL_TOP + EAVE) / 2), (0.15, 0.15, EAVE - RAIL_TOP), beam, bridge, rot_z=ang)
                if i % 2 == 0 and 0 < s < Ls:
                    a3 = (*at(s - 0.45, side * (WIDTH / 2 - 0.05)), EAVE - 0.15)
                    b3 = (*at(s, side * (WIDTH / 2 - 0.05)), EAVE - 0.6)
                    L.beam_between(f'{n}_brk{side}_{i}', a3, b3, 0.08, beam, bridge)
        # Zugbalken
        k = max(1, int(Ls / 3.6))
        for i in range(k + 1):
            c = at(Ls * i / k)
            L.box(f'{n}_tie{i}', (*c, EAVE - 0.05), (0.14, WIDTH + 0.1, 0.16), beam, bridge, rot_z=ang)
        # Dach mit Sparrenköpfen
        L.gable_roof(f'{n}_roof', at(-ext), at(Ls + ext), WIDTH + 1.2, EAVE, RIDGE, roof, beam, bridge, overhang=0.2, thick=0.14)
        L.rafters(f'{n}_raft', at(0), at(Ls), WIDTH + 1.2, EAVE, 0.9, beam, bridge, size=0.09)
        L.box(f'{n}_ridge', (*mid, RIDGE + 0.05), (Ls + 2 * ext, 0.2, 0.12), roof_t, bridge, rot_z=ang)
        # Joche
        k = max(1, int(Ls / 7.2))
        for i in range(k + 1):
            s = Ls * i / k
            for o in (-1.25, 0.0, 1.25):
                c = at(s, o)
                L.prism(f'{n}_pile{i}_{o}', (*c, -2.0), 0.19, DECK_TOP - 0.95 + 2.0, 8, pile, bridge)
            c = at(s)
            L.box(f'{n}_yoke{i}', (*c, DECK_TOP - 1.1), (0.3, WIDTH + 0.4, 0.3), pile, bridge, rot_z=ang)
            a = at(s, -1.25); b = at(s, 1.25)
            L.beam_between(f'{n}_brace{i}a', (a[0], a[1], 0.2), (b[0], b[1], DECK_TOP - 1.25), 0.13, pile, bridge)
            L.beam_between(f'{n}_brace{i}b', (b[0], b[1], 0.2), (a[0], a[1], DECK_TOP - 1.25), 0.13, pile, bridge)
            # Eisbrecher (schräger Pfahl stromaufwärts)
            ia = at(s, -2.4)
            L.beam_between(f'{n}_ice{i}', (ia[0], ia[1], -0.5), (*at(s, -1.25), 1.3), 0.17, pile, bridge)
        L.hide_box(f'Hide_{n}', (*mid, 6), (Ls + 3, WIDTH + 4.5, 20), rot_z=ang)

    # ---------- Verbindungsgang zum Turm
    k0 = PATH[1]
    Lc, angc = L.frame_along(k0, TOWER)
    dx, dy = math.cos(angc), math.sin(angc)
    c0 = (k0[0] + dx * 1.2, k0[1] + dy * 1.2)
    c1 = (TOWER[0] - dx * 5.0, TOWER[1] - dy * 5.0)
    Lp, _ = L.frame_along(c0, c1)
    midc = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)
    L.box('gang_deck', (*midc, DECK_TOP - 0.15), (Lp, 2.6, 0.3), deck, bridge, rot_z=angc)
    for side in (-1, 1):
        cc = (midc[0] - dy * side * 1.25, midc[1] + dx * side * 1.25)
        L.box(f'gang_wall{side}', (*cc, (DECK_TOP + EAVE) / 2), (Lp, 0.14, EAVE - DECK_TOP), boards, bridge, rot_z=angc)
    L.gable_roof('gang_roof', c0, c1, 3.4, EAVE, RIDGE - 0.3, roof, beam, bridge, overhang=0.3, thick=0.14)
    for o in (-0.9, 0.9):
        cc = (midc[0] - dy * o, midc[1] + dx * o)
        L.prism(f'gang_pile{o}', (*cc, -2.0), 0.19, DECK_TOP - 0.3 + 2.0, 8, pile, bridge)

    # ---------- Wasserturm (achteckig, 34.5 m)
    T = TOWER
    R = 5.6
    top = 25.5
    rot8 = math.radians(22.5)
    L.prism('wt_plinth', (*T, -2.0), R * 1.12, 2.6, 8, stone_l, tower, rot=rot8)
    L.prism('wt_shaft', (*T, 0.6), R * 1.06, top - 0.6, 8, stone, tower, radius_top=R, rot=rot8)
    # Bogenfries / Konsolen unter dem Dach
    L.prism('wt_cornice', (*T, top - 0.6), R * 1.03, 0.5, 8, stone_l, tower, rot=rot8)
    for k in range(24):
        a = k * math.tau / 24
        p = (T[0] + math.cos(a) * R * 1.02, T[1] + math.sin(a) * R * 1.02)
        L.box(f'wt_corbel{k}', (*p, top - 0.1), (0.35, 0.3, 0.45), stone_l, tower, rot_z=a)
    L.prism('wt_cornice2', (*T, top + 0.1), R * 1.09, 0.35, 8, stone_l, tower, rot=rot8)
    L.prism('wt_wall_top', (*T, top + 0.45), R * 1.02, 0.9, 8, beam, tower, rot=rot8)
    L.prism('wt_roof', (*T, top + 1.35), R * 1.24, 7.6, 8, roof_t, tower, radius_top=0.05, rot=rot8)
    # Gratziegel
    for k in range(8):
        a = rot8 + k * math.tau / 8 + math.pi / 8
        p0 = (T[0] + math.cos(a - math.pi / 8) * R * 1.24, T[1] + math.sin(a - math.pi / 8) * R * 1.24, top + 1.35)
        L.beam_between(f'wt_hip{k}', p0, (T[0], T[1], top + 8.9), 0.16, roof, tower)
    L.prism('wt_finial', (*T, top + 8.8), 0.07, 1.6, 6, metal, tower)
    L.prism('wt_knob', (*T, top + 9.5), 0.22, 0.35, 8, metal, tower)
    # Fenster mit Rahmen auf den Achteckseiten
    ap = R * math.cos(math.pi / 8)
    for k in range(8):
        a = k * math.pi / 4
        from mathutils import Vector
        nrm = Vector((math.cos(a), math.sin(a), 0))
        tang = a + math.pi / 2
        for j, z in enumerate((6.5, 12.0, 17.5, 22.0)):
            if (k + j) % 2:
                continue
            r = ap * (1.06 - 0.06 * z / top) + 0.01
            base = (T[0] + nrm.x * r, T[1] + nrm.y * r, z)
            L.window(f'wt_win{k}_{j}', base, tang, nrm, 0.55, 1.3 if z < 20 else 0.8, glass, stone_l, tower,
                     depth=0.08, mullion=False, sill=(stone_l, 0.2))
    # Tür zum Gang
    a = math.atan2(-dy, -dx)
    from mathutils import Vector
    nrm = Vector((math.cos(a), math.sin(a), 0))
    r = ap * 1.04 + 0.02
    L.box('wt_door', (T[0] + nrm.x * r, T[1] + nrm.y * r, DECK_TOP + 1.0), (0.14, 1.1, 2.0), dark, tower, rot_z=a)
    # Wasserlinie (dunkler, nass)
    L.prism('wt_wet', (*T, -0.4), R * 1.125, 0.9, 8, L.mat('rock', (0.2, 0.2, 0.18), meters=3.0), tower, rot=rot8)
    L.hide_box('Hide_tower', (*T, 18), (15, 15, 40))

    L.merge_children(bridge)
    L.merge_children(tower)
