# Aufruf: blender -b --factory-startup -P tools/blender/build.py -- <modell> <ausgabe.glb>
import sys
import os
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'models'))

import lib  # noqa: E402
import lib2  # noqa: E402
for _k in dir(lib2):
    if not _k.startswith('__'):
        setattr(lib, _k, getattr(lib2, _k))

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
name = argv[0]
out = argv[1]

lib.reset()
mod = importlib.import_module(name)
mod.build(lib)
# .blend zur Kontrolle/Weiterbearbeitung speichern
blend = os.path.join(HERE, 'blend', name + '.blend')
os.makedirs(os.path.dirname(blend), exist_ok=True)
import bpy  # noqa: E402
bpy.ops.wm.save_as_mainfile(filepath=blend)
lib.export(out)
tris = sum(len(o.data.loop_triangles) if (o.type == 'MESH' and (o.data.calc_loop_triangles() or True)) else 0 for o in bpy.data.objects)
print(f'OK {name}: {len(bpy.data.objects)} Objekte, {tris} Dreiecke -> {out}')
