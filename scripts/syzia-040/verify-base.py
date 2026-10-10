from pathlib import Path
import hashlib,json,zipfile,sys
root=Path(__file__).resolve().parents[2]
archive=Path(sys.argv[1]) if len(sys.argv)>1 else root.parents[1]/'base040/SYZIA-039-Consolidado.zip'
report={'base_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'migrations':[],'brand':[],'modified':[],'removed':[]}
with zipfile.ZipFile(archive) as z:
 for n in z.namelist():
  if not n.startswith('foundation/')or n.endswith('/'):continue
  rel=n[len('foundation/'):];p=root/rel
  if not p.is_file():report['removed'].append(rel);continue
  before=hashlib.sha256(z.read(n)).hexdigest();after=hashlib.sha256(p.read_bytes()).hexdigest()
  entry={'path':rel,'sha256':after,'preserved':before==after}
  if rel.startswith('supabase/migrations/'):report['migrations'].append(entry)
  if rel.startswith('public/brand/'):report['brand'].append(entry)
  if before!=after:report['modified'].append(rel)
assert all(e['preserved']for e in report['migrations'])
assert all(e['preserved']for e in report['brand'])
assert not report['removed'],report['removed']
(root/'reports/syzia-040/base-integrity.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'previous_migrations_unchanged':len(report['migrations']),'brand_files_unchanged':len(report['brand']),'removed':len(report['removed'])}))
