"""Package the complete 044 UX source and evidence; no build, deploy or database action."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
output = Path(sys.argv[1]).resolve()
if output.is_relative_to(root):
    raise SystemExit('Choose an output outside the source tree')
skip_dirs = {'node_modules', 'dist', '.git', '.browser-runtime', '.homologation', 'backups', 'playwright-report', '__pycache__'}
files = []
for p in root.rglob('*'):
    rel = p.relative_to(root)
    if not p.is_file() or any(x in skip_dirs or x.startswith('test-results') for x in rel.parts):
        continue
    if p.name == 'MANIFEST.json' or p.name.startswith('.audit-demo-') or p.suffix in {'.pyc', '.dump'}:
        continue
    if p.name.startswith('.env') and p.name not in {'.env.example', '.env.server.example'}:
        continue
    if p.is_symlink():
        raise SystemExit('Unexpected symlink: ' + str(rel))
    files.append(p)
files.sort()
manifest = [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(root / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
output.parent.mkdir(parents=True, exist_ok=True)
tmp = output.with_suffix('.zip.tmp')
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in files + [root / 'MANIFEST.json']:
        # Playwright traces are already compressed; retain them in this evidence package.
        z.write(p, 'foundation/' + str(p.relative_to(root)), compress_type=zipfile.ZIP_STORED if p.suffix == '.zip' else zipfile.ZIP_DEFLATED)
with zipfile.ZipFile(tmp) as z:
    assert z.testzip() is None
    for item in manifest:
        assert hashlib.sha256(z.read('foundation/' + item['path'])).hexdigest() == item['sha256']
tmp.replace(output)
print(json.dumps({'archive': str(output), 'files': len(files) + 1, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'manifest_verified': True}))
