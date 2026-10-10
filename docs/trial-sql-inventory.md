# Inventário — trial e prevenção de abuso

Migration nova: `202609180021_trial_eligibility.sql`. Total cumulativo **21 migrations**. 001–020 preservadas byte a byte: reports/trial-migration-integrity.json. 63 tabelas públicas/63 policies SELECT/RLS/FORCE RLS anteriores preservadas.

## Registro privado

Dez tabelas adicionais no schema private, todas com RLS/FORCE RLS, nenhuma policy/grant para clientes. Nenhuma tabela antifraude é exposta por PostgREST. Leituras passam por projeções autorizadas.

| Tabela private | Finalidade |
|---|---|
| trial_secret | Segredo persistente para fingerprints; sem retorno por RPC |
| trial_policy | Configuração versionada de elegibilidade e teto administrativo |
| trial_identifiers | Identificadores pseudonimizados, tipo, verificador e referência de prova |
| trial_grants | Organização, plano/versão, datas, status, modo, ator e motivo |
| trial_claims | Vínculo entre concessão e identidades/contas consumidas |
| trial_consumed_keys | Chave única por tipo/fingerprint; barreira de concessão concorrente |
| trial_extensions | Datas anterior/nova, motivo, ator e data da extensão |
| trial_requests | Solicitação, plano, decisão, situação e motivo interno de revisão |
| trial_admin_commands | Idempotência por ator/chave, payload/resultado |
| trial_audit | Histórico administrativo append-only |

Sem FK de organização/conta que apague histórico por cascata. FKs de plano e concessão preservam a relação de registros. CHECKs de prazos/estados/tipos/limites, fingerprints de 32 bytes, unicidade de identidade verificada por empresa, uma solicitação pendente por empresa e chaves idempotentes. Índice único global de identidade consumida é exigido na concessão automática; exceções manuais mantêm o primeiro consumo e auditam a nova concessão.

DELETE/TRUNCATE bloqueados no registro; segredo, identificadores, claims, consumo, extensões, comandos e auditoria imutáveis. Estado do trial acompanha eventos da assinatura; expiração por tempo é calculada em cada operação/leitura, sem depender de cron. A data anterior de extensão fica congelada em trial_extensions.

## Funções e autorização

- `private.billing_context_base(p_org uuid)`.
- `private.billing_subscription_action_base(p_org uuid, p_action text, p_plan uuid, p_revision integer, p_key uuid)`.
- `private.trial_context(p_org uuid)`.
- `private.trial_current_claims(p_org uuid)`.
- `private.trial_eligibility(p_org uuid)`.
- `private.trial_fingerprint(p_kind text, p_value text)`.
- `private.trial_record(p_org uuid, p_version uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_mode text, p_reason text)`.
- `private.trial_sync()`.
- `public.billing_trial_admin(p_org uuid, p_action text, p_request uuid, p_revision integer, p_days integer, p_reason text, p_override boolean, p_key uuid)`.
- `public.billing_trial_policy_save(p_revision integer, p_auto boolean, p_required text[], p_match text[], p_max_days integer, p_reason text)`.
- `public.billing_trial_verify(p_org uuid, p_kind text, p_value text, p_evidence text, p_reason text, p_verified boolean)`.

Três RPCs novas: billing_trial_verify (atestação por superadmin), billing_trial_policy_save (política por superadmin), billing_trial_admin (decidir/estender, revisão/motivo/idempotência). Grant authenticated permite chamar, mas não substitui a checagem de papel atual dentro da função. Revogação/suspensão continuam eficazes na próxima operação.

billing_subscription_action e billing_context foram substituídas por wrappers seguros; seus corpos anteriores foram preservados em funções privadas com EXECUTE revogado dos clientes. Helpers privados usam search_path vazio e acesso fechado. Atualizações de billing_feature/billing_guard preservam as condições anteriores e impedem que trial pendente/recusado sem vigência use o comportamento legado sem adesão.

Catálogo efetivo em reports/trial-sql-catalog.json: 15 índices e 28 triggers relacionados ao trial, incluindo as proteções de imutabilidade e sincronização. Definitions de constraints e grants constam integralmente no JSON, sem segredos/dados pessoais. Inventário produzido somente em PGlite, não em Supabase real.
