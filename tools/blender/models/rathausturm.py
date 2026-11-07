# Luzerner Rathausturm. Approximate shape from the OSM footprint and the
# riverside photograph documented in docs/luzern-referenzszene.md.
# Origin: LV95 2'665'914.3 / 1'211'590.3; z = local ground level.
import math
import bmesh
from mathutils import Vector

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
    wall = L.mat('rathaus_plaster', (0.78, 0.71, 0.59), meters=3.5)
    frame = L.mat('sandstone_light', (0.72, 0.69, 0.61), meters=3.0)
    glass = L.mat('rathaus_glass', (0.20, 0.26, 0.30), rough=0.3)
    tiles = L.mat('rathaus_roof_tile', (0.47, 0.25, 0.19), meters=2.0)
    paving = L.mat('cobble', (0.45, 0.43, 0.39), meters=3.0)
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
    rathaus(L, wall, frame, glass, dark, tiles, paving)
    # The replacement should only mask the tower's footprint, not the Rathaus.
    # Allow for small footprint differences between OSM and the pre-baked
    # swissBUILDINGS3D surface; otherwise the old wall shows through.
    L.hide_box('Hide_rathausturm', (0, 0, 21), (11.0, 11.4, 44), rot_z=ANGLE)


def rathaus(L, wall, frame, glass, dark, tiles, paving):
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
    L.facade('rathaus_windows', (p0.x, p0.y), (p1.x, p1.y), glass, frame, root,
             floors=2, spacing=4.0, win_w=1.35, win_h=2.25, z_start=6.2, floor_h=3.8,
             margin=2.2, sill=(frame, 0.25))
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
