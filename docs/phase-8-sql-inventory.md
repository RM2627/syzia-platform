# Inventário SQL — Fase 8

> Inventário da entrega-base; complemento atual em `trial-sql-inventory.md`: migration 021 e dez tabelas privadas, preservando as 63 públicas.

TESTADO LOCALMENTE em PGlite. Homologação externa pendente. Total cumulativo: 20 migrations, 63 tabelas públicas com RLS e FORCE RLS, 63 policies SELECT. Migrations 001–017 preservadas byte a byte; relatório reports/phase-8-migration-integrity.json.

## Migrations adicionais

| Migration | Responsabilidade |
|---|---|
| 202609180018_billing_schema.sql | Oito tabelas públicas, runtime privado, constraints, índices, RLS, auditoria e imutabilidade |
| 202609180019_billing_commands.sql | Catálogo, versões, contexto, assinatura, transições, eventos fictícios e idempotência |
| 202609180020_billing_limits.sql | Backfill de uso real existente, quotas transacionais e elegibilidade de atendimento |

## Tabelas e policies

Todas as oito tabelas novas possuem policy `<tabela>_read`, exclusivamente SELECT authenticated. Escrita direta não é concedida; nenhum botão substitui autorização SQL.

| Tabela | Conteúdo / leitura |
|---|---|
| billing_plans | Metadados editáveis do catálogo; superadmin |
| billing_plan_versions | Preço, periodicidade, trial, recursos e limites imutáveis; superadmin, catálogo projetado por RPC ao gestor |
| billing_subscriptions | Uma assinatura por organização, versão atual/pendente, vigência/revisão; gestor autorizado |
| billing_invoices | Cobrança exclusivamente mock, BRL, estados; gestor autorizado |
| billing_events | Histórico append-only; gestor autorizado |
| billing_usage | Ledger append-only por empresa/métrica/entidade/mês; gestor autorizado |
| billing_commands | Chave idempotente empresa/ator/chave e payload; superadmin |
| billing_webhooks | Evento de provedor idempotente, payload/resultado; superadmin |

`private.billing_runtime` não é exposto; mock_enabled=false por padrão, sem grants para clientes/service_role. O proprietário confiável pode habilitar somente no ambiente de teste autorizado.

## Funções

- `private.billing_apply_event(p_event text, p_invoice uuid, p_state text, p_amount integer)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_can_read(p_org uuid)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_catalog(p_admin boolean)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_effective(p_sub billing_subscriptions)` — SECURITY DEFINER: False; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_event(p_org uuid, p_event text, p_invoice uuid, p_details jsonb)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_feature(p_org uuid, p_feature text)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_guard()` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `private.billing_usage_snapshot(p_org uuid)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_admin_overview()` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_admin_state(p_org uuid, p_revision integer, p_suspend boolean, p_reason text)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_context(p_org uuid)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_mock_event(p_event text, p_invoice uuid, p_state text, p_amount integer)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_plan_save(p_id uuid, p_revision integer, p_data jsonb)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_provider_event(p_event text, p_invoice uuid, p_state text, p_amount integer)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.
- `public.billing_subscription_action(p_org uuid, p_action text, p_plan uuid, p_revision integer, p_key uuid)` — SECURITY DEFINER: True; search_path vazio; grants efetivos em reports/phase-8-sql-catalog.json.

São sete RPCs públicas e oito helpers privados. billing_provider_event é executável somente pelo service_role de backend; as outras RPCs exigem identidade/papel/vínculo atual além do grant authenticated. A migration 020 substitui private.central_eligible preservando todos os predicados anteriores e acrescentando o recurso de atendimento humano do plano. Não concede leitura administrativa dos dados privados de consumidores.

## Constraints e índices

Valores monetários inteiros de 0 a 100.000.000 centavos; periodicidade de 1/3/6/12 meses; trial 0–90 dias; estoque de membros/serviços 1–100.000, quotas mensais 0–10.000.000 ou null sem limite. CHECKs de estado, moeda BRL, provider=mock, is_simulation=true e timestamp coerente com estado pago/reembolsado. Vigência final maior que inicial; revisão positiva.

Unicidade plano/versão, uma assinatura por empresa, no máximo uma cobrança pendente por empresa, uma unidade de uso por empresa/métrica/entidade, chave de comando por empresa/ator e ID único de webhook. FKs compostas de evento/webhook para cobrança impedem relação cruzada. 14 índices novos, incluindo PK/unique; histórico e uso possuem índices por organização/data ou mês.

## Triggers

Oito triggers de auditoria reutilizam private.company_audit. Cinco tabelas append-only têm triggers de imutabilidade e anti-TRUNCATE; três mutáveis atualizam updated_at. Seis guardas novos: billing_members_guard, billing_services_guard, billing_requests_guard, billing_tickets_guard, billing_followups_guard e billing_interest_guard.

A trava transacional segue a ordem global da Fundação. Limite, operação e ledger são atômicos; falha reverte todos. Estoque conta membros/serviços ativos; quotas contam eventos efetivos no mês empresarial, sem reset por renovação. A ausência de assinatura mantém a compatibilidade histórica; adesão é explícita e não existe comando cliente para apagar assinatura e voltar a esse estado.

O catálogo JSON anexo lista cada constraint, trigger, índice, função e grant efetivamente inspecionado no banco local. Concorrência com conexões PostgreSQL independentes permanece PENDENTE DE HOMOLOGAÇÃO EXTERNA.
