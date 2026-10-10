# Inventário SQL — Fase 4 ampliada

Migrations aplicadas somente no PostgreSQL local PGlite. Nenhuma migration aplicada em Supabase real. Migrations 001–005 preservadas.

**25 tabelas novas, 25 policies novas; total do projeto: 41 tabelas públicas e 41 policies SELECT com RLS/FORCE RLS.**

## Migrations novas

- `202609160006_consumer_schema.sql`
- `202609160007_consumer_commands.sql`
- `202609160008_consumer_attachments.sql`
- `202609160009_consumer_presence.sql`
- `202609160010_payment_preparation.sql`

## Tabelas e policies SELECT

| Tabela | Policy |
|---|---|
| `consumer_pages` | `consumer_pages_read` |
| `consumer_publications` | `consumer_publications_read` |
| `schedule_resources` | `schedule_resources_read` |
| `customers` | `customers_read` |
| `customer_consents` | `customer_consents_read` |
| `opportunities` | `opportunities_read` |
| `quote_requests` | `quote_requests_read` |
| `quote_versions` | `quote_versions_read` |
| `quote_items` | `quote_items_read` |
| `request_access_tokens` | `request_access_tokens_read` |
| `customer_access` | `customer_access_read` |
| `appointments` | `appointments_read` |
| `request_events` | `request_events_read` |
| `attachments` | `attachments_read` |
| `attachment_tickets` | `attachment_tickets_read` |
| `consumer_idempotency` | `consumer_idempotency_read` |
| `company_media` | `company_media_read` |
| `company_branding` | `company_branding_read` |
| `portfolio_items` | `portfolio_items_read` |
| `customer_context` | `customer_context_read` |
| `opportunity_context` | `opportunity_context_read` |
| `payment_rules` | `payment_rules_read` |
| `payment_plans` | `payment_plans_read` |
| `payments` | `payments_read` |
| `payment_events` | `payment_events_read` |

Nenhuma policy de escrita direta. Tokens/grants/idempotência não são legíveis pelo cliente. Contexto, personalização em rascunho, regras financeiras e planos em preparação são administrativos. Pagamentos futuros são filtrados pela solicitação autorizada; não há criação/confirmação financeira operacional nesta fase.

## RPCs e funções

| Schema | Função e parâmetros | Migration da definição final |
|---|---|
| `private` | `consumer_access(p_request uuid,p_manage boolean default false)` | `202609160006_consumer_schema.sql` |
| `private` | `consumer_code(p_prefix text,p_id uuid)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_customer_access(p_customer uuid)` | `202609160006_consumer_schema.sql` |
| `private` | `consumer_deny_immutable()` | `202609160006_consumer_schema.sql` |
| `private` | `consumer_design_snapshot(p_org uuid)` | `202609160009_consumer_presence.sql` |
| `private` | `consumer_event(p_org uuid,p_request uuid,p_event text)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_idem(p_org uuid,p_op text,p_key uuid,p_payload jsonb)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_identity()` | `202609160006_consumer_schema.sql` |
| `private` | `consumer_lock()` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_payment_calculate(p_request uuid,p_version text,p_kind text,p_origin text)` | `202609160010_payment_preparation.sql` |
| `private` | `consumer_payment_plan_guard()` | `202609160010_payment_preparation.sql` |
| `private` | `consumer_portfolio_media_guard()` | `202609160009_consumer_presence.sql` |
| `private` | `consumer_publication(p_slug text)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_ready_media(p_org uuid,p_code text)` | `202609160009_consumer_presence.sql` |
| `private` | `consumer_remember(p_org uuid,p_op text,p_key uuid,p_payload jsonb,p_result jsonb)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_request(p_code text,p_manage boolean default false)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_selection(p_publication uuid,p_service text,p_addons text[],p_answers jsonb,p_validate boolean default true)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_slot_allowed(p_pub uuid,p_start timestamptz,p_minutes integer,p_ignore uuid default null)` | `202609160007_consumer_commands.sql` |
| `private` | `consumer_version_guard()` | `202609160006_consumer_schema.sql` |
| `public` | `consumer_admin_context(p_org uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_approve_quote(p_code text,p_version text,p_key uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_attachment_ticket(p_code text)` | `202609160008_consumer_attachments.sql` |
| `public` | `consumer_book(p_code text,p_start timestamptz,p_previous text,p_key uuid)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_branding_save(p_org uuid,p_revision integer,p_data jsonb)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_cancel_booking(p_code text,p_appointment text,p_key uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_create_request(p_slug text,p_revision text,p_service text,p_addons text[],p_answers jsonb,p_customer jsonb,p_notes text,p_contact boolean,p_expected_cents bigint,p_key uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_create_tracking_link(p_code text,p_manage boolean default false)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_customer_context_save(p_code text,p_data jsonb)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_decline_quote(p_code text,p_version text,p_key uuid)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_finalize_attachment(p_code text,p_user uuid,p_sha256 text,p_size integer,p_width integer,p_height integer)` | `202609160008_consumer_attachments.sql` |
| `public` | `consumer_finalize_company_media(p_code text,p_user uuid,p_sha256 text,p_size integer,p_width integer,p_height integer)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_gateway_attachment(p_code text,p_user uuid,p_write boolean)` | `202609160008_consumer_attachments.sql` |
| `public` | `consumer_gateway_company_media(p_code text,p_user uuid,p_write boolean)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_gateway_download(p_code text,p_user uuid,p_ticket text)` | `202609160008_consumer_attachments.sql` |
| `public` | `consumer_gateway_public_media(p_code text)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_mark_review(p_code text)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_my_requests()` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_payment_rule_save(p_org uuid,p_service text,p_revision integer,p_data jsonb)` | `202609160010_payment_preparation.sql` |
| `public` | `consumer_payment_rules_context(p_org uuid)` | `202609160010_payment_preparation.sql` |
| `public` | `consumer_portfolio_save(p_org uuid,p_code text,p_data jsonb)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_prepare_payment_plan(p_code text,p_version text,p_kind text,p_origin text,p_expected_cents bigint,p_key uuid)` | `202609160010_payment_preparation.sql` |
| `public` | `consumer_presence_context(p_org uuid)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_preview_payment_plan(p_code text,p_version text,p_kind text,p_origin text)` | `202609160010_payment_preparation.sql` |
| `public` | `consumer_public_page(p_slug text)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_publish_page(p_org uuid,p_manual uuid,p_enabled boolean,p_show_prices boolean,p_expected_revision integer)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_redeem_tracking_link(p_code text,p_secret text)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_remove_block(p_org uuid,p_code text)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_request_context(p_code text)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_request_slots(p_code text,p_day date)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_reserve_attachment(p_code text,p_mime text,p_size integer,p_key uuid)` | `202609160008_consumer_attachments.sql` |
| `public` | `consumer_reserve_company_media(p_org uuid,p_mime text,p_size integer,p_key uuid)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_returning_profile(p_slug text)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_revoke_tracking(p_code text)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_schedule_block(p_org uuid,p_start timestamptz,p_end timestamptz,p_note text,p_key uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_schedule_config(p_org uuid,p_expected_revision integer,p_rules jsonb)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_send_quote(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_set_contact(p_code text,p_allowed boolean)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_set_page_enabled(p_org uuid,p_enabled boolean,p_expected_revision integer)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_set_source(p_code text,p_source text,p_detail text)` | `202609160009_consumer_presence.sql` |
| `public` | `consumer_slots(p_slug text,p_service text,p_addons text[],p_day date)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_submit_request(p_code text,p_attachment_count integer,p_key uuid)` | `202609160007_consumer_commands.sql` |
| `public` | `consumer_work_context(p_code text)` | `202609160009_consumer_presence.sql` |

Inventário: 43 funções públicas novas e 19 helpers privados novos. Recriações da 009 atualizam quatro RPCs da própria Fase 4, não alteram funções da Fundação/Fase 3.

## Grants, constraints e triggers

- Somente `consumer_public_page` e `consumer_slots` são novos RPCs anônimos. A FAQ anônima da Fase 3 foi preservada.
- Os seis RPCs de gateway/finalização de anexos e mídia empresarial são exclusivos de `service_role` server-side. As demais funções públicas exigem authenticated + autorização atual no corpo.
- FKs compostas por organização em relacionamentos; customers UNIQUE organização/identidade, sem deduplicação por telefone.
- Agenda: recurso UNIQUE empresa, EXCLUDE GiST recurso/intervalo confirmado compartilhado por bloqueios/reservas, índice parcial de uma reserva ativa por solicitação. Remarcação em transação.
- Orçamentos: versão por solicitação única, versão atual/aceita relacionada à mesma solicitação; itens/versões enviadas imutáveis; totais centavos, modalidades e validade/duração final validadas.
- Publicações e eventos imutáveis; mídia empresarial e anexos em namespaces separados, formato/tamanho/hash/dimensões verificados; trigger valida mídia e empresa de cada item de portfólio.
- Branding: cinco cores enumeradas, campos permitidos e FKs de mídia por empresa. Portfólio: 1–4 imagens; antes/depois exatamente duas. Notas/referrer internos; autoindicação recusada.
- Preparação financeira: UNIQUE empresa/serviço com NULLS NOT DISTINCT; activation_state preso em preparation_only; FK do plano para versão/valor; planos imutáveis; FK de registro financeiro para todos os dados autorizados do plano.
- CHECKs financeiros diferenciam origem/confirmador manual e provedor; moeda BRL, valores/reembolsos limitados; estados explícitos. Nenhum PAN/CVV/carteira/saldo no modelo.
- Idempotência por empresa/identidade/operação/chave e hash do payload. Links: segredo aleatório 256 bits, hash, escopo, validade/revogação e uso único. Tickets de imagem: usuário/anexo/60s/uso único.
- Auditoria em todas as tabelas novas por private.company_audit; não copia valores pessoais/segredos. Helpers privados sem EXECUTE cliente, salvo predicados necessários às policies.

## Storage (execução externa pendente)

- `supabase/storage/consumer-private.sql`: bucket privado de anexos, MIME/5 MB, policy RESTRICTIVE impedindo leitura/escrita direta de anon/authenticated.
- `supabase/storage/company-media.sql`: bucket separado também privado; acesso público somente via gateway à mídia vinculada ao snapshot publicado ativo. Policy RESTRICTIVE impede acesso direto cliente.

Os SQLs completos são a fonte canônica dos nomes de constraints, índices, triggers e assinaturas. `scripts/homologation/consumer-inspect.sql` permite conferir o catálogo real.
