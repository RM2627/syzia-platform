#!/usr/bin/env python3
"""Build a clean, independently extractable archive without deleting the source workspace."""
import argparse, hashlib, json, shutil, zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--stage',required=True);p.add_argument('--zip',required=True);p.add_argument('--inventory',required=True);p.add_argument('--original');a=p.parse_args()
src=Path(a.source).resolve();stage=Path(a.stage).resolve();archive=Path(a.zip).resolve()
if stage==src or src in stage.parents or stage.exists():raise SystemExit('Use a new staging directory outside source')
keep_reports={'reports/README.md','reports/phase-6-migration-integrity.json'}|{f'reports/ux001/{x}/measurements.json'for x in ['before','after']}|{f'reports/ux-performance/{x}/measurements.json'for x in ['before','after','before-actions','after-actions','after-guards']}
exclude_dirs={'node_modules','dist','coverage','.cache','.git','.browser-runtime','.homologation','backups','__pycache__','playwright-report'}
exclude_root={'MANIFEST.json','MANIFEST-DISPONIBILIDADE-EQUIPE-ASSISTIDO.json','MANIFEST-SUPORTE-COMPARTILHADO-FLEXIVEL.json','RESULTADO-GATE-UX001.json'}
kept=[];removed=[]
def reason(path):
 parts=path.split('/');name=parts[-1]
 if any(x in exclude_dirs or x.startswith('test-results') or x.startswith('playwright-report')for x in parts[:-1]):return 'dependencies-build-cache-generated-tests'
 if path.startswith('reports/')and path not in keep_reports:return 'historical-or-generated-reports'
 if path in exclude_root:return 'historical-manifest-or-gate'
 if name.startswith('.env')and name not in ('.env.example','.env.server.example'):return 'local-environment'
 if name.endswith(('.zip','.log','.pyc','.tmp','.bak'))or '.temporary.'in name or '.047-temporary.'in name:return 'temporary-archive-log'
 return None
for f in sorted(src.rglob('*')):
 if not f.is_file():continue
 path=f.relative_to(src).as_posix();why=reason(path)
 if why:removed.append({'path':path,'bytes':f.stat().st_size,'reason':why});continue
 dest=stage/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest);kept.append(path)
archive.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for path in kept:z.write(stage/path,'foundation/'+path)
summary={'source_files':len(kept)+len(removed),'kept_files':len(kept),'excluded_working_files':len(removed),'clean_zip_bytes':archive.stat().st_size,'clean_zip_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'uncompressed_bytes':sum((stage/x).stat().st_size for x in kept),'preserved_report_inputs':sorted(keep_reports),'excluded':removed}
if a.original:
 original=Path(a.original)
 with zipfile.ZipFile(original)as z:
  entries=[x for x in z.infolist()if not x.is_dir()];old={x.filename.removeprefix('foundation/'):x for x in entries}
  removed_original=[{'path':x,'bytes':i.file_size,'reason':reason(x)}for x,i in old.items()if x not in kept]
  summary.update(original_zip_bytes=original.stat().st_size,original_files=len(entries),removed_original_count=len(removed_original),removed_original=removed_original)
Path(a.inventory).write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items()if k not in('excluded','removed_original')},indent=2))
