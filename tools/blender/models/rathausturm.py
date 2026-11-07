# Luzerner Rathausturm. Approximate shape from the OSM footprint and the
# riverside photograph documented in docs/luzern-referenzszene.md.
# Origin: LV95 2'665'914.3 / 1'211'590.3; z = local ground level.
import math
import bmesh
import bpy
from mathutils import Vector
from mathutils import Matrix

ANGLE = math.radians(16.6)


def ringed_roof(L, name, center, rings, material, parent, sides=16):
    bm = bmesh.new()
    rows = []
    for z, radius in rings:
        rows.append([bm.verts.new((center[0] + radius * math.cos(ANGLE + 2 * math.pi * k / sides),
                                   center[1] + radius * math.sin(ANGLE + 2 * math.pi * k / sides), z))
                     for k in range(sides)])
    for a, b in zip(rows, rows[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L._finish(name, bm, [material], parent)


def disk(L, name, center, along, radius, material, parent):
    bm = bmesh.new()
    verts = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        verts.append(bm.verts.new(center + along * (radius * math.cos(a)) + Vector((0, 0, radius * math.sin(a)))))
    face = bm.faces.new(verts)
    bm.normal_update()
    if face.normal.dot(along.cross(Vector((0, 0, 1)))) < 0:
        face.normal_flip()
    return L._finish(name, bm, [material], parent)


def build(L):
    stone = L.mat('stone_tower', (0.48, 0.46, 0.42), meters=3.5)
    edge = L.mat('sandstone_old', (0.58, 0.56, 0.51), meters=2.5)
    roof = L.mat('rathaus_roof', (0.42, 0.15, 0.12), meters=2.0)
    dark = L.mat('dark', (0.03, 0.03, 0.035))
    blue = L.mat('rathaus_clock_blue', (0.06, 0.14, 0.35))
    red = L.mat('rathaus_clock_red', (0.42, 0.12, 0.09))
    gold = L.mat('gold', (0.75, 0.60, 0.22), metal=1.0)
    wall = L.mat('rathaus_stone', (0.70, 0.68, 0.62), meters=4.0)
    frame = L.mat('sandstone_light', (0.72, 0.69, 0.61), meters=3.0)
    glass = L.mat('rathaus_glass', (0.20, 0.26, 0.30), rough=0.3)
    tiles = L.mat('rathaus_roof_tile', (0.47, 0.25, 0.19), meters=2.0)
    paving = L.mat('cobble', (0.45, 0.43, 0.39), meters=3.0)
    flag_red = L.mat('flag_red', (0.8, 0.03, 0.03))
    flag_white = L.mat('flag_white', (0.95, 0.95, 0.92))
    flag_blue = L.mat('flag_luzern_blue', (0.05, 0.2, 0.55))
    pf_wall = L.mat('pfistern_plaster', (0.84, 0.84, 0.80), meters=3.5)
    pf_frame = L.mat('pfistern_frame', (0.36, 0.39, 0.40))
    pf_glass = L.mat('pfistern_glass', (0.12, 0.16, 0.19), rough=0.25)
    awning = L.mat('pfistern_awning', (0.88, 0.79, 0.53))
    root = L.empty('Rathausturm')
    L.box('tower_shaft', (0, 0, 15.5), (8.1, 8.4, 31.0), stone, root, rot_z=ANGLE)
    L.box('tower_cornice', (0, 0, 30.9), (8.8, 9.1, 0.4), edge, root, rot_z=ANGLE)
    # Small openings on the stone faces, visible from close drone viewpoints.
    along = Vector((math.cos(ANGLE), math.sin(ANGLE), 0))
    outward = Vector((math.sin(ANGLE), -math.cos(ANGLE), 0))
    for side in (-1, 1):
        n = outward * side
        for i, z in enumerate((14.5, 20.0)):
            p = n * 4.22
            L.window(f'slit_{side}_{i}', (p.x, p.y, z), ANGLE, n,
                     0.35, 1.1, dark, edge, root, mullion=False)
    # The broad dark red dome, lantern, and four corner turrets are important
    # silhouette features; dimensions remain an approximation for review.
    ringed_roof(L, 'tower_dome', (0, 0), [(31, 4.2), (31.8, 4.7), (33.2, 4.45),
                 (35.3, 3.65), (37.3, 2.35), (38.1, 1.45)], roof, root)
    L.prism('lantern_base', (0, 0, 38.0), 1.3, 0.35, 8, roof, root, rot=ANGLE)
    L.prism('lantern', (0, 0, 38.35), 0.9, 1.9, 8, dark, root, rot=ANGLE)
    L.prism('lantern_roof', (0, 0, 40.25), 1.3, 0.7, 8, roof, root, radius_top=0.12, rot=ANGLE)
    L.prism('finial', (0, 0, 40.95), 0.055, 2.1, 8, gold, root)
    c, s = math.cos(ANGLE), math.sin(ANGLE)
    for i, (x, y) in enumerate(((-3.25, -3.25), (-3.25, 3.25), (3.25, -3.25), (3.25, 3.25))):
        p = (x * c - y * s, x * s + y * c)
        L.prism(f'corner_base{i}', (*p, 31.0), 0.8, 2.0, 8, roof, root, rot=ANGLE)
        L.prism(f'corner_cap{i}', (*p, 33.0), 0.88, 1.25, 8, roof, root, radius_top=0.04, rot=ANGLE)
        L.prism(f'corner_tip{i}', (*p, 34.25), 0.035, 0.45, 6, gold, root)
    # Riverside clock: dark blue outer field, red centre and gold markers.
    normal = outward
    clock = normal * 4.23 + Vector((0, 0, 28.2))
    disk(L, 'clock_outer', clock, along, 2.05, blue, root)
    disk(L, 'clock_inner', clock + normal * 0.025, along, 1.57, red, root)
    for k in range(12):
        a = math.pi * 2 * k / 12
        direction = along * math.cos(a) + Vector((0, 0, math.sin(a)))
        L.beam_between(f'clock_mark{k}', clock + normal * 0.06 + direction * 1.64,
                       clock + normal * 0.06 + direction * 1.91, 0.09, gold, root)
    for k, (a, length) in enumerate(((math.radians(65), 1.15), (math.radians(158), 0.8))):
        direction = along * math.cos(a) + Vector((0, 0, math.sin(a)))
        L.beam_between(f'clock_hand{k}', clock + normal * 0.07,
                       clock + normal * 0.07 + direction * length, 0.09, gold, root)
    L.merge_children(root)
    rathaus(L, wall, frame, glass, dark, tiles, paving, flag_red, flag_white, flag_blue)
    pfistern(L, pf_wall, frame, pf_frame, pf_glass, dark, tiles, paving, flag_white, awning)
    # The replacement should only mask the tower's footprint, not the Rathaus.
    # Allow for small footprint differences between OSM and the pre-baked
    # swissBUILDINGS3D surface; otherwise the old wall shows through.
    L.hide_box('Hide_rathausturm', (0, 0, 21), (11.0, 11.4, 44), rot_z=ANGLE)


def rathaus(L, wall, frame, glass, dark, tiles, paving, flag_red, flag_white, flag_blue):
    """Main Rathaus volume and riverside arcade, positioned from OSM.

    The shaped arcade and roof are an approximation for the first visual
    pass; retain the existing terrain and neighbouring building meshes.
    """
    along = Vector((math.cos(ANGLE), math.sin(ANGLE), 0))
    normal = Vector((math.sin(ANGLE), -math.cos(ANGLE), 0))
    front = Vector((2.9, -31.7, 0))
    length, depth = 29.2, 23.4
    center = front - normal * (depth / 2)
    root = L.empty('Rathaus')
    L.box('rathaus_paving', (center.x, center.y, 0.03), (length, depth, 0.16), paving, root, rot_z=ANGLE)
    L.box('rathaus_upper', (center.x, center.y, 10.2), (length, depth, 10.4), wall, root, rot_z=ANGLE)
    L.box('rathaus_floor_band', (center.x, center.y, 5.0), (length + 0.2, depth + 0.2, 0.25), frame, root, rot_z=ANGLE)
    L.box('rathaus_middle_band', (center.x, center.y, 9.65), (length + 0.15, depth + 0.15, 0.22), frame, root, rot_z=ANGLE)
    L.box('rathaus_eave_band', (center.x, center.y, 15.25), (length + 0.4, depth + 0.4, 0.3), frame, root, rot_z=ANGLE)
    # Lower side and rear walls; the river side is an open arcade.
    back = center - normal * (depth / 2 - 0.15)
    L.box('rathaus_back', (back.x, back.y, 2.5), (length, 0.3, 5.0), wall, root, rot_z=ANGLE)
    for side in (-1, 1):
        p = center + along * (side * (length / 2 - 0.15))
        L.box(f'rathaus_side{side}', (p.x, p.y, 2.5), (0.3, depth, 5.0), wall, root, rot_z=ANGLE)
    inner = front - normal * 3.2
    L.box('arcade_rear', (inner.x, inner.y, 2.35), (length, 0.18, 4.7), wall, root, rot_z=ANGLE)
    for i in range(5):
        p = inner + along * ((i - 2) * 5.1) + normal * 0.12
        L.box(f'arcade_door{i}', (p.x, p.y, 1.25), (1.35, 0.08, 2.5), dark, root, rot_z=ANGLE)
    # Eight stone piers and seven arch rings frame the riverfront arcade.
    bays = 7
    step = length / bays
    for i in range(bays + 1):
        p = front + along * (-length / 2 + i * step)
        L.box(f'arcade_pier{i}', (p.x, p.y, 1.65), (0.46, 0.62, 3.3), frame, root, rot_z=ANGLE)
        L.box(f'arcade_cap{i}', (p.x, p.y, 3.28), (0.7, 0.8, 0.22), frame, root, rot_z=ANGLE)
    for i in range(bays):
        mid = front + along * (-length / 2 + (i + 0.5) * step)
        radius = (step - 0.46) / 2
        points = []
        for j in range(9):
            a = math.pi * j / 8
            points.append(mid + along * (radius * math.cos(a)) + Vector((0, 0, 3.25 + 1.25 * math.sin(a))))
        for j in range(8):
            L.beam_between(f'arcade_arch{i}_{j}', points[j], points[j + 1], 0.18, frame, root)
    p0 = front - along * (length / 2) + normal * 0.16
    p1 = front + along * (length / 2) + normal * 0.16
    # The lower row has round arches; the upper row is rectangular.
    L.facade('rathaus_round_windows', (p0.x, p0.y), (p1.x, p1.y), glass, frame, root,
             floors=1, spacing=3.5, win_w=1.3, win_h=2.35, z_start=6.1,
             margin=1.8, arch='round', sill=(frame, 0.25))
    L.facade('rathaus_upper_windows', (p0.x, p0.y), (p1.x, p1.y), glass, frame, root,
             floors=1, spacing=3.5, win_w=1.3, win_h=2.15, z_start=10.2,
             margin=1.8, sill=(frame, 0.25), lintel=(frame, 0.22))
    # The reference shows the Swiss and Lucerne flags on projecting poles.
    for i, offset in enumerate((-5.0, 5.0)):
        pole_base = front + along * offset + normal * 0.25 + Vector((0, 0, 9.7))
        pole_tip = pole_base + normal * 2.0 + Vector((0, 0, 1.7))
        L.beam_between(f'flag_pole{i}', pole_base, pole_tip, 0.07, frame, root)
        p = pole_tip + along * 0.55
        if i == 0:
            L.box('swiss_flag', (p.x, p.y, p.z - 0.65), (1.1, 0.06, 1.3), flag_red, root, rot_z=ANGLE)
            q = p + normal * 0.045
            L.box('swiss_cross_v', (q.x, q.y, p.z - 0.65), (0.18, 0.03, 0.65), flag_white, root, rot_z=ANGLE)
            L.box('swiss_cross_h', (q.x, q.y, p.z - 0.65), (0.58, 0.03, 0.18), flag_white, root, rot_z=ANGLE)
        else:
            L.box('luzern_flag_white', (p.x, p.y, p.z - 0.325), (1.1, 0.06, 0.65), flag_white, root, rot_z=ANGLE)
            L.box('luzern_flag_blue', (p.x, p.y, p.z - 0.975), (1.1, 0.06, 0.65), flag_blue, root, rot_z=ANGLE)
    L.hip_roof('rathaus_roof', (center.x, center.y, 0), length + 1.6, depth + 1.6,
               15.35, 8.4, tiles, root, rot=ANGLE, ridge_frac=0.66, overhang=0.0)
    # Low riverside dormers break up the broad roof silhouette.
    dormer_line = center + normal * (depth / 2 - 3.2)
    for i in range(4):
        p = dormer_line + along * ((i - 1.5) * 5.5)
        z = 17.6
        L.box(f'dormer_body{i}', (p.x, p.y, z + 0.55), (2.0, 1.5, 1.1), wall, root, rot_z=ANGLE)
        fp = p + normal * 0.78
        L.window(f'dormer_window{i}', (fp.x, fp.y, z + 0.1), ANGLE, normal,
                 0.75, 0.9, glass, frame, root)
        a = p + normal * 1.0
        b = p - normal * 1.0
        L.gable_roof(f'dormer_roof{i}', (a.x, a.y), (b.x, b.y), 2.5,
                     z + 1.1, z + 1.8, tiles, frame, root, overhang=0.1, thick=0.1)
    L.merge_children(root)
    # Mask the full pre-baked roof as well as its walls: the source roof can
    # be much taller than the lower, reference-based replacement roof.
    L.hide_box('Hide_rathaus', (center.x, center.y, 30), (length + 1.2, depth + 1.2, 62), rot_z=ANGLE)


def pfistern(L, wall, frame, window_frame, glass, dark, tiles, paving, white, awning):
    """First geometry pass of the adjacent Zunfthaus, from its OSM footprint.

    Painted coats of arms are not represented yet; the separate image study
    is an illustrative reference and deliberately not used as a texture.
    """
    ang = math.radians(20.0)
    along = Vector((math.cos(ang), math.sin(ang), 0))
    normal = Vector((math.sin(ang), -math.cos(ang), 0))
    front = Vector((-25.0, -33.15, 0))
    length, depth = 12.5, 15.4
    center = front - normal * (depth / 2)
    root = L.empty('Pfistern')
    L.box('pfistern_upper', (center.x, center.y, 10.4), (length, depth, 14.0), wall, root, rot_z=ang)
    L.box('pfistern_floor', (center.x, center.y, 0.03), (length, depth, 0.16), paving, root, rot_z=ang)
    inner = front - normal * 2.8
    L.box('pfistern_arcade_back', (inner.x, inner.y, 1.75), (length, 0.2, 3.5), dark, root, rot_z=ang)
    for side in (-1, 1):
        p = center + along * side * (length / 2 - 0.15)
        L.box(f'pfistern_side{side}', (p.x, p.y, 1.75), (0.3, depth, 3.5), wall, root, rot_z=ang)
    bays = 3
    step = length / bays
    for i in range(bays + 1):
        p = front + along * (-length / 2 + i * step)
        L.box(f'pfistern_pier{i}', (p.x, p.y, 1.25), (0.44, 0.6, 2.5), frame, root, rot_z=ang)
    for i in range(bays):
        mid = front + along * (-length / 2 + (i + 0.5) * step)
        r = (step - 0.44) / 2
        points = [mid + along * (r * math.cos(math.pi * j / 8)) + Vector((0, 0, 2.5 + 0.8 * math.sin(math.pi * j / 8))) for j in range(9)]
        for j in range(8):
            L.beam_between(f'pfistern_arch{i}_{j}', points[j], points[j + 1], 0.2, frame, root)
    # Balcony and striped restaurant canopy.
    balcony = front + normal * 0.65
    L.box('pfistern_balcony', (balcony.x, balcony.y, 3.55), (length, 1.5, 0.22), frame, root, rot_z=ang)
    a = balcony - along * (length / 2 - 0.2) + normal * 0.7
    b = balcony + along * (length / 2 - 0.2) + normal * 0.7
    L.railing('pfistern_railing', (a.x, a.y), (b.x, b.y), 3.65, 1.0, 0.22, dark, root, post=0.04)
    for i in range(24):
        p = front + along * (-length / 2 + (i + 0.5) * length / 24) + normal * 0.6
        L.box(f'pfistern_awning{i}', (p.x, p.y, 6.4), (length / 24 + 0.01, 1.5, 0.08),
              white if i % 2 == 0 else awning, root, rot_z=ang)
    p0 = front - along * (length / 2) + normal * 0.16
    p1 = front + along * (length / 2) + normal * 0.16
    for i, z in enumerate((7.2, 10.2, 13.3)):
        L.facade(f'pfistern_windows{i}', (p0.x, p0.y), (p1.x, p1.y), glass, window_frame, root,
                 floors=1, spacing=4.0, win_w=1.8, win_h=1.8, z_start=z,
                 margin=1.6, sill=(frame, 0.2))
    L.gable_wall('pfistern_gable', (front.x, front.y), length, 17.4, 17.4, 21.0, 0.22,
                 ang + math.pi / 2, wall, root)
    L.facade('pfistern_gable_windows', (p0.x, p0.y), (p1.x, p1.y), glass, window_frame, root,
             floors=1, spacing=3.2, win_w=1.4, win_h=1.5, z_start=17.6, margin=3.0)
    pback = front - normal * depth
    L.gable_roof('pfistern_roof', (front.x, front.y), (pback.x, pback.y), length + 0.9,
                 17.4, 21.0, tiles, frame, root, overhang=0.4, thick=0.15)
    # Convert lettering to mesh before export so browsers do not need fonts.
    curve = bpy.data.curves.new('Pfistern_label', 'FONT')
    curve.body = 'Zunfthaus zu Pfistern'
    curve.align_x = 'CENTER'
    curve.size = 0.7
    obj = bpy.data.objects.new('Pfistern_label', curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    n = normal
    orientation = Matrix(((along.x, 0, n.x), (along.y, 0, n.y), (0, 1, 0))).to_4x4()
    p = front + normal * 0.27 + Vector((0, 0, 12.25))
    obj.matrix_world = Matrix.Translation(p) @ orientation
    obj.data.materials.append(dark)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    L.merge_children(root)
    L.hide_box('Hide_pfistern', (center.x, center.y, 20), (length + 0.6, depth + 0.6, 42), rot_z=ang)
