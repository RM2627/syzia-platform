# Inventário — revisão operacional

Migrations anteriores 001–021 preservadas byte a byte: `reports/operations-migration-preservation.json`. Catálogo extraído do banco local: `reports/operations-sql-catalog.json`.

| Migration | Alteração |
|---|---|
| `202609180022_operational_authorization.sql` | Marca de atendente próprio, modalidade própria/compartilhada/mista, autorização gerencial distinta da plataforma, prontidão e elegibilidade, gestão atômica do vínculo |
| `202609180023_daily_operations.sql` | Cliente manual, execução da reserva existente, histórico, notificações, Home, agenda/ficha, orçamento manual e agregação de conclusões |
| `202609180024_company_onboarding.sql` | Tutorial persistido por usuário/organização, checklist derivada e transições com revisão/idempotência |

## Tabelas novas e policies

- `appointment_events`: eventos imutáveis da reserva; `appointment_events_read` somente para gestor da organização.
- `notifications`: atualizações e decisões; `notifications_read` somente para gestor da organização.
- `notification_reads`: leitura por usuário, com FK composta organização/notificação; `notification_reads_read` exige gestor e usuário da linha.
- `organization_user_guides`: PK organização/usuário; `organization_user_guides_read` exige gestor e usuário da linha.

As quatro têm **RLS e FORCE RLS**, SELECT autenticado, nenhuma policy/grant cliente de escrita e auditoria. Inventário cumulativo local: **67 tabelas públicas e 67 policies SELECT**.

## Colunas e constraints

- `organization_members.is_attendant`: somente colaborador pode ser atendente próprio; promoção a gestor limpa a marca; RPC atômica.
- `company_settings.support_mode`, `support_configured`: três modalidades; alteração desativa atendimento até nova revisão.
- `customers.user_id` aceita nulo somente para representar cadastro manual, sem atribuir identidade ao telefone. Acesso privado do consumidor continua exigindo sessão/vínculo/token válido.
- `appointments.revision`, `execution_state`, `started_at`, `completed_at`: execução separada da confirmação/cancelamento. Checks impedem conclusão antes de início e inconsistências; guard bloqueia mudanças retroativas. Constraint de exclusão temporal original e unicidade de reserva ativa preservadas.
- `request_events` admite `service_started` e `service_completed` para acompanhamento.
- Guia: etapas 0–4; conclusão somente na etapa final; datas e estados consistentes; revisão positiva; chave composta usuário/empresa.

## RPCs novas

`operations_member`, `operations_set_attendant`, `operations_support_mode`, `operations_customer`, `operations_request`, `operations_schedule`, `operations_appointment_act`, `operations_agenda`, `operations_detail`, `operations_directory`, `operations_requests`, `operations_home`, `operations_read_notification`, `operations_quote_context`, `operations_send_quote`, `onboarding_context`, `onboarding_act`.

Leituras e comandos validam gestor atual. Comandos usam o lock transacional existente, validação no banco, auditoria e idempotência quando representam intenção repetível. Funções SECURITY DEFINER usam `search_path` vazio. Helpers privados não são executáveis pelo cliente.

`analytics_company` preserva os agregados anteriores e acrescenta conclusão por evento/período. A implementação anterior foi renomeada para `analytics_company_before_operations` e teve execução de cliente revogada. `analytics_central` passou a exigir gestor; papel de atendente não libera indicadores gerenciais.

`company_can_manage` deixa de conceder administração comercial implicitamente ao superadmin. `billing_can_read` mantém o escopo legítimo de administração de planos/trial. Central continua consultando manual publicado e autonomia pelo contexto autorizado do ticket; acesso direto de atendente à configuração administrativa foi removido.

## Páginas e componentes

- `src/operations/Onboarding.tsx`: navegação empresarial, checklist, tour, Ajuda e ajuda contextual.
- `src/operations/Operations.tsx`: Home, Agenda dia/semana/calendário, ficha, clientes, criação manual e revisão de proposta.
- `src/operations/operations.css`: layouts responsivos, navegação, checklist, cards, status, formulário e tour.
- Rotas `/painel/:orgId`, `/agenda`, `/clientes`, `/novo-agendamento`, `/novo-orcamento`, `/orcamentos`, `/atendimento`, `/ajuda` no mesmo escopo empresarial; `/acessos` mantém administração de vínculos.
- Integrações em FoundationApp, Company, ConsumerAdmin/PresenceAdmin, acompanhamento do consumidor, Central e Analytics.
- Fixture local `tests/fixtures/operations-demo.mjs`: empresa nova, equipe própria e rotina fictícia.
