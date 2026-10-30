# MKPHOTO – Blender-Helfer: prozedurale Texturen, Bauteile, Export.
# Koordinaten: x = Ost, y = Nord, z = oben, Meter. Ursprung = Ankerpunkt (lat/lon) des Wahrzeichens.
import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(HERE, 'tex')
os.makedirs(TEX_DIR, exist_ok=True)

MAT_SCALE = {}  # Material -> Meter pro Texturwiederholung


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- Rauschen
def value_noise(size, cells, rng):
    g = rng.random((cells, cells))
    x = np.arange(size) / size * cells
    i0 = np.floor(x).astype(int) % cells
    f = x - np.floor(x)
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = g[np.ix_(i0, i0)]
    b = g[np.ix_(i0, i1)]
    c = g[np.ix_(i1, i0)]
    d = g[np.ix_(i1, i1)]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, base, octaves, rng, gain=0.5):
    out = np.zeros((size, size))
    amp, tot, cells = 1.0, 0.0, base
    for _ in range(octaves):
        out += value_noise(size, cells, rng) * amp
        tot += amp
        amp *= gain
        cells *= 2
    return out / tot


def stretched_noise(size, cx, cy, rng):
    """Anisotropes Rauschen (z. B. Holzmaserung)."""
    g = rng.random((cy, cx))
    xs = np.arange(size) / size * cx
    ys = np.arange(size) / size * cy
    x0 = np.floor(xs).astype(int) % cx
    y0 = np.floor(ys).astype(int) % cy
    fx = (xs - np.floor(xs))[None, :]
    fy = (ys - np.floor(ys))[:, None]
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x1 = (x0 + 1) % cx
    y1 = (y0 + 1) % cy
    a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x1)]; c = g[np.ix_(y1, x0)]; d = g[np.ix_(y1, x1)]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def col(rgb):
    return np.array(rgb, dtype=float)[None, None, :]


# ---------------------------------------------------------------- Texturen
def tex_masonry(name, base, var=0.12, mortar=(0.55, 0.52, 0.47), rows=8, mean_w=2.2, jitter=0.35,
                rough_rows=True, seed=1, size=512, hue=(0.05, 0.03, 0.0)):
    """Mauerwerk: Reihen mit Steinen unterschiedlicher Breite (rows pro Textur)."""
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size, 3))
    # Reihenhöhen
    if rough_rows:
        hs = rng.uniform(0.7, 1.3, rows)
    else:
        hs = np.ones(rows)
    hs = np.round(hs / hs.sum() * size).astype(int)
    hs[-1] = size - hs[:-1].sum()
    y = 0
    detail = fbm(size, 16, 4, rng)
    edge = np.zeros((size, size))
    for r in range(rows):
        h = hs[r]
        # Steinbreiten
        ws = []
        tot = 0
        n_est = int(size / (size / rows * mean_w)) + 2
        while tot < size:
            w = max(6, int(size / rows * mean_w * rng.uniform(1 - jitter, 1 + jitter)))
            ws.append(w)
            tot += w
        ws = np.array(ws)
        ws[-1] -= tot - size
        if ws[-1] < 6:
            ws[-2] += ws[-1]
            ws = ws[:-1]
        off = rng.integers(0, size)
        edges = np.cumsum(ws)
        xs = (np.arange(size) + off) % size
        idx = np.searchsorted(edges, xs, side='right')
        starts = np.concatenate([[0], edges[:-1]])
        lx = xs - starts[idx]
        wx = ws[idx]
        shade = 1 + var * (rng.random(len(ws)) * 2 - 1)
        tint = rng.random((len(ws), 3)) * np.array(hue)[None, :]
        c = (np.array(base)[None, :] * shade[:, None] + tint)[idx]
        img[y:y + h] = c[None, :, :]
        # Fugenabstand
        dx = np.minimum(lx, wx - lx)[None, :].astype(float)
        dy = np.minimum(np.arange(h), h - 1 - np.arange(h))[:, None].astype(float)
        edge[y:y + h] = np.minimum(dx, dy)
        y += h
    mw = max(1.5, size / rows * 0.07)
    bevel = np.clip(edge / (mw * 3), 0, 1)
    img *= (0.78 + 0.22 * bevel)[..., None]
    img *= (0.85 + 0.3 * detail)[..., None]
    m = (edge < mw)[..., None]
    img = np.where(m, col(mortar) * (0.9 + 0.2 * detail[..., None]), img)
    return save_tex(name, img)


def tex_roof_tiles(name, base=(0.52, 0.22, 0.13), rows=16, cols=10, seed=2, size=512, aged=0.25):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    r = np.floor(yy * rows).astype(int)
    v = yy * rows - r
    xo = xx * cols + (r % 2) * 0.5
    c = np.floor(xo).astype(int) % cols
    u = xo - np.floor(xo)
    tid = r * cols + c
    rnd = rng.random(rows * cols + cols)
    rnd2 = rng.random(rows * cols + cols)
    shade = 0.82 + 0.3 * rnd[tid]
    img = col(base) * shade[..., None]
    old = (rnd2[tid] < aged)[..., None]
    img = np.where(old, img * col((0.75, 0.85, 0.9)) + 0.03, img)
    # Biberschwanz: runde Unterkante, Überlappung dunkler
    round_edge = (u - 0.5) ** 2 * 1.6 + np.maximum(0, v - 0.75) ** 2 * 10
    gap = (np.abs(u - 0.5) > 0.47) | (round_edge > 0.42)
    img *= (1 - 0.45 * v ** 4)[..., None]
    img = np.where(gap[..., None], img * 0.35, img)
    img *= (0.88 + 0.24 * fbm(size, 24, 3, rng))[..., None]
    lichen = fbm(size, 8, 3, rng)
    img = np.where((lichen > 0.68)[..., None], img * 0.7 + col((0.12, 0.12, 0.08)), img)
    return save_tex(name, img)


def tex_wood(name, base=(0.36, 0.22, 0.12), boards=6, seed=3, size=512, vertical=True, gap=0.04):
    rng = np.random.default_rng(seed)
    grain = stretched_noise(size, 64, 6, rng) * 0.6 + stretched_noise(size, 160, 12, rng) * 0.4
    if vertical:
        grain = grain.T
    yy, xx = np.mgrid[0:size, 0:size] / size
    t = xx if vertical else yy
    b = np.floor(t * boards).astype(int)
    lt = t * boards - b
    shade = 0.8 + 0.4 * rng.random(boards + 1)
    img = col(base) * (shade[b] * (0.75 + 0.5 * grain))[..., None]
    img = np.where(((lt < gap) | (lt > 1 - gap))[..., None], img * 0.35, img)
    return save_tex(name, img)


def tex_plaster(name, base=(0.85, 0.82, 0.75), seed=4, size=512, dirt=0.15):
    rng = np.random.default_rng(seed)
    n = fbm(size, 8, 5, rng)
    img = col(base) * (1 - dirt * 0.5 + dirt * n)[..., None]
    # Schmutzstreifen von oben nach unten
    streak = stretched_noise(size, 40, 2, rng)
    img *= (1 - 0.08 * streak)[..., None]
    return save_tex(name, img)


def tex_copper(name, seed=5, size=512):
    rng = np.random.default_rng(seed)
    n = fbm(size, 6, 5, rng)
    s = stretched_noise(size, 60, 3, rng)
    base = col((0.30, 0.55, 0.47))
    dark = col((0.18, 0.30, 0.27))
    img = base * (1 - n[..., None] * 0.35) + dark * (s[..., None] * 0.35)
    # Blechbahnen
    xx = np.arange(size) / size
    seam = (np.abs((xx * 8) % 1 - 0.5) > 0.47)[None, :, None]
    img = np.where(seam, img * 0.7, img)
    return save_tex(name, img)


def tex_flowers(name, seed=6, size=256):
    rng = np.random.default_rng(seed)
    leaf = fbm(size, 16, 3, rng)
    img = col((0.12, 0.30, 0.08)) * (0.6 + 0.8 * leaf[..., None])
    blob = fbm(size, 32, 2, rng)
    red = (blob > 0.6)[..., None]
    img = np.where(red, col((0.75, 0.05, 0.06)) * (0.8 + 0.4 * leaf[..., None]), img)
    pink = (blob < 0.25)[..., None]
    img = np.where(pink, col((0.85, 0.35, 0.5)), img)
    return save_tex(name, img)


def tex_window_facade(name, wall_tex_arr=None, base=(0.62, 0.62, 0.55), win=(0.10, 0.12, 0.15),
                      frame=(0.85, 0.83, 0.78), cols=2, rows=1, wx=(0.28, 0.72), wy=(0.25, 0.8),
                      seed=7, size=512, arch=False, ashlar=True):
    """Fassade mit Fenstern (eine Kachel = cols x rows Fenster)."""
    rng = np.random.default_rng(seed)
    if ashlar:
        img = tex_arr_masonry(base, rows=10, mean_w=3.0, seed=seed, size=size)
    else:
        img = col(base) * (0.9 + 0.2 * fbm(size, 8, 4, rng))[..., None] * np.ones((size, size, 1))
    yy, xx = np.mgrid[0:size, 0:size] / size
    u = (xx * cols) % 1
    v = (yy * rows) % 1
    inside = (u > wx[0]) & (u < wx[1]) & (v > wy[0]) & (v < wy[1])
    if arch:
        cx = (wx[0] + wx[1]) / 2
        rad = (wx[1] - wx[0]) / 2
        top = wy[0] + rad
        inside = inside & ((v > top) | ((u - cx) ** 2 + ((v - top) * 1.0) ** 2 < rad ** 2))
    fr = 0.025
    outer = (u > wx[0] - fr) & (u < wx[1] + fr) & (v > wy[0] - fr) & (v < wy[1] + fr * 2.5)
    img = np.where(outer[..., None], col(frame), img)
    glass = col(win) * (0.8 + 0.5 * (1 - v)[..., None]) * np.ones((size, size, 1))
    # Fenstersprossen
    mid_u = np.abs(u - (wx[0] + wx[1]) / 2) < 0.008
    mid_v = np.abs(v - (wy[0] + (wy[1] - wy[0]) * 0.4)) < 0.008
    glass = np.where((mid_u | mid_v)[..., None], col(frame) * 0.9, glass)
    img = np.where(inside[..., None], glass, img)
    return save_tex(name, img)


def tex_arr_masonry(base, rows=10, mean_w=3.0, seed=1, size=512):
    """Wie tex_masonry, liefert aber nur das Array (Quaderstein, regelmässig)."""
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size, 3))
    h = size // rows
    detail = fbm(size, 16, 4, rng)
    for r in range(rows):
        w = int(h * mean_w)
        off = (r % 2) * w // 2
        xs = (np.arange(size) + off) % size
        idx = xs // w
        lx = xs % w
        shade = 0.92 + 0.16 * rng.random(size // w + 2)
        img[r * h:(r + 1) * h] = (np.array(base)[None, :] * shade[idx][:, None])[None]
        dx = np.minimum(lx, w - lx)[None, :]
        dy = np.minimum(np.arange(h), h - 1 - np.arange(h))[:, None]
        e = np.minimum(dx, dy)
        img[r * h:(r + 1) * h] *= (0.85 + 0.15 * np.clip(e / 4, 0, 1))[..., None]
    img[rows * h:] = img[:size - rows * h]
    img *= (0.88 + 0.24 * detail)[..., None]
    return img


def save_tex(name, arr):
    arr = np.clip(arr, 0, 1)
    h, w = arr.shape[:2]
    path = os.path.join(TEX_DIR, name + '.png')
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([arr, np.ones((h, w, 1))], axis=2)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


# ---------------------------------------------------------------- Materialien
def material(name, image=None, color=(0.8, 0.8, 0.8), rough=0.85, metal=0.0, meters=4.0, emission=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = image
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
    MAT_SCALE[m.name] = meters
    return m


# ---------------------------------------------------------------- Geometrie
def collection():
    return bpy.context.scene.collection


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    collection().objects.link(e)
    e.parent = parent
    return e


def _finish(name, bm, mats, parent, uv=True, uv_origin=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    collection().objects.link(o)
    for m in mats:
        me.materials.append(m)
    o.parent = parent
    if uv:
        box_uv(o, uv_origin)
    return o


def box_uv(obj, origin=None):
    """Würfel-Projektion in Metern, ausgerichtet am Objekt-Minimum (Fenster passen auf Wandkanten)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers.active.data
    co = np.array([v.co[:] for v in me.vertices]) if len(me.vertices) else np.zeros((1, 3))
    mn = co.min(axis=0) if origin is None else np.array(origin)
    for poly in me.polygons:
        mat = me.materials[poly.material_index] if me.materials else None
        s = MAT_SCALE.get(mat.name, 4.0) if mat else 4.0
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co - Vector(mn)
            if ax == 2:
                u, v = p.x, p.y
            elif ax == 0:
                u, v = (p.y if n.x > 0 else -p.y), p.z
            else:
                u, v = (-p.x if n.y > 0 else p.x), p.z
            uvl[li].uv = (u / s, v / s)


def frame_along(p0, p1):
    """Matrix für ein Bauteil entlang p0->p1 (2D), x-Achse = Richtung."""
    d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0))
    L = d.length
    ang = math.atan2(d.y, d.x)
    return L, ang


def box(name, center, size, mat, parent=None, rot_z=0.0, mats=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, mats if mats is not None else [mat], parent)


def prism(name, base_center, radius, height, sides, mat, parent=None, radius_top=None, rot=0.0, cap=True):
    bm = bmesh.new()
    rt = radius if radius_top is None else radius_top
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=sides, radius1=radius, radius2=rt, depth=height)
    M = Matrix.Translation(Vector(base_center) + Vector((0, 0, height / 2))) @ Matrix.Rotation(rot, 4, 'Z')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, [mat], parent)


def gable_roof(name, p0, p1, width, eave_z, ridge_z, roof_mat, gable_mat, parent=None, overhang=0.6, thick=0.18):
    """Satteldach entlang p0->p1. Firstrichtung = Segment."""
    L, ang = frame_along(p0, p1)
    bm = bmesh.new()
    hw = width / 2
    x0, x1 = -overhang, L + overhang
    pts = []
    for x in (x0, x1):
        pts.append([(x, -hw, eave_z), (x, 0, ridge_z), (x, hw, eave_z),
                    (x, hw, eave_z - thick), (x, 0, ridge_z - thick * 1.4), (x, -hw, eave_z - thick)])
    v = [[bm.verts.new(p) for p in ring] for ring in pts]
    a, b = v
    faces = []
    # Dachflächen
    f1 = bm.faces.new((a[0], b[0], b[1], a[1])); f1.material_index = 0
    f2 = bm.faces.new((a[1], b[1], b[2], a[2])); f2.material_index = 0
    # Unterseite
    f3 = bm.faces.new((a[3], b[3], b[4], a[4])); f3.material_index = 1
    f4 = bm.faces.new((a[4], b[4], b[5], a[5])); f4.material_index = 1
    # Traufkanten
    f5 = bm.faces.new((a[2], b[2], b[3], a[3])); f5.material_index = 1
    f6 = bm.faces.new((a[5], b[5], b[0], a[0])); f6.material_index = 1
    # Giebel-Stirnseiten (Ringe)
    fe = bm.faces.new(list(reversed(a))); fe.material_index = 1
    fe2 = bm.faces.new(b); fe2.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    M = Matrix.Translation(Vector((p0[0], p0[1], 0))) @ Matrix.Rotation(ang, 4, 'Z')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, [roof_mat, gable_mat], parent)


def gable_wall(name, p_center, width, base_z, eave_z, ridge_z, thick, ang, mat, parent=None):
    """Giebelwand (Fünfeck) quer zu einer Richtung ang."""
    bm = bmesh.new()
    hw = width / 2
    ring = [(-hw, base_z), (hw, base_z), (hw, eave_z), (0, ridge_z), (-hw, eave_z)]
    fr = [bm.verts.new((-thick / 2, y, z)) for y, z in ring]
    bk = [bm.verts.new((thick / 2, y, z)) for y, z in ring]
    bm.faces.new(fr)
    bm.faces.new(list(reversed(bk)))
    for i in range(5):
        j = (i + 1) % 5
        bm.faces.new((fr[i], fr[j], bk[j], bk[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    M = Matrix.Translation(Vector((p_center[0], p_center[1], 0))) @ Matrix.Rotation(ang, 4, 'Z')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, [mat], parent)


def hip_roof(name, center, sx, sy, eave_z, height, mat, parent=None, rot=0.0, ridge_frac=0.4, overhang=0.5):
    """Walmdach über Rechteck sx * sy (sx >= sy für First in x-Richtung)."""
    bm = bmesh.new()
    hx, hy = sx / 2 + overhang, sy / 2 + overhang
    r = (sx / 2) * ridge_frac
    c = [bm.verts.new(p) for p in [(-hx, -hy, eave_z), (hx, -hy, eave_z), (hx, hy, eave_z), (-hx, hy, eave_z)]]
    t = [bm.verts.new((-r, 0, eave_z + height)), bm.verts.new((r, 0, eave_z + height))]
    bm.faces.new((c[0], c[1], t[1], t[0]))
    bm.faces.new((c[1], c[2], t[1]))
    bm.faces.new((c[2], c[3], t[0], t[1]))
    bm.faces.new((c[3], c[0], t[0]))
    bm.faces.new(list(reversed(c)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    M = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rot, 4, 'Z')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, [mat], parent)


def beam_between(name, a, b, thickness, mat, parent=None):
    """Balken (quadratischer Querschnitt) zwischen zwei 3D-Punkten."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    M = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((thickness, thickness, L, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return _finish(name, bm, [mat], parent)


def hide_box(name, center, size, rot_z=0.0):
    """Unsichtbare Box: swisstopo-Gebäude darin werden im Spiel ausgeblendet."""
    o = box(name, center, size, None, rot_z=rot_z, mats=[])
    o.name = name
    return o


# ---------------------------------------------------------------- Zusammenführen & Export
def merge_children(parent, name=None):
    """Alle Mesh-Kinder eines Empties zu einem Mesh vereinen (weniger Draw-Calls)."""
    objs = [o for o in parent.children if o.type == 'MESH' and not o.name.startswith('Hide')]
    if not objs:
        return None
    mats = []
    bm = bmesh.new()
    for o in objs:
        me = o.data
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            if remap:
                p.material_index = remap[p.material_index]
        bm.from_mesh(me)
    me = bpy.data.meshes.new((name or parent.name) + '_mesh')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new((name or parent.name) + '_mesh', me)
    collection().objects.link(o)
    o.parent = parent
    for x in objs:
        bpy.data.objects.remove(x, do_unlink=True)
    return o


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    for extra in ({'export_image_format': 'NONE'}, {}):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra)
            return
        except TypeError as e:
            print('Export-Option nicht unterstützt, nächster Versuch:', e)
    raise RuntimeError('glTF-Export fehlgeschlagen')


# ---------------------------------------------------------------- Weitere Bauteile
class Axis:
    """Lokales Achsensystem: a entlang der Achse (Winkel in Grad ab Ost), b quer (links)."""
    def __init__(self, cx, cy, deg):
        self.cx, self.cy = cx, cy
        self.ang = math.radians(deg)
        self.c, self.s = math.cos(self.ang), math.sin(self.ang)

    def p(self, a, b):
        return (self.cx + a * self.c - b * self.s, self.cy + a * self.s + b * self.c)

    def p3(self, a, b, z):
        return (*self.p(a, b), z)


def abox(name, ax, a, b, z, size, mat, parent=None, mats=None):
    """Box im Achsensystem: Mittelpunkt (a, b, z), size = (entlang, quer, hoch)."""
    return box(name, (*ax.p(a, b), z), size, mat, parent, rot_z=ax.ang, mats=mats)


def dome(name, center, radius, z0, height, mat, parent=None, sides=24, rings=8, base_r=None):
    """Kuppel aus Kegelstümpfen (Halbellipsoid)."""
    parts = []
    for k in range(rings):
        t0, t1 = (k / rings) * math.pi / 2, ((k + 1) / rings) * math.pi / 2
        r0, r1 = radius * math.cos(t0), radius * math.cos(t1)
        h0, h1 = height * math.sin(t0), height * math.sin(t1)
        parts.append(prism(f'{name}_{k}', (center[0], center[1], z0 + h0), r0, h1 - h0, sides, mat, parent,
                           radius_top=max(r1, 0.02), cap=(k == rings - 1)))
    return parts


def extrude_polygon(name, pts, z0, z1, mat, parent=None, top_mat=None):
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    bm.faces.new(list(reversed(lo)))
    ft = bm.faces.new(hi)
    if top_mat is not None:
        ft.material_index = 1
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, [mat] + ([top_mat] if top_mat is not None else []), parent)


def offset_polygon(pts, d):
    """Polygon um d nach innen (d > 0) versetzen (für konvex-ähnliche Formen ausreichend)."""
    n = len(pts)
    # Orientierung bestimmen
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e0 = (p1 - p0).normalized(); e1 = (p2 - p1).normalized()
        n0 = Vector((-e0.y, e0.x)) * sgn; n1 = Vector((-e1.y, e1.x)) * sgn
        m = (n0 + n1).normalized()
        k = d / max(0.3, m.dot(n1))
        q = p1 + m * k
        out.append((q.x, q.y))
    return out


def wall_ring(name, pts, z0, z1, thick, mat, parent=None, closed=True):
    segs = len(pts) if closed else len(pts) - 1
    objs = []
    for i in range(segs):
        p0, p1 = pts[i], pts[(i + 1) % len(pts)]
        L, ang = frame_along(p0, p1)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        objs.append(box(f'{name}_{i}', (*mid, (z0 + z1) / 2), (L + thick, thick, z1 - z0), mat, parent, rot_z=ang))
    return objs


def pyramid_roof(name, center, side_a, side_b, z0, height, mat, parent=None, rot=0.0, overhang=0.4):
    """Zeltdach über Rechteck (side_a entlang rot)."""
    return hip_roof(name, (*center, 0) if len(center) == 2 else center, side_a, side_b, z0, height, mat, parent,
                    rot=rot, ridge_frac=0.0001 if abs(side_a - side_b) < 0.01 else (side_a - side_b) / side_a, overhang=overhang)
