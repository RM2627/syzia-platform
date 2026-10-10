# Matriz de testes da Fase 3

Todos os resultados abaixo são **TESTADOS LOCALMENTE**. Total: 182 PASS, 0 FAIL. Não representam homologação externa. Ambiente e limites em `phase-3-report.md`.

| Nº | Bateria | Teste | Resultado |
|---|---|---|---|
| 1 | Fundação SQL | Empresa A vê somente A | PASS |
| 2 | Fundação SQL | Empresa B vê somente B | PASS |
| 3 | Fundação SQL | Alterar UUID de organização não expõe B | PASS |
| 4 | Fundação SQL | Empresa A não lê membros de B | PASS |
| 5 | Fundação SQL | Empresa A não lê perfil do administrador B | PASS |
| 6 | Fundação SQL | Empresa A não lê vínculos de B | PASS |
| 7 | Fundação SQL | Empresa A não lê auditoria de B nem global | PASS |
| 8 | Fundação SQL | Atendente acessa somente empresa vinculada | PASS |
| 9 | Fundação SQL | Atendente sem vínculo não acessa empresa | PASS |
| 10 | Fundação SQL | Colaborador acessa sua organização | PASS |
| 11 | Fundação SQL | Colaborador não consulta demais membros | PASS |
| 12 | Fundação SQL | Colaborador não consulta auditoria | PASS |
| 13 | Fundação SQL | Superadmin consulta organizações e auditoria global | PASS |
| 14 | Fundação SQL | Visitante anon não lê dados | PASS |
| 15 | Fundação SQL | Visitante anon não executa comandos | PASS |
| 16 | Fundação SQL | JWT ausente não libera dados nem comando | PASS |
| 17 | Fundação SQL | Sessão anônima não se torna funcionário por metadata | PASS |
| 18 | Fundação SQL | Flag anônima no JWT bloqueia até identidade permanente | PASS |
| 19 | Fundação SQL | Conta sem email confirmado não recebe privilégio | PASS |
| 20 | Fundação SQL | Metadata de superadmin não concede papel | PASS |
| 21 | Fundação SQL | Usuário não insere papel diretamente | PASS |
| 22 | Fundação SQL | Usuário não altera status diretamente | PASS |
| 23 | Fundação SQL | Administrador da empresa não se promove | PASS |
| 24 | Fundação SQL | Administrador da empresa não cria organizações | PASS |
| 25 | Fundação SQL | Empresa A não adiciona membro a B | PASS |
| 26 | Fundação SQL | Empresa A não altera organização B via RPC | PASS |
| 27 | Fundação SQL | Colaborador não altera membros | PASS |
| 28 | Fundação SQL | Atendente não gerencia membros | PASS |
| 29 | Fundação SQL | Empresa não concede vínculo de atendente | PASS |
| 30 | Fundação SQL | Admin da empresa adiciona colaborador elegível | PASS |
| 31 | Fundação SQL | Admin da empresa renomeia sua empresa | PASS |
| 32 | Fundação SQL | Empresa não suspende conta organizacional | PASS |
| 33 | Fundação SQL | Usuário edita somente seu nome via RPC | PASS |
| 34 | Fundação SQL | Validação de nome vazia | PASS |
| 35 | Fundação SQL | Autoalteração de vínculo bloqueada | PASS |
| 36 | Fundação SQL | Último administrador empresarial preservado | PASS |
| 37 | Fundação SQL | Superadmin não remove seu próprio papel | PASS |
| 38 | Fundação SQL | Superadmin não suspende a si mesmo | PASS |
| 39 | Fundação SQL | Superadmin pode revogar outro admin; token antigo perde autoridade | PASS |
| 40 | Fundação SQL | Usuário suspenso não lê nem escreve | PASS |
| 41 | Fundação SQL | Suspensão de perfil revoga acesso com mesmo sub/JWT | PASS |
| 42 | Fundação SQL | Banimento do Auth também bloqueia usuário | PASS |
| 43 | Fundação SQL | Suspensão da organização revoga acesso do membro | PASS |
| 44 | Fundação SQL | Suspensão do membro revoga acesso imediatamente | PASS |
| 45 | Fundação SQL | Suspensão do vínculo revoga acesso da atendente | PASS |
| 46 | Fundação SQL | Revogação global de atendente desativa vínculos antigos | PASS |
| 47 | Fundação SQL | Não pode vincular pessoa sem papel atendente | PASS |
| 48 | Fundação SQL | Não concede papel a sessão anônima | PASS |
| 49 | Fundação SQL | Não adiciona membro sem email verificado | PASS |
| 50 | Fundação SQL | Não ativa membro suspenso | PASS |
| 51 | Fundação SQL | Não existem dois principais ativos na mesma empresa | PASS |
| 52 | Fundação SQL | Não cria vínculo com organização inexistente | PASS |
| 53 | Fundação SQL | Slug duplicado rejeitado e criação atômica | PASS |
| 54 | Fundação SQL | Slug reservado rejeitado | PASS |
| 55 | Fundação SQL | Auditoria registra ator, empresa e campos alterados | PASS |
| 56 | Fundação SQL | Auditoria não armazena nome privado em payload | PASS |
| 57 | Fundação SQL | Cliente autenticado não insere auditoria falsa | PASS |
| 58 | Fundação SQL | Não pode editar, apagar ou truncar auditoria | PASS |
| 59 | Fundação SQL | Trigger bloqueia edição de auditoria até em sessão proprietária | PASS |
| 60 | Fundação SQL | RLS impede escrita mesmo com GRANT adicionado por engano | PASS |
| 61 | Fundação SQL | RLS oculta atualização cruzada mesmo com GRANT acidental | PASS |
| 62 | Fundação SQL | Todas as tabelas das fases 2 e 3 têm RLS e FORCE RLS | PASS |
| 63 | Fundação SQL | Todas as policies são SELECT e destinadas a authenticated | PASS |
| 64 | Fundação SQL | Nenhuma função SECURITY DEFINER usa search_path mutável | PASS |
| 65 | Fundação SQL | Helpers de mutação não podem ser invocados pelo cliente | PASS |
| 66 | Fundação SQL | Anon não executa nenhum RPC da Fundação | PASS |
| 67 | Fundação SQL | Contexto empresarial só retorna organização autorizada | PASS |
| 68 | Fundação SQL | Trigger de identidade ignora metadata privilegiada | PASS |
| 69 | Empresa SQL | RLS: A não lê B em company_settings | PASS |
| 70 | Empresa SQL | Escrita direta negada em company_settings | PASS |
| 71 | Empresa SQL | RLS: A não lê B em services | PASS |
| 72 | Empresa SQL | Escrita direta negada em services | PASS |
| 73 | Empresa SQL | RLS: A não lê B em service_addons | PASS |
| 74 | Empresa SQL | Escrita direta negada em service_addons | PASS |
| 75 | Empresa SQL | RLS: A não lê B em service_intake_fields | PASS |
| 76 | Empresa SQL | Escrita direta negada em service_intake_fields | PASS |
| 77 | Empresa SQL | RLS: A não lê B em manual_versions | PASS |
| 78 | Empresa SQL | Escrita direta negada em manual_versions | PASS |
| 79 | Empresa SQL | RLS: A não lê B em manual_sections | PASS |
| 80 | Empresa SQL | Escrita direta negada em manual_sections | PASS |
| 81 | Empresa SQL | RLS: A não lê B em faqs | PASS |
| 82 | Empresa SQL | Escrita direta negada em faqs | PASS |
| 83 | Empresa SQL | RLS: A não lê B em quick_replies | PASS |
| 84 | Empresa SQL | Escrita direta negada em quick_replies | PASS |
| 85 | Empresa SQL | RLS: A não lê B em business_rules | PASS |
| 86 | Empresa SQL | Escrita direta negada em business_rules | PASS |
| 87 | Empresa SQL | RLS: A não lê B em attendant_permissions | PASS |
| 88 | Empresa SQL | Escrita direta negada em attendant_permissions | PASS |
| 89 | Empresa SQL | Isolamento simétrico B → A | PASS |
| 90 | Empresa SQL | Perfil worker não altera autonomia por RPC | PASS |
| 91 | Empresa SQL | Perfil attendant não altera autonomia por RPC | PASS |
| 92 | Empresa SQL | Perfil unlinked não altera autonomia por RPC | PASS |
| 93 | Empresa SQL | Perfil anonymous não altera autonomia por RPC | PASS |
| 94 | Empresa SQL | Perfil unconfirmed não altera autonomia por RPC | PASS |
| 95 | Empresa SQL | Admin A não altera configuração nem publica B | PASS |
| 96 | Empresa SQL | JWT editável não concede administração | PASS |
| 97 | Empresa SQL | Atendente sem vínculo não lê contexto nem prontidão | PASS |
| 98 | Empresa SQL | Atendente vinculado não vê rascunho, FAQ nem respostas não publicadas | PASS |
| 99 | Empresa SQL | Campos de permissão/identidade injetados são rejeitados | PASS |
| 100 | Empresa SQL | Escrita direta segue bloqueada mesmo com GRANT acidental | PASS |
| 101 | Empresa SQL | FK composta rejeita adicional e pergunta com serviço de B | PASS |
| 102 | Empresa SQL | ID de FAQ de outra empresa não pode ser editado | PASS |
| 103 | Empresa SQL | Modalidades fixo, a partir de e sob consulta persistem corretamente | PASS |
| 104 | Empresa SQL | Constraint rejeita preço negativo | PASS |
| 105 | Empresa SQL | Constraint rejeita preço fracionário | PASS |
| 106 | Empresa SQL | Constraint rejeita fixo sem preço | PASS |
| 107 | Empresa SQL | Constraint rejeita consulta com preço | PASS |
| 108 | Empresa SQL | Constraint rejeita agendamento direto sem duração | PASS |
| 109 | Empresa SQL | Constraint rejeita agendamento direto a partir de | PASS |
| 110 | Empresa SQL | Constraint rejeita imagem com protocolo inseguro | PASS |
| 111 | Empresa SQL | Perguntas exigem opções válidas e distintas | PASS |
| 112 | Empresa SQL | Horários rejeitam inversão, duplicidade e valor inválido | PASS |
| 113 | Empresa SQL | Nunca alterar preço bloqueia desconto e negociação | PASS |
| 114 | Empresa SQL | Permissões desconhecidas e desconto sem permissão são rejeitados | PASS |
| 115 | Empresa SQL | Revisão obsoleta não sobrescreve edição já salva | PASS |
| 116 | Empresa SQL | Revisão obrigatória impede bypass por null | PASS |
| 117 | Empresa SQL | Manual incompleto bloqueia publicação e ativação | PASS |
| 118 | Empresa SQL | Checklist não é um booleano editável pelo cliente | PASS |
| 119 | Empresa SQL | Publicação completa registra versão, ator e snapshot | PASS |
| 120 | Empresa SQL | Manual e seções publicados são imutáveis também sob proprietário SQL | PASS |
| 121 | Empresa SQL | Nova versão clona manual e mantém snapshot anterior | PASS |
| 122 | Empresa SQL | Só um rascunho por empresa; descarte não altera publicados | PASS |
| 123 | Empresa SQL | FAQ pública exige opt-in e não expõe conteúdo privado | PASS |
| 124 | Empresa SQL | Edição de FAQ não muda snapshot público até nova publicação | PASS |
| 125 | Empresa SQL | Retirada da FAQ corta próxima consulta anônima | PASS |
| 126 | Empresa SQL | FAQ publicada funciona sem atendente principal; humano é bloqueado | PASS |
| 127 | Empresa SQL | Autonomia efetiva exige publicação, ativação, papel e vínculo | PASS |
| 128 | Empresa SQL | Desconto máximo é conferido no banco | PASS |
| 129 | Empresa SQL | Redução de autonomia invalida prontidão e bloqueia sessão já existente | PASS |
| 130 | Empresa SQL | Revogação/suspensão profile bloqueia próxima operação com mesmas claims | PASS |
| 131 | Empresa SQL | Revogação/suspensão membership bloqueia próxima operação com mesmas claims | PASS |
| 132 | Empresa SQL | Revogação/suspensão attendant bloqueia próxima operação com mesmas claims | PASS |
| 133 | Empresa SQL | Revogação/suspensão role bloqueia próxima operação com mesmas claims | PASS |
| 134 | Empresa SQL | Revogação/suspensão organization bloqueia próxima operação com mesmas claims | PASS |
| 135 | Empresa SQL | Empresa suspensa some da FAQ pública | PASS |
| 136 | Empresa SQL | Auditoria inclui empresa e ator sem conteúdo sensível | PASS |
| 137 | Empresa SQL | Helpers privados de mutação não são executáveis | PASS |
| 138 | Empresa SQL | Todas as 16 tabelas têm RLS e FORCE RLS; nenhuma policy de escrita | PASS |
| 139 | Empresa SQL | Anon só executa a projeção pública entre as funções Empresa | PASS |
| 140 | Navegador | Empresa: salva configuração por RPC com escopo e revisão | PASS |
| 141 | Navegador | Empresa: serviço com preço a partir de usa centavos inteiros | PASS |
| 142 | Navegador | Empresa: adicional e pergunta ficam vinculados ao serviço selecionado | PASS |
| 143 | Navegador | Empresa: contradição de autonomia é rejeitada sem enviar alteração | PASS |
| 144 | Navegador | Empresa: grava limite de desconto consistente | PASS |
| 145 | Navegador | Empresa: backend rejeita publicação com seção incompleta | PASS |
| 146 | Navegador | Empresa: publica manual, ativa atendimento e cria nova versão | PASS |
| 147 | Navegador | Empresa: prontidão impede ativação antes da publicação | PASS |
| 148 | Navegador | Empresa: troca de URL não carrega empresa B | PASS |
| 149 | Navegador | Empresa: atendente não recebe controles de edição nem rascunhos | PASS |
| 150 | Navegador | Empresa: FAQ pública mostra apenas snapshot aprovado e escapa HTML | PASS |
| 151 | Navegador | Empresa: nova revisão concorrente causa conflito sem falso sucesso | PASS |
| 152 | Navegador | Empresa: layout móvel não transborda e permite navegar | PASS |
| 153 | Navegador | Visitante é enviado ao login antes da administração | PASS |
| 154 | Navegador | Login, empresa autorizada e logout | PASS |
| 155 | Navegador | Administrador empresarial não abre área global por URL | PASS |
| 156 | Navegador | Troca de organização por URL não mostra seus dados | PASS |
| 157 | Navegador | Superadmin cria empresa através do RPC autorizado | PASS |
| 158 | Navegador | Resposta de permissão negada nunca vira confirmação de sucesso | PASS |
| 159 | Navegador | Suspensão remove painel após revalidação de acesso | PASS |
| 160 | Navegador | Recuperação mantém resposta sem enumerar contas | PASS |
| 161 | Navegador | Cadastro pede confirmação e não cria permissões | PASS |
| 162 | Navegador | Senha nova exige link válido | PASS |
| 163 | Navegador | Painel funciona em tela de celular sem transbordamento | PASS |
| 164 | Navegador | Administração desktop sem erros de renderização | PASS |
| 165 | Ferramentas Fundação | Aceita configuração explícita de homologação | PASS |
| 166 | Ferramentas Fundação | Recusa configuração sem confirmação de dados fictícios | PASS |
| 167 | Ferramentas Fundação | Recusa referência e URL de projetos diferentes | PASS |
| 168 | Ferramentas Fundação | Recusa HTTP, caminho extra e domínio externo | PASS |
| 169 | Ferramentas Fundação | Recusa service role e secret key | PASS |
| 170 | Ferramentas Fundação | Recusa conta repetida e placeholders | PASS |
| 171 | Ferramentas Fundação | Recusa IDs de empresas iguais | PASS |
| 172 | Ferramentas Fundação | Não copia mensagens sensíveis para o relatório | PASS |
| 173 | Ferramentas Fundação | Sem configuração, runner encerra antes de autenticar | PASS |
| 174 | Ferramentas Fundação | Preparação fictícia e inspeção SQL funcionam sem alterar proteções | PASS |
| 175 | Ferramentas Empresa | Conversão monetária preserva centavos sem arredondamento binário | PASS |
| 176 | Ferramentas Empresa | Preço inválido não é convertido silenciosamente | PASS |
| 177 | Ferramentas Empresa | Modalidades mantêm rótulos de estimativa e consulta | PASS |
| 178 | Ferramentas Empresa | Runner externo da Empresa para antes de rede sem configuração | PASS |
| 179 | Ferramentas Empresa | Inventário SQL da Empresa é somente leitura e confere as 16 tabelas | PASS |
| 180 | Configuração segura | secret key | PASS |
| 181 | Configuração segura | service_role JWT | PASS |
| 182 | Configuração segura | privileged VITE variable | PASS |
