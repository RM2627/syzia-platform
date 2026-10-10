# Gate vigente 048

O mesmo comando `npm run test:current-gate` mantém as 17 etapas da 047 e acrescenta `focused-048` e `browser-048` (19 etapas). `SYZIA_OPTIONAL_MANUAL_CURRENT=1` aplica a 048 após a 047 nas fixtures operacionais; snapshots de upgrade históricos continuam testando seus pontos de origem. O teste 048-M01 aplica a 048 sobre a 047 populada e compara dados/RLS. O teste 048-I01 confere 43 migrations anteriores, lockfile e núcleo do billing por SHA-256.

O Manual opcional é a regra de produto aprovada da 048; não se remove qualquer teste histórico. Nova matriz: `MATRIZ-TESTES-SYZIA-048.md`. Relatório corrente: `reports/syzia-044/current-gate.json`, com `version: 048`. O caminho preserva compatibilidade das ferramentas. A base limpa mantém somente as oito entradas JSON e README de `reports/`; as demais saídas são regeneradas. MP-01 e demais verificações externas continuam PENDENTES.

# Gate vigente 047

`npm run test:current-gate` acrescenta 33 testes de billing, upgrade incremental e navegador 047 ao gate abaixo, sem remover asserções funcionais históricas. A regressão de suporte flexível executa as mesmas asserções sobre 047. Os casos antigos de trial sem cartão são fixture explicitamente offline; o runtime real 047 exige cartão e confirmação server-side. A base limpa conserva testes/migrations e oito JSON de referência; o contrato de preservação não requer logs/traces antigos. Resultado externo Mercado Pago/Supabase: PENDENTE, inclusive MP-01 documentado no guia.

# Gate cumulativo vigente — SYZIA 044

Comando oficial: `npm run test:current-gate`.

Preparação local: Node 24, `npm ci`, Chromium instalado para Playwright (`npx playwright install chromium`). Alternativamente, informar `FOUNDATION_CHROMIUM_PATH` com o executável Chromium local. Nenhuma conta externa é necessária. A fixture é exclusivamente fictícia; portas locais 5173 e 54321 devem estar livres.

O runner `scripts/syzia-044/current-gate.mjs` executa sequencialmente as etapas abaixo, escreve logs separados e `reports/syzia-044/current-gate.json`, interrompe na primeira falha e retorna status diferente de zero. O relatório registra comando, versão Node, datas, duração, código de saída e etapas não executadas. Não há retries automáticos nem conversão de falhas para sucesso. `--inject-failure` exercita o próprio runner com um filho que termina em 42 e deve produzir saída 1 / relatório FAIL separado; é teste do gate, não falha do produto.

| Etapa | Código executado | Requisitos vigentes |
|---|---|---|
| gate-contracts | `tests/current-gate.test.mjs` | Integridade byte a byte de históricos, relatório/falha controlada e mapa completo |
| focused | `tests/syzia-044-sql.test.mjs` | AUD-001/002/003, isolamento, origem manual, RLS/grants, empresa sem ADM |
| upgrade | `tests/syzia-044-upgrade.test.mjs` | 042 populada→044, todas as colunas/linhas antigas, rollback, histórico manual e segurança |
| regression-040-042 | `scripts/syzia-044/regression.mjs` | Asserções vigentes 040/041/042 e onboarding existente, sobre a implementação 044 |
| gateways | 036 HTTP, 035 server, enterprise-access-server, organization-activation-server, 034 utils, syzia-media | Credenciais, diagnósticos seguros, retomada, entrega, mídia e enquadramento; adapters locais |
| build | `scripts/inspect-browser-bundle.mjs` | Typecheck, Vite build e ausência de canário server-only no bundle |
| browser | `scripts/syzia-044/browser.mjs` / `playwright.current.config.ts` | UI atual, jornada/Agenda/Equipe/Home, mídia, login/ativação, planos/trial, sessões, AUD-001/002/003 e navegação desktop/celular |

## Reutilização sem reescrever históricos

Todos os arquivos originalmente presentes em `tests/`, `supabase/migrations/` e `reports/` são conferidos por SHA-256 contra `preserved-042-sha256.json`. As suítes originais continuam disponíveis com os comandos históricos. `test:local` é o comando histórico acumulado; não representa o gate vigente.

O adaptador SQL produz cópias temporárias e as remove ao terminar. Carrega explicitamente as migrations posteriores ao cenário antes das asserções. Em 041/042 as asserções não mudam. Na 040 somente dois ajustes de compatibilidade estão autorizados e visíveis no adaptador: comparação de todas as **colunas existentes antes do upgrade**, em vez de acrescentar colunas novas ao snapshot antigo; aceitação da causa específica `shared_identity_requires_superadmin` como negação, além da causa antiga `access_denied`. Isso não permite sucesso no lugar de negação. O onboarding reutiliza integralmente as asserções com fixture atual e saída separada.

O adaptador de navegador reutiliza:

- 042: todos os sete cenários, sem mudar asserções;
- 040: cenários 01–04 e 06–09. O cenário 05 depende do seletor de horários anterior; seu requisito é exercitado pelos cenários 042 04–06 e pelos testes 044, com períodos atuais;
- 033-media e 034-media: todos os cenários, sem mudar asserções; a cópia 034 usa prefixo próprio nos títulos fictícios para evitar colisão com trabalhos criados pela 033 no mesmo banco;
- 036: fluxo empresarial de provisionamento/ativação, login por identidade e primeiro acesso responsivo. O antigo fluxo global genérico de “Nova pessoa” foi substituído pela Equipe SYZIA da 040/042 e pelo cenário 040 03;
- `current-session.spec.ts`: asserções de inatividade, atividade explícita e logout entre abas reaproveitadas com login/rota atuais; cenário atual de rascunho/isolamento;
- `current-navigation.spec.ts`: inspeção atual reutilizada da 043, agora propagando qualquer falha de subcaso para saída não-zero;
- `syzia-044.spec.ts`: HTTP/UI específicos de aprovação, remarcação, buffer, mensagem de ordem e ficha.

Relatórios/capturas reutilizados são redirecionados para `reports/syzia-044/`. Nenhum relatório 040/041/042 é sobrescrito. As cópias temporárias não integram o pacote.

## Mapa completo e limites

[history-current-map.md](history-current-map.md) e o JSON correspondente mapeiam individualmente todos os 105 registros FAIL da 043 (incluindo três reproduções de defeitos) e os três bloqueios de preparação histórica. Linhas TAP duplicadas são identificadas como tal. Cada entrada conserva resultado/evidência anterior, motivo, decisão aprovada e arquivo/casos atuais equivalentes. Não se reclassifica retrospectivamente um teste antigo como PASS.

O mapa distingue requisito ainda vigente, requisito substituído legitimamente e os três defeitos corrigidos. Suítes não incluídas na tabela de execução permanecem preservadas como **histórico**, não são prova de regressão atual. A integridade e o mapa fazem parte do gate. Cobertura de servidor é usada para contratos de autorização e integridade; inspeção visual de rota não é apresentada como prova de todas as mutações daquela tela.

PENDENTE DE HOMOLOGAÇÃO EXTERNA: Auth, SMTP, Storage/gateway, PostgREST/schema cache, concorrência PostgreSQL em conexões independentes, backup/restauração, volume/performance e provider reais. PGlite, simulações HTTP e relógio simulado não provam esses ambientes.

Permanecem os limites declarados na 043: não se afirma testar todas as combinações possíveis de papel × plano × ação por cliques, nem toda tabela com massa positiva de ambos os tenants. O gate é cumulativo para os requisitos selecionados e os quatro achados autorizados; não é a bateria final ampla pós-correções.

## Complemento autorizado UX-001 — feature freeze

O gate mantém integralmente as etapas e asserções acima e acrescenta:

- `ux001-security`: `tests/ux001-security.test.mjs`, autorização de tickets em A/B, grants/vínculos revogados, Equipe SYZIA atribuída/não atribuída, consumidor e anônimo.
- `ux001-browser`: `playwright.ux001.config.ts` / `ux001.spec.ts`, em fixture nova após a etapa histórica de navegador: rotas empresarial/global, filtros, histórico, links de origem, isolamento de exibição e 1440/390/320 px.

Nenhum teste histórico foi substituído ou afrouxado. A suíte focada pode ser executada com `node node_modules/@playwright/test/cli.js test --config=playwright.ux001.config.ts`. As medições de produção estão em `scripts/ux001/`, separadas do servidor de desenvolvimento usado pelo gate. Relatório desta intervenção: `RELATORIO-UX001-FINAL.md`. UX-002 permanece adiado para pós-lançamento.

A fixture de UX-001 é isolada porque suítes históricas alteram deliberadamente planos e atribuições. Reutilizar aquele estado final como se ainda fosse a fixture inicial invalida a preparação dos cenários positivos de operadores. O runner mantém as negações históricas e inicia uma fixture descartável nova para as mesmas asserções UX-001, sem conceder acessos artificiais ao produto.

## Exceção controlada — disponibilidade e Assistido (045)

O mesmo comando oficial acrescenta `team-upgrade`, `team-availability` e `team-browser`. As etapas SQL vigentes aplicam a 045: `current-db`, `current-fixture` e o adaptador de regressão usam `SYZIA_TEAM_CURRENT=1`. As asserções históricas permanecem iguais. No adaptador 040–042, a configuração fictícia do horário/limite ocorre somente nos cenários operacionais, depois da comparação intacta de upgrade. A migration continua sem valores comerciais; a fixture local tem horários/limites exclusivamente fictícios, separados da produção.

O upgrade focado compara todas as linhas/colunas anteriores de 119 tabelas da 044 populada. O teste novo cobre disponibilidade semanal, bloqueios pontuais, buffer, remarcação, múltiplos períodos, atribuição, isolamento, ciclos, consumo, excesso, mensagens e downgrade. O navegador acrescenta edição em 1440/390/320 px, política global e consulta empresarial. Relatório: `RELATORIO-DISPONIBILIDADE-EQUIPE-ASSISTIDO.md`.

A saída corrente do runner continua em `reports/syzia-044/current-gate.json`. A entrega da 045 preserva a execução em `reports/team-availability/current-gate/`. Os arquivos de teste originais de 040–042/044/UX-001 não foram afrouxados. Os únicos helpers de teste alterados são os adaptadores necessários para carregar a migration atual.
# Complemento 046 — suporte compartilhado flexível

O comando oficial continua `npm run test:current-gate`. A rodada 046 acrescenta `flexible-upgrade`, `flexible-support` e `flexible-browser` às etapas anteriores, sem remover assertions históricas. A variável interna `SYZIA_FLEXIBLE_CURRENT=1` aplica a migration 046 às fixtures atuais; os snapshots de upgrade das bases históricas continuam independentes.

O gate cobre os dois modos, presença operacional, fila sem consumo, quota/ciclo, upgrade populado e UI desktop/mobile. As regressões 045, 040–042 adaptadas, 044, gateways, build, consumidor, Central e UX-001 continuam no runner. Evidências da execução 046 ficam em `reports/flexible-support/current-gate/`; os relatórios entregues na 045 são preservados nos caminhos históricos do pacote.

PGlite/HTTP fictício/Chromium são validação local. Supabase/Auth/PostgREST/Storage reais, concorrência multi-conexão e restauração continuam PENDENTES DE HOMOLOGAÇÃO EXTERNA. Não há autorização de deploy/publicação.

## Adequação explícita de política aprovada na 048

O teste histórico `tests/onboarding.test.mjs` permanece intacto. Somente sua cópia temporária no gate 048 troca três asserções dos dois cenários afetados: o Manual antes ausente passa a estar presente/opcional, e Manual/autonomia shared deixam de integrar os requisitos gerais de configuração mínima. O adaptador exige os anchors exatos e falha se não os encontrar. Não aceita simplesmente qualquer resultado. M09/M10 da 048 verificam a negação específica do shared sem orientação e a ausência de bloqueio da equipe própria. Todas as demais asserções históricas são reaproveitadas.
