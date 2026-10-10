"""Check local 034 against the verified 033 source; no network or database writes."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[2]
base=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent.parent/'syzia-033'/'foundation'
old=json.loads((base/'MANIFEST.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert all(sha(base/x['path'])==x['sha256'] for x in old),'Base 033 changed'
missing=[x['path'] for x in old if not (root/x['path']).is_file()]
assert not missing,missing
changed=[x['path'] for x in old if sha(root/x['path'])!=x['sha256']]
protected=[x for x in old if x['path'].startswith(('supabase/migrations/','supabase/storage/','src/brand/','assets/brand/','public/brand/')) or x['path']=='package-lock.json']
assert all(sha(root/x['path'])==x['sha256'] for x in protected),'Historical migration/Storage/brand/lockfile modified'
assert len(list((root/'supabase/migrations').glob('*.sql')))==33
sql=json.loads((root/'reports/syzia-034/sql.json').read_text())
browser=json.loads((root/'reports/syzia-034/browser.json').read_text())
assert all(t['status']=='PASS' for t in sql['tests'])
assert browser['stats']['unexpected']==browser['stats']['skipped']==browser['stats']['flaky']==0
assert browser['stats']['expected']==9
for name,count in [('backend',38),('utils',4)]:
 log=(root/f'reports/syzia-034/{name}.log').read_text()
 assert f'pass {count}' in log and 'fail 0' in log,(name,log[-300:])
scan=json.loads((root/'reports/syzia-034/release-bundle-scan.json').read_text())
assert scan['build_exit_code']==0 and not scan['server_secret_canary_found']
report={'base':'SYZIA 033','base_files_verified':len(old),'migrations_001_033_unchanged':True,'new_migration':False,'protected_files_verified':len(protected),'changed_existing_files':changed,'deleted_existing_files':missing,'tests':{'sql':len(sql['tests']),'backend':38,'geometry_instructions_readiness':4,'browser_journeys':9,'unique_total':len(sql['tests'])+38+4+9,'failed':0,'skipped':0},'build_typecheck_secret_scan':'PASS','evidence':sorted(str(p.relative_to(root)) for p in (root/'reports/syzia-034').glob('*.png')),'external_homologation':'PENDING; no external services, real data, production or deploy','migration_sha256':[{**x} for x in old if x['path'].startswith('supabase/migrations/')]}
(root/'reports/syzia-034/release-inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('evidence','migration_sha256','changed_existing_files')},ensure_ascii=False))
