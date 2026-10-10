# Matriz de permissões efetivas

G = autoridade global própria; O = própria organização com vínculo/sessão/estado válidos; S = sem ADM responsável, suporte temporário aprovado ou emergência; A = atribuição e autonomia explícitas; P = público ou própria solicitação. “—” = não concedido. Nenhum papel empresarial concede papel global.

| Área / ação | Super Admin | admin_empresa | colaborador_empresa | Atendente próprio | Atendente compartilhado | Consumidor |
|---|---|---|---|---|---|---|
| Administração VIRELOQ / cadastro e situação | G | Nome da própria empresa | — | — | — | — |
| Abrir/configurar empresa, onboarding | S | O | Sem gestão do painel | — | — | — |
| Serviços, preços, regras, manual, configuração | S: ler/criar/editar | O: ler/criar/editar | Leitura limitada em RLS; sem edição | Manual/autonomia para atendimento A | Manual/autonomia para atendimento A | Somente conteúdo publicado |
| Página pública / portfólio / imagens | S: editar/publicar | O: editar/publicar | — | — | — | P: conteúdo público |
| Clientes e dados internos | S | O | — | A: contexto necessário ao atendimento | A: contexto necessário ao atendimento | Próprios dados pertinentes |
| Orçamento e agenda | S | O | — | A: ações e limites autorizados | A: ações e limites autorizados | Solicitar/aprovar/agendar/cancelar conforme regras P |
| Atendimento / pendências | S | O | — | A | A | Mensagens públicas da própria solicitação |
| Notas internas | S | O | — | A | A | — |
| Follow-up / recuperação | S | O | — | A + follow_up | A + follow_up | — |
| Métricas empresariais | S | O | — | — | — | — |
| Métricas globais | G: agregados | — | — | — | — | — |
| Pessoas e acessos empresariais | S; primeiro ADM sem responsável | O; identidade preservada, último ADM protegido | — | — | — | — |
| Papel global / suspensão de profile global | G; proteções de autocontrole existentes | — | — | — | — | — |
| Trial / planos / billing | G, sem grant operacional | O conforme RPCs existentes | — | — | — | — |
| Auditoria global (menu/rota/RPC) | G | — | — | — | — | — |
| Histórico empresarial / suporte | S para operação; suas solicitações em qualquer regime | O: próprio histórico e acessos VIRELOQ | — | — | — | — |
| Solicitar suporte / emergência | G; motivo, prazo e limites | — | — | — | — | — |
| Autorizar / recusar suporte normal | Nunca autoaprova; ser global não basta | ADM válido O, diferente do solicitante | — | — | — | — |
| Revogar suporte | Própria solicitação | Qualquer ADM válido O | — | — | — | — |
| Desativar / reativar organização | G | — | — | — | — | — |
| Excluir organização | G; nome exato e elegibilidade revalidada | — | — | — | — | — |

Fontes: `FoundationApp`, RPCs Fundação/enterprise access, helpers company/central/commercial/billing, policies históricas e migration 029. O papel colaborador não foi promovido a gestor nem recebeu novo painel; atendente próprio é membership colaborador com `is_attendant`, compartilhado usa os vínculos existentes. Aprovação de orçamento não confirma pagamento. Exclusão não apaga trial/auditoria e não permite remover organização com histórico operacional ou suporte.
