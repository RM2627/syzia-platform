# Matriz final de permissões — 030

O teto abaixo não concede acesso sozinho. ADM/global têm ações implícitas dentro do teto e da autorização vigente; demais atores dependem de grants explícitos, capacidade, status e escopo. Consumidor não recebe permissões empresariais.

| Ação | Finalidade | ADM | Colaborador | Próprio | Compartilhado | Escopo | Capacidade |
|---|---|---|---|---|---|---|---|
| home.read | Ver Home | Sim | Sim | Sim | Não | organization | setup |
| clients.read | Ver Clientes | Sim | Sim | Sim | Sim | organization | software |
| clients.manage | Gerenciar Clientes | Sim | Sim | Sim | Sim | organization | software |
| central.read | Ver Atendimento | Sim | Sim | Sim | Sim | organization | software |
| central.manage | Gerenciar Atendimento | Sim | Sim | Sim | Sim | organization | software |
| quotes.read | Ver Orçamentos | Sim | Sim | Sim | Sim | organization | software |
| quotes.manage | Gerenciar Orçamentos | Sim | Sim | Sim | Sim | organization | software |
| agenda.read | Ver Agenda | Sim | Sim | Sim | Sim | organization | setup |
| agenda.manage | Gerenciar Agenda | Sim | Sim | Sim | Sim | organization | setup |
| pending.read | Ver Pendências | Sim | Sim | Sim | Sim | organization | software |
| pending.manage | Gerenciar Pendências | Sim | Sim | Sim | Sim | organization | software |
| followup.read | Ver Retornos | Sim | Sim | Sim | Sim | organization | commercial_followups |
| followup.manage | Gerenciar Retornos | Sim | Sim | Sim | Sim | organization | commercial_followups |
| services.read | Ver Serviços | Sim | Sim | Não | Não | organization | setup |
| services.manage | Gerenciar Serviços | Sim | Sim | Não | Não | organization | setup |
| portfolio.read | Ver Portfólio | Sim | Sim | Não | Não | organization | setup |
| portfolio.manage | Gerenciar Portfólio | Sim | Sim | Não | Não | organization | setup |
| page.read | Ver Página pública | Sim | Sim | Não | Não | organization | setup |
| page.manage | Gerenciar Página pública | Sim | Sim | Não | Não | organization | setup |
| settings.read | Ver Configurações | Sim | Sim | Não | Não | organization | setup |
| settings.manage | Gerenciar Configurações | Sim | Sim | Não | Não | organization | setup |
| people.read | Ver Pessoas e acessos | Sim | Não | Não | Não | organization | setup |
| people.manage | Gerenciar Pessoas e acessos | Sim | Não | Não | Não | organization | setup |
| central.reply | Responder ao cliente | Sim | Sim | Sim | Sim | organization | software |
| quotes.values | Ver valores dos orçamentos | Sim | Sim | Sim | Sim | organization | software |
| analytics.operational | Ver métricas operacionais | Sim | Sim | Sim | Não | organization | software |
| analytics.financial | Ver métricas financeiras consolidadas | Sim | Sim | Sim | Não | organization | software |
| billing.manage | Administrar plano e assinatura | Sim | Não | Não | Não | organization | setup |
| finance.accounts.read | Ver contas a receber | Sim | Sim | Sim | Sim | organization, assigned | software |
| finance.history.read | Ver histórico financeiro autorizado | Sim | Sim | Sim | Sim | organization, assigned | software |
| finance.receipts.record | Registrar recebimento | Sim | Sim | Sim | Sim | organization, assigned | software |
| finance.accounts.manage | Criar e gerenciar contas | Sim | Sim | Sim | Não | organization | software |
| finance.expenses.read | Ver despesas | Sim | Sim | Sim | Não | organization | software |
| finance.expenses.record | Registrar despesas | Sim | Sim | Sim | Não | organization | software |
| finance.expenses.manage | Gerenciar despesas | Sim | Sim | Sim | Não | organization | software |
| finance.cash.read | Ver caixa consolidado | Sim | Sim | Sim | Não | organization | software |
| finance.receipts.summary | Ver recebimentos consolidados | Sim | Sim | Sim | Não | organization | software |
| finance.result.read | Ver resultado do período | Sim | Sim | Sim | Não | organization | software |
| finance.calculators | Usar calculadoras | Sim | Sim | Sim | Não | organization | software |
| finance.receipts.reverse | Estornar recebimento confirmado | Sim | Não | Não | Não | organization | software |

Super Admin está sujeito à autorização operacional da 029 e às capacidades, incluindo recusa de atribuição compartilhada quando o plano não a oferece. A gestão comercial global preserva sua autorização própria.

Escopo `assigned`: somente conta atribuída ao ator ou ticket relacionado atribuído a ele, com vínculo ativo. Para compartilhados, grants financeiros individuais nunca aceitam escopo de organização.

Atendentes usam o fluxo da Central e suas autonomias publicadas para alterar propostas/agendamentos. A leitura dos módulos empresariais pode ser concedida separadamente; os formulários administrativos antigos não substituem as autonomias da Central.

Configuração: Pessoas e acessos → Permissões por pessoa. Um salvamento envia o conjunto completo de grants com revisão e idempotência. Atendentes compartilhados já atribuídos podem ter autonomias editadas pelo ADM dentro do teto; atribuição permanece global.
