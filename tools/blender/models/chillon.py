# Château de Chillon: Wasserburg auf einer Felsinsel im Genfersee.
# Umriss aus SWISSIMAGE, Donjon 32 m bei (8.9, 13.4) aus swissBUILDINGS3D. z = 0 = Seespiegel.
import math

OUTLINE = [(-3.6, 64.4), (8.9, 63.0), (22.2, 44.4), (28.9, 13.3), (35.5, -8.9), (36.4, -35.5),
           (26.6, -43.5), (4.4, -35.5), (-17.8, 13.3), (-18.6, 40.0)]
DONJON = (8.9, 13.4)


def build(L):
    rock = L.material('ch_rock', L.tex_masonry('ch_rock', (0.45, 0.43, 0.40), var=0.25, mortar=(0.36, 0.35, 0.33),
                                                  rows=5, mean_w=1.3, jitter=0.6, seed=71), rough=1.0, meters=8.0)
    wall = L.material('ch_wall', L.tex_masonry('ch_wall', (0.72, 0.69, 0.62), var=0.12, mortar=(0.78, 0.76, 0.70),
                                                  rows=14, mean_w=1.7, jitter=0.5, seed=72, hue=(0.04, 0.03, 0.0)), rough=0.95, meters=6.0)
    wall_w = L.material('ch_wall_win', L.tex_window_facade('ch_wall_win', base=(0.72, 0.69, 0.62), win=(0.07, 0.07, 0.08),
                                                             frame=(0.78, 0.76, 0.70), cols=2, rows=1, wx=(0.42, 0.58), wy=(0.3, 0.62),
                                                             ashlar=False, seed=73), rough=0.95, meters=8.0)
    roof = L.material('ch_roof', L.tex_roof_tiles('ch_roof', (0.42, 0.24, 0.16), rows=22, cols=14, seed=74, aged=0.35), rough=0.8, meters=3.0)
    wood = L.material('ch_wood', L.tex_wood('ch_wood', (0.28, 0.17, 0.10), boards=5, seed=75), rough=0.85, meters=1.5)
    dark = L.material('ch_dark', None, color=(0.04, 0.04, 0.045), rough=0.6)

    root = L.empty('Chillon')
    base = L.empty('Fels', root)
    castle = L.empty('Burg', root)
    donjon = L.empty('Donjon', root)

    # Felsinsel (unter Wasser beginnend)
    rock_pts = L.offset_polygon(OUTLINE, -3.5)
    L.extrude_polygon('rock', rock_pts, -8.0, 2.0, rock, base)
    L.extrude_polygon('rock_top', L.offset_polygon(OUTLINE, -1.2), 1.5, 3.0, rock, base)

    # Ringbebauung entlang des Umrisses: Gebäude mit Satteldächern
    inner = L.offset_polygon(OUTLINE, 9.0)
    n = len(OUTLINE)
    heights = [17, 16, 15, 14, 14, 16, 18, 15, 16, 19]
    for i in range(n):
        p0, p1 = OUTLINE[i], OUTLINE[(i + 1) % n]
        q0, q1 = inner[i], inner[(i + 1) % n]
        o0 = ((p0[0] + q0[0]) / 2, (p0[1] + q0[1]) / 2)
        o1 = ((p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2)
        Ls, ang = L.frame_along(o0, o1)
        mid = ((o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2)
        h = heights[i]
        L.box(f'wing{i}', (*mid, (h + 2) / 2), (Ls + 2.0, 8.6, h - 2), wall_w, castle, rot_z=ang)
        L.gable_roof(f'wing_roof{i}', o0, o1, 10.0, h - 1.0, h + 4.5, roof, wood, castle, overhang=1.2)
    # Aussenmauer (Seeseite hoch, Landseite mit Wehrgang)
    L.wall_ring('curtain', OUTLINE, 2.0, 9.0, 1.6, wall, castle)

    # Landseitige Halbrundtürme
    for k, (x, y) in enumerate(((31.5, 3.0), (34.5, -18.0), (25.0, 30.0))):
        L.prism(f'tower{k}', (x, y, 1.0), 4.6, 18.0, 16, wall_w, castle)
        L.prism(f'tower_roof{k}', (x, y, 19.0), 5.2, 7.0, 16, roof, castle, radius_top=0.05)
    # Nordwest-Turm (zweithöchster, 21 m)
    L.box('nw_tower', (-3.2, 46.0, 10.5), (9.5, 9.5, 21.0), wall_w, castle, rot_z=math.radians(-15))
    L.pyramid_roof('nw_tower_roof', (-3.2, 46.0), 9.5, 9.5, 21.0, 7.5, roof, castle, rot=math.radians(-15), overhang=0.5)
    # Süd-Turm
    L.box('s_tower', (24.0, -34.0, 11.0), (8.5, 8.5, 22.0), wall_w, castle, rot_z=math.radians(-20))
    L.pyramid_roof('s_tower_roof', (24.0, -34.0), 8.5, 8.5, 22.0, 6.5, roof, castle, rot=math.radians(-20), overhang=0.5)

    # Donjon (Hauptturm) 32 m inkl. Dach
    L.box('dj_body', (*DONJON, 13.0), (10.5, 10.5, 26.0), wall_w, donjon, rot_z=math.radians(-16))
    L.box('dj_top', (*DONJON, 26.2), (11.2, 11.2, 0.6), wall, donjon, rot_z=math.radians(-16))
    L.pyramid_roof('dj_roof', DONJON, 10.8, 10.8, 26.4, 5.8, roof, donjon, rot=math.radians(-16), overhang=0.6)

    # Eingangsbrücke zum Land (gedeckter Holzsteg)
    p0, p1 = (36.0, -6.0), (55.0, -10.5)
    Lb, ang = L.frame_along(p0, p1)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    L.box('br_deck', (*mid, 4.0), (Lb, 3.4, 0.5), wood, castle, rot_z=ang)
    L.gable_roof('br_roof', p0, p1, 4.4, 7.0, 8.6, roof, wood, castle, overhang=0.3)
    for s in (0.25, 0.5, 0.75):
        c = (p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s)
        L.box(f'br_pier{s}', (*c, 1.0), (1.4, 3.4, 6.0), wall, castle, rot_z=ang)
    L.box('gate', (35.9, -5.8, 5.0), (0.3, 3.0, 4.0), dark, castle, rot_z=ang)

    L.merge_children(base)
    L.merge_children(castle)
    L.merge_children(donjon)
    ax = L.Axis(11.5, 10.0, -74.4)
    c = ax.p(0, 0)
    L.hide_box('Hide_chillon', (*c, 15), (122, 64, 50), rot_z=ax.ang)
