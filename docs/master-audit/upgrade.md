# Atualização 028 → 029, sem reset

1. Faça backup e mantenha seus `.env` e `.env.server` locais. Eles não estão no pacote. Guarde também a versão anterior do projeto e o backup do banco.
2. Substitua pelos arquivos consolidados desta entrega, preservando as configurações locais e os segredos no servidor. Execute `npm ci` na pasta `foundation`.
3. Confirme que a instalação já possui migrations 001–028. Aplique **somente** `supabase/migrations/202609200029_authorized_support.sql`. Não reaplique históricos, não use reset. Uma instalação anterior à 028 deve seguir primeiro seus upgrades incrementais anteriores.
4. Execute `npm run build`, reinicie os processos locais do frontend e da Platform API conforme o guia existente. Exemplos de ambiente continuam os mesmos; não exponha segredos em VITE_.
5. Valide login global; criação de empresa sem ADM; abertura/onboarding; configuração persistida; Definir administrador separado; primeiro login + senha + aceite institucional.
6. Na empresa com ADM responsável, confirme bloqueio operacional global, solicitação, notificação ao ADM, aprovação, entrada com banner/prazo, revogação e recusa da próxima operação. Confira emergência, registro de motivo e expiração. Nenhuma empresa existente recebe autorização presumida no upgrade.
7. Confira códigos: novos legíveis, antigos preservados, alteração de nome/slug sem troca do código. Valide código antigo no login.
8. Execute a jornada e a matriz em ambiente fictício de homologação autorizado pelo proprietário. Teste Auth/JWT/PostgREST/Storage/SMTP reais somente nessa etapa separada. SMTP falho deve preservar o provisionamento.

Verificações locais: `npm run test:master`, `npm run test:local`, `npm run check:bundle`. Concorrência preparada: `npm run test:master:native`, `test:access:native`, `test:activation:native`, `test:operations:native` e `test:trial:native` em Linux com usuário comum.

Restauração não é downgrade SQL improvisado. Caso seja necessário, interrompa alterações, restaure o backup validado e a versão compatível dos arquivos. Não apague solicitações/grants para simular rollback. Esta entrega não autoriza deploy, produção, envio real, cobrança ou vídeo.
