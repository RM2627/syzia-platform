# Inventário técnico — Fase 5

Estado: implementado localmente. SQL aplicado em bancos descartáveis PGlite; aplicação em Supabase real pendente.

## Migrations e tabelas

| Migration | Objetos |
|---|---|
| 202609160011_central_schema.sql | Oito tabelas, oito policies SELECT, RLS/FORCE RLS, constraints, índices, auditoria e imutabilidade |
| 202609160012_central_commands.sql | Fila, ciclo do ticket, presença, configuração, mensagens, revisão, encaminhamento e projeção do consumidor |
| 202609160013_central_integration.sql | Contexto publicado, preços/descontos, motores compartilhados de orçamento/agenda, anexos e eventos do consumidor |

Migrations 001–010 preservadas byte a byte; evidência em `reports/phase-5-migration-integrity.json`. Total atual: **13 migrations, 49 tabelas públicas, 49 policies SELECT**, todas com RLS/FORCE RLS. SQL separado de buckets permanece no diretório `supabase/storage`.

| Tabela nova | Finalidade | Policy |
|---|---|---|
| central_settings | SLA configurável, edição de resposta e compartilhamento de contexto; revisão | central_settings_read |
| tickets | Unidade de atendimento vinculada à solicitação e cliente da mesma empresa | tickets_read |
| ticket_messages | Mensagens públicas com autoria/nome congelado e manual de resposta rápida | ticket_messages_read |
| ticket_notes | Notas internas com autoria e timestamp | ticket_notes_read |
| ticket_events | Histórico operacional sem duplicar corpos pessoais | ticket_events_read |
| ticket_escalations | Motivo, resumo, pergunta e resposta autorizada da empresa | ticket_escalations_read |
| work_sessions | Sessão operacional e presença do atendente | work_sessions_read |
| central_quote_actions | Desconto, valor original/final, motivo, manual e responsável | central_quote_actions_read |

As policies usam `private.central_staff(organization_id)`, exceto work_sessions: usuário ativo lê a própria sessão ou superadmin autorizado. Consumers não leem tabelas cruas da Central; RPC específica projeta somente mensagens públicas do pedido autorizado. Authenticated tem SELECT, sem INSERT/UPDATE/DELETE; mutações usam funções SECURITY DEFINER com search_path vazio e autorização atual. FORCE RLS não substitui autorização dentro dessas funções privilegiadas. Helpers internos/motores não são endpoints públicos.

## Constraints, índices e triggers

- FK composta `(organization_id,request_id,customer_id)` impede ticket com cliente de outra solicitação/empresa; adicionada `central_request_customer_unique` em quote_requests. Referências ao ticket anterior, manual e versão são compostas por empresa.
- `central_one_open_ticket`: um ticket não encerrado por solicitação. `central_queue_idx`: fila por empresa/estado/prioridade/espera.
- `central_one_pending_escalation`: uma decisão pendente por ticket. `central_one_work_session`: uma sessão aberta por usuário.
- CHECKs de estados, prioridade 0–2, revisão positiva, responsável obrigatório em ativo e timestamps coerentes em resolvido/encerrado.
- SLA nulo por padrão; resposta de 5 a 10.080 minutos, atenção positiva menor que resposta. Resposta rápida editável/contexto compartilhado são false por padrão.
- Corpo de mensagem 1–4.000 caracteres, nota 1–2.000, motivo 2–120, resumo 2–2.000, pergunta 2–1.000 e decisão 2–2.000. Resposta/autor/data da empresa são todos nulos ou todos preenchidos.
- Valores de desconto em centavos e percentual inteiro 0–100 com limite efetivo da autonomia; valor final entre zero e original. Motivo obrigatório de 2–1.000 caracteres.
- Cada tabela recebe triggers `<tabela>_updated` e `<tabela>_audit`; messages/notes/events/central_quote_actions recebem `<tabela>_immutable` contra alteração/exclusão.
- `central_intake`: submissão enviada abre ticket quando humano habilitado. `central_consumer_activity`: aprovação/recusa/agendamento/cancelamento do consumidor atualiza próxima ação/revisão do ticket aberto, preservando pendência empresarial.
- Trava transacional compartilhada com Fundação/Empresa/Consumidor + revisão esperada + idempotência por operação/usuário/empresa. Não há tabela conversation ou agenda/orçamento paralelos.
- EXCLUDE GiST, unicidade de reserva ativa, imutabilidade de proposta final e constraints das fases anteriores permanecem.

## Funções e RPCs

**12 RPCs públicas novas, 15 helpers/motores privados novos e 6 RPCs existentes redefinidas.** Todas as assinaturas abaixo provêm das migrations entregues.

| Função/assinatura | Tipo | Migration |
|---|---|---|
| `private.central_eligible(p_org uuid,p_user uuid)` | Privada; sem execute de cliente | 0011 |
| `private.central_staff(p_org uuid)` | Predicado de policy; execute authenticated | 0011 |
| `private.central_lock()` | Privada; sem execute de cliente | 0012 |
| `private.central_ticket(p_code text,p_operate boolean default false)` | Privada; sem execute de cliente | 0012 |
| `private.central_event(p_ticket uuid,p_event text,p_from uuid default null,p_to uuid default null)` | Privada; sem execute de cliente | 0012 |
| `private.central_customer(p_request uuid,p_manage boolean default false)` | Privada; sem execute de cliente | 0012 |
| `private.central_open(p_request uuid)` | Privada; sem execute de cliente | 0012 |
| `private.central_on_submit()` | Privada; sem execute de cliente | 0012 |
| `public.central_open_request(p_request text)` | RPC authenticated | 0012 |
| `public.central_settings_save(p_org uuid,p_revision integer,p_data jsonb)` | RPC authenticated | 0012 |
| `public.central_presence(p_state text)` | RPC authenticated | 0012 |
| `public.central_act(p_code text,p_revision integer,p_action text,p_data jsonb,p_key uuid)` | RPC authenticated | 0012 |
| `public.central_consumer_thread(p_request text)` | RPC authenticated | 0012 |
| `public.central_consumer_send(p_request text,p_body text,p_key uuid)` | RPC authenticated | 0012 |
| `public.central_queue(p_org uuid default null,p_search text default '',p_state text default null,p_mine boolean default false,p_offset integer default 0,p_view text default 'all',p_date date default null)` | RPC authenticated | 0012 |
| `private.central_request_context_core(p_code text)` | Privada; sem execute de cliente | 0013 |
| `public.consumer_request_context(p_code text)` | Existente, preserva entrada autorizada | 0013 |
| `private.central_send_quote_core(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid)` | Privada; sem execute de cliente | 0013 |
| `public.consumer_send_quote(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid)` | Existente, preserva entrada autorizada | 0013 |
| `private.central_request_slots_core(p_code text,p_day date)` | Privada; sem execute de cliente | 0013 |
| `public.consumer_request_slots(p_code text,p_day date)` | Existente, preserva entrada autorizada | 0013 |
| `private.central_book_core(p_code text,p_start timestamptz,p_previous text,p_key uuid)` | Privada; sem execute de cliente | 0013 |
| `public.consumer_book(p_code text,p_start timestamptz,p_previous text,p_key uuid)` | Existente, preserva entrada autorizada | 0013 |
| `private.central_cancel_booking_core(p_code text,p_appointment text,p_key uuid)` | Privada; sem execute de cliente | 0013 |
| `public.consumer_cancel_booking(p_code text,p_appointment text,p_key uuid)` | Existente, preserva entrada autorizada | 0013 |
| `public.central_context(p_code text)` | RPC authenticated | 0013 |
| `public.central_quote(p_code text,p_revision integer,p_discount integer,p_expires timestamptz,p_reason text,p_expected_cents bigint,p_key uuid)` | RPC authenticated | 0013 |
| `public.central_slots(p_code text,p_day date)` | RPC authenticated | 0013 |
| `public.central_booking(p_code text,p_revision integer,p_action text,p_start timestamptz,p_appointment text,p_key uuid)` | RPC authenticated | 0013 |
| `private.central_attachment_access(p_request uuid)` | Privada; sem execute de cliente | 0013 |
| `public.central_attachment_ticket(p_code text,p_file text)` | RPC authenticated | 0013 |
| `public.consumer_gateway_attachment(p_code text,p_user uuid,p_write boolean)` | Existente, preserva entrada autorizada | 0013 |
| `private.central_on_request_event()` | Privada; sem execute de cliente | 0013 |

`consumer_gateway_attachment` continua exclusiva de service role e agora admite leitura do atendente autorizado, nunca upload em nome de consumidor. As demais redefinições preservam permissões públicas e chamam motores privados compartilhados. `central_act` suporta claim, transfer, return, message, note, escalate, decision, state, priority e next; todas exigem revisão e chave idempotente. `central_queue` filtra empresa, texto, estado, minha fila, visão, data no fuso empresarial e paginação; não busca telefone como identidade.

## Páginas e componentes

| Arquivo/rota | Entrega |
|---|---|
| src/central/Central.tsx · /central · /central/:code | Fila geral/minha fila, painel operacional, contexto, composer, manual, respostas, orçamento, agenda, encaminhamento e organização |
| src/central/Central.tsx · /painel/:orgId/pendencias | Fila de decisão limitada à empresa e formulário de resposta |
| src/central/ConsumerChat.tsx · acompanhamento existente | Conversa do consumidor por solicitação autorizada |
| src/central/model.ts | Estados, ações, eventos, mensagens de erro, dinheiro e datas |
| src/central/central.css | Layout desktop/tablet/mobile e separação de público/interno |
| src/main.tsx | Rotas protegidas, navegação e lazy loading |
| src/company/Company.tsx | Acesso à fila de pendências empresarial |
| src/consumer/Consumer.tsx · consumer.css | Integração da conversa e orientação de ajuda |

## Testes, scripts e configuração

- `tests/central.test.mjs`: banco, isolamento, autorização, revogação, imutabilidade, revisão, preço/agenda e RLS.
- `tests/central-tools.test.mjs`: guardas dos runners, rejeição de tokens inadequados e configuração ausente, sintaxe/inspeção somente leitura e frontend.
- `tests/browser/central.spec.ts`: oito cenários UI com fixtures SQL, incluindo screenshots em três tamanhos.
- `tests/fixtures/central.mjs`: atendentes/empresas/consumidores fictícios; fixtures e demo reaproveitam banco das fases anteriores.
- `scripts/dev-consumer-demo.mjs`: demonstração local descartável incluindo Central, com Auth simulado explícito.
- `scripts/homologation/central-config.mjs`, `central.example.json`, `central-http.mjs`, `central-concurrency.mjs`, `central-inspect.sql`: preparação externa; sem execução em ambiente real.
- `.env.example` e `.env.server.example` preservados; `package.json`/lockfile 0.5.0; `test:local` inclui a Central.
- `scripts/inspect-browser-bundle.mjs`: build com marcador fictício server-only e inspeção; `scripts/package-project.py`: ZIP completo verificável com MANIFEST SHA-256, sem credenciais/dependências/dumps.
- Guias, matriz, relatório, evidências e screenshots em docs/reports. Fonte da verdade é o pacote inteiro, não esta conversa.
