# Kettenbrücke Aarau (1851): Hängebrücke mit zwei steinernen Torportalen und Eisenketten.
# Lage aus SWISSIMAGE: Brückenachse 122° ab Ost (Süd -> Nord), Ufer zu Ufer ~128 m.
import math

AXIS_DEG = 122.0
SPAN = 104.0          # Abstand der Portale
DECK = 8.5            # Fahrbahn über Wasser
DECK_W = 7.2
PYLON_H = 17.0        # Portalhöhe über Fahrbahn
BACK = 26.0           # Rückverankerung hinter den Portalen


def build(L):
    stone = L.material('ke_stone', L.tex_masonry('ke_stone', (0.66, 0.62, 0.54), var=0.08, mortar=(0.72, 0.70, 0.64),
                                                     rows=9, mean_w=2.8, jitter=0.2, rough_rows=False, seed=31), rough=0.9, meters=4.0)
    stone_d = L.material('ke_stone_dark', L.tex_masonry('ke_stone_dark', (0.52, 0.49, 0.43), rows=6, mean_w=2.0, seed=32), rough=0.95, meters=4.0)
    iron = L.material('ke_iron', None, color=(0.09, 0.10, 0.11), rough=0.55, metal=0.7)
    deck = L.material('ke_deck', L.tex_wood('ke_deck', (0.30, 0.22, 0.15), boards=10, vertical=True, seed=33), rough=0.9, meters=3.0)
    road = L.material('ke_road', L.tex_plaster('ke_road', (0.45, 0.42, 0.38), seed=34, dirt=0.3), rough=0.95, meters=6.0)
    roof = L.material('ke_cap', L.tex_roof_tiles('ke_cap', (0.32, 0.30, 0.30), rows=16, cols=10, seed=35, aged=0.1), rough=0.7, meters=2.0)
    dark = L.material('ke_dark', None, color=(0.04, 0.04, 0.045), rough=0.7)

    ax = L.Axis(0.0, 0.0, AXIS_DEG)
    root = L.empty('Kettenbruecke')
    south = L.empty('PortalSued', root)
    north = L.empty('PortalNord', root)
    span = L.empty('Ketten', root)

    half = SPAN / 2
    # ---------- Fahrbahn
    L.abox('deck', ax, 0, 0, DECK - 0.35, (SPAN + 2 * BACK, DECK_W, 0.5), road, span)
    L.abox('deck_under', ax, 0, 0, DECK - 0.9, (SPAN, DECK_W - 0.6, 0.6), deck, span)
    for side in (-1, 1):
        L.abox(f'girder{side}', ax, 0, side * (DECK_W / 2 - 0.15), DECK - 0.3, (SPAN + 2 * BACK, 0.3, 1.2), iron, span)
        # Geländer
        L.abox(f'rail{side}', ax, 0, side * (DECK_W / 2 - 0.05), DECK + 1.05, (SPAN + 2 * BACK, 0.08, 0.1), iron, span)
        for i in range(int(SPAN / 1.5) + 1):
            a = -half + i * 1.5
            L.abox(f'baluster{side}_{i}', ax, a, side * (DECK_W / 2 - 0.05), DECK + 0.55, (0.05, 0.05, 1.0), iron, span)

    # ---------- Portale (Torbögen)
    def portal(name, a0, parent):
        w_out = DECK_W + 6.5
        depth = 5.0
        z0 = -10.0
        top = DECK + PYLON_H
        # Pfeiler links/rechts
        for side in (-1, 1):
            b = side * (DECK_W / 2 + 1.6)
            L.abox(f'{name}_pier{side}', ax, a0, b, (z0 + top) / 2, (depth, 3.2, top - z0), stone, parent)
            L.abox(f'{name}_plinth{side}', ax, a0, b, z0 + 2.5, (depth + 0.8, 4.0, 5.0 + 3.0), stone_d, parent)
            # Kettensattel
            L.abox(f'{name}_saddle{side}', ax, a0, b, top + 0.6, (2.2, 1.6, 1.2), iron, parent)
        # Sturz über dem Tor mit Gesims
        L.abox(f'{name}_lintel', ax, a0, 0, DECK + 9.5, (depth, DECK_W + 0.2, 3.0), stone, parent)
        L.abox(f'{name}_attic', ax, a0, 0, top - 2.5, (depth - 0.4, w_out - 0.8, 5.0), stone, parent)
        L.abox(f'{name}_cornice', ax, a0, 0, top - 0.1, (depth + 0.8, w_out + 0.4, 0.6), stone_d, parent)
        L.abox(f'{name}_cornice2', ax, a0, 0, DECK + 11.1, (depth + 0.5, w_out + 0.2, 0.4), stone_d, parent)
        # Bogen-Andeutung (Torbogen als Rundung aus Segmenten)
        r = DECK_W / 2
        for k in range(7):
            t = math.pi * (k + 0.5) / 7
            b = -math.cos(t) * r
            z = DECK + 6.0 + math.sin(t) * 2.4
            L.abox(f'{name}_arch{k}', ax, a0, b, z + 0.6, (depth + 0.05, r * 0.48, 1.0), stone_d, parent)
        # Fundament im Wasser / Ufer
        L.abox(f'{name}_found', ax, a0, 0, z0 + 1.5, (depth + 3, w_out + 1.5, 6), stone_d, parent)
        # kleine Zeltdächer auf den Pfeilern
        for side in (-1, 1):
            c = ax.p(a0, side * (DECK_W / 2 + 1.6))
            L.hip_roof(f'{name}_cap{side}', (*c, 0), depth, 3.2, top + 0.2, 1.6, roof, parent, rot=ax.ang, ridge_frac=0.3, overhang=0.25)
        # Inschrift-Tafel
        L.abox(f'{name}_plaque', ax, a0 + (depth / 2 + 0.03) * (1 if a0 < 0 else -1), 0, DECK + 13.5, (0.06, 4.0, 1.2), dark, parent)

    portal('PortalSued_body', -half, south)
    portal('PortalNord_body', half, north)

    # Rampen / Widerlager hinter den Portalen bis ins Ufer
    for sgn, par in ((-1, south), (1, north)):
        L.abox(f'abut{sgn}', ax, sgn * (half + BACK / 2 + 2.5), 0, (DECK - 0.6 - 14) / 2, (BACK, DECK_W + 2, DECK - 0.6 + 14), stone_d, par)

    # ---------- Ketten (Parabel) + Hänger
    top = DECK + PYLON_H + 0.6
    sag_low = DECK + 1.4
    for side in (-1, 1):
        b = side * (DECK_W / 2 + 1.6)
        n = 40
        pts = []
        for i in range(n + 1):
            a = -half + SPAN * i / n
            t = a / half
            z = sag_low + (top - sag_low) * t * t
            pts.append((a, z))
        for i in range(n):
            (a0, z0), (a1, z1) = pts[i], pts[i + 1]
            for off in (-0.25, 0.25):  # zwei parallele Kettenstränge
                L.beam_between(f'chain{side}_{i}_{off}', ax.p3(a0, b + off * side, z0 + off), ax.p3(a1, b + off * side, z1 + off),
                               0.28, iron, span)
        # Hänger alle 2.6 m
        for i in range(1, int(SPAN / 2.6)):
            a = -half + i * 2.6
            t = a / half
            z = sag_low + (top - sag_low) * t * t
            if z - DECK < 0.8:
                continue
            L.beam_between(f'hanger{side}_{i}', ax.p3(a, b * 0.86, DECK), ax.p3(a, b, z), 0.06, iron, span)
        # Rückhaltekette zur Verankerung
        for sgn in (-1, 1):
            a0 = sgn * half
            a1 = sgn * (half + BACK)
            L.beam_between(f'backstay{side}_{sgn}', ax.p3(a0, b, top), ax.p3(a1, b, DECK + 0.5), 0.35, iron, span)
            L.abox(f'anchor{side}_{sgn}', ax, a1, b, DECK + 0.2, (2.0, 2.0, 1.6), stone, span)

    L.merge_children(south)
    L.merge_children(north)
    L.merge_children(span)

    # swisstopo-Objekte im Brückenbereich ausblenden
    c = ax.p(0, 0)
    L.hide_box('Hide_bridge', (*c, 10), (SPAN + 2 * BACK + 10, DECK_W + 14, 40), rot_z=ax.ang)
