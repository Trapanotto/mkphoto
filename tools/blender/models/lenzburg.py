# Schloss Lenzburg: Höhenburg auf dem Schlosshügel, Ringmauer, Palas, Bergfried, Barockgarten im Westen.
# Lage aus swissBUILDINGS3D: Zentrum (-14.6, -2.1), Achse 20.6° ab Ost, 140 x 72 m, höchster First 24 m.
import math

CENTER = (-14.6, -2.1)
AXIS = 20.6


def build(L):
    wall = L.material('le_wall', L.tex_masonry('le_wall', (0.60, 0.57, 0.50), var=0.15, mortar=(0.66, 0.64, 0.58),
                                                  rows=12, mean_w=1.6, jitter=0.45, seed=61), rough=0.95, meters=5.0)
    plaster = L.material('le_plaster', L.tex_window_facade('le_plaster', base=(0.86, 0.83, 0.76), win=(0.10, 0.11, 0.12),
                                                             frame=(0.55, 0.52, 0.48), cols=2, rows=1, wx=(0.36, 0.64), wy=(0.3, 0.75),
                                                             ashlar=False, seed=62), rough=0.9, meters=6.0)
    plaster_p = L.material('le_plain', L.tex_plaster('le_plain', (0.84, 0.81, 0.74), seed=63), rough=0.9, meters=6.0)
    roof = L.material('le_roof', L.tex_roof_tiles('le_roof', (0.50, 0.26, 0.16), rows=20, cols=12, seed=64, aged=0.3), rough=0.8, meters=3.0)
    wood = L.material('le_wood', L.tex_wood('le_wood', (0.30, 0.18, 0.10), boards=4, seed=65), rough=0.85, meters=1.5)
    dark = L.material('le_dark', None, color=(0.05, 0.05, 0.05), rough=0.6)

    ax = L.Axis(CENTER[0], CENTER[1], AXIS)
    root = L.empty('Schloss')
    walls = L.empty('Ringmauer', root)
    bld = L.empty('Gebaeude', root)
    keep = L.empty('Bergfried', root)

    # Ringmauer (oval) – folgt dem Hügelplateau; reicht tief in den Hang
    ring = []
    for k in range(28):
        t = k / 28 * math.tau
        a = 68 * math.cos(t)
        b = 31 * math.sin(t) * (1.0 - 0.18 * max(0, -math.cos(t)))  # Westseite schmaler
        ring.append(ax.p(a, b))
    L.wall_ring('ring', ring, -14.0, 5.0, 1.8, wall, walls)
    # Wehrgang-Abdeckung (Ziegel) auf der Mauer
    for i in range(len(ring)):
        p0, p1 = ring[i], ring[(i + 1) % len(ring)]
        Ls, ang = L.frame_along(p0, p1)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        L.box(f'ring_cap{i}', (*mid, 5.25), (Ls + 1.8, 2.3, 0.5), roof, walls, rot_z=ang)
    # Bastion / Rundtürme an der Mauer
    for t, r in ((0.0, 5.0), (0.62, 4.0), (-0.62, 4.0), (2.7, 4.5), (-2.7, 4.5)):
        p = ax.p(68 * math.cos(t), 31 * math.sin(t))
        L.prism(f'bast{t}', (*p, -14), r, 22, 16, wall, walls)
        L.prism(f'bast_roof{t}', (*p, 8), r + 0.6, 5.5, 16, roof, walls, radius_top=0.05)

    def house(name, a, b, la, lb, h, ridge, mat=plaster, par=bld, hip=False):
        L.abox(name, ax, a, b, (h - 12) / 2, (la, lb, h + 12), mat, par)  # Fundament reicht in den Hang
        if hip:
            c = ax.p(a, b)
            L.hip_roof(name + '_roof', (*c, 0), la, lb, h, ridge - h, roof, par, rot=ax.ang, ridge_frac=0.5, overhang=0.6)
        else:
            L.gable_roof(name + '_roof', ax.p(a - la / 2, b), ax.p(a + la / 2, b), lb + 1.2, h, ridge, roof, wood, par, overhang=0.5)

    # Südflügel: Palas (höchster First 24 m)
    house('palas', 12, -21, 44, 13, 15, 24, hip=True)
    # Landvogtei Ost-Süd
    house('landvogtei', 40, -17, 14, 12, 12.5, 21.5)
    # Ostflügel / Stapferhaus
    house('stapferhaus', 52, 2, 13, 26, 11, 19, hip=True)
    # Nordflügel: Ritterhaus
    house('ritterhaus', 40, 22, 26, 11, 10, 18)
    # Nordwest: Torhaus mit Tor
    house('torhaus', -20, 17, 16, 10, 8, 15)
    L.abox('tor', ax, -20, 22.1, 3.0, (4.0, 0.2, 5.0), dark, bld)
    # Verbindungsbau Nord
    house('nordbau', 14, 22, 24, 9, 9, 16, mat=plaster_p)
    # Treppenturm im Hof
    c = ax.p(26, -8)
    L.prism('treppenturm', (*c, -2), 2.4, 17, 8, plaster_p, bld)
    L.prism('treppenturm_roof', (*c, 15), 3.0, 5, 8, roof, bld, radius_top=0.05)

    # Bergfried (Hauptturm) – quadratisch, Zeltdach
    c = ax.p(60, -14)
    L.abox('bf_body', ax, 60, -14, 4, (11, 11, 32), wall, keep)
    L.abox('bf_top', ax, 60, -14, 20.4, (11.6, 11.6, 0.8), wall, keep)
    L.pyramid_roof('bf_roof', c, 11.0, 11.0, 20.8, 8.0, roof, keep, rot=ax.ang, overhang=0.6)
    for k, (da, db) in enumerate(((5.6, 0), (-5.6, 0), (0, 5.6), (0, -5.6))):
        L.abox(f'bf_win{k}', ax, 60 + da * 1.005, -14 + db * 1.005, 16, (0.12 if da else 1.0, 1.0 if da else 0.12, 1.6), dark, keep)

    # Barockgarten-Terrasse (West): niedrige Stützmauer
    gar = [ax.p(a, b) for a, b in ((-62, -18), (-30, -24), (-30, 20), (-58, 16))]
    L.wall_ring('garden', gar, -3, 1.2, 0.8, wall, walls)

    L.merge_children(walls)
    L.merge_children(bld)
    L.merge_children(keep)
    c = ax.p(0, 0)
    L.hide_box('Hide_schloss', (*c, 15), (150, 80, 60), rot_z=ax.ang)
