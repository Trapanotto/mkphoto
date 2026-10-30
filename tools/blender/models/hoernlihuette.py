# Hörnlihütte (3260 m) am Fuss des Matterhorn-Hörnligrats: Neubau 2015 + altes Berghotel aus Stein.
import math


def build(L):
    stone = L.material('ho_stone', L.tex_masonry('ho_stone', (0.50, 0.48, 0.45), var=0.2, mortar=(0.42, 0.41, 0.39),
                                                    rows=12, mean_w=1.5, jitter=0.5, seed=81), rough=1.0, meters=5.0)
    stone_w = L.material('ho_stone_win', L.tex_window_facade('ho_stone_win', base=(0.52, 0.50, 0.47), win=(0.10, 0.12, 0.15),
                                                               frame=(0.80, 0.80, 0.78), cols=3, rows=1, wx=(0.32, 0.68), wy=(0.28, 0.72),
                                                               ashlar=False, seed=82), rough=0.95, meters=7.5)
    clad = L.material('ho_clad', L.tex_window_facade('ho_clad', base=(0.78, 0.77, 0.74), win=(0.08, 0.10, 0.13),
                                                       frame=(0.40, 0.40, 0.40), cols=4, rows=1, wx=(0.25, 0.75), wy=(0.25, 0.75),
                                                       ashlar=False, seed=83), rough=0.7, meters=9.0)
    metal = L.material('ho_metal', None, color=(0.32, 0.33, 0.35), rough=0.45, metal=0.6)
    solar = L.material('ho_solar', None, color=(0.05, 0.07, 0.14), rough=0.15, metal=0.3)
    wood = L.material('ho_wood', L.tex_wood('ho_wood', (0.32, 0.20, 0.11), boards=5, seed=84), rough=0.85, meters=1.5)
    red = L.material('ho_red', None, color=(0.7, 0.05, 0.05), rough=0.6)
    white = L.material('ho_white', None, color=(0.9, 0.9, 0.9), rough=0.6)

    root = L.empty('Huette')
    ang = math.radians(35)   # Ausrichtung entlang des Grats
    ax = L.Axis(0, 0, 35)
    # Fundament (folgt dem Fels)
    L.abox('found', ax, 0, 0, -3.0, (34, 16, 8), stone, root)
    # Neubau (hell, viele Fenster)
    L.abox('new', ax, 6, 0, 6.5, (20, 13, 13), clad, root)
    c = ax.p(6, 0)
    L.hip_roof('new_roof', (*c, 0), 20, 13, 13, 2.2, metal, root, rot=ax.ang, ridge_frac=0.5, overhang=0.6)
    L.abox('solar', ax, 6, -3.2, 14.25, (17, 5.5, 0.15), solar, root)
    # altes Berghotel (Stein)
    L.abox('old', ax, -9, 0, 6.0, (13, 12, 12), stone_w, root)
    L.gable_roof('old_roof', ax.p(-15.5, 0), ax.p(-2.5, 0), 13.4, 12, 15.5, metal, wood, root, overhang=0.6)
    # Terrasse
    L.abox('terrace', ax, 0, 9.5, 0.8, (30, 6, 1.6), wood, root)
    for i in range(11):
        L.abox(f'terr_post{i}', ax, -15 + i * 3, 12.4, 2.1, (0.08, 0.08, 1.1), metal, root)
    L.abox('terr_rail', ax, 0, 12.4, 2.6, (30, 0.08, 0.08), metal, root)
    # Schweizer Fahne
    p = ax.p(-16, 7)
    L.prism('flagpole', (*p, 0), 0.06, 9, 6, white, root)
    L.box('flag', (p[0] + 0.9, p[1], 8.2), (1.6, 0.04, 1.6), red, root)
    L.box('flag_cross_h', (p[0] + 0.9, p[1] + 0.025, 8.2), (1.0, 0.01, 0.32), white, root)
    L.box('flag_cross_v', (p[0] + 0.9, p[1] + 0.025, 8.2), (0.32, 0.01, 1.0), white, root)
    L.merge_children(root)
    L.hide_box('Hide_huette', (0, 0, 10), (45, 30, 40), rot_z=ang)
