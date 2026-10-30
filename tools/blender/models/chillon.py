# Château de Chillon (Detailstufe 2): Wasserburg auf Felsinsel im Genfersee. z = 0 = Seespiegel.
import math
from mathutils import Vector

OUTLINE = [(-3.6, 64.4), (8.9, 63.0), (22.2, 44.4), (28.9, 13.3), (35.5, -8.9), (36.4, -35.5),
           (26.6, -43.5), (4.4, -35.5), (-17.8, 13.3), (-18.6, 40.0)]   # Uhrzeigersinn
DONJON = (8.9, 13.4)


def build(L):
    rock = L.mat('rock', (0.45, 0.43, 0.40), meters=6.0)
    wall = L.mat('castle_wall', (0.72, 0.69, 0.62), meters=4.0)
    wall2 = L.mat('stone_wall', (0.75, 0.72, 0.66), meters=3.5)
    plaster = L.mat('plaster_old', (0.78, 0.75, 0.68), meters=4.0)
    detail = L.mat('sandstone_detail', (0.70, 0.68, 0.60), meters=2.0)
    roof = L.mat('roof_clay', (0.42, 0.24, 0.16), meters=2.2)
    wood = L.mat('wood_weathered', (0.30, 0.20, 0.12), meters=2.0)
    beam = L.mat('wood_dark', (0.22, 0.14, 0.08), meters=1.5)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    dark = L.mat('dark', (0.04, 0.04, 0.045))
    gold = L.mat('gold', (0.75, 0.6, 0.3), rough=0.3, metal=1.0)

    root = L.empty('Chillon')
    base = L.empty('Fels', root)
    castle = L.empty('Burg', root)
    donjon = L.empty('Donjon', root)

    # Felsinsel
    L.extrude_polygon('rock', L.offset_polygon(OUTLINE, -3.5), -8.0, 1.2, rock, base)
    L.extrude_polygon('rock2', L.offset_polygon(OUTLINE, -1.6), 0.5, 2.6, rock, base)

    # Ringbebauung: Flügel mit Fensterreihen, Dächern, Kaminen
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
        mw = wall if i % 3 else plaster
        L.box(f'wing{i}', (*mid, (h + 2) / 2), (Ls + 2.0, 8.6, h - 2), mw, castle, rot_z=ang)
        L.gable_roof(f'wing_roof{i}', o0, o1, 10.0, h - 1.0, h + 4.5, roof, wood, castle, overhang=1.2, thick=0.14)
        L.rafters(f'wing_raft{i}', o0, o1, 10.0, h - 1.0, 1.0, beam, castle, size=0.1)
        # Fenster aussen (seeseitig klein und hoch), innen grösser
        L.facade(f'wing_out{i}', p0, p1, glass, detail, castle, floors=2, floor_h=4.5, z_start=h - 9.5, spacing=4.5,
                 win_w=0.8, win_h=1.5, margin=3.0, arch='round', mullion=False, sill=(detail, 0.15))
        L.facade(f'wing_in{i}', q1, q0, glass, detail, castle, floors=2, floor_h=4.0, z_start=4.0, spacing=3.5,
                 win_w=1.0, win_h=1.6, margin=2.0, sill=(detail, 0.15))
        # Kamin
        c = ((o0[0] + o1[0]) / 2 + 1.2, (o0[1] + o1[1]) / 2)
        L.box(f'chim{i}', (*c, h + 3.5), (0.9, 0.9, 3.0), wall2, castle)
    # Aussenmauer mit Zinnen (Merlons)
    L.wall_ring('curtain', OUTLINE, 1.5, 9.0, 1.6, wall, castle)
    for i in range(n):
        p0, p1 = OUTLINE[i], OUTLINE[(i + 1) % n]
        Ls, ang = L.frame_along(p0, p1)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        for k in range(int(Ls / 2.2)):
            q = Vector((p0[0], p0[1], 0)) + d * (1.1 + k * 2.2)
            L.box(f'merlon{i}_{k}', (q.x, q.y, 9.6), (1.2, 1.6, 1.2), wall, castle, rot_z=ang)

    # Landseitige Halbrundtürme mit hölzernen Wehrgängen (Hourds)
    for k, (x, y) in enumerate(((31.5, 3.0), (34.5, -18.0), (25.0, 30.0))):
        L.prism(f'tower{k}', (x, y, 1.0), 4.6, 18.0, 24, wall2, castle)
        L.prism(f'hourd{k}', (x, y, 17.0), 5.4, 2.4, 24, wood, castle)
        L.prism(f'tower_roof{k}', (x, y, 19.4), 5.9, 7.5, 24, roof, castle, radius_top=0.05)
        L.prism(f'tower_tip{k}', (x, y, 26.9), 0.07, 1.6, 6, gold, castle)
        for j in range(6):
            a = j * math.tau / 6
            nrm = Vector((math.cos(a), math.sin(a), 0))
            L.window(f'tw{k}_{j}', (x + nrm.x * 4.6, y + nrm.y * 4.6, 10.0), a + math.pi / 2, nrm, 0.4, 1.2, dark, detail, castle,
                     mullion=False)
    # Nordwest-Turm
    ang = math.radians(-15)
    L.building('nw_tower', -3.2, 46.0, 9.5, 9.5, -4, 21.0, ang, wall2, castle, roof=roof, roof_h=7.5, roof_type='pyramid',
               glass=glass, frame=detail, win=dict(floors=3, floor_h=5, z_start=6, spacing=3, win_w=0.7, win_h=1.4, margin=3.4, arch='round', mullion=False))
    # Süd-Turm
    ang = math.radians(-20)
    L.building('s_tower', 24.0, -34.0, 8.5, 8.5, -4, 22.0, ang, wall2, castle, roof=roof, roof_h=6.5, roof_type='pyramid',
               glass=glass, frame=detail, win=dict(floors=3, floor_h=5, z_start=6, spacing=3, win_w=0.7, win_h=1.4, margin=3.0, arch='round', mullion=False))

    # Donjon 32 m
    ang = math.radians(-16)
    L.building('dj', *DONJON, 10.5, 10.5, 0, 26.0, ang, wall2, donjon, roof=roof, roof_h=5.8, roof_type='pyramid',
               glass=glass, frame=detail, win=dict(floors=4, floor_h=5, z_start=6, spacing=3, win_w=0.6, win_h=1.3, margin=3.6, arch='round', mullion=False))
    L.box('dj_band', (*DONJON, 26.1), (11.4, 11.4, 0.5), detail, donjon, rot_z=ang)
    L.prism('dj_tip', (*DONJON, 32.2), 0.08, 1.8, 6, gold, donjon)

    # Gedeckte Holzbrücke zum Land
    p0, p1 = (36.0, -6.0), (55.0, -10.5)
    Lb, ang = L.frame_along(p0, p1)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    L.box('br_deck', (*mid, 4.0), (Lb, 3.4, 0.5), wood, castle, rot_z=ang)
    for s in (-1, 1):
        q = Vector(mid) + Vector((-math.sin(ang), math.cos(ang))) * (s * 1.6)
        L.box(f'br_wall{s}', (q.x, q.y, 5.2), (Lb, 0.12, 2.0), wood, castle, rot_z=ang)
    L.gable_roof('br_roof', p0, p1, 4.4, 7.0, 8.6, roof, wood, castle, overhang=0.3, thick=0.12)
    for s in (0.25, 0.5, 0.75):
        c = (p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s)
        L.box(f'br_pier{s}', (*c, 1.0), (1.4, 3.4, 6.0), wall2, castle, rot_z=ang)
    L.box('gate', (35.9, -5.8, 5.0), (0.3, 3.0, 4.0), dark, castle, rot_z=ang)

    L.merge_children(base)
    L.merge_children(castle)
    L.merge_children(donjon)
    ax = L.Axis(11.5, 10.0, -74.4)
    L.hide_box('Hide_chillon', (*ax.p(0, 0), 15), (122, 64, 50), rot_z=ax.ang)
