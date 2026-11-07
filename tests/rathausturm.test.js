import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { getHideBox } from '../src/hide-box.js';

test('exported riverside clock faces point outwards and remain separately visible', async () => {
  const doc = await new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  }).read('public/models/rathausturm.glb');
  const parts = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const faces = ['rathaus_clock_blue', 'rathaus_clock_red'].map((name) => {
    const part = parts.find((p) => p.getMaterial()?.getName() === name);
    assert.ok(part, `${name} is missing`);
    return part.getAttribute('NORMAL').getArray();
  });
  for (const n of faces) assert.ok(n[2] > 0.9, 'clock face must face the river in glTF coordinates');
});

test('Rathaus roof mask covers the old roof without swallowing a neighbouring house', async () => {
  const doc = await new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  }).read('public/models/rathausturm.glb');
  const node = doc.getRoot().listNodes().find((n) => n.getName() === 'Hide_rathaus');
  assert.ok(node);
  const p = node.getMesh().listPrimitives()[0].getAttribute('POSITION');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(p.getArray(), 3));
  const mesh = new THREE.Mesh(geometry);
  mesh.matrixWorld.fromArray(node.getWorldMatrix());
  const b = getHideBox(mesh);
  assert.ok(b.maxY > 50, 'old roof must be masked above the replacement');
  const inside = (x, z) => {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.angle), s = Math.sin(b.angle);
    return Math.abs(dx * c + dz * s) < b.hx && Math.abs(-dx * s + dz * c) < b.hz;
  };
  assert.ok(inside(b.x, b.z), 'replacement footprint should be covered');
  assert.ok(!inside(b.x + 35, b.z), 'nearby buildings must remain outside');
});
