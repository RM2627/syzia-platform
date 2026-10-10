# Atualização 045 → 046 sem reset

Base obrigatória: `SYZIA-045-Disponibilidade-Equipe-Assistido-Consolidado`.

1. Preserve o backup e o procedimento de homologação do proprietário. Esta rodada não conectou serviços externos.
2. Use o projeto consolidado inteiro. Mantenha todas as migrations e registros já existentes.
3. Aplique apenas `supabase/migrations/202610030046_flexible_shared_support.sql` após a 045. A migration usa BEGIN/COMMIT e exige as funções atuais da 045. Se uma âncora esperada não existir, ela aborta; não remova a checagem para forçar aplicação.
4. Atualize o cache de esquema pelo procedimento vigente do ambiente e publique frontend/backend compatíveis somente quando houver autorização do proprietário. Nenhuma publicação foi executada nesta rodada.
5. Na preparação local, use `npm ci`, `npm run test:current-gate` e `npm run build`. Chromium pode ser informado por `FOUNDATION_CHROMIUM_PATH`. Os scripts da demo usam dados fictícios e não devem ser ligados ao banco real.
6. Confira a política: se havia grade ou ativo=true na 045, o modo inicial é **Horário programado** e esses valores são preservados. Se a política era inativa e vazia, o modo é **Conforme disponibilidade da equipe**, ainda inativo.
7. Para adotar o modelo de lançamento, o Super Admin escolhe o modo flexível explicitamente quando necessário. Não precisa preencher grade. Limite/threshold seguem pendentes da configuração comercial real; a migration não define números.
8. Confira presença Disponível versus Ocupado/Em pausa/Offline, entrada na fila sem consumo, assunção com uma unidade e troca entre modos. A empresa e o consumidor continuam operando sem presença humana compartilhada.

A 045 não foi editada. Reservas, responsáveis, horários individuais, bloqueios, consumo, ciclos, limites, preços e trial não são alterados por esta migration. A única coluna persistente nova é `assisted_policy.availability_mode`; as demais alterações são funções/contratos sobre estruturas existentes. A conversão de política já configurada para modo programado acrescenta registros na auditoria existente, preservando os registros anteriores.

Não execute reset, renumeração ou reaplicação da 046 concluída. Não há rollback destrutivo automático. Se for necessário interromper a operação compartilhada, o Super Admin pode desativar a política preservando tickets, mensagens e histórico. Restauração e concorrência em PostgreSQL real permanecem para homologação externa.
