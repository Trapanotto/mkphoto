# MKPHOTO – Detail-Bausteine (v2): Fenster, Fassaden, Baukörper, Sparren, Blumen.
# Materialien werden zur Laufzeit im Spiel mit CC0-Fototexturen belegt (src/materials.js).
# In Blender nur Farbe + Texturmassstab (Meter pro Wiederholung) für die UVs.
import math
import random
import bmesh
from mathutils import Vector, Matrix
import lib
from lib import box, beam_between, gable_roof, gable_wall, hip_roof, pyramid_roof, frame_along, material

_MATS = {}


def mat(key, color=(0.7, 0.7, 0.7), meters=3.0, rough=0.85, metal=0.0):
    if key in _MATS:
        return _MATS[key]
    m = material(key, None, color=color, rough=rough, metal=metal, meters=meters)
    _MATS[key] = m
    return m


def wall_frame(p0, p1):
    L, ang = frame_along(p0, p1)
    d = Vector((math.cos(ang), math.sin(ang), 0))
    n = Vector((d.y, -d.x, 0))  # aussen = rechts der Laufrichtung (Umriss im Uhrzeigersinn)
    return L, ang, d, n


def window(name, base, ang, n, w, h, glass, frame, parent, depth=0.06, arch=None, sill=None, lintel=None, mullion=True):
    """Fenster auf einer Wandfläche: base = Mitte unten (auf Wandoberfläche), n = Normale nach aussen."""
    base = Vector(base)
    dvec = Vector((math.cos(ang), math.sin(ang), 0))
    off = lambda k: base + n * k
    hb = h if not arch else max(0.3, h - w / 2 * (1.35 if arch == 'pointed' else 1.0))
    c = off(0.02)
    box(f'{name}_g', (c.x, c.y, base.z + hb / 2), (w, 0.04, hb), glass, parent, rot_z=ang)
    t = max(0.07, w * 0.08)
    c = off(depth)
    for s in (-1, 1):
        q = c + dvec * (s * (w / 2 + t / 2))
        box(f'{name}_fs{s}', (q.x, q.y, base.z + hb / 2), (t, depth * 2, hb), frame, parent, rot_z=ang)
    if mullion:
        box(f'{name}_fm', (c.x, c.y, base.z + hb / 2), (t * 0.55, depth * 1.5, hb), frame, parent, rot_z=ang)
        box(f'{name}_ft', (c.x, c.y, base.z + hb * 0.64), (w, depth * 1.5, t * 0.55), frame, parent, rot_z=ang)
    if not arch:
        box(f'{name}_fh', (c.x, c.y, base.z + h + t / 2), (w + 2 * t, depth * 2, t), frame, parent, rot_z=ang)
    else:
        r = w / 2
        k = 7
        pts = []
        for i in range(k + 1):
            a = math.pi * i / k
            x = -math.cos(a) * r
            z = math.sin(a) * r * (1.35 if arch == 'pointed' else 1.0)
            if arch == 'pointed':
                z += (1 - abs(x) / r) * r * 0.25 - r * 0.25 * (1 - math.sin(a))
            pts.append((x, z))
        for i in range(k):
            (x0, z0), (x1, z1) = pts[i], pts[i + 1]
            c0 = Vector((c.x, c.y, 0))
            a3 = c0 + dvec * x0 + Vector((0, 0, base.z + hb + z0))
            b3 = c0 + dvec * x1 + Vector((0, 0, base.z + hb + z1))
            beam_between(f'{name}_fa{i}', a3, b3, t, frame, parent)
            g0 = off(0.02) + dvec * ((x0 + x1) / 2)
            zz = max(0.05, min(z0, z1))
            box(f'{name}_ga{i}', (g0.x, g0.y, base.z + hb + zz / 2), (abs(x1 - x0) + 0.03, 0.04, zz), glass, parent, rot_z=ang)
    if sill:
        c = off(sill[1] / 2)
        box(f'{name}_sill', (c.x, c.y, base.z - 0.06), (w + 2 * t + 0.15, sill[1], 0.12), sill[0], parent, rot_z=ang)
    if lintel:
        c = off(lintel[1] / 2)
        top = base.z + h + t + 0.05
        box(f'{name}_lint', (c.x, c.y, top + 0.12), (w + 2 * t + 0.25, lintel[1], 0.24), lintel[0], parent, rot_z=ang)
        if len(lintel) > 2 and lintel[2] == 'pediment':
            gable_wall(f'{name}_ped', (c.x, c.y), w + 2 * t + 0.3, top + 0.24, top + 0.24, top + 0.24 + w * 0.32,
                       lintel[1], ang + math.pi / 2, lintel[0], parent)


def facade(name, p0, p1, glass, frame, parent, floors=1, spacing=3.2, win_w=1.1, win_h=1.6,
           z_start=1.0, floor_h=3.2, margin=1.2, arch=None, sill=None, lintel=None, mullion=True, skip=None, inset=0.0):
    """Fensterreihen auf einer Wand von p0 nach p1 (Wand selbst wird separat gebaut)."""
    L, ang, d, n = wall_frame(p0, p1)
    usable = L - 2 * margin
    if usable < win_w + 0.4:
        return
    cols = max(1, int(usable / spacing) + 1)
    step = usable / (cols - 1) if cols > 1 else 0
    for f in range(floors):
        for i in range(cols):
            if skip and skip(f, i, cols):
                continue
            s = margin + (i * step if cols > 1 else usable / 2)
            b = Vector((p0[0], p0[1], 0)) + d * s + n * inset
            window(f'{name}_w{f}_{i}', (b.x, b.y, z_start + f * floor_h), ang, n, win_w, win_h, glass, frame, parent,
                   arch=arch, sill=sill, lintel=lintel, mullion=mullion)


def rect_pts(cx, cy, la, lb, ang):
    """Rechteck-Ecken im Uhrzeigersinn (Fassaden-Normale zeigt nach aussen)."""
    c, s = math.cos(ang), math.sin(ang)
    loc = [(-la / 2, lb / 2), (la / 2, lb / 2), (la / 2, -lb / 2), (-la / 2, -lb / 2)]
    return [(cx + a * c - b * s, cy + a * s + b * c) for a, b in loc]


def building(name, cx, cy, la, lb, z0, h, ang, wall, parent, roof=None, roof_h=None, roof_type='gable',
             glass=None, frame=None, win=None, cornice=None, quoins=None, plinth=None, sides=(0, 1, 2, 3), gable_mat=None):
    """Baukörper: Wände, Fenster, Gesims, Ecksteine, Dach. la entlang ang, lb quer."""
    box(f'{name}_body', (cx, cy, (z0 + h) / 2), (la, lb, h - z0), wall, parent, rot_z=ang)
    pts = rect_pts(cx, cy, la, lb, ang)
    if plinth:
        box(f'{name}_plinth', (cx, cy, (z0 + plinth[1]) / 2), (la + 0.3, lb + 0.3, plinth[1] - z0), plinth[0], parent, rot_z=ang)
    if win and glass:
        for i in sides:
            facade(f'{name}_f{i}', pts[i], pts[(i + 1) % 4], glass, frame, parent, **win)
    if cornice:
        box(f'{name}_cor', (cx, cy, h - 0.15), (la + 2 * cornice[1], lb + 2 * cornice[1], 0.35), cornice[0], parent, rot_z=ang)
    if quoins:
        for k_, (x, y) in enumerate(pts):
            z = max(z0, 0.0)
            k = 0
            while z < h - 0.5:
                big = k % 2 == 0
                box(f'{name}_q{k_}_{k}', (x, y, z + 0.42), ((0.95, 0.6) if big else (0.6, 0.95)) + (0.84,), quoins, parent, rot_z=ang)
                z += 0.9
                k += 1
    if roof:
        rh = roof_h if roof_h is not None else lb * 0.55
        c, s = math.cos(ang), math.sin(ang)
        if roof_type == 'gable':
            a0 = (cx - la / 2 * c, cy - la / 2 * s)
            a1 = (cx + la / 2 * c, cy + la / 2 * s)
            gable_roof(f'{name}_roof', a0, a1, lb + 1.0, h, h + rh, roof, gable_mat or wall, parent, overhang=0.5)
            for j, p_ in enumerate((a0, a1)):
                gable_wall(f'{name}_gw{j}', p_, lb, h, h, h + rh - 0.15, 0.3, ang, gable_mat or wall, parent)
        elif roof_type == 'hip':
            hip_roof(f'{name}_roof', (cx, cy, 0), la, lb, h, rh, roof, parent, rot=ang,
                     ridge_frac=max(0.02, (la - lb) / la) if la > lb else 0.02, overhang=0.5)
        elif roof_type == 'pyramid':
            pyramid_roof(f'{name}_roof', (cx, cy), la, lb, h, rh, roof, parent, rot=ang, overhang=0.4)


def rafters(name, p0, p1, width, eave_z, spacing, mat_, parent, size=0.12):
    """Sparrenköpfe unter der Traufe (beidseitig)."""
    L, ang, d, n = wall_frame(p0, p1)
    k = int(L / spacing)
    for i in range(k + 1):
        q = Vector((p0[0], p0[1], 0)) + d * (L * i / max(k, 1))
        for s in (-1, 1):
            a = q + n * (s * (width / 2 - 0.9))
            b = q + n * (s * (width / 2 - 0.08))
            beam_between(f'{name}_{i}_{s}', (a.x, a.y, eave_z + 0.32), (b.x, b.y, eave_z - 0.04), size, mat_, parent)


def blobs(name, p0, p1, z, count, radius, mat_, parent, jitter=0.15, seed=1):
    """Blumen/Laub als kleine Kugeln entlang einer Linie (ein Mesh)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for i in range(count):
        t = (i + rnd.random()) / count
        x = p0[0] + (p1[0] - p0[0]) * t + (rnd.random() - 0.5) * jitter
        y = p0[1] + (p1[1] - p0[1]) * t + (rnd.random() - 0.5) * jitter
        r = radius * (0.7 + rnd.random() * 0.6)
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation((x, y, z + rnd.random() * 0.12)))
    return lib._finish(name, bm, [mat_], parent, uv=False)


def railing(name, p0, p1, z, h, spacing, mat_, parent, post=0.06):
    L, ang, d, n = wall_frame(p0, p1)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    box(f'{name}_top', (*mid, z + h), (L, post * 1.6, post * 1.6), mat_, parent, rot_z=ang)
    k = max(1, int(L / spacing))
    for i in range(k + 1):
        q = Vector((p0[0], p0[1], 0)) + d * (L * i / k)
        box(f'{name}_p{i}', (q.x, q.y, z + h / 2), (post, post, h), mat_, parent, rot_z=ang)
