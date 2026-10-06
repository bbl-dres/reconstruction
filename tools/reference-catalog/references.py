"""Find and validate a building evidence library without loading a 3D model."""
from pathlib import Path
import argparse,json,hashlib,sys,shutil,datetime

def run():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',type=Path,default=Path.cwd()/'references/manifest.json');p.add_argument('--workspace',type=Path,help='Building workspace, e.g. reconstructions/<id>/work; overrides --manifest');p.add_argument('--kind');p.add_argument('--space');p.add_argument('--level');p.add_argument('--query');p.add_argument('--resolve');p.add_argument('--validate',action='store_true');p.add_argument('--intake',type=Path);p.add_argument('--source');p.add_argument('--intended-date');p.add_argument('--building-state',choices=['existing','historic','proposed','unknown'],default='unknown');p.add_argument('--source-role',choices=['photographic-record', 'historic-record', 'alteration-drawing', 'seating-snapshot', 'contextual-document', 'navigation-aid', 'unknown']);p.add_argument('--gaps',action='store_true');p.add_argument('--note',default='');a=p.parse_args()
 if a.workspace:a.manifest=a.workspace/'references/manifest.json'
 m=json.loads(a.manifest.read_text(encoding='utf-8'));root=a.manifest.resolve().parent;rows=m['assets']
 if a.intake:
  src=a.intake.resolve();assert src.is_file(),'Intake file does not exist'
  h=hashlib.sha256(src.read_bytes()).hexdigest();existing=next((r for r in rows if r['sha256']==h),None)
  if existing:print(json.dumps({'status':'already-cataloged','assetId':existing['id'],'path':existing['path'],'note':'Append the additional provenance to this record; no duplicate copied.'},indent=2));return 0
  incoming=root/'incoming';incoming.mkdir(exist_ok=True);ip=incoming/'manifest.json';intake=json.loads(ip.read_text())if ip.exists()else{'schemaVersion':1,'entries':[]}
  existing=next((r for r in intake['entries']if r['sha256']==h and r['status']=='pending-review'),None)
  if existing:print(json.dumps(existing,indent=2));return 0
  dest=incoming/src.name
  if dest.exists()and hashlib.sha256(dest.read_bytes()).hexdigest()!=h:dest=incoming/(src.stem+'-'+h[:8]+src.suffix)
  if src!=dest.resolve():shutil.copy2(src,dest)
  assert hashlib.sha256(dest.read_bytes()).hexdigest()==h
  entry={'id':'incoming-'+h[:16],'path':dest.relative_to(root).as_posix(),'originalFileName':src.name,'source':a.source or str(src),'receivedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':h,'bytes':src.stat().st_size,'status':'pending-review','note':a.note,'promotedAssetId':None,'intendedDate':a.intended_date,'buildingState':a.building_state};intake['entries'].append(entry);ip.write_text(json.dumps(intake,ensure_ascii=False,indent=2));print(json.dumps(entry,ensure_ascii=False,indent=2));return 0
 if a.gaps:
  gaps=[{'id':r['id'],'path':r['path'],'missing':[k for k,missing in [('acquisition-source',not r['provenance']['urls']and not r['provenance']['originalPaths']and not r.get('derivation')),('capture-or-creation-date',r['dates']['created']is None),('source-role',r.get('sourceRole',{}).get('value','unknown')=='unknown')]if missing]}for r in rows]
  print(json.dumps([r for r in gaps if r['missing']],ensure_ascii=False,indent=2));return 0
 if a.validate:
  errors=[];ids=set();paths=set();hashes=set()
  for r in rows:
   i=r['id'];f=(root/r['path']).resolve()
   if i in ids:errors.append('Duplicate ID: '+i)
   if r['path']in paths:errors.append('Duplicate path: '+r['path'])
   if r['sha256']in hashes:errors.append('Duplicate content: '+r['path'])
   ids.add(i);paths.add(r['path']);hashes.add(r['sha256'])
   if not f.is_relative_to(root):errors.append('Path escapes library: '+r['path']);continue
   if f.suffix.lower()in['.glb','.gltf','.ifc','.ifczip','.blend','.b3dm']:errors.append('Model binary in evidence: '+r['path'])
   if not f.is_file():errors.append('Missing: '+r['path']);continue
   if f.stat().st_size!=r['bytes']or hashlib.sha256(f.read_bytes()).hexdigest()!=r['sha256']:errors.append('Changed content: '+r['path'])
  for r in rows:
   for parent in (r.get('derivation')or{}).get('sourceAssetIds',[]):
    if parent not in ids or parent==r['id']:errors.append('Invalid derivative parent: '+r['id'])
  decision_file=root.parent/'research/decisions.json'
  if decision_file.exists():
   decisions=json.loads(decision_file.read_text(encoding='utf-8'))['decisions'];decision_ids=set()
   for decision in decisions:
    if decision['id']in decision_ids:errors.append('Duplicate decision ID: '+decision['id'])
    decision_ids.add(decision['id'])
    for source in decision['sourceIds']:
     if source not in ids:errors.append('Unknown decision source: '+source)
    if decision['status']=='adopted'and not decision.get('resolution'):errors.append('Adopted decision missing resolution: '+decision['id'])
  support={'incoming/README.md','incoming/manifest.json','README.md','INDEX.md','INDEX.html','manifest.json','manifest.schema.json'}
  pending=[]
  for f in root.rglob('*'):
   if f.is_file()and f.is_relative_to(root/'incoming')and f.name not in ['README.md','manifest.json']:pending.append(f.relative_to(root).as_posix());continue
   if f.is_file()and f.is_relative_to(root/'catalog'):continue  # generated by build.py
   if f.is_file()and f.name!='README.md'and f.relative_to(root).as_posix()not in paths|support:errors.append('Unindexed file: '+f.relative_to(root).as_posix())
  print(json.dumps({'status':'FAIL'if errors else'PASS','assets':len(rows),'pendingIncomingFiles':len(pending),'errors':errors},indent=2));return bool(errors)
 out=[]
 for r in rows:
  if a.source_role and r.get('sourceRole',{}).get('value')!=a.source_role:continue
  if a.kind and r['kind']!=a.kind:continue
  if a.space and a.space not in r['location']['spaces']:continue
  if a.level and a.level not in r['location']['levels']:continue
  if a.query and a.query.casefold()not in json.dumps(r,ensure_ascii=False).casefold():continue
  if a.resolve:
   q=a.resolve.replace('\\','/');q=q.removeprefix('references/')
   if q not in [r['id'],r['path'],r['ingestedFileName'],*r['legacyPaths'],*r['aliases'],*r['originalFileNames']]:continue
  out.append(r)
 print(json.dumps(out,ensure_ascii=False,indent=2));return 0 if out else 1
if __name__=='__main__':sys.exit(run())
