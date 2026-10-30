# Berner Münster (Detailstufe 2): Westturm 100.6 m, dreischiffiges Langhaus, polygonaler Chor.
# Lage aus swissBUILDINGS3D: Turmmitte (3.3, -15.9), Achse 2.1° ab Ost.
import math
from mathutils import Vector

TOWER = (3.3, -15.9)
AXIS = 2.1


def build(L):
    sand = L.mat('sandstone_bern', (0.56, 0.57, 0.49), meters=3.5)
    sand_d = L.mat('sandstone_detail', (0.62, 0.62, 0.56), meters=2.5)
    roof = L.mat('roof_dark', (0.36, 0.27, 0.22), meters=2.2)
    roof_c = L.mat('roof_slate', (0.30, 0.32, 0.33), meters=2.2)
    glass = L.mat('glass_church', (0.08, 0.10, 0.15), rough=0.1)
    dark = L.mat('dark', (0.04, 0.04, 0.05))
    gold = L.mat('gold', (0.75, 0.6, 0.3), rough=0.3, metal=1.0)

    ax = L.Axis(TOWER[0], TOWER[1], AXIS)
    A = ax.ang
    root = L.empty('Muenster')
    tower = L.empty('Turm', root)
    nave = L.empty('Langhaus', root)

    def wall_windows(name, a0, a1, b, z, w, h, spacing, parent, arch='pointed', outward=1, margin=2.0, mull=True):
        p0 = ax.p(a0, b) if outward < 0 else ax.p(a1, b)
        p1 = ax.p(a1, b) if outward < 0 else ax.p(a0, b)
        L.facade(name, p0, p1, glass, sand_d, parent, floors=1, spacing=spacing, win_w=w, win_h=h, z_start=z,
                 margin=margin, arch=arch, sill=(sand_d, 0.25), mullion=mull)

    def pinnacle(name, x, y, z, r, h, parent, rot=0.0):
        L.prism(name + '_b', (x, y, z), r, h * 0.35, 4, sand_d, parent, rot=rot + math.pi / 4)
        L.prism(name + '_s', (x, y, z + h * 0.35), r * 1.05, h * 0.65, 4, sand_d, parent, radius_top=0.03, rot=rot + math.pi / 4)
        # Krabben
        for k in range(3):
            zz = z + h * (0.45 + 0.17 * k)
            rr = r * (1 - (0.1 + 0.25 * k))
            for j in range(4):
                a = rot + j * math.pi / 2 + math.pi / 4
                L.box(f'{name}_k{k}{j}', (x + math.cos(a) * rr, y + math.sin(a) * rr, zz), (0.18, 0.18, 0.18), sand_d, parent, rot_z=a)

    # ---------------- Turm
    S = 15.0
    L.abox('t_base', ax, 0, 0, 24, (S, S, 52), sand, tower)
    tp = L.rect_pts(*ax.p(0, 0), S, S, A)
    for i in range(4):
        q0, q1 = tp[i], tp[(i + 1) % 4]
        L.facade(f't_win_hi{i}', q0, q1, glass, sand_d, tower, spacing=5.0, win_w=1.7, win_h=7.5, z_start=36,
                 margin=4.5, arch='pointed', sill=(sand_d, 0.3))
        L.facade(f't_win_mid{i}', q0, q1, glass, sand_d, tower, spacing=5.0, win_w=1.3, win_h=4.5, z_start=24,
                 margin=5.5, arch='pointed', sill=(sand_d, 0.3))
    # Eckstrebepfeiler mit Rücksprüngen + Fialen
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k, (h0, h1, s) in enumerate(((0, 20, 2.6), (20, 36, 2.2), (36, 48, 1.8))):
                L.abox(f't_bt{sx}{sy}{k}', ax, sx * (S / 2 + 0.5), sy * (S / 2 + 0.5), (h0 + h1) / 2, (s, s, h1 - h0), sand, tower)
                L.abox(f't_bts{sx}{sy}{k}', ax, sx * (S / 2 + 0.5), sy * (S / 2 + 0.5), h1 + 0.15, (s + 0.3, s + 0.3, 0.3), sand_d, tower)
            c = ax.p(sx * (S / 2 + 0.5), sy * (S / 2 + 0.5))
            pinnacle(f't_pin{sx}{sy}', c[0], c[1], 48, 1.1, 9, tower, rot=A)
    # Galerie mit Balustrade
    L.abox('t_gallery', ax, 0, 0, 50.6, (S + 2.6, S + 2.6, 1.0), sand_d, tower)
    gp = L.rect_pts(*ax.p(0, 0), S + 2.4, S + 2.4, A)
    for i in range(4):
        L.railing(f't_bal{i}', gp[i], gp[(i + 1) % 4], 51.1, 1.1, 0.7, sand_d, tower, post=0.18)
    # Hauptportal (gestuft)
    for k in range(5):
        w = 7.0 - k * 0.9
        L.abox(f't_portal{k}', ax, -S / 2 - 0.9 + k * 0.2, 0, 4.5 + (5 - k) * 0.4, (0.25, w, 9.0 + (5 - k) * 0.8), sand_d if k % 2 == 0 else sand, tower)
    L.abox('t_door', ax, -S / 2 - 0.05, 0, 3.0, (0.12, 3.4, 6.0), dark, tower)
    L.gable_wall('t_wimperg', ax.p(-S / 2 - 1.0, 0), 7.4, 13.0, 13.0, 18.5, 0.4, A, sand_d, tower)
    # Achteck 1 + 2
    c = ax.p(0, 0)
    rot8 = A + math.pi / 8
    for k_, (z0, h, R) in enumerate(((51.5, 14.5, 6.6), (67.0, 12.0, 5.9))):
        L.prism(f't_oct{k_}', (*c, z0), R, h, 8, sand, tower, rot=rot8)
        ap = R * math.cos(math.pi / 8)
        for j in range(8):
            a = A + j * math.pi / 4
            nrm = Vector((math.cos(a), math.sin(a), 0))
            base = (c[0] + nrm.x * ap, c[1] + nrm.y * ap, z0 + 1.5)
            L.window(f't_ow{k_}_{j}', base, a + math.pi / 2, nrm, 1.5 if k_ == 0 else 1.2, h - 4.0, glass, sand_d, tower,
                     arch='pointed', depth=0.1)
            # Fialen an den Ecken
            ac = A + j * math.pi / 4 + math.pi / 8
            pinnacle(f't_of{k_}_{j}', c[0] + math.cos(ac) * (R + 0.3), c[1] + math.sin(ac) * (R + 0.3), z0 + h - 1.5, 0.45, 5.0, tower, rot=ac)
        L.prism(f't_ogal{k_}', (*c, z0 + h), R + 0.8, 0.8, 8, sand_d, tower, rot=rot8)
    # Spitzhelm mit Krabben
    L.prism('t_spire', (*c, 79.8), 5.5, 19.6, 8, sand, tower, radius_top=0.3, rot=rot8)
    for j in range(8):
        a = A + j * math.pi / 4 + math.pi / 8
        for k in range(10):
            t = (k + 0.5) / 10
            r = 5.5 * (1 - t) + 0.3 * t + 0.15
            L.box(f't_crk{j}_{k}', (c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, 79.8 + 19.6 * t), (0.45, 0.25, 0.3), sand_d, tower, rot_z=a)
    L.prism('t_finial', (*c, 99.3), 0.4, 1.3, 8, gold, tower, radius_top=0.06)

    # ---------------- Langhaus
    a0, a1 = S / 2, S / 2 + 44.0
    mid, ln = (a0 + a1) / 2, a1 - a0
    NW, AW = 12.0, 8.5
    L.abox('n_clerestory', ax, mid, 0, 12.5, (ln, NW, 25), sand, nave)
    L.gable_roof('n_roof', ax.p(a0, 0), ax.p(a1 + 1, 0), NW + 1.4, 25.0, 37.0, roof, sand, nave, overhang=0.3)
    L.abox('n_cornice', ax, mid, 0, 24.9, (ln, NW + 0.8, 0.4), sand_d, nave)
    for side in (-1, 1):
        b_wall = side * NW / 2
        wall_windows(f'n_clw{side}', a0 + 1, a1 - 1, b_wall, 16.5, 2.2, 6.5, 6.2, nave, outward=-side)
        b = side * (NW / 2 + AW / 2)
        L.abox(f'n_aisle{side}', ax, mid, b, 6.5, (ln, AW, 13), sand, nave)
        wall_windows(f'n_aw{side}', a0 + 1, a1 - 1, side * (NW / 2 + AW), 2.5, 2.4, 7.2, 6.2, nave, outward=-side)
        L.abox(f'n_aisle_roof{side}', ax, mid, side * (NW / 2 + AW / 2), 15.3, (ln, AW + 1.4, 0.5), roof, nave)
        L.abox(f'n_aisle_cor{side}', ax, mid, side * (NW / 2 + AW + 0.3), 13.2, (ln, 0.6, 0.4), sand_d, nave)
        L.railing(f'n_aisle_bal{side}', ax.p(a0, side * (NW / 2 + AW + 0.3)), ax.p(a1, side * (NW / 2 + AW + 0.3)), 13.4, 0.9, 0.6, sand_d, nave, post=0.14)
        # Strebepfeiler, Fialen, Strebebögen
        for i in range(8):
            a = a0 + 0.2 + i * (ln - 0.4) / 7
            bo = side * (NW / 2 + AW + 1.0)
            for k, (h0, h1, s) in enumerate(((0, 9, 2.2), (9, 16, 1.8))):
                L.abox(f'n_bt{side}_{i}_{k}', ax, a, bo, (h0 + h1) / 2, (1.6, s, h1 - h0), sand, nave)
            p = ax.p(a, bo)
            pinnacle(f'n_fial{side}_{i}', p[0], p[1], 16, 0.8, 6.5, nave, rot=A)
            L.beam_between(f'n_fly{side}_{i}', ax.p3(a, bo * 0.98, 15.0), ax.p3(a, side * (NW / 2 + 0.3), 22.0), 0.8, sand_d, nave)
            L.beam_between(f'n_fly2{side}_{i}', ax.p3(a, bo * 0.98, 16.2), ax.p3(a, side * (NW / 2 + 0.3), 23.2), 0.35, sand_d, nave)

    # ---------------- Chor mit 5/8-Schluss
    c0, cl, CW = a1, 16.0, 12.5
    L.abox('c_body', ax, c0 + cl / 2, 0, 12.5, (cl, CW, 25), sand, nave)
    for side in (-1, 1):
        wall_windows(f'c_w{side}', c0 + 1, c0 + cl - 1, side * CW / 2, 5.0, 2.4, 14.0, 6.0, nave, outward=-side)
    L.gable_roof('c_roof', ax.p(c0, 0), ax.p(c0 + cl, 0), CW + 1.4, 25.0, 36.0, roof_c, sand, nave, overhang=0.0)
    cc = ax.p(c0 + cl, 0)
    Ra = CW / 2 / math.cos(math.pi / 8)
    L.prism('c_apse', (*cc, 0), Ra, 25, 8, sand, nave, rot=A + math.pi / 8)
    L.prism('c_apse_roof', (*cc, 25), Ra + 0.6, 11, 8, roof_c, nave, radius_top=0.05, rot=A + math.pi / 8)
    ap = CW / 2
    for k in range(5):
        a = A - math.pi / 2 + k * math.pi / 4
        nrm = Vector((math.cos(a), math.sin(a), 0))
        base = (cc[0] + nrm.x * ap, cc[1] + nrm.y * ap, 5.0)
        L.window(f'c_aw{k}', base, a + math.pi / 2, nrm, 2.2, 14.0, glass, sand_d, nave, arch='pointed', depth=0.12)
        ab = a + math.pi / 8
        p = (cc[0] + math.cos(ab) * (Ra + 0.9), cc[1] + math.sin(ab) * (Ra + 0.9))
        L.box(f'c_buttr{k}', (*p, 10), (2.0, 1.4, 20), sand, nave, rot_z=ab)
        pinnacle(f'c_fial{k}', p[0], p[1], 20, 0.75, 6.0, nave, rot=ab)
    # Dachreiter
    p = ax.p(a1 - 1, 0)
    L.prism('n_ridge_turret', (*p, 35.5), 1.0, 4.0, 8, sand_d, nave)
    L.prism('n_ridge_spire', (*p, 39.5), 1.2, 6.0, 8, roof_c, nave, radius_top=0.05)
    L.prism('n_ridge_tip', (*p, 45.5), 0.12, 1.0, 6, gold, nave)

    L.merge_children(tower)
    L.merge_children(nave)
    c = ax.p(36, 0)
    L.hide_box('Hide_muenster', (*c, 50), (90, NW + 2 * AW + 8, 110), rot_z=A)
