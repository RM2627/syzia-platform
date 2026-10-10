# Atualização sem reset — disponibilidade e Assistido

Base: SYZIA-044-UX001-Feature-Freeze-Consolidado, ZIP SHA-256 `79aac3fbdc03a91af2dc533d8aba7d3dac67afc53bba6c0908a8d11d9e5596d2`.

1. Preserve backup/restauração e o procedimento de homologação do ambiente adotados pelo proprietário. Nenhuma conexão externa foi executada nesta rodada.
2. Use o projeto consolidado inteiro. Mantenha as migrations anteriores e seu histórico. Não apague banco, dados, audit logs ou assinaturas.
3. Aplique **somente** `supabase/migrations/202610030045_team_availability_assisted.sql` após a 044. O arquivo tem BEGIN/COMMIT; em caso de erro, interrompa, faça rollback e investigue. Não reaplique sobre uma 045 já concluída.
4. Atualize o cache de esquema da API pelo procedimento vigente do ambiente. A alteração exige backend e frontend compatíveis na mesma atualização controlada.
5. Instale as dependências fixadas com `npm ci`. Execute `npm run test:current-gate` e `npm run build` localmente. O gate usa exclusivamente fixtures fictícias; nunca aponte os scripts de demo para produção.
6. Confira Pessoas e acessos, Agenda e Planos e assinaturas com contas de homologação autorizadas. Disponibilidade de todos os membros existentes começa herdando o horário da empresa. Nenhuma reserva é atribuída, movida, cancelada ou apagada pela migration.
7. Antes de habilitar a operação compartilhada, o proprietário deve definir horário/timezone, limite e aviso por versão de plano. A configuração de produção começa inativa e sem quantidade comercial preenchida. Os valores dos testes não são valores comerciais.

O ciclo explícito é opcional quando a assinatura já tem `period_start`/`period_end` vigentes. Nesse caso, a primeira atuação compartilhada cria o registro desse ciclo. Não há integração de pagamento, cobrança excedente nem extensão automática de período. Ciclos vencidos exigem uma assinatura com novo período ou registro explícito autorizado.

A mudança da disponibilidade não modifica reservas antigas. O aviso de compromissos fora do horário exige revisão e remarcação explícitas na Agenda. Mudanças em reserva/atribuição revalidam a disponibilidade.

Rollback operacional: não remova colunas/tabelas com dados após uso. Mantenha o banco e desative a política compartilhada, se necessário, enquanto investiga. Qualquer rollback de aplicação/banco deve ser planejado sobre backup validado; não há script destrutivo automático.
