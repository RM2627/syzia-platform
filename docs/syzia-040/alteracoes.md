# SYZIA 040 — inventário de alterações

Comparação por conteúdo com o consolidado 039: **30 arquivos alterados, 489 adicionados e nenhum anterior removido**.

O inventário completo está em `alteracoes.json`. O `MANIFEST.json` da raiz é regenerado no empacotamento e contém os hashes finais. As 36 migrations anteriores, os 23 assets da marca e as dependências/lockfile foram preservados.

## Finalidade das alterações

| Área | Mudança |
|---|---|
| Banco | Migration 040 incremental: trial, homologação, destaque, autorização, equipe global e contexto do consumidor. |
| Frontend | Planos/trial, aplicação de versão, Equipe SYZIA, grants, Central, marca publicada, agenda, FAQ e traduções. |
| Testes | Suíte 040, regressões 038/039 sobre 040 e navegador; fixture descartável e evidências. |
| Documentação | Escopo, relatório, upgrade, matrizes, inventário e resumo verificável. |
| Empacotamento | Nome 040, exclusões dos resultados temporários e manifesto verificável. |

## Arquivos existentes alterados

- `.gitignore`
- `AGENTS.md`
- `README.md`
- `package.json`
- `reports/phase-8-build.txt`
- `reports/phase-8-bundle-scan.json`
- `scripts/dev-consumer-demo.mjs`
- `scripts/package-project.py`
- `scripts/test-native.mjs`
- `src/FoundationApp.tsx`
- `src/access/EnterpriseAccess.tsx`
- `src/access/OrganizationAdmin.tsx`
- `src/access/PeopleAccess.tsx`
- `src/acquisition/Acquisition.tsx`
- `src/acquisition/PublicSite.tsx`
- `src/acquisition/SelfService.tsx`
- `src/acquisition/acquisition.css`
- `src/api.ts`
- `src/billing/Billing.tsx`
- `src/billing/billing.css`
- `src/central/Central.tsx`
- `src/central/ConsumerChat.tsx`
- `src/central/model.ts`
- `src/company/model.ts`
- `src/consumer/Consumer.tsx`
- `src/consumer/RequestedItems.tsx`
- `src/consumer/consumer.css`
- `src/operations/Operations.tsx`
- `src/permissions/Permissions.tsx`
- `tests/support/consumer-db.mjs`

## Arquivos adicionados

- `docs/syzia-040/alteracoes.json`
- `docs/syzia-040/alteracoes.md`
- `docs/syzia-040/guia-upgrade.md`
- `docs/syzia-040/matrizes.md`
- `docs/syzia-040/relatorio.md`
- `docs/syzia-040/request.md`
- `playwright.syzia040.config.ts`
- `reports/syzia-040/base-integrity.json`
- `reports/syzia-040/baseline-catalog.json`
- `reports/syzia-040/baseline-columns.json`
- `reports/syzia-040/browser.json`
- `reports/syzia-040/browser.log`
- `reports/syzia-040/build.log`
- `reports/syzia-040/bundle.log`
- `reports/syzia-040/consumidor-claro.png`
- `reports/syzia-040/consumidor-escuro.png`
- `reports/syzia-040/equipe.png`
- `reports/syzia-040/faq-mobile.png`
- `reports/syzia-040/inspect.log`
- `reports/syzia-040/manual.png`
- `reports/syzia-040/native.log`
- `reports/syzia-040/planos.png`
- `reports/syzia-040/regression-038.json`
- `reports/syzia-040/regression-039.json`
- `reports/syzia-040/regression.log`
- `reports/syzia-040/sql.json`
- `reports/syzia-040/sql.log`
- `reports/syzia-040/trial-onboarding.png`
- `reports/syzia-040/validation-summary.json`
- `scripts/syzia-040/build.py`
- `scripts/syzia-040/finalize-report.py`
- `scripts/syzia-040/inspect.mjs`
- `scripts/syzia-040/regression.mjs`
- `scripts/syzia-040/verify-base.py`
- `src/billing/Homologation.tsx`
- `supabase/migrations/202609260040_post_homologation.sql`
- `tests/demo-browser/syzia-040.spec.ts`
- `tests/syzia-040-sql.test.mjs`

Também foram adicionadas 451 definições SQL em `reports/syzia-040/baseline-functions/`, extraídas da base 039 para diagnóstico e reprodução do gerador da migration. Cada caminho consta no JSON; não são migrations adicionais.

Os relatórios antigos de build/bundle são atualizados pelo verificador existente. A evidência específica da rodada permanece em `reports/syzia-040/`. Nenhum ambiente externo foi alterado.
