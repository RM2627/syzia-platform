# Dicionário das métricas globais

Fonte única: `public.analytics_platform` na migration 029. RPC STABLE de leitura, sem writes/refresh comercial. Período usa `private.analytics_period(UTC, início, fim)` com limite exclusivo no dia seguinte ao fim. Não combinar estoques atuais com eventos do período para inferir taxas.

| Nome | Chave | Fonte | Filtro | Evento / estado que conta |
|---|---|---|---|---|
| Empresas cadastradas / ativas / suspensas | organizations / active_organizations / suspended_organizations | public.organizations | Atual | Total; status active; status diferente de active. |
| Configuração incompleta | in_setup | private.onboarding_readiness → mesmo checklist público de onboarding | Atual | Qualquer etapa obrigatória incompleta. Não depende de ter ADM. |
| Sem ADM responsável | without_admin | support_responsible + members/profiles/Auth/accounts/legal | Atual | Sem administrador elegível e institucionalmente responsável. |
| Novas empresas | new_organizations | organizations.created_at | Período UTC | Criação ≥ início e < dia seguinte ao final. |
| Ativações | activations | enterprise_accounts.activated_at | Período UTC | Primeira ativação registrada; a partir da 029 resets preservam esta data. Histórico anterior mantém a data existente. |
| Ativações pendentes | pending_activations | enterprise_accounts | Atual | State pending e activated_at nulo. Reset não entra nesta contagem. |
| Usuários empresariais habilitados | active_enterprise_users | organization_members + profiles + Auth + enterprise_accounts + legal | Atual, pessoas distintas | Organização/vínculo/profile ativos, Auth confirmado/não banido, conta ativa ou legado e aceite regular. |
| Usuários com atividade há menos de 30 minutos | recent_users | enterprise_sessions + profiles/Auth + organizations/accounts/roles | Últimos 30 minutos | Sessão não revogada, last_activity recente, identidade e contexto válidos. Não é métrica de produtividade. |
| Perfis ativos (compatibilidade API) | active_profiles | profiles.status | Atual | Contagem histórica de profiles active, inclusive perfis de consumidores; não apresentada como usuários empresariais. |
| Empresas em trial / assinaturas ativas | trial_organizations / subscribers | billing_subscriptions + billing_effective | Atual | Estado comercial efetivo trial / active. Assinatura ativa pertence ao billing simulado. |
| Trials iniciados | trials_started | trial_grants.starts_at | Período UTC | Grants iniciados na janela, inclusive modo administrativo/legado. |
| Convertidos entre os trials iniciados | trial_cohort_converted | trial_grants | Coorte iniciada no período; estado atual | Coorte de trials iniciados cuja situação é converted. Não é conversão ocorrida naquele dia nem receita real. |
| Trials expirados | trials_expired | trial_grants.ends_at/status | Fim dentro do período e ≤ agora | Status active ou ended, prazo vencido. Cancelados/suspensos/convertidos não contam como expiração natural. |
| Extensões | trial_extensions | private.trial_extensions.created_at | Período UTC | Número de eventos, não número de organizações. |
| Distribuição por plano | plans | billing_plans/versions/subscriptions | Atual | Assinaturas efetivamente active ou trial agrupadas pelo plano. Sem billing real. |
| Receita global | revenue_cents | Nenhum provider real configurado | Não disponível | NULL; nunca soma faturas mock nem orçamentos de clientes. |
| Páginas publicadas | published_organizations | consumer_pages | Atual | Enabled e publication_id preenchido; não equivale a visitas ou faturamento. |
| Solicitações / atendimentos / reservas | requests / tickets / appointments | quote_requests / tickets / appointments.created_at | Período UTC | Registros criados; reserva exige kind booking e inclui posteriores cancelamentos. Adoção agregada, sem nomes de clientes. |
| Suporte pendente / ativo | support_pending / support_active | private.support_requests | Atual | Pending; ou approved não expirado e decisor ainda válido (emergência usa autoridade global). |
| Emergências | emergencies | private.support_requests.created_at | Período UTC | Solicitações com mode emergency. Pode incluir acessos posteriormente revogados. |
| Últimas entregas com falha | delivery_failures | private.access_deliveries | Última tentativa no período UTC | Estado failed da última tentativa por conta; não é total histórico de erros ou prova de entrega SMTP. |
| Empresas que precisam de atenção | attention | organizations/codes + checklist + responsabilidade + suporte | Atual; até 50 recentes | Suspensas, sem ADM, configuração incompleta ou pedido de suporte pendente. Somente dados administrativos. |

As métricas empresariais existentes permanecem em `analytics_company`/`analytics_central`, com período no timezone da organização e filtros de serviço/origem. Valores orçados, aprovados/contratados, serviços executados e pagamentos recebidos continuam distintos. Consultas globais não concedem permissão de leitura operacional.

Billing real, visitas/conversões de marketing, MRR, ARR e churn financeiro não foram inventados.

Dicionário empresarial detalhado preservado: [Métricas da empresa e Central](../phase-7-metrics.md). A definição global atual acima substitui somente o conjunto global anterior.
