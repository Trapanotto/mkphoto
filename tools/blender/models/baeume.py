# Bäume für die Instanzierung (Detailstufe 2): Stamm + Äste + Blattkarten mit Alpha-Textur.
# Höhe normiert auf 1 m, Fuss bei 0. Laubbaum (Kronenkarten), Nadelbaum (hängende Astetagen).
import math
import os
import random
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_TEX = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'public', 'tex', 'foliage'))


def leaf_texture(path, size, kind, seed):
    """RGBA-Textur: viele kleine Blätter/Nadeln auf transparentem Grund (für Alpha-Test)."""
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size, 4), np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    n = 260 if kind == 'leaf' else 520
    for _ in range(n):
        cx, cy = rng.uniform(0.06, 0.94) * size, rng.uniform(0.06, 0.94) * size
        # Dichte zur Mitte hin höher (natürlicher Rand)
        if np.hypot(cx - size / 2, cy - size / 2) > size * 0.46 and rng.random() < 0.6:
            continue
        a = rng.uniform(0, math.pi)
        if kind == 'leaf':
            L, W = rng.uniform(0.035, 0.06) * size, rng.uniform(0.018, 0.03) * size
        else:
            L, W = rng.uniform(0.05, 0.09) * size, rng.uniform(0.004, 0.007) * size
        dx, dy = xx - cx, yy - cy
        u = dx * math.cos(a) + dy * math.sin(a)
        v = -dx * math.sin(a) + dy * math.cos(a)
        m = (u / L) ** 2 + (v / W) ** 2 < 1
        g = rng.uniform(0.55, 1.15)
        base = np.array([0.16, 0.33, 0.10]) if kind == 'leaf' else np.array([0.10, 0.22, 0.10])
        col = base * g + rng.uniform(-0.03, 0.03, 3)
        shade = 0.75 + 0.35 * np.clip(1 - np.abs(v / W), 0, 1)  # Mittelrippe heller
        for c in range(3):
            img[..., c] = np.where(m, col[c] * shade, img[..., c])
        img[..., 3] = np.where(m, 1.0, img[..., 3])
    import bpy
    im = bpy.data.images.new(os.path.basename(path), size, size, alpha=True)
    im.pixels.foreach_set(np.clip(img[::-1], 0, 1).ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()


def card(bm, center, normal, up, w, h, uv_layer):
    n = Vector(normal).normalized()
    u = Vector(up).cross(n)
    if u.length < 1e-3:
        u = Vector((1, 0, 0))
    u.normalize()
    v = n.cross(u).normalized()
    c = Vector(center)
    pts = [c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2, c + u * w / 2 + v * h / 2, c - u * w / 2 + v * h / 2]
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv_layer].uv = uv
    return f


def branch(L, name, a, b, r0, r1, mat, parent, sides=6):
    """Konischer Ast von a nach b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=sides, radius1=r0, radius2=r1, depth=d.length)
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return L._finish(name, bm, [mat], parent)


def foliage_mesh(L, name, cards, mat, parent):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    for (c, n, up, w, h) in cards:
        card(bm, c, n, up, w, h, uv)
    return L._finish(name, bm, [mat], parent, uv=False)


def build(L):
    os.makedirs(OUT_TEX, exist_ok=True)
    leaf_texture(os.path.join(OUT_TEX, 'leaves.png'), 512, 'leaf', 3)
    leaf_texture(os.path.join(OUT_TEX, 'needles.png'), 512, 'needle', 5)
    bark = L.mat('bark', (0.28, 0.22, 0.17), meters=0.5)
    leaves = L.mat('leaf_cards', (0.20, 0.36, 0.14))
    needles = L.mat('needle_cards', (0.12, 0.24, 0.12))
    rnd = random.Random(7)

    # ---------- Laubbaum: Stamm, 5 Hauptäste, ~44 Blattkarten in einer Kronen-Ellipse
    lb = L.empty('Laubbaum')
    branch(L, 'lb_trunk', (0, 0, 0), (0, 0, 0.52), 0.035, 0.022, bark, lb, sides=8)
    tips = []
    for k in range(5):
        a = k * math.tau / 5 + rnd.uniform(-0.3, 0.3)
        z0 = 0.36 + k * 0.04
        tip = (math.cos(a) * 0.2, math.sin(a) * 0.2, z0 + 0.25)
        branch(L, f'lb_br{k}', (0, 0, z0), tip, 0.016, 0.006, bark, lb)
        tips.append(tip)
    cards = []
    center = Vector((0, 0, 0.68))
    for i in range(44):
        # Punkt in Ellipse (Breite 0.62, Höhe 0.52), eher an der Oberfläche
        while True:
            p = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.35 < p.length <= 1:
                break
        pos = center + Vector((p.x * 0.31, p.y * 0.31, p.z * 0.26))
        nrm = (pos - center).normalized()
        nrm = (nrm + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(-0.2, 0.4)))).normalized()
        s = rnd.uniform(0.2, 0.3)
        cards.append((pos, nrm, (0, 0, 1), s, s))
    foliage_mesh(L, 'lb_crown', cards, leaves, lb)
    L.merge_children(lb)

    # ---------- Nadelbaum: Stamm + 9 Astetagen mit hängenden Nadelkarten
    nb = L.empty('Nadelbaum')
    branch(L, 'nb_trunk', (0, 0, 0), (0, 0, 0.98), 0.03, 0.004, bark, nb, sides=8)
    cards = []
    for e in range(9):
        z = 0.16 + e * 0.092
        r = 0.24 * (1 - e / 9) + 0.04
        for k in range(7):
            a = k * math.tau / 7 + e * 0.5 + rnd.uniform(-0.2, 0.2)
            out = Vector((math.cos(a), math.sin(a), 0))
            pos = Vector((0, 0, z)) + out * (r * 0.55)
            pos.z -= r * 0.18
            nrm = (out * 0.35 + Vector((0, 0, 1))).normalized()
            cards.append((pos, nrm, out, r * 1.05, r * 0.75))
    cards.append((Vector((0, 0, 0.95)), Vector((1, 0, 0)), (0, 0, 1), 0.08, 0.14))
    cards.append((Vector((0, 0, 0.95)), Vector((0, 1, 0)), (0, 0, 1), 0.08, 0.14))
    foliage_mesh(L, 'nb_needles', cards, needles, nb)
    L.merge_children(nb)


def geranium_texture(path, w=512, h=256, seed=11):
    """Balkon-Geranien: runde Blätter unten, Blütendolden oben, unregelmässiger Rand (Alpha)."""
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 4), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    def disc(cx, cy, r, col):
        m = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
        shade = np.clip(1.15 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r * 0.45, 0.5, 1.2)
        for c in range(3):
            img[..., c] = np.where(m, col[c] * shade, img[..., c])
        img[..., 3] = np.where(m, 1.0, img[..., 3])
    # Blätter (unten dichter, hängende Ranken)
    for _ in range(420):
        cx = rng.uniform(0, w)
        cy = h * (0.35 + 0.65 * rng.random() ** 0.7)
        if cy > h * 0.85 and rng.random() < 0.5:
            continue
        g = rng.uniform(0.6, 1.1)
        disc(cx, cy, rng.uniform(8, 16), np.array([0.13, 0.30, 0.08]) * g)
    # Blütendolden
    palettes = [np.array([0.85, 0.05, 0.05]), np.array([0.92, 0.12, 0.10]), np.array([0.88, 0.30, 0.55]), np.array([0.95, 0.92, 0.90])]
    for _ in range(46):
        cx, cy = rng.uniform(8, w - 8), rng.uniform(h * 0.12, h * 0.5)
        col = palettes[rng.choice(4, p=[0.45, 0.25, 0.2, 0.1])]
        for _ in range(rng.integers(7, 13)):
            disc(cx + rng.normal(0, 7), cy + rng.normal(0, 6), rng.uniform(3.5, 6.5), col * rng.uniform(0.8, 1.1))
    import bpy
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    im.pixels.foreach_set(np.clip(img[::-1], 0, 1).ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()


_build_trees = build


def build(L):
    _build_trees(L)
    geranium_texture(os.path.join(OUT_TEX, 'geraniums.png'))
