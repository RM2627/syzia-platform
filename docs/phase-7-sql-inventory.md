# Inventário SQL — Fase 7

Migration nova: `202609170017_analytics.sql`, após 016, em transação. Total cumulativo: **17 migrations, 55 tabelas públicas e 55 policies SELECT**, todas as tabelas com RLS/FORCE RLS. Não há novas tabelas, constraints, triggers, policies ou papéis. Nenhuma proteção anterior foi removida.

| Objeto | Finalidade |
|---|---|
| `public.analytics_company(uuid,date,date,uuid default null,text default null)` | Coorte, funil, valores, retornos, série e grupos; administrador da empresa/superadmin autorizado |
| `public.analytics_central(uuid,date,date)` | Indicadores humanos; `private.central_staff` elegível |
| `public.analytics_platform(date,date)` | Capacidade agregada; superadmin ativo |
| `private.analytics_period(text,date,date)` | Valida datas finitas, ordem, intervalo até 366 dias e timezone |
| `analytics_op_created` | Índice opportunities(organization_id,created_at,service_id) |
| `analytics_request_events` | request_events(organization_id,request_id,created_at,event) |
| `analytics_commercial_events` | commercial_events(organization_id,opportunity_id,created_at,event) |
| `analytics_messages` | ticket_messages(organization_id,ticket_id,created_at) |
| `analytics_ticket_created` | tickets(organization_id,created_at) |

Três RPCs `STABLE SECURITY DEFINER SET search_path=''`, com autorização atual antes das consultas e predicado explícito por organização em todos os caminhos empresariais. EXECUTE revogado de PUBLIC/anon e concedido a authenticated somente nas RPCs públicas. Helper privado sem execução direta por clientes. SECURITY DEFINER não é considerado substituto de RLS: as verificações explícitas e os agregados são testados.

Fontes existentes: organizations, profiles, services, opportunities, opportunity_context, quote_requests, quote_versions, request_events, appointments, commercial_events/tasks/attempts, central_settings, tickets/messages/events. Nenhuma cópia de dados para tabelas analíticas. Respostas sem clientes, telefone, mensagens, notas, manual, tokens ou identificação individual de operadores.

Catálogo: `reports/phase-7-sql-catalog.json`. Integridade histórica: `reports/phase-7-migration-integrity.json`. Auditoria, snapshots, constraints de agenda, idempotência e funções de escrita das Fases 2–6 preservados.
