import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=process.env.ARCHIVE_REVIEW_REPO?pathToFileURL(process.env.ARCHIVE_REVIEW_REPO+'/'):new URL('../',import.meta.url);
const models=process.env.ARCHIVE_REVIEW_MODELS?pathToFileURL(process.env.ARCHIVE_REVIEW_MODELS+'/'):new URL('public/models/',root);
registerHooks({resolve(s,c,next){if(s==='three')return {url:new URL('public/vendor/three/build/three.module.js',root).href,shortCircuit:true};if(s.startsWith('three/addons/'))return {url:new URL('public/vendor/three/examples/jsm/'+s.slice(13),root).href,shortCircuit:true};return next(s,c);}});
globalThis.ProgressEvent??=class {constructor(type,init){this.type=type;Object.assign(this,init);}};
const {parseCatalog}=await import(new URL('public/js/model-catalog.js',root));
const {parseMetadata}=await import(new URL('public/js/model-metadata.js',root));
const {readGLBBytes}=await import(new URL('tests/helpers/glb-bytes.mjs',root));
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder}=await import(new URL('public/vendor/meshoptimizer/meshopt_decoder.mjs',root));
const {prepareStaticModel}=await import(new URL('public/js/asset-loader.js',root));
const {collisionThroughWorker}=await import(new URL('tests/helpers/collision-worker.mjs',root));
const {Walker}=await import(new URL('public/js/walking.js',root));
const {WALK_STARTS,visibleInMode}=await import(new URL('public/js/model-policy.js',root));
const {PerspectiveCamera}=await import('three');
const catalog=parseCatalog(JSON.parse(await readFile(new URL('catalog.json',models),'utf8')));
test('v027 archive assets retain complete geometry, valid floor views and supported walking starts',async()=>{
 const e=catalog.find(e=>e.version===27);assert(e,'Archive release must be in the catalog');assert(e.levels.includes('second')&&e.levels.includes('tiefparterre'));
 const metadata=parseMetadata(JSON.parse(await readFile(new URL(e.metadata,models),'utf8')),e.levels);assert.deepEqual(metadata.issues,[]);
 const registry=JSON.parse(await readFile(new URL(e.bim,models),'utf8'));assert.equal(registry.sourceSha256,e.sourceSha256);assert.equal(registry.elements.length,1795);assert.equal(registry.unresolvedComponents.length,2858);
 const bytes=await readGLBBytes(new URL(e.building,models));const length=bytes.readUInt32LE(12);const d=JSON.parse(bytes.subarray(20,20+length));const ids=d.nodes.filter(n=>n.mesh!==undefined).map(n=>n.extras.viewer_id);assert.equal(ids.length,10768);assert.equal(new Set(ids).size,ids.length);
 const covered=[...registry.elements.flatMap(p=>p.components.map(c=>c.id)),...registry.unresolvedComponents.map(c=>c.id)];assert.deepEqual(new Set(covered),new Set(ids));assert.equal(new Set(covered).size,covered.length);
 for(const id of metadata.objects.keys())assert(ids.includes(id),id);
 d.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length,28+length+d.buffers[0].byteLength).toString('base64');delete d.materials;delete d.textures;delete d.images;delete d.samplers;for(const m of d.meshes)for(const p of m.primitives)delete p.material;
 const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(d),'');const meshes=await prepareStaticModel(scene,{yieldControl:async()=>{},onMesh:m=>{m.name=m.userData.viewer_source_name||m.name;}});assert.equal(meshes.length,e.meshCount);
 const hiddenTypes=new Set(['type-5efb4d29-0928-5a62-a722-2b5c098b082c','type-f315b3d9-ba4c-5691-a5c8-dab9353df1ad','type-4a02775a-acb6-59e6-9624-f6ebd026705f']);
 const hiddenProducts=registry.elements.filter(p=>hiddenTypes.has(p.typeId));assert.equal(hiddenProducts.length,3);
 const hiddenIds=new Set(hiddenProducts.flatMap(p=>p.components.map(c=>c.id)));hiddenIds.add('d008-a9f4d24d-1c1b-50d7-818f-2600165415ce');
 const topObstructions=meshes.filter(m=>hiddenIds.has(m.userData.viewer_id));assert.equal(topObstructions.length,73);
 for(const m of topObstructions){assert(!visibleInMode(m,'dollhouse','upper',e.levelDefinitions),m.name);for(const mode of ['dollhouse','orbit','walk','plan'])assert(visibleInMode(m,mode,'all',e.levelDefinitions),mode+': '+m.name);}
 const crimson=meshes.find(m=>m.name==='NR v011 upper lunette wall and cartouches | NR v011 gallery crimson');assert(crimson);assert(visibleInMode(crimson,'dollhouse','upper',e.levelDefinitions),'The separate crimson component stays visible');
 for(const floor of ['second','upper','tiefparterre'])assert(meshes.some(m=>visibleInMode(m,'dollhouse',floor,e.levelDefinitions)),floor+' must not be empty');
 assert(meshes.filter(m=>/^Three Confederates simplified sculpture/.test(m.name)).length>=4);
 for(const m of meshes.filter(m=>m.name.includes('North inner arched reveal')||m.name.includes('North timber arched transom')))assert(visibleInMode(m,'dollhouse','lower',e.levelDefinitions),'Inner vestibule must remain visible: '+m.name);
 assert.equal(ids.filter(i=>i.startsWith('archive31-third-offices')).length,24);
 for(const m of meshes){const role=m.userData.viewer_cutaway_role;assert(!role||['interior','enclosure','overhead'].includes(role),'Unsupported cutaway role: '+m.name);}
 for(const m of meshes.filter(m=>m.userData.viewer_id?.startsWith('finish40-')))assert(visibleInMode(m,'dollhouse','all'));
 for(const m of meshes.filter(m=>m.userData.viewer_id?.startsWith('portal40-'))){assert(!visibleInMode(m,'dollhouse','all'));assert(visibleInMode(m,'orbit','all'));}
 for(const floor of ['entrance','tiefparterre','lower','principal','second','upper'])assert(meshes.some(m=>visibleInMode(m,'dollhouse',floor,e.levelDefinitions)),floor);
 const deckIds=new Set(['bh-eb95d233d3e941b6ad144f4b30659436','bh-af2758363054495991c999a0fa869ac6','bh-79e36582454244a49d6efc9e19bd8f08','bh-0ab4fb07da36449db02f4b494e27bdba']);const connectorDecks=meshes.filter(m=>deckIds.has(m.userData.viewer_id));assert.equal(connectorDecks.length,4);
 for(const m of connectorDecks){assert(Math.abs(m.userData.bounds.max.y-7.16)<.0001);assert(visibleInMode(m,'dollhouse','principal',e.levelDefinitions));}
 const {world}=await collisionThroughWorker(meshes);
 for(const [name,start]of Object.entries(WALK_STARTS)){const walker=new Walker(new PerspectiveCamera(),world);assert(walker.spawn(start.position,start.target),'Supported start: '+name);assert(walker.hasSafePosition);}
 console.log('v027: 10,768 imported components, 4,653 IFC membership entries and three supported walking starts.');
});

