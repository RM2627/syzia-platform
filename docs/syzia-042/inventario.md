# SYZIA 042 — inventário de alterações

Comparação com o ZIP consolidado 041 verificado. **20 arquivos anteriores alterados**, **541 arquivos novos**, **nenhum arquivo removido**. O `MANIFEST.json` é regenerado no empacotamento para registrar o conteúdo integral do novo ZIP e não entra em seu próprio hash.

As **38 migrations anteriores** e os **23 assets da marca** permanecem byte a byte idênticos. Os registros em `reports/syzia-042/baseline-functions/` são cópias das definições da base para diagnóstico e geração auditável; não são novas migrations. Não houve alteração de dependências ou lockfile.

## Arquivos de aplicação e infraestrutura alterados

| Arquivo | Situação |
|---|---|
| `AGENTS.md` | Alterado |
| `README.md` | Alterado |
| `package.json` | Alterado |
| `playwright.syzia042.config.ts` | Novo |
| `scripts/dev-consumer-demo.mjs` | Alterado |
| `scripts/package-project.py` | Alterado |
| `scripts/syzia-042/build.py` | Novo |
| `scripts/syzia-042/diagnose.mjs` | Novo |
| `scripts/syzia-042/execution.sql` | Novo |
| `scripts/syzia-042/finalize-docs.py` | Novo |
| `scripts/syzia-042/home.sql` | Novo |
| `scripts/syzia-042/identity.sql` | Novo |
| `scripts/syzia-042/inspect.mjs` | Novo |
| `scripts/syzia-042/package-delivery.py` | Novo |
| `scripts/syzia-042/patches.py` | Novo |
| `scripts/syzia-042/quotes.sql` | Novo |
| `scripts/syzia-042/regression.mjs` | Novo |
| `scripts/syzia-042/schema.sql` | Novo |
| `scripts/syzia-042/smoke.mjs` | Novo |
| `scripts/syzia-042/ui.py` | Novo |
| `scripts/syzia-042/verify-base.py` | Novo |
| `scripts/test-native.mjs` | Alterado |
| `src/access/EnterpriseAccess.tsx` | Alterado |
| `src/api.ts` | Alterado |
| `src/central/Central.tsx` | Alterado |
| `src/commercial/Commercial.tsx` | Alterado |
| `src/company/Company.tsx` | Alterado |
| `src/company/model.ts` | Alterado |
| `src/consumer/Consumer.tsx` | Alterado |
| `src/consumer/Journey.tsx` | Alterado |
| `src/consumer/QuoteSummary.tsx` | Alterado |
| `src/consumer/api.ts` | Alterado |
| `src/operations/ExecutionBooking.tsx` | Novo |
| `src/operations/Operations.tsx` | Alterado |
| `src/operations/QuoteCalculator.tsx` | Alterado |
| `src/permissions/Permissions.tsx` | Alterado |
| `src/scheduling/ExecutionSchedule.tsx` | Novo |
| `src/scheduling/execution.css` | Novo |
| `supabase/migrations/202609260042_operational_refinements.sql` | Novo |
| `tests/demo-browser/syzia-042.spec.ts` | Novo |
| `tests/support/consumer-db.mjs` | Alterado |
| `tests/syzia-042-sql.test.mjs` | Novo |

## Documentação, testes e evidências

A relação completa, inclusive cada definição SQL de referência, está em `reports/syzia-042/changes.json`, com hashes antes/depois. O manifesto do ZIP cobre também os arquivos inalterados.

| Caminho ou grupo | Quantidade alterada/nova |
|---|---:|
| `docs/syzia-042/` | 9 |
| `reports/syzia-042/baseline-functions/` | 480 |
| `reports/syzia-042/` | 30 |

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
