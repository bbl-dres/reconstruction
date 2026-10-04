import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleInMode } from '../public/js/model-policy.js';
const mesh = (data={}) => ({name:'New authored component',userData:{viewer_floor_ids:['principal'],bounds:{min:{x:0,y:7.55,z:0},max:{x:1,y:12,z:1}},...data}});
test('cutaway presentation does not change physical category or Exterior, Walk and plan visibility',()=>{
  for(const category of ['column','window','wall','cladding']) for(const role of ['enclosure','overhead']) {
    const m=mesh({viewer_cutaway_role:role,viewer_category:category,viewer_id:'test-'+category});
    const before=JSON.stringify(m.userData);
    assert.equal(visibleInMode(m,'dollhouse','principal'),false);
    for(const mode of ['orbit','walk','plan'])assert.equal(visibleInMode(m,mode,'principal'),true);
    assert.equal(JSON.stringify(m.userData),before);
  }
});
test('explicit interior overrides inherited cutaway flags but still respects floor membership',()=>{
 const m=mesh({viewer_cutaway_role:'interior',viewer_dollhouse_hidden:true,viewer_source_collections:['02d | misplaced shell collection']});
 assert(visibleInMode(m,'dollhouse','principal'));
 assert(!visibleInMode(m,'dollhouse','lower'));
 assert(!visibleInMode(mesh({viewer_cutaway_role:'interior',viewer_role:'collision'}),'dollhouse'));
 assert(visibleInMode(mesh({viewer_cutaway_role:'interior',viewer_role:'ceiling',viewer_source_collections:['02b | Connecting galleries']}),'dollhouse','principal'));
});
test('a new interior wall or column is retained without guessing from its name or height',()=>{
 for(const category of ['wall','column']) {
  const m=mesh({viewer_category:category,viewer_role:'interior-wall'});m.name='New roof-looking internal wall';
  assert(visibleInMode(m,'dollhouse','principal'));
 }
});
test('audited lantern assembly leaves with the roof and returns in Exterior',()=>{
 const m=mesh({viewer_id:'d008-fc0fe003-3f79-51e7-b223-3239273707a8',viewer_category:'column'});
 assert(!visibleInMode(m,'dollhouse'));
 assert(visibleInMode(m,'orbit'));
 // An explicit corrected native tag supersedes the old component-ID fallback.
 m.userData.viewer_cutaway_role='interior';assert(visibleInMode(m,'dollhouse'));
});


test('archive third floor does not revive enclosure hidden in the whole-building cutaway',()=>{
 const definitions={upper:{min:17.85,max:30.8}};
 const m=mesh({viewer_dollhouse_hidden:true,viewer_source_collections:['08c | Conference room 301'],viewer_floor_ids:['upper'],bounds:{min:{y:20},max:{y:23}}});
 assert(visibleInMode(m,'dollhouse','upper'),'Legacy Room 301 remains compatible');
 assert(!visibleInMode(m,'dollhouse','upper',definitions));
 assert(!visibleInMode(m,'dollhouse','all',definitions));
 assert(visibleInMode(m,'orbit','upper',definitions));
 assert(visibleInMode(m,'walk','upper',definitions));
 m.userData.viewer_cutaway_role='interior';
 assert(visibleInMode(m,'dollhouse','upper',definitions),'Authored interior still takes precedence');
});

test('selected top-floor obstructions are hidden only in the versioned upper Dollhouse view', () => {
  const definitions = { upper: { min: 17.85, max: 30.8 } };
  const selections = [
    { viewer_element_id: 'archive-floor-third-south-workplace' },
    { viewer_element_id: 'archive-floor-third-offices' },
    { viewer_element_id: 'archive-floor-second' },
    { viewer_id: 'd008-a9f4d24d-1c1b-50d7-818f-2600165415ce' },
  ];
  for (const selection of selections) {
    const m = mesh({ ...selection, viewer_role: 'floor', viewer_cutaway_role: 'interior',
      viewer_floor_ids: ['upper'], viewer_room_ids: ['room-301'], bounds: { min: { y: 20 }, max: { y: 21 } } });
    const before = JSON.stringify(m.userData);
    assert(!visibleInMode(m, 'dollhouse', 'upper', definitions));
    assert(visibleInMode(m, 'dollhouse', 'all', definitions));
    assert(visibleInMode(m, 'dollhouse', 'upper'), 'Legacy Room 301 keeps its original behavior');
    for (const mode of ['orbit', 'walk', 'plan']) assert(visibleInMode(m, mode, 'upper', definitions), mode);
    assert.equal(JSON.stringify(m.userData), before, 'Visibility must not alter source metadata');
  }
  const other = mesh({ viewer_element_id: 'another-floor', viewer_cutaway_role: 'interior',
    bounds: { min: { y: 20 }, max: { y: 21 } } });
  assert(visibleInMode(other, 'dollhouse', 'upper', definitions), 'Unselected interior geometry stays visible');
});
