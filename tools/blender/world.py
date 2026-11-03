# Baut die vorberechnete Welt eines Levels in Blender:
#   Gelände in drei Ringen (Kern 2/4 m, Mittel 20 m, Horizont grob) mit Luftbild-UVs,
#   swisstopo-Gebäude (bereinigt, ausgerichtet), Export nach public/world/<level>/.
# Aufruf: blender -b --factory-startup -P tools/blender/world.py -- <level>
import bpy
import bmesh
import json
import math
import os
import sys
import shutil
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
lvl = sys.argv[sys.argv.index('--') + 1]
SRC = os.path.join(ROOT, '.cache', 'bake', lvl)
OUT = os.path.join(ROOT, 'public', 'world', lvl)
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
meta = json.load(open(os.path.join(SRC, 'meta.json')))
R_EARTH = 6371000 * 1.15  # mit Refraktion

bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.context.scene.collection


def load_dem(name):
    d = meta['dem'][name]
    a = np.fromfile(os.path.join(SRC, f'dem_{name}.f32'), dtype=np.float32).reshape(d['n'], d['n'])
    return a, d


core_dem, core_d = load_dem('core')
mid_dem, mid_d = load_dem('mid')
far_dem, far_d = load_dem('far')
H0 = float(np.round(np.median(core_dem[core_d['n'] // 2 - 20:core_d['n'] // 2 + 20, core_d['n'] // 2 - 20:core_d['n'] // 2 + 20])))


def sample(dem, d, x, y):
    """Bilinear: x = Ost, y = Nord (lokal), Raster Zeile 0 = Norden."""
    n, step, half = d['n'], d['step'], d['half']
    fx = (x + half) / step
    fy = (half - y) / step
    fx = np.clip(fx, 0, n - 1.001)
    fy = np.clip(fy, 0, n - 1.001)
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int)
    tx = fx - x0; ty = fy - y0
    a = dem[y0, x0]; b = dem[y0, x0 + 1]; c = dem[y0 + 1, x0]; e = dem[y0 + 1, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty


def grid_mesh(name, x0, y0, size, step, heightfn, uv_rect, mat_name, cut=None, curvature=False, parent=None):
    """Regelmässiges Gitter (x0,y0 = Südwest-Ecke). uv_rect = (ux0, uy0, uw, uh) in Metern für UVs 0..1."""
    n = int(round(size / step)) + 1
    xs = x0 + np.arange(n) * step
    ys = y0 + np.arange(n) * step
    X, Y = np.meshgrid(xs, ys)
    Z = heightfn(X, Y) - H0
    if curvature:
        Z = Z - (X ** 2 + Y ** 2) / (2 * R_EARTH)
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    ii, jj = np.meshgrid(np.arange(n - 1), np.arange(n - 1))
    a = (jj * n + ii).ravel()
    quads = np.stack([a, a + 1, a + n + 1, a + n], 1)
    if cut is not None:
        cx = (X[:-1, :-1] + step / 2).ravel(); cy = (Y[:-1, :-1] + step / 2).ravel()
        keep = ~((np.abs(cx) < cut) & (np.abs(cy) < cut))
        quads = quads[keep]
        if not len(quads):
            return None
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    me.loops.add(len(quads) * 4)
    me.loops.foreach_set('vertex_index', quads.astype(np.int32).ravel())
    me.polygons.add(len(quads))
    me.polygons.foreach_set('loop_start', (np.arange(len(quads)) * 4).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(quads), 4, np.int32))
    me.update(calc_edges=True)
    uvl = me.uv_layers.new(name='UVMap')
    lv = quads.ravel()
    ux, uy, uw, uh = uv_rect
    u = (verts[lv, 0] - ux) / uw
    v = (verts[lv, 1] - uy) / uh
    uvl.data.foreach_set('uv', np.stack([u, v], 1).astype(np.float32).ravel())
    m = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    o.parent = parent
    return o


def decimate(o, ratio):
    if ratio >= 1:
        return
    # Rand schützen: Randvertices in Vertexgruppe mit hohem Gewicht
    bm = bmesh.new(); bm.from_mesh(o.data)
    border = [v.index for v in bm.verts if v.is_boundary]
    bm.free()
    vg = o.vertex_groups.new(name='border')
    vg.add(border, 1.0, 'REPLACE')
    md = o.modifiers.new('dec', 'DECIMATE')
    md.decimate_type = 'COLLAPSE'
    md.ratio = ratio
    md.vertex_group = 'border'
    md.invert_vertex_group = True
    md.vertex_group_factor = 1000.0
    bpy.context.view_layer.objects.active = o
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier='dec')
    o.vertex_groups.clear()


def skirt(o, depth):
    """Schürze entlang der Ränder gegen Lücken zwischen Kacheln."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    edges = [e for e in bm.edges if e.is_boundary]
    if edges:
        ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
        vs = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=vs, vec=(0, 0, -depth))
    bm.to_mesh(o.data); bm.free()


def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_image_format='NONE', export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=7, export_normals=True, export_attributes=True)


def clear(objs):
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)


core, chunk = meta['core'], meta['chunk']
mid, mchunk = meta['mid'], meta['midChunk']
far = meta['far']
core_h = lambda X, Y: sample(core_dem, core_d, X, Y)
mid_h = lambda X, Y: sample(mid_dem, mid_d, X, Y)
far_h = lambda X, Y: sample(far_dem, far_d, X, Y)

VARIANTS = [] if os.environ.get('MK_SKIP_TERRAIN') == '1' else (('hoch', 0.32, 0.45, ''), ('handy', 0.12, 0.22, '_s'))
for variant, ratio_core, ratio_mid, suffix in VARIANTS:
    # ---------- Kern: 400-m-Kacheln, innen 2 m, aussen 4 m
    objs = []
    nC = int(round(2 * core / chunk))
    for j in range(nC):
        for i in range(nC):
            x0 = -core + i * chunk
            y1 = core - j * chunk
            y0 = y1 - chunk
            cx, cy = x0 + chunk / 2, y0 + chunk / 2
            step = 2 if max(abs(cx), abs(cy)) < chunk else 4
            if variant == 'handy':
                step *= 2
            o = grid_mesh(f'core_{i}_{j}', x0, y0, chunk, step, core_h, (x0, y0, chunk, chunk), f'ortho:core_{i}_{j}')
            decimate(o, ratio_core)
            skirt(o, 6)
            objs.append(o)
    export(objs, os.path.join(OUT, f'terrain_core{suffix}.glb'))
    clear(objs)

    # ---------- Mittelring: 2-km-Kacheln, 20 m (Handy 40 m), Kern ausgespart
    objs = []
    nM = int(round(2 * mid / mchunk))
    for j in range(nM):
        for i in range(nM):
            x0 = -mid + i * mchunk
            y1 = mid - j * mchunk
            y0 = y1 - mchunk
            step = 20 if variant == 'hoch' else 40
            o = grid_mesh(f'mid_{i}_{j}', x0, y0, mchunk, step, mid_h, (x0, y0, mchunk, mchunk), f'ortho:mid_{i}_{j}',
                          cut=core - step, curvature=True)
            if o is None:
                continue
            decimate(o, ratio_mid)
            skirt(o, 15)
            objs.append(o)
    export(objs, os.path.join(OUT, f'terrain_mid{suffix}.glb'))
    clear(objs)

    # ---------- Horizont: ein Gitter, Mittelring ausgespart, Erdkrümmung
    step = 2 * far / (200 if variant == 'hoch' else 120)
    o = grid_mesh('far', -far, -far, 2 * far, step, far_h, (-far, -far, 2 * far, 2 * far), 'ortho:far',
                  cut=mid - step, curvature=True)
    skirt(o, 60)
    export([o], os.path.join(OUT, f'terrain_far{suffix}.glb'))
    clear([o])

# ---------- Gebäude
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'buildings.glb'))
b = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
b.name = 'Buildings'
me = b.data
# auf Gelände ausrichten: Median(Sockel - Gelände) über alle Gebäude
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
bidattr = me.attributes.get('_BATCHID')
bids = np.empty(len(me.vertices), np.float32)
bidattr.data.foreach_get('value', bids)
order = np.argsort(bids)
ub, starts = np.unique(bids[order], return_index=True)
offs = []
for k in range(0, len(ub), max(1, len(ub) // 400)):
    sl = order[starts[k]:(starts[k + 1] if k + 1 < len(starts) else len(order))]
    p = co[sl]
    g = sample(core_dem, core_d, p[:, 0].mean(), p[:, 1].mean())
    offs.append(p[:, 2].min() - g)
dz = float(np.median(offs))
print(f'Gebäude-Höhenversatz: {dz:.2f} m -> korrigiert')
co[:, 2] -= dz + H0
me.vertices.foreach_set('co', co.ravel())
me.update()

# Gebäude neu aufbauen: echte Dachflächen aus swissBUILDINGS3D, saubere Wände bis zum Sockel
hides = json.load(open(os.path.join(SRC, 'hide.json'))) if os.path.exists(os.path.join(SRC, 'hide.json')) else []
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.08)
bid_l = bm.verts.layers.float.get('_BATCHID')
base, cen = {}, {}
for v in bm.verts:
    k = int(v[bid_l])
    if k not in base or v.co.z < base[k]:
        base[k] = v.co.z
    c = cen.setdefault(k, [0.0, 0.0, 0])
    c[0] += v.co.x; c[1] += v.co.y; c[2] += 1
bm.normal_update()
kill = []
for f in bm.faces:
    if f.normal.z < 0.25:
        kill.append(f); continue
    c = f.calc_center_median()
    for h in hides:
        dx, dy = c.x - h['x'], c.y - h['y']
        lx = dx * h['c'] + dy * h['s']; ly = -dx * h['s'] + dy * h['c']
        if abs(lx) < h['hx'] and abs(ly) < h['hy']:
            kill.append(f); break
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# kleine Dachteile (Kamine, Gauben-Reste) entfernen
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(5), verts=bm.verts, edges=bm.edges)
print(f'Dachflächen: {len(bm.faces)}')
edges = [e for e in bm.edges if e.is_boundary]
ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
for g in ret['geom']:
    if isinstance(g, bmesh.types.BMVert):
        g.co.z = base.get(int(g[bid_l]), g.co.z) - 0.6
bm.normal_update()
flipped = 0
for g in ret['geom']:
    if isinstance(g, bmesh.types.BMFace):
        k = int(g.verts[0][bid_l])
        c = cen.get(k)
        if not c:
            continue
        fc = g.calc_center_median()
        out = (fc.x - c[0] / c[2]) * g.normal.x + (fc.y - c[1] / c[2]) * g.normal.y
        if out < 0:
            g.normal_flip(); flipped += 1
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
me.validate()
print(f'Gebäude neu modelliert: {len(me.polygons)} Dreiecke ({flipped} Wände gedreht)')
for crop, suffix in ((None, ''), (750, '_s')):
    o = b.copy(); o.data = me.copy(); col.objects.link(o)
    o.name = 'Buildings'
    if crop:
        # Radius so wählen, dass höchstens ~200k Dreiecke bleiben
        cs = np.array([max(abs(p.center.x), abs(p.center.y)) for p in o.data.polygons])
        for c in (750, 650, 550, 450, 380):
            if (cs <= c).sum() <= 200000:
                break
        print(f'Handy-Radius: {c} m')
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if max(abs(f.calc_center_median().x), abs(f.calc_center_median().y)) > c], context='FACES')
        bm.to_mesh(o.data); bm.free()
    print(f'Gebäude{suffix}: {len(o.data.polygons)} Dreiecke')
    b.hide_set(True)
    export([o], os.path.join(OUT, f'buildings{suffix}.glb'))
    clear([o])

# ---------- Texturen + Metadaten
for f in os.listdir(os.path.join(SRC, 'ortho')):
    shutil.copy(os.path.join(SRC, 'ortho', f), os.path.join(OUT, 'tex', f))
# Handy-Varianten (halbe Auflösung)
for f in os.listdir(os.path.join(OUT, 'tex')):
    if f.endswith('.jpg') and not f.endswith('_s.jpg'):
        img = bpy.data.images.load(os.path.join(OUT, 'tex', f))
        w, h = img.size
        img.scale(max(1, w // 2), max(1, h // 2))
        img.filepath_raw = os.path.join(OUT, 'tex', f.replace('.jpg', '_s.jpg'))
        img.file_format = 'JPEG'
        bpy.context.scene.render.image_settings.quality = 80
        img.save()
        bpy.data.images.remove(img)
shutil.copy(os.path.join(SRC, 'trees.json'), os.path.join(OUT, 'trees.json'))
json.dump({'id': lvl, 'E0': meta['E0'], 'N0': meta['N0'], 'H0': H0, 'core': core, 'mid': mid, 'far': far,
           'chunk': chunk, 'midChunk': mchunk}, open(os.path.join(OUT, 'world.json'), 'w'), indent=1)
print('OK world', lvl, 'H0', H0)
