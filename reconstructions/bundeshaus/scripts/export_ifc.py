"""Export registered whole products as a tessellated IFC4 reference model.

Install requirements-bim.txt in a separate Python environment. Input is the
prepared uncompressed GLB, never a camera-filtered scene. Unregistered source
components are explicitly listed in the report, not counted as physical objects.
"""
from pathlib import Path
import argparse,hashlib,json,uuid,zipfile,time
from collections import Counter,defaultdict
import numpy as np
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate
from bim_geometry import Geometry,matrix,packed,points
from bim_registry import validate_registry

# glTF X/right,Y/up,Z/back -> IFC X/right,Y/forward,Z/up.
C=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]],float)

def validate_product_types(g,data):
    """A shared type must reproduce every occurrence, not only its AABB.

    IFC local placements are rigid. Scale, shear and reflections must already
    be baked into each type's component geometry by the authoring migration.
    """
    prototypes={};checked=0;maximum=0.
    for e in data['elements']:
        root=matrix(e['rootMatrix']);r=root[:3,:3]
        if not np.allclose(r.T@r,np.eye(3),atol=1e-8,rtol=0) or not np.isclose(np.linalg.det(r),1.,atol=1e-8,rtol=0):
            raise ValueError('Non-rigid product root: '+e['id'])
        inv=np.linalg.inv(root);parts=[]
        for c in e['components']:
            for vv,ff,mat in g.mesh(g.nodes[c['id']]['mesh']):parts.append((mat,ff,points(vv,inv@g.world[c['id']])))
        parts.sort(key=lambda p:(-1 if p[0] is None else p[0],len(p[1]),len(p[2])))
        tid=e['typeId']
        if tid in prototypes:
            expected=prototypes[tid]
            if len(parts)!=len(expected):raise ValueError('Incompatible product type membership: '+tid)
            for a,b in zip(expected,parts):
                if a[0]!=b[0] or not np.array_equal(a[1],b[1]) or a[2].shape!=b[2].shape:raise ValueError('Incompatible product type geometry: '+tid)
                error=float(np.max(np.abs(a[2]-b[2])));maximum=max(maximum,error)
                if error>1e-5:raise ValueError('Product type geometry differs: '+tid)
        else:prototypes[tid]=parts
        checked+=1
    return dict(productsChecked=checked,typesChecked=len(prototypes),maximumLocalVertexDifferenceM=maximum,toleranceM=1e-5)

def global_id(namespace,kind,ident):
    return ifcopenshell.guid.compress(uuid.uuid5(uuid.UUID(namespace),kind+'/'+ident).hex)

def watertight(vertices,faces):
    _,inv=np.unique(np.round(vertices,8),axis=0,return_inverse=True)
    ff=inv[faces];edges=Counter();directions=Counter()
    for a,b,c in ff:
        if a==b or b==c or c==a:return False
        for u,v in [(a,b),(b,c),(c,a)]:
            edges[tuple(sorted((int(u),int(v))))]+=1;directions[(int(u),int(v))]+=1
    return bool(edges) and all(v==2 for v in edges.values()) and all(directions[(b,a)]==n for (a,b),n in directions.items())

def export(glb,registry,output,scope='registered'):
    start=time.perf_counter();g=Geometry(glb);d=json.loads(Path(registry).read_text(encoding='utf-8'))
    validate_registry(d,g.document)
    type_check=validate_product_types(g,d)
    ns=d['projectNamespace'];f=ifcopenshell.file(schema='IFC4')
    def gid(kind,i):return global_id(ns,kind,i)
    def pnt(x):return f.create_entity('IfcCartesianPoint',Coordinates=tuple(float(v) for v in x))
    def direction(x):return f.create_entity('IfcDirection',DirectionRatios=tuple(float(v) for v in x))
    def axis(m=None):
        m=np.eye(4) if m is None else m
        return f.create_entity('IfcAxis2Placement3D',Location=pnt(m[:3,3]),Axis=direction(m[:3,2]),RefDirection=direction(m[:3,0]))
    def placement(m=None,parent=None):return f.create_entity('IfcLocalPlacement',PlacementRelTo=parent,RelativePlacement=axis(m))
    def root(cls,kind,ident,name,**kw):return f.create_entity(cls,GlobalId=gid(kind,ident),Name=name,**kw)
    def relate(cls,kind,ident,**kw):return root(cls,kind,ident,ident,**kw)
    origin=axis();context=f.create_entity('IfcGeometricRepresentationContext',ContextIdentifier='Model',ContextType='Model',CoordinateSpaceDimension=3,Precision=1e-5,WorldCoordinateSystem=origin)
    body=f.create_entity('IfcGeometricRepresentationSubContext',ContextIdentifier='Body',ContextType='Model',ParentContext=context,TargetView='MODEL_VIEW')
    unit=f.create_entity('IfcSIUnit',UnitType='LENGTHUNIT',Name='METRE')
    areaunit=f.create_entity('IfcSIUnit',UnitType='AREAUNIT',Name='SQUARE_METRE')
    units=f.create_entity('IfcUnitAssignment',Units=[unit,areaunit])
    project=root('IfcProject','project',d['projectId'],'Bundeshaus reference reconstruction',RepresentationContexts=[context],UnitsInContext=units)
    site=root('IfcSite','site',d['projectId']+'/site','Bundeshaus local engineering site',ObjectPlacement=placement(),CompositionType='ELEMENT')
    building=root('IfcBuilding','building',d['projectId'],'Bundeshaus central building',ObjectPlacement=placement(parent=site.ObjectPlacement),CompositionType='ELEMENT')
    relate('IfcRelAggregates','aggregate','project-site',RelatingObject=project,RelatedObjects=[site])
    relate('IfcRelAggregates','aggregate','site-building',RelatingObject=site,RelatedObjects=[building])
    storeys={}
    for s in d['storeys']:
        m=np.eye(4);m[2,3]=s['elevation']
        storeys[s['id']]=root('IfcBuildingStorey','storey',s['id'],s['name']+' (provisional)',ObjectPlacement=placement(m,building.ObjectPlacement),CompositionType='ELEMENT',Elevation=float(s['elevation']))
    relate('IfcRelAggregates','aggregate','building-storeys',RelatingObject=building,RelatedObjects=list(storeys.values()))
    def properties(obj,ident,values,name='ReconstructionEvidence'):
        props=[]
        for key,(typ,val) in values.items():
            if val is not None:props.append(f.create_entity('IfcPropertySingleValue',Name=key,NominalValue=f.create_entity(typ,val)))
        if props:
            ps=root('IfcPropertySet','pset',ident+'/'+name,name,HasProperties=props)
            relate('IfcRelDefinesByProperties','properties',ident+'/'+name,RelatedObjects=[obj],RelatingPropertyDefinition=ps)
    properties(building,d['projectId'],dict(SourceSHA256=('IfcIdentifier',d['sourceSha256']),ModelId=('IfcIdentifier',d['modelId']),GeometryBasis=('IfcText','Reference reconstruction; local engineering coordinates, no survey-grade map conversion or closed IfcSpace volumes'),SchemaBaseline=('IfcLabel','IFC4 ADD2 TC1 / 4.0.2.1'),ReceivingApplicationTest=('IfcLabel','Not performed; receiving CDE unspecified')))
    styles={}
    def style(mat):
        if mat not in styles:
            md=g.document['materials'][mat] if mat is not None else {}
            rgba=md.get('pbrMetallicRoughness',{}).get('baseColorFactor',[.7,.7,.7,1]);rgb=f.create_entity('IfcColourRgb',Name=md.get('name'),Red=float(rgba[0]),Green=float(rgba[1]),Blue=float(rgba[2]))
            transmission=md.get('extensions',{}).get('KHR_materials_transmission',{}).get('transmissionFactor',0)
            transparency=max(1-rgba[3],transmission*.65)
            rendering=f.create_entity('IfcSurfaceStyleRendering',SurfaceColour=rgb,Transparency=float(transparency),ReflectanceMethod='NOTDEFINED')
            styles[mat]=f.create_entity('IfcSurfaceStyle',Name=md.get('name','Default'),Side='BOTH',Styles=[rendering])
        return styles[mat]
    def surface(vv,ff,mat):
        # All source vertex positions remain; a closed flag is asserted only
        # after welded-edge orientation/manifold checks, not from the category.
        coords=f.create_entity('IfcCartesianPointList3D',CoordList=vv.astype(float).tolist())
        item=f.create_entity('IfcTriangulatedFaceSet',Coordinates=coords,Closed=watertight(vv,ff),CoordIndex=(ff.astype(int)+1).tolist())
        if mat is not None:f.create_entity('IfcStyledItem',Item=item,Styles=[style(mat)])
        return item
    selected=d['elements']
    if scope=='pilot':
        keep=set();counts=Counter()
        for e in selected:
            cap={'chair':3,'stool':1,'desk':1,'sculpture':1,'column':1,'window':3,'wall':1,'door':2,'stair':1}.get(e['category'],0)
            if counts[e['category']]<cap:keep.add(e['id']);counts[e['category']]+=1
        # Always include the host of a selected opening/filling.
        for o in d['openings']:
            if o['fillingId'] in keep:keep.add(o['hostId'])
        selected=[e for e in selected if e['id'] in keep]
    chosen={e['id']:e for e in selected};all_elements={e['id']:e for e in d['elements']}
    types={};maps={};products={};source_map={};bytype=defaultdict(list);contains=defaultdict(list);refs=defaultdict(list)
    type_records={t['id']:t for t in d['types']}
    for e in selected:
        tid=e['typeId'];record=type_records[tid]
        if tid not in types:
            prototype=all_elements[record['prototypeElementId']];inverse=np.linalg.inv(matrix(prototype['rootMatrix']));items=[]
            for c in prototype['components']:
                ident=c['id'];local=C@inverse@g.world[ident]
                for vv,ff,mat in g.mesh(g.nodes[ident]['mesh']):items.append(surface(points(vv,local),ff,mat))
            rep=f.create_entity('IfcShapeRepresentation',ContextOfItems=body,RepresentationIdentifier='Body',RepresentationType='Tessellation',Items=items)
            maps[tid]=f.create_entity('IfcRepresentationMap',MappingOrigin=axis(),MappedRepresentation=rep)
            cls=e['ifcClass']+'Type'
            kwargs=dict(RepresentationMaps=[maps[tid]],PredefinedType='NOTDEFINED')
            if cls=='IfcFurnitureType':kwargs.update(AssemblyPlace='NOTDEFINED',PredefinedType={'chair':'CHAIR','stool':'CHAIR','desk':'DESK','table':'TABLE','cabinet':'FILECABINET'}.get(e['category'],'NOTDEFINED'))
            if cls=='IfcDoorType':kwargs.update(OperationType='NOTDEFINED',ParameterTakesPrecedence=False)
            if cls=='IfcWindowType':kwargs.update(PartitioningType='NOTDEFINED',ParameterTakesPrecedence=False)
            if cls=='IfcColumnType':kwargs['PredefinedType']='PILASTER' if 'pilaster' in e['name'].lower() else 'COLUMN'
            types[tid]=root(cls,'type',tid,record['name'],**kwargs)
            ps=root('IfcPropertySet','type-pset',tid,'ReconstructionType',HasProperties=[f.create_entity('IfcPropertySingleValue',Name=k,NominalValue=f.create_entity(typ,val)) for k,typ,val in [('ProductTypeId','IfcIdentifier',tid),('FamilyId','IfcIdentifier',record['familyId']),('Revision','IfcInteger',record['revision'])]])
            types[tid].HasPropertySets=[ps]
        transform=f.create_entity('IfcCartesianTransformationOperator3D',LocalOrigin=pnt([0,0,0]),Scale=1.)
        item=f.create_entity('IfcMappedItem',MappingSource=maps[tid],MappingTarget=transform)
        shape=f.create_entity('IfcShapeRepresentation',ContextOfItems=body,RepresentationIdentifier='Body',RepresentationType='MappedRepresentation',Items=[item])
        product_shape=f.create_entity('IfcProductDefinitionShape',Representations=[shape])
        m=C@matrix(e['rootMatrix'])@C.T
        storey=storeys[e['primaryStorey']];m[2,3]-=storey.Elevation
        kw=dict(ObjectPlacement=placement(m,storey.ObjectPlacement),Representation=product_shape,Tag=e['id'])
        if e['ifcClass'] in ['IfcDoor','IfcWindow']:
            kw.update(OverallHeight=e['properties'].get('overallHeight'),OverallWidth=e['properties'].get('overallWidth'))
        product=root(e['ifcClass'],'product',e['id'],e['name'],**kw);products[e['id']]=product
        bytype[tid].append(product);contains[e['primaryStorey']].append(product)
        for extra in e['storeyRefs']:refs[extra].append(product)
        values=dict(ProductId=('IfcIdentifier',e['id']),Category=('IfcLabel',e['category']),Membership=('IfcLabel','Reviewed modeled assembly'),Source=('IfcText',e['evidence']['source']),ClassificationBasis=('IfcLabel',e['evidence']['basis']),Confidence=('IfcLabel',e['evidence']['confidence']),GeometryBasis=('IfcText',e['evidence']['geometry']),SourceComponents=('IfcText',json.dumps([c['id'] for c in e['components']],separators=(',',':'))),Rooms=('IfcText',', '.join(e['roomIds'])),SourceSHA256=('IfcIdentifier',d['sourceSha256']))
        for key,val in e['properties'].items():
            typ='IfcLengthMeasure' if key in ['overallWidth','overallHeight'] else 'IfcBoolean' if isinstance(val,bool) else 'IfcInteger' if isinstance(val,int) else 'IfcReal' if isinstance(val,float) else 'IfcText'
            values[key]=(typ,val)
        properties(product,e['id'],values)
        qs=[]
        for key,q in e['quantities'].items():
            if q is None:continue
            qs.append(f.create_entity('IfcQuantityArea',Name=key,Description=q['method'],AreaValue=float(q['value'])))
            properties(product,e['id']+'/'+key,dict(Method=('IfcText',q['method']),Source=('IfcText',q['source']),Confidence=('IfcLabel',q['confidence'])),'QuantityEvidence_'+key)
        if qs:
            qset=root('IfcElementQuantity','quantities',e['id'],'ReconstructionQuantities',MethodOfMeasurement='Modeled projected areas; not surveyed',Quantities=qs)
            relate('IfcRelDefinesByProperties','quantity-relation',e['id'],RelatedObjects=[product],RelatingPropertyDefinition=qset)
        for c in e['components']:source_map[c['id']]={'productId':e['id'],'ifcGlobalId':product.GlobalId,'typeId':tid,'localMatrix':c['localMatrix']}
    for tid,occurrences in bytype.items():relate('IfcRelDefinesByType','type-relation',tid,RelatedObjects=occurrences,RelatingType=types[tid])
    for sid,occurrences in contains.items():relate('IfcRelContainedInSpatialStructure','containment',sid,RelatedElements=occurrences,RelatingStructure=storeys[sid])
    for sid,occurrences in refs.items():relate('IfcRelReferencedInSpatialStructure','spatial-reference',sid,RelatedElements=occurrences,RelatingStructure=storeys[sid])
    for o in d['openings']:
        if o['fillingId'] not in chosen:continue
        # The authored tessellation already contains the aperture. Some walls
        # comprise overlapping/open decorative shells, not Boolean-ready BReps.
        # A second subtractive opening body can erase these walls in receivers.
        # Preserve reviewed host/filling semantics and the exact local profile as
        # typed evidence, without asserting an independently subtractable solid.
        # Opening plane coordinates are already x/h; IFC converts only its world frame.
        m=C@matrix(o['rootMatrix'])
        opening=root('IfcOpeningElement','opening',o['id'],'Modeled '+chosen[o['fillingId']]['category']+' aperture',ObjectPlacement=placement(m,building.ObjectPlacement),PredefinedType='OPENING')
        properties(opening,o['id'],dict(ProfileCoordinatesMetres=('IfcText',json.dumps(o['profile'],separators=(',',':'))),Depth=('IfcLengthMeasure',float(o['depth'])),GeometryBasis=('IfcText','Authored wall tessellation already contains aperture; profile uses opening local X/Y. No separate subtractive Body or parametric void behavior asserted.')),'ReconstructionOpening')
        relate('IfcRelVoidsElement','void',o['id'],RelatingBuildingElement=products[o['hostId']],RelatedOpeningElement=opening)
        relate('IfcRelFillsElement','filling',o['id'],RelatingOpeningElement=opening,RelatedBuildingElement=products[o['fillingId']])
    f.header.file_description.description=('Bundeshaus tessellated reference reconstruction; IFC4 ADD2 TC1. No certified MVD or receiving-CDE validation claimed.',)
    f.header.file_name.name=Path(output).name
    f.header.file_name.preprocessor_version='IfcOpenShell '+ifcopenshell.version
    f.header.file_name.originating_system='Bundeshaus BIM registry v1'
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);f.write(str(output))
    reopened=ifcopenshell.open(str(output));logger=ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(reopened,logger,express_rules=True)
    (output.with_suffix('.validation.json')).write_text(json.dumps(logger.statements,indent=2,default=str),encoding='utf-8')
    if logger.statements:raise ValueError('IFC schema/EXPRESS validation failed; see .validation.json')
    settings=ifcopenshell.geom.settings();settings.set('use-world-coords',True)
    errors=[];maximum=0.;geometry_count=0
    # Tessellation round trip through the independent IfcOpenShell geometry engine.
    for ident,p in products.items():
        try:
            shape=ifcopenshell.geom.create_shape(settings,reopened.by_guid(p.GlobalId),geometry_library='cgal-simple')
            vv=np.asarray(shape.geometry.verts).reshape(-1,3)
            actual=[vv.min(axis=0),vv.max(axis=0)]
            expected=g.bounds([c['id'] for c in chosen[ident]['components']])
            expected=np.array([[expected[0][0],-expected[1][2],expected[0][1]],[expected[1][0],-expected[0][2],expected[1][1]]])
            error=float(np.max(np.abs(actual-expected)));maximum=max(maximum,error);geometry_count+=1
            if error>d['conversionTolerance']:errors.append({'id':ident,'errorM':error})
        except Exception as exc:errors.append({'id':ident,'error':str(exc)})
    report=dict(schema='IFC4 ADD2 TC1 / 4.0.2.1',tool=ifcopenshell.version,scope=scope,sourceSha256=d['sourceSha256'],registrySha256=hashlib.sha256(Path(registry).read_bytes()).hexdigest(),glbSha256=hashlib.sha256(Path(glb).read_bytes()).hexdigest(),ifcSha256=hashlib.sha256(output.read_bytes()).hexdigest(),ifcBytes=output.stat().st_size,products=len(products),types=len(types),mappedRepresentations=len(maps),sourceComponents=len(g.nodes),exportedComponents=len(source_map),unexportedComponents=[i for i in g.nodes if i not in source_map],openingRelationships=len(reopened.by_type('IfcRelVoidsElement')),spatialReferences=len(reopened.by_type('IfcRelReferencedInSpatialStructure')),schemaValidation='PASS',geometryProductsChecked=geometry_count,maximumBoundsErrorM=maximum,geometryErrors=errors,receivingApplicationValidation='NOT PERFORMED; receiving application unspecified',textures='Material colors/transparency only. Keep GLB for PBR textures.',mapConversion='Not emitted: projected CRS and vertical datum unresolved.',sourceMapping=source_map,elapsedSeconds=time.perf_counter()-start)
    report.update(geometryBackend='IfcOpenShell cgal-simple; default opening handling',openingSubtractionCheck='Source walls retain authored apertures. Opening entities have placement, exact profile/depth evidence and host/filling relationships but no second subtractive Body; not parametric voids.')
    report['typeGeometryValidation']=type_check
    report_path=output.with_suffix('.report.json');report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
    if errors:raise ValueError('IFC geometry round trip failed; see report')
    with zipfile.ZipFile(output.with_suffix('.ifczip'),'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:archive.write(output,output.name)
    report['ifczipSha256']=hashlib.sha256(output.with_suffix('.ifczip').read_bytes()).hexdigest()
    report['ifczipBytes']=output.with_suffix('.ifczip').stat().st_size
    report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['sourceMapping','unexportedComponents']},indent=2),flush=True)
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('glb',type=Path);parser.add_argument('registry',type=Path);parser.add_argument('output',type=Path)
    parser.add_argument('--scope',choices=['pilot','registered'],default='pilot')
    args=parser.parse_args();export(args.glb,args.registry,args.output,args.scope)
