import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getHideBox } from '../src/hide-box.js';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { toLV95 } from '../src/lv95.js';
import { readFile } from 'node:fs/promises';

const inside = (b, x, z) => {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.angle), s = Math.sin(b.angle);
  return Math.abs(dx * c + dz * s) < b.hx && Math.abs(-dx * s + dz * c) < b.hz;
};

test('rotated geometry excludes houses beside a bridge while retaining the bridge', () => {
  const g = new THREE.BoxGeometry(100, 20, 8);
  g.rotateY(Math.PI / 4); // rotation baked into the mesh, as in the exported GLB
  const mesh = new THREE.Mesh(g);
  mesh.position.set(15, 6, -20);
  mesh.updateMatrixWorld(true);
  const b = getHideBox(mesh);
  assert.ok(Math.abs(b.hx - 50) < 0.001);
  assert.ok(Math.abs(b.hz - 4) < 0.001);
  assert.equal(b.maxY, 16);
  assert.ok(inside(b, 15, -20));
  assert.ok(!inside(b, 35, 0)); // inside the old axis-aligned bounds
});

test('also handles a rotated and translated parent', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 4));
  const parent = new THREE.Group();
  parent.rotation.y = 0.4;
  parent.position.set(20, 3, 30);
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  const b = getHideBox(mesh);
  assert.ok(Math.abs(b.x - 20) < 0.001 && Math.abs(b.z - 30) < 0.001);
  assert.ok(Math.abs(b.hx - 20) < 0.001 && Math.abs(b.hz - 2) < 0.001);
  assert.equal(b.maxY, 8);
});

test('actual Lucerne bridge hide boxes do not cut away the Reuss riverfront', async () => {
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const doc = await io.read('public/models/kapellbruecke.glb');
  const world = JSON.parse(await readFile('public/world/luzern/world.json', 'utf8'));
  const anchor = toLV95(47.05165, 8.30755);
  const placement = new THREE.Matrix4().makeTranslation(anchor.E - world.E0, 0, -(anchor.N - world.N0));
  const boxes = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith('Hide') || !node.getMesh()) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const p = primitive.getAttribute('POSITION');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(p.getArray(), 3));
      const mesh = new THREE.Mesh(geometry);
      mesh.matrixWorld.copy(placement).multiply(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      boxes.push(getHideBox(mesh));
    }
  }
  assert.ok(boxes.length >= 4, 'bridge and tower hide meshes must be present');
  // Actual facade position measured on the old clipped wall; y is below each
  // bridge hide-box ceiling, so the horizontal test alone catches the bug.
  assert.ok(boxes.every((box) => !inside(box, -19.8, -41.7)));
  assert.ok(boxes.some((box) => box.hx > 40 && inside(box, box.x, box.z)));
});
