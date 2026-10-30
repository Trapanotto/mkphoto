# Kapellbrücke mit Wasserturm, Luzern.
# Verlauf aus SWISSIMAGE ausgemessen (Meter relativ zum Anker 47.05165 / 8.30755, z = Wasserspiegel).
import math

PATH = [(51.0, 77.8), (-23.9, -30.7), (-69.6, -64.8), (-71.1, -80.5)]
TOWER = (-19.4, -44.2)  # aus swissBUILDINGS3D-Geometrie

DECK_TOP = 2.6
RAIL_TOP = DECK_TOP + 1.05
EAVE = DECK_TOP + 2.45
RIDGE = DECK_TOP + 3.75
WIDTH = 3.4


def build(L):
    stone = L.material('wt_stone', L.tex_masonry('wt_stone', (0.60, 0.47, 0.33), var=0.14, mortar=(0.66, 0.62, 0.55),
                                                     rows=14, mean_w=1.8, seed=11), rough=0.92, meters=6.0)
    stone_l = L.material('wt_stone_light', L.tex_masonry('wt_stone_light', (0.70, 0.62, 0.50), rows=4, mean_w=3, seed=12),
                         rough=0.9, meters=3.0)
    roof = L.material('kb_roof', L.tex_roof_tiles('kb_roof', (0.50, 0.24, 0.15), rows=18, cols=12, seed=13), rough=0.8, meters=3.0)
    roof_t = L.material('wt_roof', L.tex_roof_tiles('wt_roof', (0.40, 0.21, 0.14), rows=22, cols=14, seed=14, aged=0.4),
                        rough=0.8, meters=3.0)
    boards = L.material('kb_boards', L.tex_wood('kb_boards', (0.36, 0.22, 0.12), boards=6, vertical=False, seed=15),
                        rough=0.85, meters=1.2)
    beam = L.material('kb_beam', L.tex_wood('kb_beam', (0.26, 0.16, 0.09), boards=2, vertical=True, seed=16),
                      rough=0.85, meters=1.0)
    pile = L.material('kb_pile', L.tex_wood('kb_pile', (0.18, 0.13, 0.09), boards=3, vertical=True, seed=17),
                      rough=0.95, meters=1.5)
    flowers = L.material('kb_flowers', L.tex_flowers('kb_flowers', seed=18), rough=1.0, meters=0.8)
    dark = L.material('kb_dark', None, color=(0.03, 0.03, 0.035), rough=0.6)
    metal = L.material('wt_metal', None, color=(0.25, 0.25, 0.22), rough=0.4, metal=0.8)

    bridge = L.empty('Bruecke')
    tower = L.empty('Wasserturm')

    # ---------- Brückensegmente
    for si in range(len(PATH) - 1):
        p0, p1 = PATH[si], PATH[si + 1]
        Ls, ang = L.frame_along(p0, p1)
        dx, dy = math.cos(ang), math.sin(ang)
        px, py = -dy, dx
        at = lambda s, o=0.0: (p0[0] + dx * s + px * o, p0[1] + dy * s + py * o)
        mid = at(Ls / 2)
        ext = 0.25  # Überlappung an Knicken
        n = f'S{si}'
        L.box(f'{n}_deck', (*mid, DECK_TOP - 0.15), (Ls + 2 * ext, WIDTH, 0.3), boards, bridge, rot_z=ang)
        for side in (-1, 1):
            c = at(Ls / 2, side * (WIDTH / 2 - 0.3))
            L.box(f'{n}_stringer{side}', (*c, DECK_TOP - 0.55), (Ls + 2 * ext, 0.3, 0.5), beam, bridge, rot_z=ang)
            # Brüstung aussen mit Brettern
            c = at(Ls / 2, side * (WIDTH / 2))
            L.box(f'{n}_rail{side}', (*c, (DECK_TOP + RAIL_TOP) / 2), (Ls + 2 * ext, 0.12, RAIL_TOP - DECK_TOP), boards, bridge, rot_z=ang)
            # Blumenkisten
            c = at(Ls / 2, side * (WIDTH / 2 + 0.22))
            L.box(f'{n}_flowerbox{side}', (*c, RAIL_TOP - 0.25), (Ls - 0.8, 0.32, 0.28), beam, bridge, rot_z=ang)
            L.box(f'{n}_flowers{side}', (*c, RAIL_TOP + 0.02), (Ls - 0.9, 0.42, 0.28), flowers, bridge, rot_z=ang)
            # Pfette
            c = at(Ls / 2, side * (WIDTH / 2 - 0.05))
            L.box(f'{n}_plate{side}', (*c, EAVE - 0.08), (Ls + 2 * ext, 0.2, 0.18), beam, bridge, rot_z=ang)
            # Pfosten
            k = max(2, int(Ls / 1.8))
            for i in range(k + 1):
                s = Ls * i / k
                c = at(s, side * (WIDTH / 2 - 0.05))
                L.box(f'{n}_post{side}_{i}', (*c, (RAIL_TOP + EAVE) / 2), (0.15, 0.15, EAVE - RAIL_TOP), beam, bridge, rot_z=ang)
        # Zugbalken quer
        k = max(1, int(Ls / 3.6))
        for i in range(k + 1):
            c = at(Ls * i / k)
            L.box(f'{n}_tie{i}', (*c, EAVE - 0.05), (0.14, WIDTH + 0.1, 0.16), beam, bridge, rot_z=ang)
        # Dach
        L.gable_roof(f'{n}_roof', at(-ext), at(Ls + ext), WIDTH + 1.1, EAVE, RIDGE, roof, beam, bridge, overhang=0.2)
        # Joche (Pfähle im Wasser)
        k = max(1, int(Ls / 7.2))
        for i in range(k + 1):
            s = Ls * i / k
            for o in (-1.25, 0.0, 1.25):
                c = at(s, o)
                L.prism(f'{n}_pile{i}_{o}', (*c, -2.0), 0.19, DECK_TOP - 0.75 + 2.0, 8, pile, bridge)
            c = at(s)
            L.box(f'{n}_yoke{i}', (*c, DECK_TOP - 0.95), (0.3, WIDTH + 0.4, 0.3), pile, bridge, rot_z=ang)
            a = at(s, -1.25); b = at(s, 1.25)
            L.beam_between(f'{n}_brace{i}', (a[0], a[1], 0.3), (b[0], b[1], DECK_TOP - 1.1), 0.14, pile, bridge)
        # Ausblenden der swisstopo-Gebäude entlang des Segments
        L.hide_box(f'Hide_{n}', (*mid, 6), (Ls + 3, WIDTH + 4.5, 20), rot_z=ang)

    # ---------- Verbindungsgang Brücke -> Turm
    k0 = PATH[1]
    Lc, angc = L.frame_along(k0, TOWER)
    dx, dy = math.cos(angc), math.sin(angc)
    c0 = (k0[0] + dx * 1.2, k0[1] + dy * 1.2)
    c1 = (TOWER[0] - dx * 5.0, TOWER[1] - dy * 5.0)
    Lp, _ = L.frame_along(c0, c1)
    midc = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)
    L.box('gang_deck', (*midc, DECK_TOP - 0.15), (Lp, 2.6, 0.3), boards, bridge, rot_z=angc)
    for side in (-1, 1):
        cc = (midc[0] - dy * side * 1.25, midc[1] + dx * side * 1.25)
        L.box(f'gang_wall{side}', (*cc, (DECK_TOP + EAVE) / 2), (Lp, 0.14, EAVE - DECK_TOP), boards, bridge, rot_z=angc)
    L.gable_roof('gang_roof', c0, c1, 3.4, EAVE, RIDGE - 0.3, roof, beam, bridge, overhang=0.3)
    for o in (-0.9, 0.9):
        cc = (midc[0] - dy * o, midc[1] + dx * o)
        L.prism(f'gang_pile{o}', (*cc, -2.0), 0.19, DECK_TOP - 0.3 + 2.0, 8, pile, bridge)

    # ---------- Wasserturm (achteckig, 34.5 m)
    T = TOWER
    R = 5.6
    top = 25.5
    L.prism('wt_shaft', (*T, -2.0), R * 1.04, top + 2.0, 8, stone, tower, radius_top=R, rot=math.radians(22.5))
    L.prism('wt_plinth', (*T, -2.0), R * 1.12, 2.2, 8, stone_l, tower, rot=math.radians(22.5))
    L.prism('wt_cornice', (*T, top - 0.2), R * 1.06, 0.6, 8, stone_l, tower, rot=math.radians(22.5))
    L.prism('wt_wall_top', (*T, top + 0.4), R * 1.0, 0.9, 8, beam, tower, rot=math.radians(22.5))
    L.prism('wt_roof', (*T, top + 1.3), R * 1.2, 7.7, 8, roof_t, tower, radius_top=0.05, rot=math.radians(22.5))
    L.prism('wt_finial', (*T, top + 8.6), 0.08, 1.4, 6, metal, tower)
    L.prism('wt_knob', (*T, top + 9.2), 0.22, 0.35, 8, metal, tower)
    # Fensterschlitze und Tür
    ap = R * math.cos(math.radians(22.5))
    for k in range(8):
        a = math.radians(45 * k)
        nx, ny = math.cos(a), math.sin(a)
        for j, z in enumerate((7.0, 12.5, 18.0, 22.5)):
            if (k + j) % 2:
                continue
            r = ap * (1.04 - 0.04 * z / top) + 0.02
            L.box(f'wt_win{k}_{j}', (T[0] + nx * r, T[1] + ny * r, z), (0.12, 0.45, 1.3 if z < 20 else 0.8), dark, tower, rot_z=a)
    # Tür zum Gang
    a = math.atan2(-dy, -dx)
    r = ap * 1.03 + 0.02
    L.box('wt_door', (T[0] + math.cos(a) * r, T[1] + math.sin(a) * r, DECK_TOP + 1.0), (0.14, 1.1, 2.0), dark, tower, rot_z=a)
    L.hide_box('Hide_tower', (*T, 18), (15, 15, 40))

    L.merge_children(bridge)
    L.merge_children(tower)
