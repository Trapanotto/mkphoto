# Bundeshaus Bern, Parlamentsgebäude (Detailstufe 2). Neorenaissance, Kuppel 64 m.
# Lage aus swissBUILDINGS3D: Zentrum (17.8, -13.2), Längsachse Nord-Süd, 72 x 58 m, Kuppel bei (18.2, -6).
import math
from mathutils import Vector

CENTER = (17.8, -13.2)
AXIS = -78.8 + 180  # a > 0 zeigt zum Bundesplatz (Norden)


def build(L):
    sand = L.mat('sandstone_light', (0.62, 0.62, 0.55), meters=3.5)
    sand_d = L.mat('sandstone_detail', (0.66, 0.66, 0.60), meters=2.5)
    granite = L.mat('granite', (0.42, 0.42, 0.40), meters=3.0)
    copper = L.mat('copper', (0.35, 0.58, 0.50), meters=3.0, metal=0.2)
    slate = L.mat('roof_slate', (0.25, 0.26, 0.28), meters=2.2)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    gold = L.mat('gold', (0.85, 0.66, 0.25), rough=0.25, metal=1.0)
    dark = L.mat('dark', (0.05, 0.05, 0.06))

    ax = L.Axis(CENTER[0], CENTER[1], AXIS)
    A = ax.ang
    root = L.empty('Bundeshaus')
    main = L.empty('Parlament', root)
    cup = L.empty('Kuppel', root)

    LEN, WID, H = 64.0, 54.0, 24.0
    WIN = dict(floors=3, floor_h=6.6, z_start=1.6, spacing=3.6, win_w=1.5, win_h=3.2, margin=2.0,
               sill=(sand_d, 0.3), lintel=(sand_d, 0.25, 'pediment'))

    def block(name, a, b, la, lb, h, parent, win=True, roof=None, roof_h=0, rt='hip'):
        cx, cy = ax.p(a, b)
        L.building(name, cx, cy, la, lb, -8, h, A, sand, parent, roof=roof, roof_h=roof_h, roof_type=rt,
                   glass=glass if win else None, frame=sand_d, win=WIN if win else None,
                   cornice=(sand_d, 0.6), plinth=(granite, 1.4))
        # Gurtgesimse zwischen den Geschossen
        for z in (7.9, 14.5):
            L.abox(f'{name}_belt{z}', ax, a, b, z, (la + 0.5, lb + 0.5, 0.35), sand_d, parent)
        # Pilaster an den Ecken
        for sa in (-1, 1):
            for sb in (-1, 1):
                L.abox(f'{name}_pil{sa}{sb}', ax, a + sa * la / 2, b + sb * lb / 2, h / 2, (1.2, 1.2, h), sand_d, parent)

    # Hauptbaukörper (ohne Fenster in der Mitte, die liegen an den Pavillons/Fassaden)
    block('body', 0, 0, LEN, WID, H, main, roof=slate, roof_h=7.5)
    # Eckpavillons, leicht vorspringend und höher
    P = 15.0
    for sa in (-1, 1):
        for sb in (-1, 1):
            a, b = sa * (LEN / 2 - P / 2 + 1.2), sb * (WID / 2 - P / 2 + 1.2)
            block(f'pav{sa}{sb}', a, b, P, P, H + 4, main, roof=copper, roof_h=7.0)
            c = ax.p(a, b)
            L.prism(f'pav_tip{sa}{sb}', (*c, H + 4 + 7.4), 0.25, 2.2, 6, gold, main, radius_top=0.05)

    # ---------- Nordfassade: Portikus mit 6 Säulen, Giebel, Treppe
    a_n = LEN / 2
    L.abox('n_risalit', ax, a_n + 1.2, 0, (H + 7) / 2, (2.4, 27, H + 7), sand, main)
    for i in range(6):
        b = -10 + i * 4
        c = ax.p(a_n + 4.4, b)
        L.prism(f'n_base{i}', (*c, 1.4), 1.0, 0.8, 12, sand_d, main)
        L.prism(f'n_col{i}', (*c, 2.2), 0.8, 15.5, 16, sand, main, radius_top=0.7)
        L.abox(f'n_cap{i}', ax, a_n + 4.4, b, 18.1, (2.1, 2.1, 0.9), sand_d, main)
    L.abox('n_entabl', ax, a_n + 4.4, 0, 19.6, (3.2, 24.5, 2.0), sand_d, main)
    L.abox('n_frieze', ax, a_n + 4.4, 0, 21.0, (3.0, 24.5, 0.8), sand, main)
    L.gable_wall('n_pediment', ax.p(a_n + 4.4, 0), 25.5, 21.4, 21.4, 27.6, 3.2, A, sand_d, main)
    L.gable_wall('n_tympanon', ax.p(a_n + 5.85, 0), 22.0, 21.9, 21.9, 26.8, 0.25, A, sand, main)
    for k, st in enumerate(range(6)):
        L.abox(f'n_step{k}', ax, a_n + 7.5 + k * 0.5, 0, 1.2 - k * 0.22, (2.0, 22 + k, 0.45), granite, main)
    for k in range(3):
        L.abox(f'n_door{k}', ax, a_n + 2.45, -6 + k * 6, 4.2, (0.15, 2.6, 5.4), dark, main)
    # Statuengruppe (vereinfacht) auf dem Giebel
    L.abox('n_statue', ax, a_n + 4.2, 0, 28.8, (1.4, 3.0, 2.4), sand_d, main)
    for s in (-1, 1):
        L.abox(f'n_statue{s}', ax, a_n + 4.2, s * 12, 23.0, (1.0, 1.2, 2.0), sand_d, main)

    # ---------- Südfassade (Aare): Mittelbau mit Kolonnade + Bundesterrasse
    a_s = -LEN / 2
    L.abox('s_risalit', ax, a_s - 1.4, 0, (H + 4) / 2, (2.8, 30, H + 4), sand, main)
    for i in range(9):
        b = -13.6 + i * 3.4
        c = ax.p(a_s - 3.6, b)
        L.prism(f's_col{i}', (*c, 8.6), 0.55, 11.5, 16, sand, main, radius_top=0.48)
        L.abox(f's_cap{i}', ax, a_s - 3.6, b, 20.3, (1.4, 1.4, 0.6), sand_d, main)
    L.abox('s_balcony', ax, a_s - 3.6, 0, 8.3, (4.4, 31, 0.6), sand_d, main)
    L.railing('s_bal_rail', ax.p(a_s - 5.6, -15.5), ax.p(a_s - 5.6, 15.5), 8.6, 1.0, 0.5, sand_d, main, post=0.16)
    L.abox('s_entabl', ax, a_s - 3.6, 0, 21.4, (3.2, 31, 1.6), sand_d, main)
    L.facade('s_risalit_win', ax.p(a_s - 2.81, 15), ax.p(a_s - 2.81, -15), glass, sand_d, main, floors=2, floor_h=7.0,
             z_start=9.6, spacing=3.4, win_w=1.6, win_h=4.2, margin=1.8, arch='round', sill=(sand_d, 0.3))
    L.abox('s_terrace', ax, a_s - 6, 0, -12, (10, 64, 24), sand, main)
    L.railing('s_terr_rail', ax.p(a_s - 10.8, -32), ax.p(a_s - 10.8, 32), 0.0, 1.1, 0.6, sand_d, main, post=0.2)

    # ---------- Kuppel: Tambour mit Säulen und Fenstern, gerippte Kupferkuppel, Laterne
    cc = (18.2, -6.0)
    L.prism('drum_base', (*cc, H + 2), 12.6, 3, 24, sand, cup)
    L.prism('drum', (*cc, H + 5), 11.2, 9, 24, sand, cup)
    for k in range(16):
        a = k * math.tau / 16
        p = (cc[0] + math.cos(a) * 11.9, cc[1] + math.sin(a) * 11.9)
        L.prism(f'drum_col{k}', (*p, H + 5), 0.42, 9, 10, sand_d, cup)
        a2 = a + math.tau / 32
        nrm = Vector((math.cos(a2), math.sin(a2), 0))
        base = (cc[0] + nrm.x * 11.1, cc[1] + nrm.y * 11.1, H + 6.6)
        L.window(f'drum_w{k}', base, a2 + math.pi / 2, nrm, 1.4, 5.0, glass, sand_d, cup, arch='round', mullion=False)
    L.prism('drum_cor', (*cc, H + 14), 12.3, 1.0, 24, sand_d, cup)
    L.prism('drum_attic', (*cc, H + 15), 11.6, 1.2, 24, sand, cup)
    L.dome('dome', cc, 11.5, H + 16.2, 15.8, copper, cup, sides=32, rings=12)
    for k in range(16):
        a = k * math.tau / 16
        pts = []
        for j in range(11):
            t = j / 10 * math.pi / 2 * 0.9
            r = 11.62 * math.cos(t)
            pts.append((cc[0] + math.cos(a) * r, cc[1] + math.sin(a) * r, H + 16.2 + 15.9 * math.sin(t)))
        for j in range(10):
            L.beam_between(f'rib{k}_{j}', pts[j], pts[j + 1], 0.32, sand_d, cup)
    for k in range(8):  # Lukarnen in der Kuppel
        a = k * math.tau / 8 + math.tau / 32
        r = 10.4
        p = (cc[0] + math.cos(a) * r, cc[1] + math.sin(a) * r)
        L.box(f'dorm{k}', (*p, H + 21.5), (1.6, 1.4, 1.8), sand_d, cup, rot_z=a)
        L.box(f'dormg{k}', (p[0] + math.cos(a) * 0.71, p[1] + math.sin(a) * 0.71, H + 21.5), (0.04, 0.9, 1.2), glass, cup, rot_z=a)
    L.prism('lantern', (*cc, H + 31.5), 2.6, 4.2, 12, sand, cup)
    for k in range(8):
        a = k * math.tau / 8
        p = (cc[0] + math.cos(a) * 2.7, cc[1] + math.sin(a) * 2.7)
        L.prism(f'lant_col{k}', (*p, H + 31.5), 0.18, 4.2, 6, sand_d, cup)
    L.prism('lantern_roof', (*cc, H + 35.7), 3.0, 2.0, 12, copper, cup, radius_top=0.6)
    L.prism('lantern_tip', (*cc, H + 37.7), 0.5, 2.0, 8, gold, cup, radius_top=0.08)
    L.prism('cross_post', (*cc, H + 39.6), 0.12, 1.6, 6, gold, cup)

    L.merge_children(main)
    L.merge_children(cup)
    c = ax.p(0, 0)
    L.hide_box('Hide_parlament', (*c, 35), (LEN + 14, WID + 8, 80), rot_z=A)
