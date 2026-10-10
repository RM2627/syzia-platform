"""Compare a supplied previous consolidated source with this UX001 delivery."""
import sys,json,hashlib,difflib
from pathlib import Path
root=Path(__file__).resolve().parents[2];base=Path(sys.argv[1]).resolve();out=root/'reports/ux001'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=json.loads((base/'MANIFEST.json').read_text());entries={x['path']:x['sha256'] for x in original}
changed=[];missing=[]
for name,digest in entries.items():
 p=root/name
 if not p.exists():missing.append(name)
 elif sha(p)!=digest:changed.append(name)
protected={}
for folder in ['supabase/migrations','server','tests','reports']:
 selected=[p for p in entries if p.startswith(folder+'/')]
 protected[folder]={'files':len(selected),'changed':[p for p in changed if p in selected],'missing':[p for p in missing if p in selected]}
 assert not protected[folder]['changed'] and not protected[folder]['missing'],folder
sourceChanges=[p for p in changed if p.startswith('src/')]
assert set(sourceChanges)=={'src/FoundationApp.tsx','src/central/Central.tsx','src/commercial/Commercial.tsx'}
# The entire auth/session implementation and all other Foundation components remain intact.
a=(base/'src/FoundationApp.tsx').read_text();b=(root/'src/FoundationApp.tsx').read_text()
assert a.split('function CompanyRoute()')[0]==b.split('function CompanyRoute()')[0]
assert a.split('export default function Application()')[1]==b.split('export default function Application()')[1]
# Parallel command refresh remains byte-identical.
a=(base/'src/central/Central.tsx').read_text();b=(root/'src/central/Central.tsx').read_text()
assert a.split('async function operation(')[1].split('const safe =')[0]==b.split('async function operation(')[1].split('const safe =')[0]
report={'status':'PASS','baseline':'SYZIA-044-UX-Final-Consolidado','checkedOriginalFiles':len(entries),'missing':missing,'changed':changed,'protected':protected,'authSessionUnchanged':True,'centralCommandsUnchanged':True,'sourceChanges':sourceChanges,'newRuntimeSource':['src/central/navigation.ts']}
assert not missing
out.mkdir(parents=True,exist_ok=True);(out/'integrity.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
patch=''.join(''.join(difflib.unified_diff((base/p).read_text().splitlines(True),(root/p).read_text().splitlines(True),fromfile='before/'+p,tofile='after/'+p)) for p in sourceChanges)
(out/'source-diff.patch').write_text(patch)
print(json.dumps(report,ensure_ascii=False,indent=2))
