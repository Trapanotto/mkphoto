# Berner Münster: Westturm 100 m, dreischiffiges Langhaus, polygonaler Chor.
# Lage aus swissBUILDINGS3D: Turmmitte (3.3, -15.9), Achse 2.1° ab Ost, Gesamtlänge ~84 m.
import math

TOWER = (3.3, -15.9)
AXIS = 2.1


def build(L):
    sand = L.material('mu_sand', L.tex_masonry('mu_sand', (0.56, 0.57, 0.49), var=0.07, mortar=(0.62, 0.62, 0.56),
                                                  rows=10, mean_w=2.6, jitter=0.25, rough_rows=False, seed=41, hue=(0.02, 0.04, 0.0)),
                      rough=0.9, meters=5.0)
    sand_w = L.material('mu_sand_win', L.tex_window_facade('mu_sand_win', base=(0.56, 0.57, 0.49), win=(0.10, 0.12, 0.18),
                                                              frame=(0.60, 0.60, 0.53), cols=1, rows=1, wx=(0.3, 0.7), wy=(0.12, 0.85),
                                                              arch=True, seed=42), rough=0.9, meters=7.0)
    roof = L.material('mu_roof', L.tex_roof_tiles('mu_roof', (0.36, 0.27, 0.22), rows=24, cols=14, seed=43, aged=0.3), rough=0.75, meters=3.0)
    roof_c = L.material('mu_roof_col', L.tex_roof_tiles('mu_roof_col', (0.30, 0.40, 0.30), rows=24, cols=14, seed=44, aged=0.5), rough=0.6, meters=3.0)
    dark = L.material('mu_dark', None, color=(0.05, 0.06, 0.07), rough=0.6)
    metal = L.material('mu_metal', None, color=(0.55, 0.48, 0.30), rough=0.35, metal=0.9)

    ax = L.Axis(TOWER[0], TOWER[1], AXIS)
    root = L.empty('Muenster')
    tower = L.empty('Turm', root)
    nave = L.empty('Langhaus', root)

    # ---------- Turm
    S = 15.0
    L.abox('t_base', ax, 0, 0, 24, (S, S, 52), sand_w, tower)
    for sx in (-1, 1):
        for sy in (-1, 1):  # Strebepfeiler an den Ecken
            L.abox(f't_buttr{sx}{sy}', ax, sx * (S / 2 + 0.6), sy * (S / 2 + 0.6), 22, (2.2, 2.2, 48), sand, tower)
            c = ax.p(sx * (S / 2 + 0.6), sy * (S / 2 + 0.6))
            L.prism(f't_pin{sx}{sy}', (*c, 46), 1.3, 9, 4, sand, tower, radius_top=0.05, rot=ax.ang + math.pi / 4)
    L.abox('t_gallery', ax, 0, 0, 50.6, (S + 2.4, S + 2.4, 1.2), sand, tower)
    # Hauptportal (Westseite)
    L.abox('t_portal', ax, -S / 2 - 0.05, 0, 6, (0.2, 6.5, 11), dark, tower)
    # Achteck
    c = ax.p(0, 0)
    L.prism('t_oct1', (*c, 51), 6.6, 15, 8, sand_w, tower, rot=ax.ang + math.pi / 8)
    L.prism('t_oct_gal', (*c, 66), 7.4, 1.0, 8, sand, tower, rot=ax.ang + math.pi / 8)
    L.prism('t_oct2', (*c, 67), 5.9, 12, 8, sand_w, tower, rot=ax.ang + math.pi / 8)
    L.prism('t_oct_gal2', (*c, 79), 6.6, 0.9, 8, sand, tower, rot=ax.ang + math.pi / 8)
    for k in range(8):  # Fialen am Achteck
        a = ax.ang + math.pi / 8 + k * math.pi / 4
        p = (c[0] + math.cos(a) * 6.4, c[1] + math.sin(a) * 6.4)
        L.prism(f't_ofial{k}', (*p, 66.5), 0.6, 7, 4, sand, tower, radius_top=0.04)
        p = (c[0] + math.cos(a) * 5.8, c[1] + math.sin(a) * 5.8)
        L.prism(f't_ofial2_{k}', (*p, 79.5), 0.5, 6, 4, sand, tower, radius_top=0.04)
    # Spitzhelm bis 100.6 m
    L.prism('t_spire', (*c, 80), 5.4, 19.4, 8, sand, tower, radius_top=0.25, rot=ax.ang + math.pi / 8)
    L.prism('t_finial', (*c, 99.4), 0.35, 1.2, 8, metal, tower, radius_top=0.05)

    # ---------- Langhaus (Mittelschiff + Seitenschiffe)
    a0, a1 = S / 2, S / 2 + 44.0
    mid = (a0 + a1) / 2
    ln = a1 - a0
    NW = 12.0      # Mittelschiff Breite
    AW = 8.5       # Seitenschiff Breite
    L.abox('n_clerestory', ax, mid, 0, 12.5, (ln, NW, 25), sand_w, nave)
    L.gable_roof('n_roof', ax.p(a0, 0), ax.p(a1 + 2, 0), NW + 1.4, 25.0, 37.0, roof, sand, nave, overhang=0.3)
    for side in (-1, 1):
        b = side * (NW / 2 + AW / 2)
        L.abox(f'n_aisle{side}', ax, mid, b, 6.5, (ln, AW, 13), sand_w, nave)
        # Pultdach Seitenschiff
        bb = side * (NW / 2 + AW + 0.6)
        p0 = ax.p3(a0, bb, 13.0)
        L.beam_between(f'n_aisle_roof_edge{side}', ax.p3(a0, bb, 13.1), ax.p3(a1, bb, 13.1), 0.3, sand, nave)
        L.abox(f'n_aisle_roof{side}', ax, mid, side * (NW / 2 + AW / 2), 15.5, (ln, AW + 1.4, 0.4), roof, nave)
        # Strebepfeiler mit Strebebögen und Fialen
        for i in range(7):
            a = a0 + 3 + i * (ln - 6) / 6
            bo = side * (NW / 2 + AW + 1.0)
            L.abox(f'n_buttr{side}_{i}', ax, a, bo, 8.5, (1.6, 2.2, 17), sand, nave)
            p = ax.p(a, bo)
            L.prism(f'n_fial{side}_{i}', (*p, 17), 0.9, 6.0, 4, sand, nave, radius_top=0.04, rot=ax.ang + math.pi / 4)
            L.beam_between(f'n_fly{side}_{i}', ax.p3(a, bo, 15.0), ax.p3(a, side * (NW / 2 + 0.3), 21.5), 0.8, sand, nave)

    # ---------- Chor mit 5/8-Schluss
    c0 = a1
    cl = 16.0
    CW = 12.5
    L.abox('c_body', ax, c0 + cl / 2, 0, 12.5, (cl, CW, 25), sand_w, nave)
    L.gable_roof('c_roof', ax.p(c0, 0), ax.p(c0 + cl, 0), CW + 1.4, 25.0, 36.0, roof_c, sand, nave, overhang=0.0)
    cc = ax.p(c0 + cl, 0)
    L.prism('c_apse', (*cc, 0), CW / 2 / math.cos(math.pi / 8), 25, 8, sand_w, nave, rot=ax.ang + math.pi / 8)
    L.prism('c_apse_roof', (*cc, 25), CW / 2 / math.cos(math.pi / 8) + 0.6, 11, 8, roof_c, nave, radius_top=0.05, rot=ax.ang + math.pi / 8)
    for k in range(5):
        a = ax.ang - math.pi / 2 + (k + 0.5) * math.pi / 5 + 0.0
        p = (cc[0] + math.cos(a) * 8.6, cc[1] + math.sin(a) * 8.6)
        L.box(f'c_buttr{k}', (*p, 10), (2.0, 1.5, 20), sand, nave, rot_z=a)
        L.prism(f'c_fial{k}', (*p, 20), 0.8, 5.5, 4, sand, nave, radius_top=0.04, rot=a + math.pi / 4)
    # Dachreiter über der Vierung
    p = ax.p(a1 - 1, 0)
    L.prism('n_ridge_turret', (*p, 36.0), 1.0, 4.0, 8, sand, nave)
    L.prism('n_ridge_spire', (*p, 40.0), 1.2, 6.0, 8, metal, nave, radius_top=0.05)

    L.merge_children(tower)
    L.merge_children(nave)

    # swisstopo-Münster ausblenden
    c = ax.p(36, 0)
    L.hide_box('Hide_muenster', (*c, 50), (90, NW + 2 * AW + 8, 110), rot_z=ax.ang)
