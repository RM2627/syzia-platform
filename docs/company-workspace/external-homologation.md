# Roteiro externo — navegação e onboarding

Pendente de execução pelo proprietário no Supabase de homologação. Os testes locais usam PGlite, Auth simulado e navegador sobre demo descartável. Eles não comprovam Supabase Auth/PostgREST/Storage/SMTP reais.

Pré-condições: código desta entrega, migrations 001–028, configuração local já utilizada, Super Admin global ativo. Use empresas e pessoas fictícias. Não forneça service_role ao frontend e não crie membership para liberar a operação do Super Admin.

| Caso | Ação | Resultado esperado |
|---|---|---|
| A | Criar empresa sem ADM; clicar no cartão em Minhas empresas | Ambiente empresarial com checklist; nenhuma tela de usuário |
| B | Preparar ADM e deixar primeiro acesso pendente; abrir empresa | Mesmo ambiente; nenhuma ativação automática |
| C | Concluir primeiro acesso do ADM; abrir como Super Admin | Mesmo ambiente empresarial |
| D | Administração VIRELOQ → Definir administrador | Fluxo existente de provisionamento do primeiro ADM |
| E | Navegação empresarial → Pessoas e acessos | Gestão existente de usuários |
| F | Empresa incompleta → Dados da empresa → Iniciar configuração, se necessário; salvar descrição/regiões/horários | Configuração salva; checklist acompanha os registros ao retornar |
| G | Empresa com requisitos do checklist concluídos → Abrir empresa | Home normal e botão Revisar checklist de configuração |
| H | No painel, clicar Voltar à Administração VIRELOQ e depois Minhas empresas | Rotas globais corretas; empresa atual identificada enquanto dentro dela |
| I | Login admin_empresa A; tentar URL/RPC de B | Acesso negado; leitura direta de tabelas não retorna B |

Validar também serviços, preços/adicionais, identidade, disponibilidade, portfólio, página, regras e manual pelas telas já existentes; gravar e recarregar sem perder dados. Não é preciso publicar uma página real para testar a navegação. O progresso do tutorial de um gestor não deve ser substituído pelo progresso do Super Admin.

Revogue o papel global ou suspenda a sessão/perfil em contas fictícias e confirme recusa na consulta/operação seguinte. Suspenda uma empresa e confirme bloqueio operacional; sua ficha global continua disponível para reativação. Confirme que a auditoria registra o usuário global real, que nenhum membership novo foi criado para ele e que o trial não mudou.

Registre versão, migration, data, cenário, resultado e código seguro de erro. Não copie tokens, senhas, service_role ou dados de clientes para o relatório. A atualização não altera configuração SMTP; homologação externa, concorrência nativa e integrações permanecem tarefas separadas.
