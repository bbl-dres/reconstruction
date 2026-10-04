import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCatalog} from '../public/js/model-catalog.js';
import {visibleInMode,LEVELS} from '../public/js/model-policy.js';
const base={id:'candidate',version:27,label:'Candidate',building:'./candidate/building.glb',surroundings:'./candidate/surroundings.glb',metadata:'./candidate/viewer.json',levels:['all','principal','second','upper']};
const defs={principal:{label:'Principal',elevation:7.16,min:6.9,max:13},second:{label:'Second',elevation:13.31,min:13.05,max:17.85},upper:{label:'Third',elevation:18.11,min:17.85,max:30.8}};
const parse=m=>parseCatalog({schemaVersion:1,models:[m]})[0];
test('custom level schedules accept second floor and reject malformed or missing cuts',()=>{
 assert.deepEqual(parse({...base,levelDefinitions:defs}).levelDefinitions,defs);
 for(const d of [null,{}, {...defs,second:{...defs.second,max:12}}, {...defs,second:{...defs.second,elevation:NaN}}])assert.throws(()=>parse({...base,levelDefinitions:d}));
 assert.throws(()=>parse(base));
});
test('legacy catalog remains valid and keeps the original floor contract',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../public/models/catalog.json',import.meta.url),'utf8'));
 assert.equal(parseCatalog(catalog).length,catalog.models.length);
 assert.equal(LEVELS.upper.label,'Room 301');assert.equal(LEVELS.principal.elevation,7.55);
});
const mesh=(lo,hi,extra={})=>({name:'Upper corridor',userData:{viewer_floor_ids:['principal'],viewer_cutaway_role:'interior',bounds:{min:{y:lo},max:{y:hi}},...extra}});
test('archive floors use height bounds despite stale legacy tags and upper-room restriction',()=>{
 const m=mesh(18.1,19.5);
 assert.equal(visibleInMode(m,'dollhouse','upper'),false);
 assert.equal(visibleInMode(m,'dollhouse','upper',defs),true);
 assert.equal(visibleInMode(m,'dollhouse','second',defs),false);
 assert.equal(visibleInMode(mesh(13.2,16),'plan','second',defs),true);
 assert.equal(visibleInMode(mesh(13.2,16,{viewer_cutaway_role:'enclosure'}),'dollhouse','second',defs),false);
});
