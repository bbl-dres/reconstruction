"""Blender regression: editable FONT export, transforms and visibility gates."""
from pathlib import Path
from types import SimpleNamespace
import bpy,json,sys,hashlib
from mathutils import Matrix
W=Path(__file__).resolve().parents[1];sys.path.insert(0,str(W/'scripts'));from export_model import worker,sha256
out=W/'.work/text-fixture';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;co=bpy.data.collections.new('02 | Test lettering');scene.collection.children.link(co)
parent=bpy.data.objects.new('Moved parent',None);co.objects.link(parent);parent.location=(2,4,6)
def text(name,body,collection,hidden=False):
 data=bpy.data.curves.new(name,'FONT');data.body=body;data.extrude=.01
 ob=bpy.data.objects.new(name,data);collection.objects.link(ob);ob['viewer_id']=name;ob.hide_render=hidden;return ob
ob=text('lettering','CURIA',co);ob.parent=parent;ob.location=(1,0,0)
text('object-hidden','HIDDEN',co,True)
hidden=bpy.data.collections.new('02 | Hidden ancestor');hidden.hide_render=True;scene.collection.children.link(hidden)
child=bpy.data.collections.new('02 | Child');hidden.children.link(child);text('ancestor-hidden','HIDDEN',child)
other=bpy.data.collections.new('09 | Excluded');scene.collection.children.link(other);text('profile-excluded','EXCLUDED',other)
source=out/'source.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True);before=sha256(source)
profile=out/'profile.json';profile.write_text(json.dumps({'includeCollectionPrefixes':['02 |']}))
dest=out/'test.glb';worker(SimpleNamespace(source=source,output=dest,profile=profile))
raw=dest.read_bytes();d=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);nodes=[n for n in d['nodes'] if 'mesh' in n]
assert len(nodes)==1 and nodes[0]['extras']['viewer_id']=='lettering'
assert nodes[0]['extras']['viewer_text']=='CURIA' and nodes[0]['extras']['viewer_source_object_type']=='FONT'
# Resolve hierarchy in the actual glTF axis convention, including parent.
from mathutils import Matrix,Vector,Quaternion
def local(n):
 if 'matrix' in n:return Matrix([n['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
 x,y,z,w=n.get('rotation',[0,0,0,1])
 return Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((w,x,y,z)),Vector(n.get('scale',[1,1,1])))
world={}
def walk(i,m):
 n=d['nodes'][i];world[i]=m@local(n)
 for child in n.get('children',[]):walk(child,world[i])
for i in d['scenes'][d.get('scene',0)]['nodes']:walk(i,Matrix.Identity(4))
i=next(i for i,n in enumerate(d['nodes']) if n.get('extras',{}).get('viewer_id')=='lettering')
assert (world[i].translation-Vector((3,6,-4))).length<1e-5,world[i]
assert sha256(source)==before
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
assert bpy.data.objects['lettering'].type=='FONT' and bpy.data.objects['lettering'].data.body=='CURIA'
report=json.loads(dest.with_suffix('.report.json').read_text());assert len(report['evaluatedText'])==1
print('PASS: visible editable text becomes mesh; object, ancestor and profile exclusions apply; saved source remains editable and unchanged',flush=True)
