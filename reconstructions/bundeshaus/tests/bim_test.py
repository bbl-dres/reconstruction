"""Offline BIM contracts; IFC revision tests use the optional pinned toolchain."""
from pathlib import Path
import contextlib,copy,hashlib,io,json,shutil,struct,sys,unittest,uuid
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from bim_registry import identity,validate_registry
import import_versions as importer
try:
    import ifcopenshell
    import ifcopenshell.util.element
    from export_ifc import export,global_id,validate_product_types
    from bim_geometry import Geometry
except ImportError:
    ifcopenshell=None

def fixture(folder,revision=1):
    vertices=[[-.5,0,-.5],[.5,0,-.5],[.5,1,-.5],[-.5,1,-.5],[-.5,0,.5],[.5,0,.5],[.5,1,.5],[-.5,1,.5]]
    faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5]
    binary=bytearray();views=[];accessors=[];meshes=[]
    for k in range(2):
        vv=copy.deepcopy(vertices)
        if revision==2 and k==1:vv[6][0]=.35 # Refinement preserves the AABB.
        for values,fmt,count,typ,bounds in [(sum(vv,[]),'f',8,'VEC3',{'min':[-.5,0,-.5],'max':[.5,1,.5]}),(faces,'I',len(faces),'SCALAR',{})]:
            part=struct.pack('<'+str(len(values))+fmt,*values);views.append({'buffer':0,'byteOffset':len(binary),'byteLength':len(part)});binary.extend(part)
            accessors.append(dict(bufferView=len(views)-1,componentType=5126 if fmt=='f' else 5125,count=count,type=typ,**bounds))
        meshes.append({'primitives':[{'attributes':{'POSITION':k*2},'indices':k*2+1,'material':0}]})
    elements=[];nodes=[]
    for name,x,typ in ([('a',0,'shared'),('b',3,'shared'),('c',6,'refined')] if revision==1 else [('a',1,'shared'),('c',6,'refined'),('d',9,'shared')]):
        root=identity();root[12]=x;ident='part-'+name
        nodes.append({'mesh':0 if typ=='shared' else 1,'matrix':root,'extras':{'viewer_id':ident}})
        elements.append(dict(id=name,name='Fixture chair '+name,category='chair',typeId=typ,rootMatrix=root,components=[dict(id=ident,slot=0,localMatrix=identity())],primaryStorey='principal',storeyRefs=[],roomIds=[],environment='interior',ifcClass='IfcFurniture',bounds=[[x-.5,0,-.5],[x+.5,1,.5]],quantities={},properties={'seatNumber':ord(name)-96},membership='reviewed',evidence=dict(basis='authored',confidence='high',source='Synthetic regression fixture',geometry='Cubes, not building data')))
    doc=dict(asset={'version':'2.0'},scene=0,scenes=[{'nodes':list(range(len(nodes)))}],nodes=nodes,meshes=meshes,materials=[{'pbrMetallicRoughness':{'baseColorFactor':[.5,.3,.1,1]}}],buffers=[{'byteLength':len(binary)}],bufferViews=views,accessors=accessors)
    data=dict(schemaVersion=1,modelId='fixture-v'+str(revision),projectId='fixture',projectNamespace='b2ed4189-5941-542d-9227-9b4b3c9a7688',sourceSha256=str(revision)*64,units='m',coordinateSystem='glTF-Y-up',conversionTolerance=.001,storeys=[dict(id='principal',name='Principal',elevation=0,provisional=True)],families=[dict(id='chairs',name='Chair',category='chair')],types=[dict(id='shared',familyId='chairs',name='Shared chair',revision=1,prototypeElementId='a'),dict(id='refined',familyId='chairs',name='Refined chair',revision=revision,prototypeElementId='c')],elements=elements,openings=[],unresolvedComponents=[],coverage=[dict(category='chair',status='complete-modeled-category',scope='Synthetic modeled chairs')],caveats=[])
    encoded=json.dumps(doc).encode();encoded+=b' '*(-len(encoded)%4)
    glb=folder/f'fixture-{revision}.glb';registry=folder/f'fixture-{revision}.json'
    glb.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
    registry.write_text(json.dumps(data),encoding='utf-8')
    return doc,data,glb,registry

class RegistryTests(unittest.TestCase):
    def setUp(self):
        (ROOT/'.work').mkdir(exist_ok=True)
        self.folder=(ROOT/'.work'/('bim-test-'+uuid.uuid4().hex)).resolve();self.folder.mkdir()
        self.addCleanup(self.clean_fixture)
        self.doc,self.data,self.glb,self.registry=fixture(self.folder)

    def clean_fixture(self):
        assert self.folder.parent==(ROOT/'.work').resolve() and self.folder.name.startswith('bim-test-')
        shutil.rmtree(self.folder)

    def test_coverage_and_whole_product_ownership(self):
        result=validate_registry(self.data,self.doc,'fixture-v1','1'*64)
        self.assertEqual(result['products'],3);self.assertEqual(result['ownedComponents'],3)
        for mutate in [lambda d:d['elements'][1]['components'][0].update(id='part-a'),lambda d:d['elements'][0]['components'][0]['localMatrix'].__setitem__(12,.1),lambda d:d.update(sourceSha256='2'*64),lambda d:d['elements'][0].update(parentId='a'),lambda d:d.update(coverage=[])]:
            bad=copy.deepcopy(self.data);mutate(bad)
            with self.assertRaises(ValueError):validate_registry(bad,self.doc,'fixture-v1','1'*64)

    def test_floor_footprint_quantity_and_slab_class(self):
        self.data['elements'][0]['ifcClass']='IfcSlab'
        self.data['elements'][0]['quantities']['floorArea']=dict(value=12.5,unit='m2',method='Projected union',source='Synthetic fixture',confidence='high')
        self.assertEqual(validate_registry(self.data,self.doc)['products'],3)
        self.data['elements'][0]['quantities']['floorArea']['value']=-1
        with self.assertRaisesRegex(ValueError,'typed area'):validate_registry(self.data,self.doc)

    def test_partial_category_and_unknown_area_are_explicit(self):
        product=self.data['elements'].pop(1)
        self.data['unresolvedComponents']=[dict(id='part-b',category='chair',reason='Unreviewed membership')]
        with self.assertRaisesRegex(ValueError,'complete category'):validate_registry(self.data,self.doc)
        self.data['coverage'][0]['status']='partial';self.data['elements'][0]['quantities']={'netGlazingArea':None}
        self.assertEqual(validate_registry(self.data,self.doc)['products'],2)
        self.data['elements'][0]['quantities']['netGlazingArea']=dict(value=-1,unit='m2',method='test',source='test')
        with self.assertRaisesRegex(ValueError,'typed area'):validate_registry(self.data,self.doc)

    def test_import_requires_matching_source_registry_and_complete_ifc_report(self):
        package=self.folder/'viewer';package.mkdir();models=self.folder/'models';output=models/'fixture-v1';output.mkdir(parents=True)
        registry=package/'bim.json';shutil.copyfile(self.registry,registry)
        with patch.object(importer,'MODELS',models):
            result=importer.import_bim_assets(self.folder,output,self.doc,'fixture-v1','1'*64)
            self.assertIn('bim',result);self.assertNotIn('ifc',result)
            zipfile=package/'building.ifczip';zipfile.write_bytes(b'trust-boundary fixture; not a genuine IFC')
            report=dict(sourceSha256='1'*64,schemaValidation='PASS',geometryErrors=[],scope='registered',products=3,geometryProductsChecked=3,ifczipSha256=hashlib.sha256(zipfile.read_bytes()).hexdigest(),registrySha256=hashlib.sha256(registry.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ValueError,'missing its validation'):importer.import_bim_assets(self.folder,output,self.doc,'fixture-v1','1'*64)
            for change in [dict(sourceSha256='2'*64),dict(registrySha256='0'*64),dict(ifczipSha256='0'*64),dict(scope='pilot'),dict(geometryProductsChecked=2),dict(schemaValidation='FAIL')]:
                (package/'building.ifc.report.json').write_text(json.dumps(report|change))
                with self.assertRaisesRegex(ValueError,'does not match'):importer.import_bim_assets(self.folder,output,self.doc,'fixture-v1','1'*64)
            (package/'building.ifc.report.json').write_text(json.dumps(report))
            self.assertIn('ifc',importer.import_bim_assets(self.folder,output,self.doc,'fixture-v1','1'*64))
            registry.unlink()
            with self.assertRaisesRegex(ValueError,'requires its reviewed'):importer.import_bim_assets(self.folder,output,self.doc,'fixture-v1','1'*64)

    @unittest.skipUnless(ifcopenshell,'Install scripts/requirements-bim.txt for IFC tests')
    def test_ifc_revisions_keep_occurrence_and_type_guids(self):
        reports=[];files=[]
        for revision in [1,2]:
            _,data,glb,registry=fixture(self.folder,revision);output=self.folder/f'revision-{revision}.ifc'
            with contextlib.redirect_stdout(io.StringIO()):reports.append(export(glb,registry,output))
            files.append(ifcopenshell.open(str(output)))
        first,second=[{p.Tag:p for p in f.by_type('IfcFurniture')} for f in files]
        self.assertEqual(set(first),{'a','b','c'});self.assertEqual(set(second),{'a','c','d'})
        for ident in ['a','c']:self.assertEqual(first[ident].GlobalId,second[ident].GlobalId)
        self.assertEqual({p.GlobalId for p in files[0].by_type('IfcFurnitureType')},{p.GlobalId for p in files[1].by_type('IfcFurnitureType')})
        self.assertEqual(len(files[1].by_type('IfcRepresentationMap')),2)
        self.assertNotEqual(first['a'].ObjectPlacement.RelativePlacement.Location.Coordinates,second['a'].ObjectPlacement.RelativePlacement.Location.Coordinates)
        self.assertIsInstance(ifcopenshell.util.element.get_psets(second['a'])['ReconstructionEvidence']['seatNumber'],int)
        for report in reports:self.assertEqual(report['geometryErrors'],[]);self.assertEqual(report['geometryProductsChecked'],3)
        refined=next(t for t in files[1].by_type('IfcFurnitureType') if t.Name=='Refined chair')
        self.assertEqual(ifcopenshell.util.element.get_psets(refined)['ReconstructionType']['Revision'],2)

    @unittest.skipUnless(ifcopenshell,'Install scripts/requirements-bim.txt for IFC tests')
    def test_shared_types_reject_geometry_drift_even_with_equal_bounds(self):
        _,data,glb,_=fixture(self.folder,2)
        data['elements'][1]['typeId']='shared'
        with self.assertRaisesRegex(ValueError,'type geometry'):validate_product_types(Geometry(glb),data)
        data=copy.deepcopy(self.data);data['elements'][0]['rootMatrix'][0]=2
        with self.assertRaisesRegex(ValueError,'Non-rigid'):validate_product_types(Geometry(self.glb),data)

if __name__=='__main__':unittest.main()
