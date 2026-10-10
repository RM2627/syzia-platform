"""Rebuild the portable source archive; no credentials, dependencies or deployment."""
from pathlib import Path
import hashlib
import json
import os
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'SYZIA-042-Consolidado.zip'
if output.is_relative_to(root):
    raise SystemExit('Choose an archive destination outside the source directory.')
skip_dirs = {'node_modules', 'dist', '.browser-runtime', '.homologation', '.git', 'backups', 'test-results', 'test-results-demo', 'test-results-presence', 'test-results-syzia', 'test-results-syzia033', 'test-results-syzia034', 'test-results-syzia035', 'test-results-syzia036', 'test-results-syzia037', 'test-results-syzia038', 'test-results-syzia039', 'test-results-syzia040', 'test-results-syzia041', 'test-results-syzia042', 'playwright-report', '__pycache__'}
skip_files = {'MANIFEST.json', 'phase-4-browser-output.txt', 'browser-diagnostic.txt', 'phase-4-format.txt'}
files = []
for directory, dirs, names in os.walk(root):
    dirs[:] = sorted(d for d in dirs if d not in skip_dirs)
    for name in sorted(names):
        path = Path(directory) / name
        if name in skip_files or name.endswith(('.dump', '.pyc', '.zip')):
            continue
        if name.startswith('.env') and name not in {'.env.example', '.env.server.example'}:
            continue
        if path.is_symlink():
            raise SystemExit('Symlink requires explicit review: ' + str(path))
        files.append(path)
files.sort()
manifest = [{'path':str(p.relative_to(root)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(root / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
output.parent.mkdir(parents=True, exist_ok=True)
temporary = output.with_name(output.name + '.tmp')
with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files + [root / 'MANIFEST.json']:
        archive.write(path, 'foundation/' + str(path.relative_to(root)))
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    for item in manifest:
        assert hashlib.sha256(archive.read('foundation/' + item['path'])).hexdigest() == item['sha256']
with temporary.open('rb') as stream:
    os.fsync(stream.fileno())
os.replace(temporary, output)
print(json.dumps({'archive':str(output), 'files':len(files)+1, 'bytes':output.stat().st_size, 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'manifest_verified':True}))
