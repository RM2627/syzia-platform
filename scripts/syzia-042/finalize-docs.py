"""Summarize existing focused results and inventory the portable source; runs no tests."""
from pathlib import Path
import hashlib
import json
import os
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
report = root / 'reports/syzia-042'
docs = root / 'docs/syzia-042'
archive = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parents[1] / 'base042/SYZIA-041-Consolidado.zip'
load = lambda name: json.loads((report / name).read_text())
sql, r40, r41, browser = [load(n) for n in ['sql.json', 'regression-040.json', 'regression-041.json', 'browser.json']]
for result in [sql, r40, r41]:
    assert all(x['status'] == 'PASS' for x in result['results'])
assert browser['stats']['expected'] == 7 and browser['stats']['unexpected'] == 0 and browser['stats']['flaky'] == 0
counts = {'sql_042': len(sql['results']), 'regression_040': len(r40['results']), 'regression_041': len(r41['results']), 'browser': browser['stats']['expected']}
summary = {
    'round': '042', 'base': 'SYZIA 041 consolidated', 'date': '2026-09-26',
    'scope': 'Focused changes and necessary regression; not the final master audit',
    'cases': counts, 'total_pass': sum(counts.values()), 'tables_preserved_on_upgrade': sql['tablesPreserved'],
    'build_typecheck': 'PASS', 'bundle_scan': 'PASS',
    'sql_engine': 'PGlite local with Auth claims and fictitious fixtures',
    'browser_engine': 'Chromium 153, current React UI and local RPCs; controlled interception for Home errors/empty state',
    'native_postgresql': 'BLOCKED: container cannot map a non-root uid',
    'independent_connection_concurrency': 'NOT EXECUTED',
    'external_homologation': 'PENDING', 'owner_manual_validation': 'PENDING', 'final_master_audit': 'NOT EXECUTED — awaiting separate authorization',
    'deploy': False, 'real_payments_or_providers': False, 'real_data': False, 'round_043_started': False,
    'migration': 'supabase/migrations/202609260042_operational_refinements.sql',
    'previous_migrations_byte_identical': 38, 'brand_files_byte_identical': 23,
    'source_baseline_sha256': '760c30e5180b30d4db4618097591ca0ab650b1eb792c5e2369e3dc22a7f82f66',
    'evidence': ['sql.json', 'regression-040.json', 'regression-041.json', 'browser.json', 'build.log', 'bundle.log', 'native.log', 'base-integrity.json'],
}
(report / 'validation-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')

rows = [
('ADM vê Equipe SYZIA separada', 'S02; B03'),
('ADM não vê/usa gerar código global', 'S03–04; B03; R040-32'),
('ADM não edita username/e-mail/papel global', 'S03–05; B03'),
('ADM não desativa conta global', 'S03; B03; R040-21–22'),
('Tentativa direta RPC/API negada', 'S03–05,43; gateway representado por chamada SQL com ator e papel privilegiado'),
('Super Admin preserva administração global', 'S06; R040-21–22,32'),
('Alteração local em A não altera B', 'S07; R040-23–24'),
('Funcionário próprio mantém fluxo', 'S06; B03; R040-19'),
('Autonomia SIM + grant SIM', 'S08'),
('Autonomia SIM + grant NÃO', 'S09'),
('Autonomia NÃO + grant SIM', 'S10–11'),
('Capacidade ausente', 'S12; matrizes e downgrade R040'),
('Revogação durante sessão', 'S10,13; R040-13,26; R041-09'),
('Preço tabelado', 'S08; R041-02–03'),
('Faixa previamente publicada', 'S14'),
('Desconto dentro/fora do teto', 'S15; R041-21–22,32'),
('Compartilhado tenta preço variável', 'S16; R041-06–07'),
('Encaixe sem/com autorização e capacidade', 'S17 (predicado); S27–29,39,43–44 (reserva/capacidade)'),
('Home: carga normal', 'S18; B01'),
('Home: falha isolada de bloco', 'S18; B02 (interceptação controlada)'),
('Home: autorização versus rede', 'B02 (interceptação controlada)'),
('Home: Agenda de hoje', 'B01; S18'),
('Home: próximo atendimento', 'B01'),
('Home: atenção acionável', 'S19–20; B01,06–07'),
('Home: proposta aprovada sem agenda', 'S20; B06'),
('Home: amanhã', 'B01'),
('Home: ações rápidas', 'B01'),
('Home: estados vazios', 'B07 (interceptação controlada de seção vazia)'),
('Links abrem objeto correto', 'S19; B01,03,06–07'),
('CTA de proposta explica bloqueio', 'B06'),
('Explicação obrigatória quando aplicável', 'S23–24; B06'),
('Caso simples sem burocracia', 'S22'),
('Prévia e versionamento preservados', 'B06; R041-23–24'),
('Duração exibida', 'B04–06'),
('Dia ocupado', 'S39; R041-12'),
('Serviço não cabe no expediente', 'S25; B04,06'),
('Próximos horários compatíveis', 'S39; B04'),
('Texto antes/depois da aprovação', 'B06; S40–41'),
('Horário pretendido preservado', 'S40–41; B06; R041-10–13'),
('Contínuo não é dividido', 'S25,38; B04'),
('Divisível gera combinação automática', 'S26,37; B05'),
('Combinação respeita bloqueio/capacidade', 'S27,29,39,44'),
('Reserva atômica de todas as partes', 'S28,47; B05'),
('Conflito impede confirmação parcial', 'S29,34,44,47; não equivale a concorrência externa'),
('Consumidor vê períodos agrupados', 'S30; B05'),
('Agenda mostra períodos vinculados', 'S31; B05'),
('Remarcação de um período', 'S32; R041-27 conserva remarcação contínua'),
('Replanejamento integral', 'S33–34; B05 verifica entrada no fluxo'),
('Cancelamento integral', 'S35–36; B05'),
('Histórico', 'S31–36; B05; R041-27'),
('Multissserviço distribuível', 'S38'),
('Multissserviço com item contínuo', 'S38'),
('Fluxos A/B/C da 041', 'R041-02–19,28–35'),
('Isolamento A/B', 'S07,21,30,43; R041-25; R040-23'),
('RLS/grants', 'S09–13,21,43; R041-06,09,25,31; R040 matrizes'),
('Proposta/aprovação', 'S22–24,40–41,45; B06; R041-08–13,20–24'),
('Agenda direta', 'S25–39; B05; R041-02–03,14'),
('Agenda de avaliação', 'S40–41,45; B06; R041-04–13'),
('Claro/escuro', 'B04 claro; B05 escuro; não é auditoria de todos os módulos'),
('Desktop/mobile', 'B01 desktop/mobile; B05 mobile e ficha desktop'),
('Build/typecheck', 'npm run build e npm run check:bundle — PASS'),
('Upgrade 041→042 em banco populado', 'S01: 119 tabelas; base-integrity.json: migrations/marca byte idênticas'),
]
assert len(rows) == 62
coverage = '''# SYZIA 042 — cobertura e resultados

Os **62 requisitos** abaixo estão relacionados aos **124 casos aprovados**: 47 SQL focados, 35 regressões 040, 35 regressões 041 e 7 testes de navegador. Um caso pode atender mais de um requisito; a tabela não soma requisitos como se fossem testes adicionais.

S = número do teste SQL 042; B = teste de navegador 042; R040/R041 = casos das suítes anteriores reaplicadas sobre a 042. A 040 possui quatro variações do caso 09; por isso são 35 resultados, embora a numeração nominal termine em 32.

Toda marcação abaixo significa validação **local**. A API/gateway real, PostgreSQL nativo e concorrência independente permanecem pendentes; os casos SQL usam PGlite e fixtures de claims/Auth. Erros/estados vazios interceptados são identificados explicitamente.

| Item exigido | Verificação | Evidência local aprovada |
|---:|---|---|
'''
coverage += ''.join(f'| {i} | {name} | {evidence} |\n' for i, (name, evidence) in enumerate(rows, 1))
coverage += '''
## Casos adicionais relevantes

S46 verifica conclusão após a última parte, métricas e valor realizado sem duplicar contratação nem pagamento recebido. S47 injeta erro de gravação no segundo appointment e confirma rollback do primeiro e da submissão. S37 confere limite de períodos; S44 rejeita adulteração de plano/duração.

## Adaptação de regressão

`scripts/syzia-042/regression.mjs` aplica as migrations posteriores antes de rodar os casos originais. As comparações de upgrade descartam somente campos novos da comparação com colunas antigas. Uma expectativa 040 de negação também aceita a causa específica `shared_identity_requires_superadmin`, mantendo a exigência de bloqueio. As suítes originais foram preservadas.

## Resultado por caso

'''
for label, data in [('SQL 042', sql), ('Regressão 040', r40), ('Regressão 041', r41)]:
    coverage += f'### {label}\n\n| Caso | Resultado |\n|---|---|\n'
    coverage += ''.join(f"| {x['name']} | {x['status']} |\n" for x in data['results'])
    coverage += '\n'
def specs(suites):
    for suite in suites:
        yield from suite.get('specs', [])
        yield from specs(suite.get('suites', []))
coverage += '### Navegador 042\n\n| Caso | Resultado |\n|---|---|\n'
coverage += ''.join(f"| {s['title']} | PASS |\n" for s in specs(browser['suites']))
coverage += '\nLogs e JSON originais acompanham `reports/syzia-042/`. Build/typecheck, bundle e integridade são verificações adicionais; não entram na contagem de 124. Bateria mestre não executada.\n'
(docs / 'cobertura-testes.md').write_text(coverage)

# Same exclusions as the portable archive. Generated inventories list themselves without a self-referential hash.
skip_dirs = {'node_modules', 'dist', '.browser-runtime', '.homologation', '.git', 'backups', 'test-results', 'test-results-demo', 'test-results-presence', 'test-results-syzia', 'playwright-report', '__pycache__'} | {f'test-results-syzia{i:03}' for i in range(33, 43)}
skip_files = {'MANIFEST.json', 'phase-4-browser-output.txt', 'browser-diagnostic.txt', 'phase-4-format.txt'}
self_paths = {'reports/syzia-042/changes.json', 'docs/syzia-042/inventario.md'}
paths = set(self_paths)
for directory, dirs, names in os.walk(root):
    dirs[:] = sorted(d for d in dirs if d not in skip_dirs)
    for name in names:
        if name in skip_files or name.endswith(('.dump', '.pyc', '.zip')) or (name.startswith('.env') and name not in {'.env.example', '.env.server.example'}):
            continue
        paths.add(str((Path(directory) / name).relative_to(root)))
with zipfile.ZipFile(archive) as z:
    before = {n[len('foundation/'):]: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('foundation/') and not n.endswith('/')}
changes = []
for name in sorted(paths):
    digest = None if name in self_paths else hashlib.sha256((root / name).read_bytes()).hexdigest()
    if name not in before or before[name] != digest:
        changes.append({'path': name, 'status': 'modified' if name in before else 'added', 'before_sha256': before.get(name), 'after_sha256': digest, **({'note': 'Generated inventory; self-hash omitted'} if name in self_paths else {})})
missing = [name for name in before if not (root / name).is_file()]
assert not missing, missing
payload = {'base_archive_sha256': summary['source_baseline_sha256'], 'changes': changes, 'removed': [], 'manifest': 'Regenerated by package-project.py; excluded from self-referential inventory', 'counts': {k: sum(x['status'] == k for x in changes) for k in ['modified', 'added']}}
(report / 'changes.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
inventory = f'''# SYZIA 042 — inventário de alterações

Comparação com o ZIP consolidado 041 verificado. **{payload['counts']['modified']} arquivos anteriores alterados**, **{payload['counts']['added']} arquivos novos**, **nenhum arquivo removido**. O `MANIFEST.json` é regenerado no empacotamento para registrar o conteúdo integral do novo ZIP e não entra em seu próprio hash.

As **38 migrations anteriores** e os **23 assets da marca** permanecem byte a byte idênticos. Os registros em `reports/syzia-042/baseline-functions/` são cópias das definições da base para diagnóstico e geração auditável; não são novas migrations. Não houve alteração de dependências ou lockfile.

## Arquivos de aplicação e infraestrutura alterados

| Arquivo | Situação |
|---|---|
'''
for item in changes:
    if not item['path'].startswith(('reports/', 'docs/')):
        inventory += f"| `{item['path']}` | {'Alterado' if item['status'] == 'modified' else 'Novo'} |\n"
inventory += '\n## Documentação, testes e evidências\n\n'
inventory += 'A relação completa, inclusive cada definição SQL de referência, está em `reports/syzia-042/changes.json`, com hashes antes/depois. O manifesto do ZIP cobre também os arquivos inalterados.\n\n'
inventory += '| Caminho ou grupo | Quantidade alterada/nova |\n|---|---:|\n'
for prefix in ['docs/syzia-042/', 'reports/syzia-042/baseline-functions/', 'reports/syzia-042/']:
    items = [x for x in changes if x['path'].startswith(prefix) and not (prefix == 'reports/syzia-042/' and '/baseline-functions/' in x['path'])]
    inventory += f'| `{prefix}` | {len(items)} |\n'
inventory += '''
## Principais responsabilidades

- `src/access`, `src/permissions`: identidade compartilhada e controles locais.
- `src/company`: configuração de execução/faixa e textos da autonomia.
- `src/operations`: Home por seção, explicação de proposta e agendamento do pedido.
- `src/scheduling`: apresentação comum de duração, períodos e planos.
- `src/consumer`, `src/central`: jornada, confirmação e acompanhamento dos planos no contexto existente.
- `src/commercial`: link direto para oportunidade da Home.
- `supabase/migrations/...042...sql`: esquema incremental, comandos, políticas efetivas e execução atômica.
- `scripts/syzia-042`: fontes do SQL, diagnóstico, regressão e inventário.
- `tests/syzia-042-sql.test.mjs`, `tests/demo-browser/syzia-042.spec.ts`: validação focada e evidências.
- `scripts/dev-consumer-demo.mjs`, `tests/support/consumer-db.mjs`, `scripts/test-native.mjs`: suporte local à 042; não são configuração de ambiente externo.

O pacote exclui dependências instaladas, builds gerados, credenciais, diretórios temporários de teste e repositório `.git`. Fonte, assets, migrations, fixtures, testes, scripts e documentação histórica permanecem no consolidado.
'''
(docs / 'inventario.md').write_text(inventory)
print(json.dumps({'pass': summary['total_pass'], 'changes': payload['counts'], 'removed': len(missing)}, ensure_ascii=False))
