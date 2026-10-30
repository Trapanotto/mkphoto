# Faltbare Kameradrohne (ähnlich DJI Air-Klasse), Masse in Metern. Vorne = +y (Nord) in Blender.
import math


def build(L):
    body = L.mat('plastic_grey', (0.55, 0.56, 0.58), meters=0.5, rough=0.5)
    dark = L.mat('plastic_dark', (0.08, 0.08, 0.09), meters=0.5, rough=0.4)
    glass = L.mat('glass', (0.05, 0.06, 0.08), rough=0.1)
    red = L.mat('led_red', (1.0, 0.1, 0.05))
    green = L.mat('led_green', (0.1, 1.0, 0.2))

    root = L.empty('Drohne')
    frame = L.empty('Rumpf', root)
    # Rumpf (gestuft für abgerundete Form)
    L.box('body', (0, 0, 0), (0.09, 0.20, 0.06), body, frame)
    L.box('body_top', (0, -0.01, 0.035), (0.075, 0.16, 0.025), body, frame)
    L.box('body_nose', (0, 0.105, -0.005), (0.07, 0.03, 0.045), body, frame)
    L.box('battery', (0, -0.04, 0.05), (0.06, 0.09, 0.012), dark, frame)
    # Sensoren vorne
    for s in (-1, 1):
        L.box(f'sensor{s}', (s * 0.02, 0.121, 0.005), (0.012, 0.004, 0.012), glass, frame)
    # Arme + Motoren
    arms = [(0.12, 0.10, 1), (-0.12, 0.10, -1), (0.12, -0.10, 1), (-0.12, -0.10, -1)]
    for i, (x, y, s) in enumerate(arms):
        L.beam_between(f'arm{i}', (x * 0.25, y * 0.4, 0.0), (x, y, 0.005), 0.018, dark, frame)
        L.prism(f'motor{i}', (x, y, 0.0), 0.016, 0.025, 12, dark, frame)
        L.prism(f'motorcap{i}', (x, y, 0.025), 0.012, 0.006, 12, body, frame)
        led = red if y > 0 else green
        L.box(f'led{i}', (x, y, -0.008), (0.01, 0.01, 0.006), led, frame)
        # Landebein
        L.box(f'leg{i}', (x * 0.85, y * 0.85, -0.03), (0.008, 0.008, 0.04), dark, frame)
    # Gimbal + Kamera
    L.box('gimbal_yoke', (0, 0.115, -0.04), (0.04, 0.012, 0.03), dark, frame)
    L.box('camera', (0, 0.125, -0.05), (0.03, 0.025, 0.025), dark, frame)
    L.prism('lens', (0, 0.138, -0.05), 0.009, 0.004, 16, glass, frame, rot=0)
    L.merge_children(frame)
    # Propeller einzeln (drehen sich im Spiel)
    for i, (x, y, s) in enumerate(arms):
        p = L.empty(f'Prop{i}', root)
        p.location = (x, y, 0.032)
        L.box(f'blade{i}', (0, 0, 0), (0.15, 0.014, 0.003), dark, p)
        L.prism(f'hub{i}', (0, 0, -0.004), 0.008, 0.008, 8, body, p)
        L.merge_children(p)
