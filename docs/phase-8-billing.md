# Planos, assinaturas e billing — contrato da Fase 8

Somente assinatura da empresa para a plataforma. Pagamento do consumidor pelo serviço continua no domínio preparado na Fase 4, sem gateway real. Os dois domínios não compartilham cobrança, status financeiro ou saldo. Receita da empresa/plataforma, MRR/ARR/LTV e recebimentos reais não são inferidos de propostas, conversões ou simulações.

## Catálogo e versionamento

Superadmin ativo cria/edita ofertas com nome, descrição, preço BRL em centavos, periodicidade de 1/3/6/12 meses, avaliação de 0–90 dias, recursos (atendimento compartilhado/follow-up), limites, disponibilidade, status e ordem. Salvar gera uma versão imutável. Assinaturas apontam para a versão contratada: preços, periodicidade e limites existentes não mudam com a oferta. Nome/descrição do catálogo são atuais. Desativar oferta impede novas adesões, sem apagar contratos/histórico.

Core: página, catálogo, orçamento, agenda, gestão e Analytics. Atendimento pela empresa é distinto da equipe compartilhada; nenhum nome de operador é fixado. Recurso de equipe adiciona uma condição à elegibilidade anterior, preservando vínculo, papel, usuário, empresa, manual e prontidão. Follow-up desabilitado impede novas tentativas; o histórico permanece consultável.

## Adesão e estados

Não há adesão/cobrança automática na migration, nem planos/valores comerciais de produção pré-definidos. Empresas sem assinatura permanecem com a autorização anterior; a interface identifica **sem adesão**. Somente administração autorizada inicia uma assinatura. Não há endpoint que remova a assinatura para recuperar esse estado: após adesão, limites e vigência passam a valer. Essa compatibilidade permite introduzir ofertas sem converter empresas existentes em clientes pagantes por decisão do agente.

- `trial`: dias configurados, sem cartão/cobrança; uma avaliação por organização. A passagem do tempo é revalidada a cada operação.
- `pending`: primeira adesão aguarda confirmação fictícia.
- `active`: confirmação fictícia gerou período vigente; não comprova pagamento real.
- `past_due`: cobrança inicial/renovação vencida ou falhou; não concede nova vigência.
- `expired`: estado efetivo calculado quando período ativo/trial terminou; não depende de cron para bloquear novas operações.
- `cancelled`: cancelamento imediato quando pendente/encerrado, ou efetivo após fim do período agendado.
- `suspended`: decisão de superadmin com motivo; bloqueia novas operações. Retirada vira `past_due`, não concede gratuidade automaticamente.

Cancelamento em período ativo preserva acesso até o fim e cancela cobranças pendentes. Antes do fim pode ser desfeito. Depois, selecionar uma oferta prepara nova vigência mediante confirmação. Histórico e consultas necessárias permanecem; operações de encerramento/cancelamento de serviços existentes não são apagadas pelo billing.

## Alteração e renovação

Trocas cujo valor por mês é menor/igual, ou cuja periodicidade difere, ficam agendadas para a próxima renovação; não reduzem limites correntes silenciosamente. Aumento com mesma periodicidade prepara cobrança fictícia do novo plano. Após confirmação começa um novo período, sem pró-rata, crédito ou saldo nesta implementação. Isso é explicitado antes da confirmação na interface. Não há dupla cobrança pendente por organização.

Renovação é explícita após fim do período, usa versão agendada ou contratada e só cria vigência após confirmação. Não existe scheduler de cobranças ou renovação automática real. Valores/condições de produção e política comercial de pró-rata deverão ser definidos por Marcelo antes da integração real; esta fase fornece comportamento testável sem movimentação financeira.

## Uso e limites

| Unidade | Medição | Regra |
|---|---|---|
| Membros | vínculos ativos atuais | inserir/reativar exige capacidade |
| Serviços | serviços ativos atuais | inserir/reativar exige capacidade; edição/desativação não consome nova unidade |
| Solicitações | primeiro envio efetivo | quota do mês civil de Recife |
| Atendimentos | tickets criados | quota do mês civil de Recife |
| Follow-ups | tentativas efetivamente registradas | quota do mês civil de Recife; não confundir com tarefas substituídas |

Limite nulo significa sem teto contratual; não elimina proteções de segurança/abuso existentes. Oportunidades já são medidas pelo Analytics e não geram uma unidade de cobrança artificial. Recursos existentes acima de um novo teto não são removidos: bloqueiam acréscimos até liberar capacidade/ampliar o plano. Cancelar pedido não devolve artificialmente quota de criação.

Ledger de uso append-only, único por organização/métrica/entidade. Backfill usa eventos reais de envio e registros existentes de tickets/tentativas, sem fabricar eventos. Triggers aplicam bloqueio/contagem na mesma transação, usando a trava existente da Fundação. Falha de quota de atendimento durante envio também reverte solicitação e contagem: não deixa estado parcialmente confirmado. Idempotência repetida não consome novamente. Renovar assinatura não reseta o mês civil.

Vigência inválida impede novos interesses, envios, tickets, tentativas e acréscimos de membros/serviços; não transforma o billing em exclusão de dados nem altera snapshots antigos. A própria empresa mantém acesso administrativo ao histórico/regularização, sujeito às permissões originais. Atendimento compartilhado exige recurso e vigência válidos.

## Provedor e webhooks

Única implementação: `MockBillingProvider`, identificada como fictícia. `private.billing_runtime.mock_enabled` começa false. Somente fixture LOCAL descartável habilita automaticamente. Clientes não recebem acesso à tabela. Em futuro projeto dedicado, habilitação deve ser ação explícita do operador, nunca habilitada em produção. Nenhum gateway real ou conta bancária.

`server/billing/provider.mjs` verifica assinatura HMAC-SHA256 sobre timestamp + bytes exatos, comparação constante, janela de ±300 segundos, limite 16 KiB e schema fechado antes de invocar o banco. Segredo mínimo 32 bytes exclusivo de servidor. Provedor diferente de mock é recusado. O handler recebe `apply`, cuja integração futura usa `billing_provider_event` com service role exclusivamente no backend; não há endpoint público implantado.

Banco valida novamente valor exato, estado, revisão da assinatura, referência da cobrança e provider mock. Event ID repetido com payload idêntico devolve resultado; divergente é recusado. Pagamento com novo event ID para cobrança já paga não renova de novo. Evento atrasado não reabre cobrança cancelada nem reverte pagamento. Refund simulado é auditado; não cancela silenciosamente outra vigência corrente. Suspensão é operação administrativa separada.

Empresa não confirma pagamento. Demo permite ao superadmin executar `billing_mock_event`, somente com simulação habilitada. RPC de provedor tem EXECUTE apenas para service_role. Históricos, versões, ledger, comandos e webhooks são imutáveis; todas as novas tabelas públicas têm FORCE RLS e somente SELECT autorizado. Payloads de comandos não carregam segredo de cartão, banco ou webhook.

## Limites declarados

Admin lista até 500 empresas; contexto retorna últimas 50 cobranças e 100 eventos. Catálogo de ofertas é pequeno e configurável. Histórico completo continua preservado no banco. Não há invoice fiscal, pró-rata, gateway real, recorrência bancária, emissão fiscal ou financeiro empresarial completo. Homologação externa, concorrência independente e dimensionamento de volume continuam pendentes.

## Revisão autorizada posterior — trial entre organizações

A regra anterior de avaliação única por organização foi ampliada: verificação de identidade e histórico entre organizações, política configurável, concessões persistentes, revisão de exceções e extensões auditadas. Demo: 15 dias por configuração da oferta. Não há nova fase nem conexão real. Contrato completo e limites em `trial-and-abuse.md`; a migration 021 mantém 001–020 intactas. Solicitar trial sem elegibilidade não gera benefício/assinatura nem permite operar indefinidamente no modo sem adesão.
