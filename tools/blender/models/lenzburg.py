# Schloss Lenzburg (Detailstufe 2). Lage aus swissBUILDINGS3D: Zentrum (-14.6, -2.1), Achse 20.6°, 140 x 72 m.
import math

CENTER = (-14.6, -2.1)
AXIS = 20.6


def build(L):
    wall = L.mat('castle_wall', (0.60, 0.57, 0.50), meters=4.0)
    stone = L.mat('stone_tower', (0.55, 0.53, 0.48), meters=3.5)
    plaster = L.mat('plaster_white', (0.86, 0.83, 0.76), meters=4.0)
    quoin = L.mat('sandstone_detail', (0.70, 0.68, 0.60), meters=2.0)
    roof = L.mat('roof_clay', (0.50, 0.26, 0.16), meters=2.2)
    wood = L.mat('wood_dark', (0.30, 0.18, 0.10), meters=1.5)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    shutter = L.mat('frame_green', (0.17, 0.29, 0.20))
    dark = L.mat('dark', (0.05, 0.05, 0.05))
    gold = L.mat('gold', (0.75, 0.6, 0.3), rough=0.3, metal=1.0)

    ax = L.Axis(CENTER[0], CENTER[1], AXIS)
    A = ax.ang
    root = L.empty('Schloss')
    walls = L.empty('Ringmauer', root)
    bld = L.empty('Gebaeude', root)
    keep = L.empty('Bergfried', root)

    # ---------- Ringmauer mit Wehrgang-Abdeckung und Zinnen-Andeutung
    ring = []
    for k in range(32):
        t = -k / 32 * math.tau   # Uhrzeigersinn
        a = 68 * math.cos(t)
        b = 31 * math.sin(t) * (1.0 - 0.18 * max(0, -math.cos(t)))
        ring.append(ax.p(a, b))
    L.wall_ring('ring', ring, -16.0, 5.0, 1.8, wall, walls)
    for i in range(len(ring)):
        p0, p1 = ring[i], ring[(i + 1) % len(ring)]
        Ls, ang = L.frame_along(p0, p1)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        L.gable_roof(f'ring_cap{i}', p0, p1, 2.6, 5.0, 5.9, roof, wall, walls, overhang=0.6, thick=0.12)
        # Strebepfeiler aussen
        L.box(f'ring_bt{i}', (*mid, -6.0), (1.4, 3.6, 20), wall, walls, rot_z=ang)
    for t, r in ((0.0, 5.0), (0.62, 4.0), (-0.62, 4.0), (2.7, 4.5), (-2.7, 4.5)):
        p = ax.p(68 * math.cos(t), 31 * math.sin(t))
        L.prism(f'bast{t}', (*p, -16), r, 24, 20, wall, walls)
        L.prism(f'bast_ring{t}', (*p, 7.6), r + 0.25, 0.4, 20, quoin, walls)
        L.prism(f'bast_roof{t}', (*p, 8), r + 0.7, 6.0, 20, roof, walls, radius_top=0.05)
        L.prism(f'bast_tip{t}', (*p, 14), 0.06, 1.2, 6, gold, walls)

    WIN = dict(floors=3, floor_h=3.4, z_start=1.4, spacing=3.0, win_w=1.0, win_h=1.6, margin=1.6,
               sill=(quoin, 0.2), mullion=True)

    def house(name, a, b, la, lb, h, ridge, hip=False, floors=3, par=bld, mat_=plaster):
        cx, cy = ax.p(a, b)
        win = dict(WIN, floors=floors)
        L.building(name, cx, cy, la, lb, -12, h, A, mat_, par, roof=roof, roof_h=ridge - h,
                   roof_type='hip' if hip else 'gable', glass=glass, frame=quoin, win=win,
                   quoins=quoin, plinth=(wall, 1.0))
        # Fensterläden neben einigen Fenstern
        # Lukarnen (Dachgauben) auf der Längsseite
        n = max(1, int(la / 9))
        for i in range(n):
            da = -la / 2 + (i + 0.5) * la / n
            for s in (-1, 1):
                cxx, cyy = ax.p(a + da, b + s * lb * 0.22)
                zz = h + (ridge - h) * 0.35
                L.box(f'{name}_dorm{i}{s}', (cxx, cyy, zz + 0.7), (1.6, 1.6, 1.4), plaster, par, rot_z=A)
                L.hip_roof(f'{name}_dormr{i}{s}', (cxx, cyy, 0), 1.9, 1.9, zz + 1.4, 0.9, roof, par, rot=A, ridge_frac=0.02, overhang=0.15)
                gx, gy = ax.p(a + da, b + s * (lb * 0.22 + 0.81))
                L.box(f'{name}_dormg{i}{s}', (gx, gy, zz + 0.7), (0.8, 0.04, 0.9), glass, par, rot_z=A)

    house('palas', 12, -21, 44, 13, 15, 24, hip=True, floors=4)
    house('landvogtei', 40, -17, 14, 12, 12.5, 21.5, floors=3)
    house('stapferhaus', 52, 2, 13, 26, 11, 19, hip=True, floors=3)
    house('ritterhaus', 40, 22, 26, 11, 10, 18, floors=2)
    house('torhaus', -20, 17, 16, 10, 8, 15, floors=2, mat_=stone)
    house('nordbau', 14, 22, 24, 9, 9, 16, floors=2)
    # Tor mit Rundbogen
    L.abox('tor', ax, -20, 22.15, 2.8, (3.6, 0.2, 4.6), dark, bld)
    L.abox('tor_frame', ax, -20, 22.3, 5.4, (4.6, 0.4, 0.6), quoin, bld)
    # Treppenturm im Hof
    c = ax.p(26, -8)
    L.prism('treppenturm', (*c, -2), 2.4, 17, 12, plaster, bld)
    L.prism('treppenturm_roof', (*c, 15), 3.0, 5.5, 12, roof, bld, radius_top=0.05)
    L.prism('treppenturm_tip', (*c, 20.5), 0.06, 1.3, 6, gold, bld)
    # Hofpflaster + Brunnen
    L.abox('hof', ax, 25, 2, 0.05, (30, 26, 0.1), L.mat('cobble', (0.5, 0.48, 0.45), meters=2.0), bld)
    c = ax.p(22, 4)
    L.prism('brunnen', (*c, 0), 1.6, 0.8, 16, quoin, bld)
    L.prism('brunnen_st', (*c, 0.8), 0.25, 1.8, 8, quoin, bld)

    # ---------- Bergfried (quadratisch, Bossenquader, Zeltdach)
    c = ax.p(60, -14)
    L.abox('bf_body', ax, 60, -14, 4, (11, 11, 32), stone, keep)
    L.abox('bf_band', ax, 60, -14, 14.0, (11.4, 11.4, 0.4), quoin, keep)
    L.abox('bf_top', ax, 60, -14, 20.4, (11.8, 11.8, 0.8), quoin, keep)
    for k in range(4):
        for s in (-1, 1):
            # Pechnasen / Konsolen
            L.abox(f'bf_corb{k}{s}', ax, 60 + (5.8 if k == 0 else -5.8 if k == 1 else s * 3), -14 + (5.8 if k == 2 else -5.8 if k == 3 else s * 3), 19.6, (0.6, 0.6, 0.8), quoin, keep)
    L.pyramid_roof('bf_roof', c, 11.0, 11.0, 20.8, 8.0, roof, keep, rot=A, overhang=0.6)
    L.prism('bf_tip', (*c, 28.8), 0.08, 1.6, 6, gold, keep)
    pts = L.rect_pts(*c, 11, 11, A)
    for i in range(4):
        L.facade(f'bf_w{i}', pts[i], pts[(i + 1) % 4], glass, quoin, keep, floors=2, floor_h=5.0, z_start=9.0,
                 spacing=4, win_w=0.7, win_h=1.4, margin=3.5, arch='round', mullion=False)

    # Barockgarten-Terrasse (West)
    gar = [ax.p(a, b) for a, b in ((-62, -18), (-58, 16), (-30, 20), (-30, -24))]
    L.wall_ring('garden', gar, -3, 1.2, 0.8, wall, walls)

    L.merge_children(walls)
    L.merge_children(bld)
    L.merge_children(keep)
    c = ax.p(0, 0)
    L.hide_box('Hide_schloss', (*c, 15), (150, 80, 60), rot_z=A)
