// Level picker order and Page Up / Page Down stepping; no browser or WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedLevels, adjacentLevel } from '../viewer/js/levels.js';

const definitions = {
  entrance: { label: 'South public entrance', elevation: -4.2 },
  lower: { label: 'Hochparterre and lower hall', elevation: 2.16 },
  principal: { label: 'Principal floor', elevation: 7.16 },
  upper: { label: '3. Obergeschoss', elevation: 18.11 },
};

test('levels are listed highest first, without All levels or undefined levels', () => {
  assert.deepEqual(orderedLevels(['all', 'entrance', 'principal', 'lower', 'upper', 'unknown'], definitions),
    ['upper', 'principal', 'lower', 'entrance']);
  assert.deepEqual(orderedLevels(['all'], definitions), [], 'a model without levels hides the picker');
});

test('Page Down walks from All levels to the top level and down; Page Up returns', () => {
  const ordered = orderedLevels(Object.keys(definitions), definitions);
  assert.equal(adjacentLevel('all', -1, ordered), 'upper');
  assert.equal(adjacentLevel('upper', -1, ordered), 'principal');
  assert.equal(adjacentLevel('entrance', -1, ordered), 'entrance', 'stops at the lowest level');
  assert.equal(adjacentLevel('principal', 1, ordered), 'upper');
  assert.equal(adjacentLevel('upper', 1, ordered), 'all');
  assert.equal(adjacentLevel('all', 1, ordered), 'all', 'stops at All levels');
});

test('Floor plan steps between levels only, and an unknown level starts at the top', () => {
  const ordered = orderedLevels(Object.keys(definitions), definitions);
  assert.equal(adjacentLevel('upper', 1, ordered, true), 'upper', 'All levels is not a floor plan');
  assert.equal(adjacentLevel('principal', -1, ordered, true), 'lower');
  assert.equal(adjacentLevel('missing', -1, ordered), 'all');
  assert.equal(adjacentLevel('missing', -1, ordered, true), 'upper');
  assert.equal(adjacentLevel('all', -1, [], false), 'all', 'no levels, no change');
});
