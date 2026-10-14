import test from 'node:test';
import assert from 'node:assert/strict';
import { modelScope, visibleModelScope } from '../viewer/js/model-scope.js';

const component = (collections, category = 'stair') => ({ userData: { viewer_source_collections: collections, viewer_category: category } });

test('surroundings toggle hides both context and site, retaining architectural stairs and walls', () => {
  const building = component(['Building_P3']);
  const site = component(['Building_Site']);
  const context = component(['Context_Buildings']);
  assert.deepEqual([building, site, context].map(modelScope), ['building', 'site', 'surroundings']);
  assert.deepEqual([building, site, context].map(mesh => visibleModelScope(mesh, false, 'orbit')), [true, false, false]);
  assert.deepEqual([building, site, context].map(mesh => visibleModelScope(mesh, true, 'orbit')), [true, true, true]);
  assert.deepEqual([building, site, context].map(mesh => visibleModelScope(mesh, true, 'plan')), [true, false, false]);
  assert.equal(site.userData.viewer_source_collections[0], 'Building_Site');
});

test('explicit model ownership survives grouped components and legacy building metadata', () => {
  const grouped = { userData: {}, parent: { userData: { viewer_model_scope: 'site' } } };
  assert.equal(modelScope(grouped), 'site');
  assert.equal(visibleModelScope(grouped, false, 'dollhouse'), false);
  assert.equal(modelScope({ userData: { viewer_model_scope: 'building', viewer_source_collections: ['Building_Site'] } }), 'building');
  assert.equal(visibleModelScope({ userData: { viewer_environment: 'exterior' } }, false, 'orbit'), true);
});
