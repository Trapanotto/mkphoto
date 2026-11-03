# Bäume für die Instanzierung im Spiel: Laubbaum und Nadelbaum, Höhe normiert auf 1 m, Fuss bei 0.
import math
import random
import bmesh
from mathutils import Matrix


def canopy_blobs(L, name, parent, mat, blobs, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    for (x, y, z, r) in blobs:
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r,
                                   matrix=Matrix.Translation((x + rnd.uniform(-0.02, 0.02), y + rnd.uniform(-0.02, 0.02), z)))
    # leicht verbeulen
    for v in bm.verts:
        v.co *= 1.0 + rnd.uniform(-0.06, 0.06)
    return L._finish(name, bm, [mat], parent, uv=False)


def build(L):
    bark = L.mat('bark', (0.28, 0.22, 0.17), meters=0.5)
    leaves = L.mat('leaves', (0.20, 0.36, 0.14))
    needles = L.mat('needles', (0.12, 0.24, 0.12))

    # Laubbaum: Stamm 0..0.45, Krone als Kugelgruppe
    lb = L.empty('Laubbaum')
    L.prism('lb_trunk', (0, 0, 0), 0.035, 0.5, 6, bark, lb, radius_top=0.022)
    canopy_blobs(L, 'lb_crown', lb, leaves, [
        (0, 0, 0.66, 0.24), (0.12, 0.05, 0.58, 0.18), (-0.11, -0.06, 0.6, 0.19),
        (0.04, -0.12, 0.72, 0.17), (-0.05, 0.11, 0.78, 0.16), (0, 0, 0.86, 0.13)], 3)
    L.merge_children(lb)

    # Nadelbaum: Stamm + gestaffelte Kegel
    nb = L.empty('Nadelbaum')
    L.prism('nb_trunk', (0, 0, 0), 0.025, 0.3, 6, bark, nb, radius_top=0.018)
    for k, (z, r, h) in enumerate(((0.18, 0.21, 0.36), (0.38, 0.17, 0.32), (0.56, 0.13, 0.28), (0.72, 0.09, 0.28))):
        L.prism(f'nb_cone{k}', (0, 0, z), r, h, 8, needles, nb, radius_top=0.005, rot=k * 0.4)
    L.merge_children(nb)
