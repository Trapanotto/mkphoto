# Bundeshaus Bern (Parlamentsgebäude, 1902): Neorenaissance, Kuppel 64 m.
# Lage aus swissBUILDINGS3D: Zentrum (17.8, -13.2), Längsachse Nord-Süd, 72 x 58 m, Kuppel bei (18.2, -6).
import math

CENTER = (17.8, -13.2)
AXIS = -78.8 + 180  # Achse zeigt nach Norden (a > 0 = Bundesplatz)


def build(L):
    sand = L.material('bh_sand', L.tex_masonry('bh_sand', (0.55, 0.57, 0.50), var=0.05, mortar=(0.66, 0.66, 0.60),
                                                  rows=12, mean_w=3.2, jitter=0.15, rough_rows=False, seed=51, hue=(0.03, 0.04, 0.01)),
                      rough=0.85, meters=6.0)
    facade = L.material('bh_facade', L.tex_window_facade('bh_facade', base=(0.55, 0.57, 0.50), win=(0.08, 0.10, 0.13),
                                                           frame=(0.70, 0.69, 0.62), cols=1, rows=1, wx=(0.3, 0.7), wy=(0.2, 0.78),
                                                           arch=True, seed=52), rough=0.85, meters=4.6)
    granite = L.material('bh_granite', L.tex_masonry('bh_granite', (0.42, 0.42, 0.40), rows=6, mean_w=2.5, rough_rows=False, seed=53),
                         rough=0.8, meters=4.0)
    copper = L.material('bh_copper', L.tex_copper('bh_copper', seed=54), rough=0.55, metal=0.2, meters=6.0)
    slate = L.material('bh_slate', L.tex_roof_tiles('bh_slate', (0.24, 0.25, 0.27), rows=26, cols=16, seed=55, aged=0.1), rough=0.6, meters=3.0)
    gold = L.material('bh_gold', None, color=(0.85, 0.66, 0.25), rough=0.25, metal=1.0)
    dark = L.material('bh_dark', None, color=(0.05, 0.05, 0.06), rough=0.5)

    ax = L.Axis(CENTER[0], CENTER[1], AXIS)
    root = L.empty('Bundeshaus')
    main = L.empty('Parlament', root)
    cup = L.empty('Kuppel', root)

    LEN, WID = 64.0, 54.0
    H = 24.0
    # Sockel + Hauptbaukörper
    L.abox('plinth', ax, 0, 0, -8, (LEN + 2, WID + 2, 19), granite, main)
    L.abox('body', ax, 0, 0, H / 2, (LEN, WID, H), facade, main)
    L.abox('cornice', ax, 0, 0, H + 0.4, (LEN + 1.2, WID + 1.2, 0.8), sand, main)
    # Eckpavillons
    P = 15.0
    for sa in (-1, 1):
        for sb in (-1, 1):
            a, b = sa * (LEN / 2 - P / 2 + 1), sb * (WID / 2 - P / 2 + 1)
            L.abox(f'pav{sa}{sb}', ax, a, b, (H + 4) / 2, (P, P, H + 4), facade, main)
            L.abox(f'pav_cor{sa}{sb}', ax, a, b, H + 4.3, (P + 1, P + 1, 0.7), sand, main)
            c = ax.p(a, b)
            L.hip_roof(f'pav_roof{sa}{sb}', (*c, 0), P, P, H + 4.6, 6.5, copper, main, rot=ax.ang, ridge_frac=0.25, overhang=0.3)
    # Dächer zwischen den Pavillons (Walm, Schiefer)
    c = ax.p(0, 0)
    L.hip_roof('roof_main', (*c, 0), LEN - 6, WID - 6, H + 0.8, 7.5, slate, main, rot=ax.ang, ridge_frac=0.3, overhang=0.0)

    # Nordfassade (Bundesplatz): Mittelrisalit mit Säulen und Giebel
    a_n = LEN / 2
    L.abox('n_risalit', ax, a_n + 1.5, 0, (H + 6) / 2, (3, 26, H + 6), sand, main)
    for i in range(6):
        b = -10 + i * 4
        c = ax.p(a_n + 4.2, b)
        L.prism(f'n_col{i}', (*c, 4.5), 0.75, 15, 12, sand, main)
        L.abox(f'n_cap{i}', ax, a_n + 4.2, b, 19.8, (2, 2, 0.8), sand, main)
    L.abox('n_entabl', ax, a_n + 4.2, 0, 21.2, (2.8, 24, 2.2), sand, main)
    L.abox('n_steps', ax, a_n + 5.5, 0, 0.8, (5, 22, 3.2), granite, main)
    # Giebel (Dreieck) über dem Risalit
    p0 = ax.p(a_n + 5.6, 0)
    p1 = ax.p(a_n - 1.0, 0)
    L.gable_wall('n_pediment', ax.p(a_n + 4.6, 0), 25, 22.3, 22.3, 28.5, 3.4, ax.ang, sand, main)
    L.abox('n_door', ax, a_n + 3.05, 0, 7, (0.2, 6, 8), dark, main)
    # Statuengruppe auf dem Giebel (vereinfacht)
    L.abox('n_statue', ax, a_n + 4.0, 0, 29.6, (1.6, 3.0, 2.2), sand, main)

    # Südfassade (Aare): Mittelbau mit Kolonnade
    a_s = -LEN / 2
    L.abox('s_risalit', ax, a_s - 1.5, 0, (H + 4) / 2, (3, 30, H + 4), facade, main)
    for i in range(8):
        b = -12.25 + i * 3.5
        c = ax.p(a_s - 3.6, b)
        L.prism(f's_col{i}', (*c, 9), 0.6, 11, 12, sand, main)
    L.abox('s_balcony', ax, a_s - 3.6, 0, 8.6, (4.4, 30, 0.8), sand, main)
    L.abox('s_entabl', ax, a_s - 3.6, 0, 20.6, (3.2, 30, 1.6), sand, main)
    L.abox('s_terrace', ax, a_s - 6, 0, -12, (10, 64, 24), sand, main)
    L.abox('s_balustrade', ax, a_s - 10.6, 0, 0.6, (0.6, 64, 1.2), sand, main)

    # ---------- Kuppel (Tambour, Kuppel, Laterne)
    cc = (18.2, -6.0)
    L.prism('drum_base', (*cc, H + 2), 12.5, 3, 16, sand, cup)
    L.prism('drum', (*cc, H + 5), 11.2, 9, 16, facade, cup)
    L.prism('drum_cor', (*cc, H + 14), 12.0, 1.0, 16, sand, cup)
    for k in range(16):  # Säulen am Tambour
        a = k * math.tau / 16
        p = (cc[0] + math.cos(a) * 11.7, cc[1] + math.sin(a) * 11.7)
        L.prism(f'drum_col{k}', (*p, H + 5), 0.4, 9, 8, sand, cup)
    L.dome('dome', cc, 11.6, H + 15, 16.5, copper, cup, sides=32, rings=10)
    for k in range(16):  # Rippen
        a = k * math.tau / 16
        pts = []
        for j in range(9):
            t = j / 8 * math.pi / 2 * 0.92
            r = 11.75 * math.cos(t)
            pts.append((cc[0] + math.cos(a) * r, cc[1] + math.sin(a) * r, H + 15 + 16.6 * math.sin(t)))
        for j in range(8):
            L.beam_between(f'rib{k}_{j}', pts[j], pts[j + 1], 0.35, sand, cup)
    L.prism('lantern', (*cc, H + 31), 2.6, 4.2, 12, sand, cup)
    L.prism('lantern_roof', (*cc, H + 35.2), 3.0, 2.0, 12, copper, cup, radius_top=0.6)
    L.prism('lantern_tip', (*cc, H + 37.2), 0.5, 2.0, 8, gold, cup, radius_top=0.08)
    L.prism('cross_post', (*cc, H + 39.0), 0.12, 1.6, 6, gold, cup)

    L.merge_children(main)
    L.merge_children(cup)
    c = ax.p(0, 0)
    L.hide_box('Hide_parlament', (*c, 35), (LEN + 14, WID + 8, 80), rot_z=ax.ang)
