"""Semantic and transform validation, with no optional BIM dependencies.

The JSON schema supplies additional shape validation in the offline release
check. This validator also runs during normal model imports.
"""
import math,re,uuid

def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def identity(): return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]

def multiply(a,b):
    return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]

def transform(a,p):
    return [sum(a[k*4+r]*p[k] for k in range(3))+a[12+r] for r in range(3)]

def node_matrix(n):
    if 'matrix' in n:return n['matrix']
    x,y,z,w=n.get('rotation',[0,0,0,1]);s=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0])
    return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,
            2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,
            2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,*t,1]

def document_nodes(doc):
    nodes={}; seen=set()
    def visit(i,parent):
        if i in seen:raise ValueError('Cyclic/multiple node parent')
        seen.add(i);n=doc['nodes'][i];world=multiply(parent,node_matrix(n))
        if 'mesh' in n:
            ident=n.get('extras',{}).get('viewer_id')
            if not ident or ident in nodes:raise ValueError('Missing/duplicate source component ID')
            nodes[ident]={'world':world,'node':n}
        for child in n.get('children',[]):visit(child,world)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,identity())
    return nodes

def validate_registry(data, doc=None, model_id=None, source_hash=None):
    def require(ok,message):
        if not ok:raise ValueError('BIM registry: '+message)
    def index(rows,label):
        require(isinstance(rows,list),label+' must be an array')
        result={}
        for row in rows:
            require(isinstance(row,dict) and isinstance(row.get('id'),str) and 0<len(row['id'])<=256,label+' invalid ID')
            require(row['id'] not in result,label+' duplicate ID '+row['id']);result[row['id']]=row
        return result
    def mat(m):
        require(isinstance(m,list) and len(m)==16 and all(finite(x) for x in m),'nonfinite or malformed matrix')
        require(max(abs(m[i]-n) for i,n in [(3,0),(7,0),(11,0),(15,1)])<1e-9,'nonaffine matrix')
        det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2])
        require(abs(det)>1e-12,'singular matrix')
    require(isinstance(data,dict) and data.get('schemaVersion')==1,'unsupported schema version')
    require(data.get('units')=='m' and data.get('coordinateSystem')=='glTF-Y-up','unexpected coordinate frame')
    require(isinstance(data.get('sourceSha256'),str) and re.fullmatch('[0-9a-f]{64}',data['sourceSha256']),'missing source SHA256')
    require(model_id is None or model_id==data.get('modelId'),'wrong model version')
    require(source_hash is None or source_hash==data.get('sourceSha256'),'wrong source revision')
    try:uuid.UUID(data['projectNamespace'])
    except (KeyError,ValueError,TypeError,AttributeError):raise ValueError('BIM registry: invalid project namespace')
    tolerance=data.get('conversionTolerance');require(finite(tolerance) and 0<tolerance<=.001,'invalid tolerance')
    storeys=index(data.get('storeys'),'storeys');families=index(data.get('families'),'families');types=index(data.get('types'),'types');elements=index(data.get('elements'),'elements');openings=index(data.get('openings'),'openings')
    require(bool(storeys) and bool(types) and bool(elements),'empty product registry')
    all_ids=list(storeys)+list(families)+list(types)+list(elements)+list(openings)
    require(len(all_ids)==len(set(all_ids)),'ID namespace collision')
    for s in storeys.values():require(finite(s.get('elevation')),'invalid storey elevation')
    for t in types.values():
        require(t.get('familyId') in families and t.get('prototypeElementId') in elements,'unresolved type reference')
        require(elements[t['prototypeElementId']].get('typeId')==t['id'],'prototype belongs to a different type')
        require(isinstance(t.get('revision'),int) and not isinstance(t['revision'],bool) and t['revision']>0,'invalid type revision')
    owned={};maximum=0;nodes=document_nodes(doc) if doc else None
    for e in elements.values():
        require(e.get('typeId') in types,'unresolved product type')
        require(e.get('category')==families[types[e['typeId']]['familyId']].get('category'),'family/category mismatch')
        require(e.get('primaryStorey') in storeys,'unresolved primary storey')
        refs=e.get('storeyRefs',[]);require(isinstance(refs,list) and len(refs)==len(set(refs)) and all(r in storeys and r!=e['primaryStorey'] for r in refs),'invalid additional storey references')
        mat(e.get('rootMatrix'))
        b=e.get('bounds');require(isinstance(b,list) and len(b)==2 and all(isinstance(p,list) and len(p)==3 and all(finite(x) for x in p) for p in b) and all(b[0][k]<=b[1][k] for k in range(3)),'invalid bounds')
        require(e.get('membership')=='reviewed','unreviewed product may not be counted')
        require(e.get('ifcClass') in ['IfcFurniture','IfcWindow','IfcDoor','IfcColumn','IfcWall','IfcStair','IfcSlab','IfcRamp','IfcRailing','IfcBuildingElementProxy'],'unsupported IFC class')
        evidence=e.get('evidence',{});require(evidence.get('basis') in ['authored','inferred'] and evidence.get('confidence') in ['low','medium','high'] and bool(evidence.get('source')),'missing evidence')
        require(isinstance(e.get('components'),list) and bool(e['components']),'empty product membership')
        slots=set()
        for c in e['components']:
            ident=c.get('id');require(isinstance(ident,str) and ident not in owned,'component has multiple product owners')
            require(isinstance(c.get('slot'),int) and c['slot']>=0 and c['slot'] not in slots,'invalid/duplicate component slot');slots.add(c['slot'])
            owned[ident]=e['id'];mat(c.get('localMatrix'))
            if nodes is not None:
                require(ident in nodes,'missing source component '+ident)
                expected=nodes[ident]['world'];actual=multiply(e['rootMatrix'],c['localMatrix'])
                n=nodes[ident]['node']
                for p in doc['meshes'][n['mesh']]['primitives']:
                    a=doc['accessors'][p['attributes']['POSITION']]
                    require('min' in a and 'max' in a,'position bounds required')
                    for corner in range(8):
                        point=[a['max' if corner&(1<<k) else 'min'][k] for k in range(3)]
                        err=math.dist(transform(expected,point),transform(actual,point));maximum=max(maximum,err)
                        require(err<=tolerance,'component transform mismatch '+ident)
        for name,q in e.get('quantities',{}).items():
            require(name in ['openingArea','outerFrameArea','netGlazingArea','floorArea'],'unknown quantity')
            if q is not None:require(finite(q.get('value')) and q['value']>=0 and q.get('unit')=='m2' and bool(q.get('method')) and bool(q.get('source')),'invalid typed area')
        ancestor=e;chain=set()
        while ancestor.get('parentId'):
            parent=ancestor['parentId'];require(parent in elements and parent not in chain,'unresolved/cyclic product parent');chain.add(parent);ancestor=elements[parent]
    unresolved=index(data.get('unresolvedComponents'),'unresolved components')
    require(not set(unresolved)&set(owned),'owned component also unresolved')
    if nodes is not None:require(set(nodes)==set(owned)|set(unresolved),'source component coverage mismatch')
    fillings=set()
    for o in openings.values():
        require(o.get('hostId') in elements and o.get('fillingId') in elements,'unresolved opening host/filling')
        require(elements[o['hostId']]['ifcClass']=='IfcWall' and elements[o['fillingId']]['ifcClass'] in ['IfcDoor','IfcWindow'],'invalid opening relationship classes')
        require(elements[o['fillingId']].get('openingId')==o['id'] and o['fillingId'] not in fillings,'ambiguous opening filling');fillings.add(o['fillingId'])
        mat(o.get('rootMatrix'));profile=o.get('profile')
        require(isinstance(profile,list) and len(profile)>=3 and all(isinstance(p,list) and len(p)==2 and all(finite(x) for x in p) for p in profile),'invalid opening profile')
        area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(profile,profile[1:]+profile[:1]))/2
        require(abs(area)>1e-9 and finite(o.get('depth')) and o['depth']>0,'degenerate opening')
    for e in elements.values():require('openingId' not in e or e['openingId'] in openings,'unresolved product opening')
    coverage=data.get('coverage');require(isinstance(coverage,list),'missing quantity coverage')
    cats=set()
    for c in coverage:
        require(c.get('category') not in cats and c.get('status') in ['complete-modeled-category','partial'] and bool(c.get('scope')),'invalid category coverage');cats.add(c['category'])
        if c['status']=='complete-modeled-category':require(not any(u.get('category')==c['category'] for u in unresolved.values()),'complete category still has unresolved components')
    require(all(e['category'] in cats for e in elements.values()),'missing product coverage category')
    return {'products':len(elements),'ownedComponents':len(owned),'unresolvedComponents':len(unresolved),'maximumTransformErrorM':maximum,'status':'PASS'}
