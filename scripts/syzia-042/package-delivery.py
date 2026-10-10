"""Package the complete source and individual review artifacts. Does not deploy."""
from pathlib import Path
import base64
import hashlib
import html
import json
import shutil
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'deliverables-042'
if out.is_relative_to(root):
    raise SystemExit('Use an output folder outside the source project.')
out.mkdir(parents=True, exist_ok=True)
report = root / 'reports/syzia-042'
docs = root / 'docs/syzia-042'
doc_names = {
    'relatorio.md': 'SYZIA-042-Relatorio-Tecnico.md',
    'guia-upgrade.md': 'SYZIA-042-Guia-Upgrade.md',
    'diagnostico.md': 'SYZIA-042-Diagnostico.md',
    'matriz-autorizacao.md': 'SYZIA-042-Matriz-Autorizacao.md',
    'matriz-autonomia.md': 'SYZIA-042-Matriz-Autonomia.md',
    'cobertura-testes.md': 'SYZIA-042-Cobertura-Testes.md',
    'inventario.md': 'SYZIA-042-Inventario.md',
    'evidencias.md': 'SYZIA-042-Indice-Evidencias.md',
    'request.md': 'SYZIA-042-Escopo-Autorizado.md',
}
for name, dest in doc_names.items():
    shutil.copy2(docs / name, out / dest)
sql_name = '202609260042_operational_refinements.sql'
shutil.copy2(root / 'supabase/migrations' / sql_name, out / sql_name)
shutil.copy2(report / 'changes.json', out / 'SYZIA-042-Inventario.json')
load = lambda name: json.loads((report / name).read_text())
results = {
    'summary': load('validation-summary.json'),
    'sql_042': load('sql.json'),
    'regression_040': load('regression-040.json'),
    'regression_041': load('regression-041.json'),
    'browser': load('browser.json'),
    'native_attempt': (report / 'native.log').read_text(),
}
(out / 'SYZIA-042-Resultados-Testes.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
scenes = [
    ('home-desktop.png', 'Home — desktop', 'Agenda, atenção, amanhã e ações do dia.'),
    ('home-mobile.png', 'Home — celular', 'Conteúdo operacional em viewport móvel.'),
    ('home-erro-local.png', 'Home — falha localizada', 'Erro injetado no teste; demais seções permanecem disponíveis.'),
    ('equipe-compartilhada.png', 'Equipe SYZIA', 'Identidade global separada; controles locais e funcionários próprios preservados.'),
    ('continuo-sem-janela.png', 'Execução contínua', 'Duração 6h30, janela incompatível e busca de próximos horários.'),
    ('divisivel-revisao-mobile.png', 'Divisível — revisão móvel', 'Uma contratação de 10h, distribuída automaticamente em dois períodos.'),
    ('divisivel-acompanhamento.png', 'Divisível — consumidor', 'As partes aparecem agrupadas no acompanhamento.'),
    ('divisivel-ficha.png', 'Divisível — ficha empresarial', 'Períodos vinculados e operações no mesmo contexto.'),
    ('proposta-validacao.png', 'Proposta — validação', 'Explicação requerida quando há alteração relevante; motivo visível.'),
    ('proposta-aprovada-agenda.png', 'Proposta aprovada — Agenda', 'Aprovação preservada, horário pretendido e orientação atual.'),
]
cards = []
nav = []
for number, (name, title, caption) in enumerate(scenes, 1):
    source = report / name
    assert source.stat().st_size > 0
    shutil.copy2(source, out / name)
    data = base64.b64encode(source.read_bytes()).decode()
    nav.append(f'<a href="#c{number}">{number:02} · {html.escape(title)}</a>')
    cards.append(f'<article id="c{number}"><h2>{number:02} · {html.escape(title)}</h2><p>{html.escape(caption)}</p><a href="{name}" download>Arquivo PNG individual</a><img alt="{html.escape(title)}" src="data:image/png;base64,{data}" loading="lazy"></article>')
page = '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYZIA 042 — evidências</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5ff;color:#262634;font:16px/1.55 system-ui,sans-serif}header{background:#0b0b14;color:#fff;padding:40px max(24px,calc((100vw - 1120px)/2))}header p{max-width:850px;color:#d8d6e8}h1{font-size:32px;margin:0}h2{font-size:22px}main{max-width:1120px;margin:auto;padding:28px 20px}nav{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:30px}a{color:#4f32cd}nav a{background:white;border:1px solid #d9d4ee;border-radius:10px;padding:8px 12px;text-decoration:none}article{background:#fff;padding:24px;margin:0 0 24px;border:1px solid #deddeb;border-radius:16px;scroll-margin-top:20px}article p{color:#595767}article img{display:block;max-width:100%;height:auto;margin:20px auto 0;border:1px solid #deddeb;border-radius:8px}footer{padding:24px;color:#595767;text-align:center}@media(max-width:600px){article{padding:14px}h1{font-size:27px}}@media print{nav,article>a{display:none}article{break-before:page}header{color:#111;background:#fff}}
</style><header><h1>SYZIA 042 · Evidências da interface</h1><p>Capturas da versão atual, executada localmente com dados fictícios. 124 casos focados/regressão/navegador aprovados. Homologação externa e bateria final permanecem pendentes.</p><p>As imagens estão incorporadas neste arquivo para consulta offline. A captura de erro usa uma falha controlada pelo teste; ela não é registro de um incidente externo.</p></header><main><nav>'''
page += ''.join(nav) + '</nav>' + ''.join(cards) + '</main><footer>26/09/2026 · Entrega para homologação manual curta do proprietário.</footer></html>'
(out / 'SYZIA-042-Evidencias.html').write_text(page)

evidence_zip = out / 'SYZIA-042-Evidencias-e-Resultados.zip'
with zipfile.ZipFile(evidence_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(out / 'SYZIA-042-Evidencias.html', 'SYZIA-042-Evidencias.html')
    for name, _, _ in scenes:
        # HTML download links are siblings; documentation also lists the source path.
        z.write(out / name, name)
    for name in ['sql.json', 'regression-040.json', 'regression-041.json', 'browser.json', 'validation-summary.json', 'base-integrity.json', 'diagnosis.json', 'build.log', 'bundle.log', 'native.log', 'sql.log', 'regression.log', 'browser.log']:
        z.write(report / name, 'resultados/' + name)
    for name, dest in doc_names.items():
        z.write(out / dest, 'documentacao/' + dest)
with zipfile.ZipFile(evidence_zip) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == 33

source_zip = out / 'SYZIA-042-Consolidado.zip'
result = subprocess.check_output([sys.executable, str(root / 'scripts/package-project.py'), str(source_zip)], cwd=root, text=True)
source_info = json.loads(result)
integrity = {
    'source_archive': source_info,
    'evidence_archive': {'filename': evidence_zip.name, 'bytes': evidence_zip.stat().st_size, 'sha256': hashlib.sha256(evidence_zip.read_bytes()).hexdigest(), 'crc_verified': True, 'files': 33},
    'base_preservation': load('base-integrity.json'),
}
(out / 'SYZIA-042-Integridade.json').write_text(json.dumps(integrity, ensure_ascii=False, indent=2) + '\n')
deliverables = sorted(p for p in out.iterdir() if p.is_file() and p.name != 'SYZIA-042-SHA256.txt')
assert all(p.stat().st_size > 0 for p in deliverables)
(out / 'SYZIA-042-SHA256.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in deliverables))
print(json.dumps({'source': source_info, 'individual_files': len(deliverables) + 1, 'output': str(out)}, ensure_ascii=False))
