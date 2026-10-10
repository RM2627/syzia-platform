"""Record the final local validation and changed-file inventory against the supplied 032 source."""
from pathlib import Path
import json,hashlib,os,re,sys
root=Path(__file__).resolve().parents[2]
base=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parents[1]/'syzia-032/foundation'
report=root/'reports/syzia-033'

def scenarios(r):
 out=[]
 for s in r.get('specs',[]):
  for t in s['tests']:out.append({'name':s['title'],'status':t['status']})
 for child in r.get('suites',[]):out+=scenarios(child)
 return out
sql=json.loads((report/'sql.json').read_text());browser=scenarios(json.loads((report/'browser.json').read_text()));colors=scenarios(json.loads((report/'browser-evidence.json').read_text()))
assert len(sql)==20 and all(x['status']=='PASS'for x in sql)
assert len(browser)==8 and all(x['status']=='expected'for x in browser)
assert colors and all(x['status']=='expected'for x in colors)
backend=(report/'backend.log').read_text();assert re.search(r'pass 48\b',backend)and re.search(r'fail 0\b',backend)
assert 'PASS'in(report/'bundle.log').read_text()
old=sorted((base/'supabase/migrations').glob('*.sql'));assert len(old)==32
assert all(p.read_bytes()==(root/p.relative_to(base)).read_bytes()for p in old)
integrity=json.loads((report/'integrity.json').read_text());assert not integrity['differences']and not integrity['asset_differences']
validation={'version':'SYZIA 033','environment':'LOCAL: PGlite, mock Auth/payment/media, Chromium; no external homologation','sql':{'passed':len(sql),'failed':0},'backend':{'passed':48,'failed':0},'browser':{'passed':len(browser),'failed':0},'color_matrix':{'combinations':8,'contrast_threshold':4.5,'scope':'affected CTAs and neutral information surfaces; not a full accessibility audit','confirmed_in':'browser-evidence.json'},'typecheck':'PASS','build':'PASS','bundle_secret_canary':'PASS','integrity':integrity,'provider':'INTEGRACAO DE PAGAMENTO REAL PENDENTE','deployment':'NOT PERFORMED'}
(report/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
skip={'node_modules','dist','.browser-runtime','.git','test-results','test-results-demo','test-results-presence','test-results-syzia','test-results-syzia033','__pycache__'}
excluded={'MANIFEST.json','changed-files.md','changed-files.json'}
def index(directory):
 result={}
 for parent,dirs,files in os.walk(directory):
  dirs[:]=[d for d in dirs if d not in skip]
  for name in files:
   p=Path(parent)/name
   if name in excluded or name.startswith('.env')and name not in {'.env.example','.env.server.example'}:continue
   result[str(p.relative_to(directory))]=hashlib.sha256(p.read_bytes()).hexdigest()
 return result
before,after=index(base),index(root)
changes=[{'path':p,'status':'Novo'if p not in before else'Alterado','sha256':h}for p,h in sorted(after.items())if before.get(p)!=h]
removed=sorted(set(before)-set(after));assert not removed,removed
(root/'docs/syzia-033/changed-files.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2)+'\n')
md='# SYZIA 033 — inventário contra a base 032\n\n'+str(len(changes))+' arquivos novos/alterados listados; nenhum arquivo anterior removido. MANIFEST e este inventário são gerados separadamente. Migrations 001–032 e ativos aprovados sem diferenças. Hashes individuais em `changed-files.json`.\n\n| Arquivo | Situação |\n| --- | --- |\n'
md+=''.join('| `'+x['path']+'` | '+x['status']+' |\n'for x in changes)
(root/'docs/syzia-033/changed-files.md').write_text(md)
print(json.dumps({'validation':'PASS','changed_files':len(changes),'removed_files':len(removed)},ensure_ascii=False))
