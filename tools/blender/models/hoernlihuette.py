# Hörnlihütte (3260 m, Detailstufe 2): Neubau 2015 (helle Fassade, viele Fenster) + altes Berghotel aus Stein.
import math


def build(L):
    stone = L.mat('stone_wall', (0.50, 0.48, 0.45), meters=3.5)
    rock = L.mat('rock', (0.40, 0.39, 0.37), meters=5.0)
    clad = L.mat('plaster_old', (0.78, 0.77, 0.74), meters=4.0)
    metal = L.mat('metal_roof', (0.32, 0.33, 0.35), meters=2.0, metal=0.5)
    solar = L.mat('solar', (0.05, 0.07, 0.14))
    wood = L.mat('wood_dark', (0.32, 0.20, 0.11), meters=1.5)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    frame = L.mat('frame_white', (0.85, 0.85, 0.82))
    red = L.mat('flag_red', (0.7, 0.05, 0.05))
    white = L.mat('flag_white', (0.9, 0.9, 0.9))

    root = L.empty('Huette')
    ax = L.Axis(0, 0, 35)
    A = ax.ang
    L.abox('found', ax, 0, 0, -4.0, (34, 16, 10), rock, root)
    # Neubau
    cx, cy = ax.p(6, 0)
    L.building('new', cx, cy, 20, 13, -1, 13, A, clad, root, roof=metal, roof_h=2.2, roof_type='hip', glass=glass, frame=frame,
               win=dict(floors=4, floor_h=3.0, z_start=0.8, spacing=2.4, win_w=1.2, win_h=1.5, margin=1.4, mullion=False))
    L.abox('solar', ax, 6, -3.2, 14.3, (17, 5.5, 0.15), solar, root)
    # altes Berghotel
    cx, cy = ax.p(-9, 0)
    L.building('old', cx, cy, 13, 12, -1, 12, A, stone, root, roof=metal, roof_h=3.5, roof_type='gable', glass=glass, frame=frame,
               gable_mat=wood, win=dict(floors=3, floor_h=3.4, z_start=1.0, spacing=2.6, win_w=1.0, win_h=1.4, margin=1.6, sill=(stone, 0.2)))
    # Terrasse mit Geländer
    L.abox('terrace', ax, 0, 9.5, 0.8, (30, 6, 1.6), wood, root)
    L.railing('terr_rail', ax.p(-15, 12.4), ax.p(15, 12.4), 1.6, 1.0, 1.5, metal, root, post=0.07)
    # Schweizer Fahne
    p = ax.p(-16, 7)
    L.prism('flagpole', (*p, 0), 0.06, 9, 6, white, root)
    L.box('flag', (p[0] + 0.9, p[1], 8.2), (1.6, 0.04, 1.6), red, root)
    L.box('flag_cross_h', (p[0] + 0.9, p[1] + 0.025, 8.2), (1.0, 0.01, 0.32), white, root)
    L.box('flag_cross_v', (p[0] + 0.9, p[1] + 0.025, 8.2), (0.32, 0.01, 1.0), white, root)
    L.merge_children(root)
    L.hide_box('Hide_huette', (0, 0, 10), (45, 30, 40), rot_z=A)
