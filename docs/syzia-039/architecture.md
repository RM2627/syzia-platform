# SYZIA 039 — decisões e mapa funcional

Base exclusiva: consolidado 038, SHA-256 `589d7a3faf938e0c1c0e1ccfa8de9820cf97572509351241e29a4116a0ff5cf7`. Inspeção dos fontes de billing 018–021, capabilities/permissions 030, aquisição 033, hosted checkout, interface e pedido multisserviço 038 antes das alterações.

## Um domínio comercial existente

Reutilizados `billing_plans`, `billing_plan_versions`, `billing_subscriptions`, `billing_invoices`, `billing_usage`, `billing_events`, o registro persistente de trial, `private.entitlement`, o catálogo de permissões e a fronteira `server/billing/hosted-checkout.mjs`. Não há segunda assinatura, trial ou onboarding.

Uma oferta reúne metadados comerciais mutáveis e versões contratuais imutáveis. Cada salvamento cria uma nova versão; a assinatura mantém seu `plan_version_id`. Nome/descrição/disponibilidade pertencem à oferta; preço, periodicidade, trial, capacidades e limites pertencem à versão. Upgrade/downgrade continuam explícitos. O nome exibido da oferta não é um congelamento de sua identidade comercial histórica.

## Recursos vendidos e autorização

A operação básica é um pacote obrigatório, apresentado com seus itens. Não existem seletores independentes para módulos sem uma capacidade separada. Os quatro recursos opcionais têm seletores próprios.

| Recurso do configurador | Vínculo no servidor | Comportamento |
|---|---|---|
| Operação empresarial: clientes, atendimento próprio, pendências, solicitações e orçamentos | `software`, permissões `clients.*`, `central.*`, `quotes.*`, `pending.*`; guardas de solicitação, oportunidades e propostas | Operações sujeitas a assinatura/capacidade válidas e às permissões da pessoa. |
| Página pública, serviços, portfólio, configuração inicial, equipe, papéis e agenda | `setup`, ações `page.*`, `portfolio.*`, `services.*`, `settings.*`, `people.*`, `agenda.*` | Configuração permanece acessível. Publicação e acesso obedecem aos controles existentes. Criar agendamento exige `software` no trigger; ausência de plano não cria gratuidade automática. |
| Acompanhamento do consumidor | Fluxo seguro existente, tokens view/manage e vínculo com a solicitação | Histórico e acompanhamento preservados; o consumidor não recebe dados internos. |
| Financeiro (opcional) | `finance`, todas as ações do módulo `finance`, RPCs e RLS | Sem capacidade, dados/ações financeiras não são liberados. |
| Métricas (opcional) | `analytics`, `analytics.operational`; métricas financeiras usam `finance_analytics` | A capacidade interna `finance_analytics` exige **financeiro e métricas**. Não é opção comercial extra. O financeiro mantém seus relatórios próprios quando incluído. |
| Follow-up/recuperação (opcional) | `commercial_followups`, `followup.read/manage` e guarda de `commercial_attempts` | Sem capacidade, novas tentativas e operação de retornos ficam bloqueadas. |
| Atendimento humano compartilhado SYZIA (opcional) | `human_support`, elegibilidade Central, vínculo de atendente, manual, autonomia e verificações existentes | Ter o recurso não dispensa autorização operacional, configuração ou disponibilidade humana. |
| Membros | `billing_members_guard` + contagem de membros ativos + `billing_capacity_allows` | Inclui administrador e membros próprios. Super Admin e vínculos compartilhados não consomem vagas empresariais. |
| Serviços ativos | `billing_services_guard` | Limite opcional. |

Financeiro e métricas são chaves adicionais no JSON de capacidades **existente**. Em versões/gratificações antigas que não têm essas chaves, herdam `software`, preservando o que já estava liberado. As versões antigas não são regravadas. Os grants individuais e o isolamento continuam necessários mesmo com capacidade contratual.

## Limites e unidades

Novas versões usam `quota_semantics=2`: `null` = **Ilimitado**. O formulário não define preço final nem cotas numéricas por padrão.

- Solicitações: uma submissão, inclusive pedido com vários serviços. Reenvio idempotente não duplica.
- Orçamentos e agendamentos: sem cota numérica; exigem autorização e software ativo para novas operações.
- Atendimentos/retornos da própria empresa: ilimitados na modalidade nova.
- `ticket_limit`: capacidade humana compartilhada SYZIA por mês. Primeiro envio público ou evento substantivo de orçamento/agenda de um atendente compartilhado consome uma unidade por ticket. Notas internas, abertura, visualização, atribuição, transferência e reabertura não consomem. Mensagens posteriores no mesmo ticket não duplicam, inclusive em outro mês.
- `followup_limit`: tentativas efetivamente registradas por atendente compartilhado. Criar, consultar, assumir ou iniciar a tarefa não consome; registrar resultado em `commercial_attempts` consome. Repetição idempotente não duplica.
- A mesma solicitação continua na Central/Comercial existentes. Não foi adicionado novo fluxo de contato externo.

`billing_usage` ganhou dois valores de métrica: `human_tickets` e `human_followups`. Usa a mesma tabela, unicidade e auditoria. `tickets`/`followups` anteriores e respectivos registros continuam intactos.

Versões anteriores recebem somente a marca aditiva `quota_semantics=1`; tetos, preço, capacidades, assinaturas e histórico são preservados. Seus limites continuam abrangendo o atendimento/retorno da modalidade antiga. Para tickets novos, a contabilização ocorre na primeira ação substantiva; registros históricos já contabilizados na abertura não são apagados nem repetidos. Ao editar uma oferta antiga, a interface mantém a modalidade 1 e oferece ação explícita para adotar a modalidade 2 **na nova versão**. Empresas já contratadas só mudam de versão por alteração explícita.

## Validação e diagnóstico

`billing_plan_validate` exige autoridade global. Valida capacidades conhecidas, coerência entre flags antigas/JSON, relações de publicação/cadastro/teste gratuito e capacidade humana. Confere vínculos concretos no catálogo de permissões e presença dos pontos de enforcement. `billing_plan_save` repete a validação: chamadas diretas também não publicam uma oferta inconsistente. Constraints existentes continuam validando tipos/faixas/preço.

`billing_plan_test` também exige autoridade global. Cria organização A, organização B, identidade e contrato sintéticos dentro de uma subtransação; executa `permission_require`, RPCs operacionais/financeiro/métricas, acesso A/B, suspensão e acesso à regularização. Um SQLSTATE interno exclusivo encerra a subtransação com rollback. O resultado fica em variáveis, sem retornar IDs, dados de outras empresas ou segredos. O contexto original de autenticação é restaurado. Falha inesperada produz **Inconsistência** e descarta o cenário.

Limites de 1 a 20 membros exercitam inserções reais e o primeiro membro recusado. Para limites maiores, o diagnóstico usa a mesma função de comparação do trigger, sem provisionar milhares de identidades. Essa distinção aparece no resultado. As funções privadas não são concedidas ao cliente; não há GUC de bypass. O teste não confirma pagamentos, não ativa empresas reais nem persiste contratos/usuários sintéticos. A suite mede as contagens antes/depois para comprovar o descarte.

O diagnóstico cobre autorização/limites, não a homologação completa do atendimento nem integrações externas. Sequências técnicas de auditoria podem avançar em PostgreSQL mesmo com rollback; não representa dado de empresa criado.

## Fronteira de cobrança

`server/billing/hosted-checkout.mjs` continua sendo a entrada única provider-neutral. `contract.mjs` define o vocabulário interno. O adapter futuro implementa criação de checkout, verificação dos bytes do webhook, consulta autenticada do contrato, cancelamento ao fim do período, reativação e mudança de plano.

Checkout: o store autoriza o ator, lê preço/versão no servidor e reserva chave idempotente; o provider recebe esses dados, e a URL só é retornada após validar origem e persistir a referência. O retorno do navegador não altera assinatura.

Confirmação: verificar webhook → localizar associação → consultar contrato no provider → comparar assinatura, checkout, moeda, valor e versão → normalizar → aplicar transacionalmente. Eventos internos: `billing.pending`, `billing.confirmed`, `billing.payment_failed`, `billing.cancelled`, `billing.suspended`, `billing.refunded`, `billing.disputed`. Renovação/regularização usam novo estado confirmado com sequência e período corretos.

`changeHostedPlan` reserva a versão alvo e a efetivação (após confirmação ou no fim do período); o retorno do provider apenas registra pendência. A sincronização validada aplica a mudança. O store durável real, associação a cobranças reais e adapter de fornecedor continuam a ser implementados/homologados quando houver escolha do provedor. O store dos testes de contrato é explicitamente em memória.

A implementação de cobrança fictícia anterior permanece isolada: runtime SQL desligado por padrão e fixture local explícita para simulação. A 039 impede `subscribe/change/renew` de criar cobrança simulada quando esse runtime não está habilitado. Não há fallback para simulação, endpoint real habilitado ou credencial inventada. A área **Administração → Cobrança** mostra a ausência de integração. Exibir simulador na UI exige também `VITE_LOCAL_DEMO=true`; registros simulados mantêm essa identificação.
