import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedTransform, transformedUnits } from '../prototype/room3d.ts';

test('drag bounds account for the rotated footprint', () => {
  const unit = { x: 0, z: 0, rotation: 0, w: 4, d: 2 };
  assert.deepEqual(boundedTransform(unit, { x: 20, z: -20 }), { x: 3, z: -3, rotation: 0 });
  const turned = boundedTransform(unit, { x: 20, z: -20, rotation: Math.PI / 2 });
  assert.equal(turned.x, 4);
  assert.equal(turned.z, -2);
  assert.throws(() => boundedTransform({ ...unit, w: 20 }, {}), /超過房間/);
});

test('moving and rotating a parent preserves nested box relationships', () => {
  const units = [
    { code: 'shelf', x: 0, z: 0, rotation: 0, w: 2, d: 1 },
    { code: 'box', parent: 'shelf', x: 1, z: 0, rotation: .2, w: .5, d: .5 },
    { code: 'other', x: -3, z: 1, rotation: 0, w: 1, d: 1 }
  ];
  const changes = transformedUnits(units, 'shelf', { x: 2, z: 1, rotation: Math.PI / 2 });
  assert.equal(changes.length, 2);
  assert.equal(changes[0].x, 2);
  assert.equal(changes[0].z, 1);
  assert.equal(changes[1].x, 2);
  assert.equal(changes[1].z, 0);
  assert.equal(changes[1].rotation, .2 + Math.PI / 2);
  assert.equal(units[0].x, 0);
  assert.equal(units[1].parent, 'shelf');
});
