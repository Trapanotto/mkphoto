import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { repairBuildingHeights } from '../src/building-heights.js';

test('repairs the height of each building relative to its own base', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 2, 0, 0, 24, 0, 0, 7, 0, 0, 17, 0], 3));
  geometry.setAttribute('_batchid', new Float32BufferAttribute([11, 11, 12, 12], 1));
  geometry.setAttribute('_relh', new Float32BufferAttribute([0.6, 0.6, -5, 5], 1));
  repairBuildingHeights(geometry);
  assert.deepEqual(Array.from(geometry.attributes._relh.array), [0, 22, 0, 10]);
});

test('leaves geometry without building attributes untouched', () => {
  assert.doesNotThrow(() => repairBuildingHeights(new BufferGeometry()));
});
