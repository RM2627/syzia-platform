"""Offline packaging. Retains the official baseline and explicitly added 061 sources.
Usage: python3 scripts/syzia-061/package.py ABSOLUTE_OUTPUT_DIRECTORY
Does not install dependencies, execute SQL, commit, upload or deploy.
"""
from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]).resolve()
if out==root or root in out.parents:
    raise SystemExit('Output must be outside the project')
out.mkdir(parents=True,exist_ok=True)
base=json.loads((root/'docs/syzia-061/base-sha256.json').read_text())
files=set(base)
for name in ['content/insights','docs/syzia-061','scripts/billing-061','scripts/insights','scripts/syzia-061','server/insights','src/insights','tests/syzia-061']:
    files.update(p.relative_to(root).as_posix() for p in (root/name).rglob('*') if p.is_file())
files.update(['server/billing/production-plans.mjs','examples/cloudflare-insights-worker.mjs',
'supabase/migrations/202610280061_service_quantities.sql',
'supabase/migrations/202610280062_insights.sql',
'supabase/migrations/202610280063_billing_environments.sql'])
for name in files:
    if '..' in Path(name).parts or any(x in Path(name).parts for x in ['node_modules','dist','.git','.cache','__pycache__']) or (name not in base and name.endswith(('.zip','.log','.pyc'))) or Path(name).name=='.env':
        raise SystemExit('Unexpected artifact: '+name)
    if not (root/name).is_file() or (root/name).is_symlink():raise SystemExit('Missing or unsafe source: '+name)
manifest={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sorted(files)}
zip_path=out/'SYZIA-061-BASE-LIMPA-CONSOLIDADA.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(files):z.write(root/p,'SYZIA-061-BASE-LIMPA-CONSOLIDADA/'+p)
    z.writestr('SYZIA-061-BASE-LIMPA-CONSOLIDADA/SHA256-ARQUIVOS.json',json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
(out/'SHA256-ARQUIVOS.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'zip':str(zip_path),'files':len(files)+1,'bytes':zip_path.stat().st_size,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest()},indent=2))
