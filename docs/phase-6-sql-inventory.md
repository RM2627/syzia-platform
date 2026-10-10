# Inventário da Fase 6 — Comercial

Migrations novas: `202609160014_commercial_schema.sql`, `202609160015_commercial_engine.sql`, `202609160016_commercial_commands.sql`. Migrations 001–013 preservadas. Aplicação somente local. Total cumulativo: 16 migrations, 55 tabelas públicas e 55 policies SELECT com RLS/FORCE RLS.

## Tabelas e políticas

| Tabela | Finalidade | Policy SELECT |
|---|---|---|
| `commercial_attempts` | Resultado e observação curta imutáveis, uma tentativa por tarefa. | `commercial_attempts_read` — `private.central_staff(organization_id)` |
| `commercial_events` | Timeline imutável ordenada por sequência, ator e evento de origem. | `commercial_events_read` — `private.central_staff(organization_id)` |
| `commercial_opportunity_state` | Metadados internos 1:1 da oportunidade existente; estado, código, ciclo, conversão e perda. Não altera SELECT do consumidor na tabela original. | `commercial_opportunity_state_read` — `private.central_staff(organization_id)` |
| `commercial_rules` | Sobrescritas por serviço/tipo com revisão. | `commercial_rules_read` — `private.company_can_manage(organization_id)` |
| `commercial_settings` | Configuração por empresa, horários, tipos, critério e motivos de perda. | `commercial_settings_read` — `private.company_can_manage(organization_id)` |
| `commercial_tasks` | Tarefas, prazo, responsável, tentativa, snapshot e resultado. | `commercial_tasks_read` — `private.central_staff(organization_id)` |

Todos os grants de escrita direta são revogados. `anon` não recebe SELECT nem EXECUTE das RPCs comerciais. `authenticated` lê somente o permitido pela policy e escreve somente por RPCs. A view `private.commercial_op` não tem acesso concedido a clientes. Predicados da Fundação/Central são reutilizados; nenhum novo helper comercial privado tem EXECUTE para clientes.

## RPCs e funções privadas

| Função / argumentos | Retorno | EXECUTE authenticated |
|---|---|---|
| `private.commercial_can_operate(p_org uuid, p_user uuid)` | `boolean` | Não |
| `private.commercial_cancel_tasks(p_op uuid, p_reason text)` | `void` | Não |
| `private.commercial_contact_ok(p_op uuid)` | `boolean` | Não |
| `private.commercial_effective(p_org uuid, p_service uuid, p_kind text)` | `jsonb` | Não |
| `private.commercial_event(p_op uuid, p_event text, p_task uuid, p_reason text, p_source uuid)` | `void` | Não |
| `private.commercial_initialize_op()` | `trigger` | Não |
| `private.commercial_on_consent()` | `trigger` | Não |
| `private.commercial_on_message()` | `trigger` | Não |
| `private.commercial_on_request_event()` | `trigger` | Não |
| `private.commercial_stop(p_op uuid, p_state text, p_reason text, p_source uuid)` | `void` | Não |
| `private.commercial_sync(p_op uuid, p_requested timestamp with time zone, p_kind text)` | `text` | Não |
| `private.commercial_terminal(p_state text)` | `boolean` | Não |
| `private.commercial_window(p_org uuid, p_at timestamp with time zone)` | `timestamp with time zone` | Não |
| `public.commercial_config(p_org uuid)` | `jsonb` | Sim |
| `public.commercial_config_save(p_org uuid, p_revision integer, p_data jsonb)` | `void` | Sim |
| `public.commercial_context(p_code text)` | `jsonb` | Sim |
| `public.commercial_list(p_filters jsonb, p_offset integer)` | `jsonb` | Sim |
| `public.commercial_op_act(p_code text, p_revision integer, p_action text, p_data jsonb, p_key uuid)` | `jsonb` | Sim |
| `public.commercial_refresh(p_org uuid, p_after uuid)` | `jsonb` | Sim |
| `public.commercial_rule_save(p_org uuid, p_id uuid, p_revision integer, p_data jsonb)` | `uuid` | Sim |
| `public.commercial_task_act(p_code text, p_revision integer, p_action text, p_data jsonb, p_key uuid)` | `jsonb` | Sim |

São 8 RPCs públicas novas e 13 helpers privados. As funções privilegiadas usam SECURITY DEFINER e search_path vazio. Helpers `commercial_terminal` imutável e `commercial_window/effective/contact_ok/can_operate` consultam somente contexto autorizado pelos comandos chamadores. Comandos de escrita usam a trava transacional compartilhada da Fundação/Central.

## Constraints e índices

FKs compostas associam empresa/oportunidade/cliente/solicitação/ticket/evento. Índice parcial permite uma tarefa ativa por oportunidade; índice de ciclo/tipo/tentativa impede duplicação; resultado único por tarefa. Teto 1–10, intervalo 1–525600 minutos, revisão/ciclo positivos, estados/resultados enumerados, nota de até 300 caracteres, “outro” exige ao menos dois caracteres. Regra exige serviço ou tipo e unicidade com NULLS NOT DISTINCT. Conversão exige evento e data. Históricos não aceitam UPDATE/DELETE.

Lista exata extraída do catálogo local:

| Tabela | Constraint | Definição |
|---|---|---|
| `commercial_attempts` | `commercial_attempts_actor_id_fkey` | `FOREIGN KEY (actor_id) REFERENCES profiles(id)` |
| `commercial_attempts` | `commercial_attempts_actor_id_not_null` | `NOT NULL actor_id` |
| `commercial_attempts` | `commercial_attempts_check` | `CHECK (((outcome <> 'other'::text) OR (length(btrim(note)) >= 2)))` |
| `commercial_attempts` | `commercial_attempts_created_at_not_null` | `NOT NULL created_at` |
| `commercial_attempts` | `commercial_attempts_id_not_null` | `NOT NULL id` |
| `commercial_attempts` | `commercial_attempts_note_check` | `CHECK ((length(note) <= 300))` |
| `commercial_attempts` | `commercial_attempts_note_not_null` | `NOT NULL note` |
| `commercial_attempts` | `commercial_attempts_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_attempts` | `commercial_attempts_organization_id_task_id_fkey` | `FOREIGN KEY (organization_id, task_id) REFERENCES commercial_tasks(organization_id, id)` |
| `commercial_attempts` | `commercial_attempts_outcome_check` | `CHECK ((outcome = ANY (ARRAY['responded'::text, 'awaiting_decision'::text, 'return_later'::text, 'interested'::text, 'approved'::text, 'booked'::text, 'no_response'::text, 'refused'::text, 'lost_interest'::text, 'price'::text, 'competitor'::text, 'not_needed'::text, 'invalid_contact'::text, 'other'::text])))` |
| `commercial_attempts` | `commercial_attempts_outcome_not_null` | `NOT NULL outcome` |
| `commercial_attempts` | `commercial_attempts_pkey` | `PRIMARY KEY (id)` |
| `commercial_attempts` | `commercial_attempts_task_id_key` | `UNIQUE (task_id)` |
| `commercial_attempts` | `commercial_attempts_task_id_not_null` | `NOT NULL task_id` |
| `commercial_attempts` | `commercial_attempts_updated_at_not_null` | `NOT NULL updated_at` |
| `commercial_events` | `commercial_events_actor_id_fkey` | `FOREIGN KEY (actor_id) REFERENCES profiles(id)` |
| `commercial_events` | `commercial_events_created_at_not_null` | `NOT NULL created_at` |
| `commercial_events` | `commercial_events_event_check` | `CHECK ((event = ANY (ARRAY['interest'::text, 'requested'::text, 'quote_sent'::text, 'approved'::text, 'booked'::text, 'responded'::text, 'converted'::text, 'lost'::text, 'refused'::text, 'expired'::text, 'cancelled'::text, 'ineligible'::text, 'scheduled'::text, 'assigned'::text, 'transferred'::text, 'started'::text, 'attempt'::text, 'rescheduled'::text, 'completed'::text, 'task_cancelled'::text, 'limit_reached'::text, 'reconciled'::text])))` |
| `commercial_events` | `commercial_events_event_not_null` | `NOT NULL event` |
| `commercial_events` | `commercial_events_event_sequence_key` | `UNIQUE (event_sequence)` |
| `commercial_events` | `commercial_events_event_sequence_not_null` | `NOT NULL event_sequence` |
| `commercial_events` | `commercial_events_id_not_null` | `NOT NULL id` |
| `commercial_events` | `commercial_events_opportunity_id_not_null` | `NOT NULL opportunity_id` |
| `commercial_events` | `commercial_events_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_events` | `commercial_events_organization_id_opportunity_id_fkey` | `FOREIGN KEY (organization_id, opportunity_id) REFERENCES opportunities(organization_id, id)` |
| `commercial_events` | `commercial_events_organization_id_source_event_id_fkey` | `FOREIGN KEY (organization_id, source_event_id) REFERENCES request_events(organization_id, id)` |
| `commercial_events` | `commercial_events_organization_id_task_id_fkey` | `FOREIGN KEY (organization_id, task_id) REFERENCES commercial_tasks(organization_id, id)` |
| `commercial_events` | `commercial_events_pkey` | `PRIMARY KEY (id)` |
| `commercial_events` | `commercial_events_updated_at_not_null` | `NOT NULL updated_at` |
| `commercial_opportunity_state` | `commercial_opportunity_state_check` | `CHECK (((commercial_state = 'converted'::text) = ((commercial_conversion_event IS NOT NULL) AND (commercial_converted_at IS NOT NULL))))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_changed_at_not_null` | `NOT NULL commercial_changed_at` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_code_key` | `UNIQUE (commercial_code)` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_code_not_null` | `NOT NULL commercial_code` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_conversion_criter_check` | `CHECK ((commercial_conversion_criterion = ANY (ARRAY['approval'::text, 'booking'::text])))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_cycle_check` | `CHECK ((commercial_cycle > 0))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_cycle_not_null` | `NOT NULL commercial_cycle` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_loss_reason_check` | `CHECK (((length(commercial_loss_reason) >= 1) AND (length(commercial_loss_reason) <= 80)))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_revision_check` | `CHECK ((commercial_revision > 0))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_revision_not_null` | `NOT NULL commercial_revision` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_state_check` | `CHECK ((commercial_state = ANY (ARRAY['interested'::text, 'requested'::text, 'awaiting_customer'::text, 'negotiating'::text, 'responded'::text, 'approved'::text, 'scheduled'::text, 'converted'::text, 'lost'::text, 'refused'::text, 'expired'::text, 'cancelled'::text, 'no_response'::text, 'ineligible'::text])))` |
| `commercial_opportunity_state` | `commercial_opportunity_state_commercial_state_not_null` | `NOT NULL commercial_state` |
| `commercial_opportunity_state` | `commercial_opportunity_state_created_at_not_null` | `NOT NULL created_at` |
| `commercial_opportunity_state` | `commercial_opportunity_state_id_not_null` | `NOT NULL id` |
| `commercial_opportunity_state` | `commercial_opportunity_state_organization_id_commercial_co_fkey` | `FOREIGN KEY (organization_id, commercial_conversion_event) REFERENCES request_events(organization_id, id)` |
| `commercial_opportunity_state` | `commercial_opportunity_state_organization_id_id_fkey` | `FOREIGN KEY (organization_id, id) REFERENCES opportunities(organization_id, id)` |
| `commercial_opportunity_state` | `commercial_opportunity_state_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_opportunity_state` | `commercial_opportunity_state_pkey` | `PRIMARY KEY (id)` |
| `commercial_opportunity_state` | `commercial_opportunity_state_updated_at_not_null` | `NOT NULL updated_at` |
| `commercial_rules` | `commercial_rules_check` | `CHECK (((service_id IS NOT NULL) OR (kind IS NOT NULL)))` |
| `commercial_rules` | `commercial_rules_created_at_not_null` | `NOT NULL created_at` |
| `commercial_rules` | `commercial_rules_enabled_not_null` | `NOT NULL enabled` |
| `commercial_rules` | `commercial_rules_id_not_null` | `NOT NULL id` |
| `commercial_rules` | `commercial_rules_interval_minutes_check` | `CHECK (((interval_minutes >= 1) AND (interval_minutes <= 525600)))` |
| `commercial_rules` | `commercial_rules_kind_check` | `CHECK ((kind = ANY (ARRAY['first_contact'::text, 'quote_followup'::text, 'abandoned'::text, 'approval_followup'::text, 'requested_return'::text])))` |
| `commercial_rules` | `commercial_rules_max_attempts_check` | `CHECK (((max_attempts >= 1) AND (max_attempts <= 10)))` |
| `commercial_rules` | `commercial_rules_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES organizations(id)` |
| `commercial_rules` | `commercial_rules_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_rules` | `commercial_rules_organization_id_service_id_fkey` | `FOREIGN KEY (organization_id, service_id) REFERENCES services(organization_id, id)` |
| `commercial_rules` | `commercial_rules_organization_id_service_id_kind_key` | `UNIQUE NULLS NOT DISTINCT (organization_id, service_id, kind)` |
| `commercial_rules` | `commercial_rules_pkey` | `PRIMARY KEY (id)` |
| `commercial_rules` | `commercial_rules_revision_check` | `CHECK ((revision > 0))` |
| `commercial_rules` | `commercial_rules_revision_not_null` | `NOT NULL revision` |
| `commercial_rules` | `commercial_rules_updated_at_not_null` | `NOT NULL updated_at` |
| `commercial_settings` | `commercial_settings_after_limit_check` | `CHECK ((after_limit = ANY (ARRAY['stop'::text, 'lose'::text])))` |
| `commercial_settings` | `commercial_settings_after_limit_not_null` | `NOT NULL after_limit` |
| `commercial_settings` | `commercial_settings_contact_hours_check` | `CHECK (((contact_hours IS NULL) OR private.valid_company_hours(contact_hours)))` |
| `commercial_settings` | `commercial_settings_conversion_criterion_check` | `CHECK ((conversion_criterion = ANY (ARRAY['approval'::text, 'booking'::text])))` |
| `commercial_settings` | `commercial_settings_conversion_criterion_not_null` | `NOT NULL conversion_criterion` |
| `commercial_settings` | `commercial_settings_created_at_not_null` | `NOT NULL created_at` |
| `commercial_settings` | `commercial_settings_eligible_types_check` | `CHECK (((array_position(eligible_types, NULL::text) IS NULL) AND (eligible_types <@ ARRAY['first_contact'::text, 'quote_followup'::text, 'abandoned'::text, 'approval_followup'::text, 'requested_return'::text])))` |
| `commercial_settings` | `commercial_settings_eligible_types_not_null` | `NOT NULL eligible_types` |
| `commercial_settings` | `commercial_settings_enabled_not_null` | `NOT NULL enabled` |
| `commercial_settings` | `commercial_settings_interval_minutes_check` | `CHECK (((interval_minutes >= 1) AND (interval_minutes <= 525600)))` |
| `commercial_settings` | `commercial_settings_loss_reasons_check` | `CHECK ((((cardinality(loss_reasons) >= 1) AND (cardinality(loss_reasons) <= 30)) AND (array_position(loss_reasons, NULL::text) IS NULL)))` |
| `commercial_settings` | `commercial_settings_loss_reasons_not_null` | `NOT NULL loss_reasons` |
| `commercial_settings` | `commercial_settings_max_attempts_check` | `CHECK (((max_attempts >= 1) AND (max_attempts <= 10)))` |
| `commercial_settings` | `commercial_settings_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES organizations(id)` |
| `commercial_settings` | `commercial_settings_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_settings` | `commercial_settings_pkey` | `PRIMARY KEY (organization_id)` |
| `commercial_settings` | `commercial_settings_revision_check` | `CHECK ((revision > 0))` |
| `commercial_settings` | `commercial_settings_revision_not_null` | `NOT NULL revision` |
| `commercial_settings` | `commercial_settings_updated_at_not_null` | `NOT NULL updated_at` |
| `commercial_tasks` | `commercial_tasks_assignee_id_fkey` | `FOREIGN KEY (assignee_id) REFERENCES profiles(id)` |
| `commercial_tasks` | `commercial_tasks_attempt_check` | `CHECK (((attempt >= 1) AND (attempt <= 10)))` |
| `commercial_tasks` | `commercial_tasks_attempt_not_null` | `NOT NULL attempt` |
| `commercial_tasks` | `commercial_tasks_check` | `CHECK ((attempt <= max_attempts))` |
| `commercial_tasks` | `commercial_tasks_check1` | `CHECK (((state <> ALL (ARRAY['assigned'::text, 'in_progress'::text])) OR (assignee_id IS NOT NULL)))` |
| `commercial_tasks` | `commercial_tasks_check2` | `CHECK (((state = ANY (ARRAY['completed'::text, 'cancelled'::text])) = (completed_at IS NOT NULL)))` |
| `commercial_tasks` | `commercial_tasks_created_at_not_null` | `NOT NULL created_at` |
| `commercial_tasks` | `commercial_tasks_customer_id_not_null` | `NOT NULL customer_id` |
| `commercial_tasks` | `commercial_tasks_cycle_check` | `CHECK ((cycle > 0))` |
| `commercial_tasks` | `commercial_tasks_cycle_not_null` | `NOT NULL cycle` |
| `commercial_tasks` | `commercial_tasks_due_at_not_null` | `NOT NULL due_at` |
| `commercial_tasks` | `commercial_tasks_id_not_null` | `NOT NULL id` |
| `commercial_tasks` | `commercial_tasks_kind_check` | `CHECK ((kind = ANY (ARRAY['first_contact'::text, 'quote_followup'::text, 'abandoned'::text, 'approval_followup'::text, 'requested_return'::text])))` |
| `commercial_tasks` | `commercial_tasks_kind_not_null` | `NOT NULL kind` |
| `commercial_tasks` | `commercial_tasks_max_attempts_check` | `CHECK (((max_attempts >= 1) AND (max_attempts <= 10)))` |
| `commercial_tasks` | `commercial_tasks_max_attempts_not_null` | `NOT NULL max_attempts` |
| `commercial_tasks` | `commercial_tasks_opportunity_id_not_null` | `NOT NULL opportunity_id` |
| `commercial_tasks` | `commercial_tasks_organization_id_id_key` | `UNIQUE (organization_id, id)` |
| `commercial_tasks` | `commercial_tasks_organization_id_not_null` | `NOT NULL organization_id` |
| `commercial_tasks` | `commercial_tasks_organization_id_opportunity_id_customer_i_fkey` | `FOREIGN KEY (organization_id, opportunity_id, customer_id) REFERENCES opportunities(organization_id, id, customer_id)` |
| `commercial_tasks` | `commercial_tasks_organization_id_request_id_customer_id_fkey` | `FOREIGN KEY (organization_id, request_id, customer_id) REFERENCES quote_requests(organization_id, id, customer_id)` |
| `commercial_tasks` | `commercial_tasks_organization_id_request_id_opportunity_id_fkey` | `FOREIGN KEY (organization_id, request_id, opportunity_id) REFERENCES quote_requests(organization_id, id, opportunity_id)` |
| `commercial_tasks` | `commercial_tasks_organization_id_ticket_id_fkey` | `FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets(organization_id, id)` |
| `commercial_tasks` | `commercial_tasks_pkey` | `PRIMARY KEY (id)` |
| `commercial_tasks` | `commercial_tasks_priority_check` | `CHECK (((priority >= 0) AND (priority <= 2)))` |
| `commercial_tasks` | `commercial_tasks_priority_not_null` | `NOT NULL priority` |
| `commercial_tasks` | `commercial_tasks_public_code_key` | `UNIQUE (public_code)` |
| `commercial_tasks` | `commercial_tasks_public_code_not_null` | `NOT NULL public_code` |
| `commercial_tasks` | `commercial_tasks_request_id_not_null` | `NOT NULL request_id` |
| `commercial_tasks` | `commercial_tasks_revision_check` | `CHECK ((revision > 0))` |
| `commercial_tasks` | `commercial_tasks_revision_not_null` | `NOT NULL revision` |
| `commercial_tasks` | `commercial_tasks_rule_snapshot_check` | `CHECK ((jsonb_typeof(rule_snapshot) = 'object'::text))` |
| `commercial_tasks` | `commercial_tasks_rule_snapshot_not_null` | `NOT NULL rule_snapshot` |
| `commercial_tasks` | `commercial_tasks_state_check` | `CHECK ((state = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'waiting_customer'::text, 'rescheduled'::text, 'completed'::text, 'cancelled'::text])))` |
| `commercial_tasks` | `commercial_tasks_state_not_null` | `NOT NULL state` |
| `commercial_tasks` | `commercial_tasks_updated_at_not_null` | `NOT NULL updated_at` |

### Índices

- `commercial_attempts_pkey`: `CREATE UNIQUE INDEX commercial_attempts_pkey ON public.commercial_attempts USING btree (id)`
- `commercial_attempts_task_id_key`: `CREATE UNIQUE INDEX commercial_attempts_task_id_key ON public.commercial_attempts USING btree (task_id)`
- `commercial_event_history`: `CREATE INDEX commercial_event_history ON public.commercial_events USING btree (opportunity_id, event_sequence)`
- `commercial_events_event_sequence_key`: `CREATE UNIQUE INDEX commercial_events_event_sequence_key ON public.commercial_events USING btree (event_sequence)`
- `commercial_events_pkey`: `CREATE UNIQUE INDEX commercial_events_pkey ON public.commercial_events USING btree (id)`
- `commercial_opportunity_state_commercial_code_key`: `CREATE UNIQUE INDEX commercial_opportunity_state_commercial_code_key ON public.commercial_opportunity_state USING btree (commercial_code)`
- `commercial_opportunity_state_pkey`: `CREATE UNIQUE INDEX commercial_opportunity_state_pkey ON public.commercial_opportunity_state USING btree (id)`
- `commercial_rules_organization_id_service_id_kind_key`: `CREATE UNIQUE INDEX commercial_rules_organization_id_service_id_kind_key ON public.commercial_rules USING btree (organization_id, service_id, kind) NULLS NOT DISTINCT`
- `commercial_rules_pkey`: `CREATE UNIQUE INDEX commercial_rules_pkey ON public.commercial_rules USING btree (id)`
- `commercial_settings_pkey`: `CREATE UNIQUE INDEX commercial_settings_pkey ON public.commercial_settings USING btree (organization_id)`
- `commercial_due_queue`: `CREATE INDEX commercial_due_queue ON public.commercial_tasks USING btree (organization_id, state, due_at, assignee_id)`
- `commercial_one_pending`: `CREATE UNIQUE INDEX commercial_one_pending ON public.commercial_tasks USING btree (opportunity_id) WHERE (state <> ALL (ARRAY['completed'::text, 'cancelled'::text]))`
- `commercial_tasks_organization_id_id_key`: `CREATE UNIQUE INDEX commercial_tasks_organization_id_id_key ON public.commercial_tasks USING btree (organization_id, id)`
- `commercial_tasks_pkey`: `CREATE UNIQUE INDEX commercial_tasks_pkey ON public.commercial_tasks USING btree (id)`
- `commercial_tasks_public_code_key`: `CREATE UNIQUE INDEX commercial_tasks_public_code_key ON public.commercial_tasks USING btree (public_code)`
- `commercial_unique_attempt`: `CREATE UNIQUE INDEX commercial_unique_attempt ON public.commercial_tasks USING btree (opportunity_id, cycle, kind, attempt) WHERE (state <> 'cancelled'::text)`

## Triggers

- `commercial_attempts.commercial_attempts_audit`: `CREATE TRIGGER commercial_attempts_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_attempts FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_attempts.commercial_attempts_immutable`: `CREATE TRIGGER commercial_attempts_immutable BEFORE DELETE OR UPDATE ON public.commercial_attempts FOR EACH ROW EXECUTE FUNCTION private.consumer_deny_immutable()`
- `commercial_attempts.commercial_attempts_updated`: `CREATE TRIGGER commercial_attempts_updated BEFORE UPDATE ON public.commercial_attempts FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `commercial_events.commercial_events_audit`: `CREATE TRIGGER commercial_events_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_events FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_events.commercial_events_immutable`: `CREATE TRIGGER commercial_events_immutable BEFORE DELETE OR UPDATE ON public.commercial_events FOR EACH ROW EXECUTE FUNCTION private.consumer_deny_immutable()`
- `commercial_events.commercial_events_updated`: `CREATE TRIGGER commercial_events_updated BEFORE UPDATE ON public.commercial_events FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `commercial_opportunity_state.commercial_opportunity_state_audit`: `CREATE TRIGGER commercial_opportunity_state_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_opportunity_state FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_opportunity_state.commercial_opportunity_state_updated`: `CREATE TRIGGER commercial_opportunity_state_updated BEFORE UPDATE ON public.commercial_opportunity_state FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `commercial_rules.commercial_rules_audit`: `CREATE TRIGGER commercial_rules_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_rules FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_rules.commercial_rules_updated`: `CREATE TRIGGER commercial_rules_updated BEFORE UPDATE ON public.commercial_rules FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `commercial_settings.commercial_settings_audit`: `CREATE TRIGGER commercial_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_settings FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_settings.commercial_settings_updated`: `CREATE TRIGGER commercial_settings_updated BEFORE UPDATE ON public.commercial_settings FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `commercial_tasks.commercial_tasks_audit`: `CREATE TRIGGER commercial_tasks_audit AFTER INSERT OR DELETE OR UPDATE ON public.commercial_tasks FOR EACH ROW EXECUTE FUNCTION private.company_audit()`
- `commercial_tasks.commercial_tasks_updated`: `CREATE TRIGGER commercial_tasks_updated BEFORE UPDATE ON public.commercial_tasks FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()`
- `customer_consents.commercial_consent_revoked`: `CREATE TRIGGER commercial_consent_revoked AFTER UPDATE ON public.customer_consents FOR EACH ROW EXECUTE FUNCTION private.commercial_on_consent()`
- `opportunities.commercial_initialize`: `CREATE TRIGGER commercial_initialize AFTER INSERT ON public.opportunities FOR EACH ROW EXECUTE FUNCTION private.commercial_initialize_op()`
- `request_events.commercial_request_activity`: `CREATE TRIGGER commercial_request_activity AFTER INSERT ON public.request_events FOR EACH ROW EXECUTE FUNCTION private.commercial_on_request_event()`
- `ticket_messages.commercial_customer_message`: `CREATE TRIGGER commercial_customer_message AFTER INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION private.commercial_on_message()`

## Páginas, componentes e arquivos

- `src/commercial/Commercial.tsx`: lista, contexto, tarefas, resultados, transferência, próxima ação, perda, histórico, recuperação de confirmação perdida e polling. Rotas `/comercial`, `/comercial/:code`, `/painel/:orgId/comercial`.
- `src/commercial/Config.tsx`: recuperação/horário/tetos/regras/motivos/critério administrativo com revisão.
- `src/commercial/model.ts`: rótulos, estados, fuso, valores e mensagens de erro.
- `src/commercial/commercial.css`: interface responsiva, detalhe prioritário em telas estreitas.
- `src/main.tsx` e `src/company/Company.tsx`: navegação e rotas protegidas.
- `src/central/Central.tsx`: abertura do painel existente de respostas rápidas por `?panel=replies`; nenhuma conversa paralela.
- `tests/fixtures/commercial.mjs`: A/B fictícias e tarefas atrasadas exclusivamente locais; fixture Central aceita autonomia opcional `follow_up`.
- `tests/commercial.test.mjs`, `tests/commercial-upgrade.test.mjs`, `tests/commercial-tools.test.mjs`, `tests/browser/commercial.spec.ts`: segurança, regressão de upgrade, ferramentas e UI.
- `tests/support/consumer-db.mjs`: limite opcional da última migration para teste de upgrade; padrão aplica todas. Browser/demo reconhecem RPCs comerciais sem expor esse mock ao produto real.
- `scripts/homologation/commercial-{config,http,concurrency}.mjs`, `commercial.example.json`, `commercial-inspect.sql`: preparação externa; não executados contra Supabase.
- `scripts/commercial-inventory.mjs`: inventário e integridade local; `scripts/inspect-browser-bundle.mjs`: build com marcador fictício server-only; empacotador completo em `scripts/package-project.py`.
- `reports/phase-6-sql-catalog.json`: catálogo completo estruturado; `MANIFEST.json`: arquivos e SHA-256 do pacote.

Nenhum bucket, provedor, cron, deployment, cliente ou estrutura financeira foi criado externamente.
