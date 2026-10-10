# Matriz de testes — Fase 4 e regressões

**270 casos aprovados LOCALMENTE. Homologação externa PENDENTE.** SQL usa PGlite com Auth em fixture; navegador usa respostas de teste; HTTP de demo usa Auth/Storage simulados. Não representam Supabase real. Não há cobrança real.

## Requisitos críticos e alcance

| Requisito | Verificação local | Limite externo |
|---|---|---|
| Empresa A/B; consumidor A/B; telefone igual; UUID/URL trocado | PASS: RLS, RPCs e interface | Repetir PostgREST/JWTs reais |
| Preço adulterado; adicionais cruzados; versão antiga/expirada | PASS: rejeição no banco | Repetir HTTP real |
| Aprovação, recusa e envio duplicados | PASS: um efeito/idempotência | Repetir concorrência real |
| Capacidade um | PASS: exclusão GiST e duas tentativas locais | Conexões independentes PENDENTES |
| Remarcação malsucedida | PASS: rollback preserva reserva | Repetir duas conexões reais |
| Serviço desativado, empresa suspensa, revogação em sessão existente | PASS: autorização atual com claims locais | Auth/JWT real PENDENTE |
| Anexo inválido, arquivo de terceiro, ticket reutilizado | PASS: sanitização real + SQL/HTTP local | Storage/tickets reais PENDENTES |
| Conteúdo interno, tags/notas/origem/financeiro não aparecem publicamente | PASS: projeção e publicação explícitas | Repetir com dados fictícios no ambiente real |
| Permissões alteradas diretamente | PASS: escrita direta/elevação negadas | Repetir REST real |
| Arquivo privado não vira público por ID; branding não executável | PASS: buckets lógicos e validações/snapshots | Buckets/policies reais PENDENTES |
| Sinal fixo/percentual, versão/valor/organização corretos | PASS: cálculo, FKs e CHECKs | Repetir preparação no banco real, sem cobranças |
| Confirmação manual distinta de provedor; consumidor não marca pago | PASS: constraints/negação; dados financeiros via fixture privilegiada | Não há função financeira operacional nesta fase |
| Ausência de chave privilegiada frontend | PASS: config, inspeção de código e bundle com marcador fictício | Revisar variáveis do futuro ambiente |
| Mobile/tablet/desktop | PASS e inspeção visual das capturas | Aparelhos físicos/Safari/rede real pendentes |

## Casos individuais

### Fundação SQL

Evidência: `reports/security-results.json`.

| Caso | Resultado local |
|---|---|
| Empresa A vê somente A | PASS |
| Empresa B vê somente B | PASS |
| Alterar UUID de organização não expõe B | PASS |
| Empresa A não lê membros de B | PASS |
| Empresa A não lê perfil do administrador B | PASS |
| Empresa A não lê vínculos de B | PASS |
| Empresa A não lê auditoria de B nem global | PASS |
| Atendente acessa somente empresa vinculada | PASS |
| Atendente sem vínculo não acessa empresa | PASS |
| Colaborador acessa sua organização | PASS |
| Colaborador não consulta demais membros | PASS |
| Colaborador não consulta auditoria | PASS |
| Superadmin consulta organizações e auditoria global | PASS |
| Visitante anon não lê dados | PASS |
| Visitante anon não executa comandos | PASS |
| JWT ausente não libera dados nem comando | PASS |
| Sessão anônima não se torna funcionário por metadata | PASS |
| Flag anônima no JWT bloqueia até identidade permanente | PASS |
| Conta sem email confirmado não recebe privilégio | PASS |
| Metadata de superadmin não concede papel | PASS |
| Usuário não insere papel diretamente | PASS |
| Usuário não altera status diretamente | PASS |
| Administrador da empresa não se promove | PASS |
| Administrador da empresa não cria organizações | PASS |
| Empresa A não adiciona membro a B | PASS |
| Empresa A não altera organização B via RPC | PASS |
| Colaborador não altera membros | PASS |
| Atendente não gerencia membros | PASS |
| Empresa não concede vínculo de atendente | PASS |
| Admin da empresa adiciona colaborador elegível | PASS |
| Admin da empresa renomeia sua empresa | PASS |
| Empresa não suspende conta organizacional | PASS |
| Usuário edita somente seu nome via RPC | PASS |
| Validação de nome vazia | PASS |
| Autoalteração de vínculo bloqueada | PASS |
| Último administrador empresarial preservado | PASS |
| Superadmin não remove seu próprio papel | PASS |
| Superadmin não suspende a si mesmo | PASS |
| Superadmin pode revogar outro admin; token antigo perde autoridade | PASS |
| Usuário suspenso não lê nem escreve | PASS |
| Suspensão de perfil revoga acesso com mesmo sub/JWT | PASS |
| Banimento do Auth também bloqueia usuário | PASS |
| Suspensão da organização revoga acesso do membro | PASS |
| Suspensão do membro revoga acesso imediatamente | PASS |
| Suspensão do vínculo revoga acesso da atendente | PASS |
| Revogação global de atendente desativa vínculos antigos | PASS |
| Não pode vincular pessoa sem papel atendente | PASS |
| Não concede papel a sessão anônima | PASS |
| Não adiciona membro sem email verificado | PASS |
| Não ativa membro suspenso | PASS |
| Não existem dois principais ativos na mesma empresa | PASS |
| Não cria vínculo com organização inexistente | PASS |
| Slug duplicado rejeitado e criação atômica | PASS |
| Slug reservado rejeitado | PASS |
| Auditoria registra ator, empresa e campos alterados | PASS |
| Auditoria não armazena nome privado em payload | PASS |
| Cliente autenticado não insere auditoria falsa | PASS |
| Não pode editar, apagar ou truncar auditoria | PASS |
| Trigger bloqueia edição de auditoria até em sessão proprietária | PASS |
| RLS impede escrita mesmo com GRANT adicionado por engano | PASS |
| RLS oculta atualização cruzada mesmo com GRANT acidental | PASS |
| Todas as tabelas das fases 2 e 3 têm RLS e FORCE RLS | PASS |
| Todas as policies são SELECT e destinadas a authenticated | PASS |
| Nenhuma função SECURITY DEFINER usa search_path mutável | PASS |
| Helpers de mutação não podem ser invocados pelo cliente | PASS |
| Anon não executa nenhum RPC da Fundação | PASS |
| Contexto empresarial só retorna organização autorizada | PASS |
| Trigger de identidade ignora metadata privilegiada | PASS |

### Empresa SQL

Evidência: `reports/company-security-results.json`.

| Caso | Resultado local |
|---|---|
| RLS: A não lê B em company_settings | PASS |
| Escrita direta negada em company_settings | PASS |
| RLS: A não lê B em services | PASS |
| Escrita direta negada em services | PASS |
| RLS: A não lê B em service_addons | PASS |
| Escrita direta negada em service_addons | PASS |
| RLS: A não lê B em service_intake_fields | PASS |
| Escrita direta negada em service_intake_fields | PASS |
| RLS: A não lê B em manual_versions | PASS |
| Escrita direta negada em manual_versions | PASS |
| RLS: A não lê B em manual_sections | PASS |
| Escrita direta negada em manual_sections | PASS |
| RLS: A não lê B em faqs | PASS |
| Escrita direta negada em faqs | PASS |
| RLS: A não lê B em quick_replies | PASS |
| Escrita direta negada em quick_replies | PASS |
| RLS: A não lê B em business_rules | PASS |
| Escrita direta negada em business_rules | PASS |
| RLS: A não lê B em attendant_permissions | PASS |
| Escrita direta negada em attendant_permissions | PASS |
| Isolamento simétrico B → A | PASS |
| Perfil worker não altera autonomia por RPC | PASS |
| Perfil attendant não altera autonomia por RPC | PASS |
| Perfil unlinked não altera autonomia por RPC | PASS |
| Perfil anonymous não altera autonomia por RPC | PASS |
| Perfil unconfirmed não altera autonomia por RPC | PASS |
| Admin A não altera configuração nem publica B | PASS |
| JWT editável não concede administração | PASS |
| Atendente sem vínculo não lê contexto nem prontidão | PASS |
| Atendente vinculado não vê rascunho, FAQ nem respostas não publicadas | PASS |
| Campos de permissão/identidade injetados são rejeitados | PASS |
| Escrita direta segue bloqueada mesmo com GRANT acidental | PASS |
| FK composta rejeita adicional e pergunta com serviço de B | PASS |
| ID de FAQ de outra empresa não pode ser editado | PASS |
| Modalidades fixo, a partir de e sob consulta persistem corretamente | PASS |
| Constraint rejeita preço negativo | PASS |
| Constraint rejeita preço fracionário | PASS |
| Constraint rejeita fixo sem preço | PASS |
| Constraint rejeita consulta com preço | PASS |
| Constraint rejeita agendamento direto sem duração | PASS |
| Constraint rejeita agendamento direto a partir de | PASS |
| Constraint rejeita imagem com protocolo inseguro | PASS |
| Perguntas exigem opções válidas e distintas | PASS |
| Horários rejeitam inversão, duplicidade e valor inválido | PASS |
| Nunca alterar preço bloqueia desconto e negociação | PASS |
| Permissões desconhecidas e desconto sem permissão são rejeitados | PASS |
| Revisão obsoleta não sobrescreve edição já salva | PASS |
| Revisão obrigatória impede bypass por null | PASS |
| Manual incompleto bloqueia publicação e ativação | PASS |
| Checklist não é um booleano editável pelo cliente | PASS |
| Publicação completa registra versão, ator e snapshot | PASS |
| Manual e seções publicados são imutáveis também sob proprietário SQL | PASS |
| Nova versão clona manual e mantém snapshot anterior | PASS |
| Só um rascunho por empresa; descarte não altera publicados | PASS |
| FAQ pública exige opt-in e não expõe conteúdo privado | PASS |
| Edição de FAQ não muda snapshot público até nova publicação | PASS |
| Retirada da FAQ corta próxima consulta anônima | PASS |
| FAQ publicada funciona sem atendente principal; humano é bloqueado | PASS |
| Autonomia efetiva exige publicação, ativação, papel e vínculo | PASS |
| Desconto máximo é conferido no banco | PASS |
| Redução de autonomia invalida prontidão e bloqueia sessão já existente | PASS |
| Revogação/suspensão profile bloqueia próxima operação com mesmas claims | PASS |
| Revogação/suspensão membership bloqueia próxima operação com mesmas claims | PASS |
| Revogação/suspensão attendant bloqueia próxima operação com mesmas claims | PASS |
| Revogação/suspensão role bloqueia próxima operação com mesmas claims | PASS |
| Revogação/suspensão organization bloqueia próxima operação com mesmas claims | PASS |
| Empresa suspensa some da FAQ pública | PASS |
| Auditoria inclui empresa e ator sem conteúdo sensível | PASS |
| Helpers privados de mutação não são executáveis | PASS |
| Todas as 41 tabelas têm RLS e FORCE RLS; nenhuma policy de escrita | PASS |
| Anon só executa a projeção pública entre as funções Empresa | PASS |

### Consumidor SQL

Evidência: `reports/consumer-results.json`.

| Caso | Resultado local |
|---|---|
| Página sem login expõe apenas campos públicos, sem UUIDs nem conteúdo interno | PASS |
| Empresa B publica somente seus próprios dados | PASS |
| Anon sem sessão não cria solicitação | PASS |
| Sessão anônima do consumidor continua impedida de acessar Fundação | PASS |
| Criação, revisão congelada e envio funcionam com identidade técnica | PASS |
| Mesmo telefone não permite acessar outro consumidor por código ou UUID | PASS |
| Mesmo telefone em empresas distintas não compartilha cadastro | PASS |
| Admin A não consulta solicitação da empresa B | PASS |
| Preço manipulado e adicional de outra empresa são rejeitados | PASS |
| Cálculo inclui adicionais e duração no banco | PASS |
| A partir de é estimativa; sob consulta não inventa valor | PASS |
| Resposta obrigatória e versão de aviso ausente são rejeitadas | PASS |
| Consentimento operacional não implica contato ou marketing; contato revogável | PASS |
| Criação repetida é idempotente e chave com payload alterado é rejeitada | PASS |
| Rascunho de preço não muda publicação; nova publicação exige revisão atual | PASS |
| Serviço desativado durante preenchimento não pode ser contratado | PASS |
| Orçamento final enviado é imutável inclusive para escrita privilegiada acidental | PASS |
| Versão antiga não é aprovada; atual aprova uma única vez | PASS |
| Proposta expirada não é aprovada | PASS |
| Colaborador e consumidor não alteram permissões nem enviam proposta | PASS |
| Agenda respeita horários, antecedência e duração adicional | PASS |
| Duas tentativas locais para mesmo horário não obtêm duas reservas | PASS |
| Constraint de exclusão impede sobreposição mesmo sem RPC | PASS |
| Remarcação malsucedida preserva reserva original | PASS |
| Agendamento repetido é idempotente; cancelamento libera capacidade | PASS |
| Bloqueio usa a mesma exclusão de capacidade e pode ser removido | PASS |
| Link forte guarda somente hash e permite apenas a solicitação vinculada | PASS |
| Link revogado e expirado nega acesso em sessão já existente | PASS |
| Tipos e limites de anexo validados também no banco | PASS |
| Consumidor não finaliza upload sem gateway nem lê anexo de outro | PASS |
| Envio não aceita anexos ainda não validados | PASS |
| Empresa suspensa interrompe operação pública e acesso privado existente | PASS |
| Suspensão de perfil e revogação de membro têm efeito sem renovar sessão | PASS |
| Todas as tabelas preservam FORCE RLS e nenhuma escrita direta do consumidor | PASS |
| Auditoria registra operações sem dados pessoais nem segredos | PASS |

### Presença e pagamentos em preparação

Evidência: `reports/presence-payments-results.json`.

| Caso | Resultado local |
|---|---|
| Personalização controlada recusa CSS/HTML/JS e cor fora da paleta | PASS |
| Empresa A não altera identidade nem portfólio de B | PASS |
| Logo empresarial permanece privada até publicação explícita | PASS |
| Troca de ID não transforma anexo privado em mídia pública | PASS |
| Portfólio não aceita mídia de outra empresa; antes/depois exige duas | PASS |
| Portfólio aprovado congela imagens/texto; alterações em rascunho não vazam | PASS |
| Suspensão da empresa revoga novas leituras de imagem pública | PASS |
| Consumidor não lê mídia empresarial em rascunho nem RPC do gateway | PASS |
| Recorrência recupera somente cadastro da própria sessão e empresa | PASS |
| Origem é interna, idempotente no envio e não editável por terceiro | PASS |
| Tags e notas internas não aparecem no consumidor, publicação ou empresa B | PASS |
| Indicação é relação básica intramuros sem recompensas; recusa autoindicação | PASS |
| Timeline contém somente eventos reais e não de outro consumidor | PASS |
| Recusa é idempotente, preserva versão e aceita somente proposta atual válida | PASS |
| Empresa A não lê nem altera preparação financeira de B | PASS |
| Sinal percentual e fixo calculados no banco respeitam regra do serviço | PASS |
| Valor manipulado e sinal acima do orçamento são rejeitados | PASS |
| Pagamento opcional não bloqueia agenda; estados permanecem distintos | PASS |
| Planos sem antecipação têm valor zero e não criam cobrança | PASS |
| Opção integrada exige opt-in e continua sem gateway ativado | PASS |
| Versão errada não vincula plano; versão congelada é preservada | PASS |
| Consumidor A não acessa registros financeiros de B | PASS |
| Registro financeiro não pode usar organização, cliente, versão ou valor de outro plano | PASS |
| Pagamento externo manual nunca pode ser marcado como automático | PASS |
| Preparação financeira interna nunca aparece na projeção pública | PASS |
| Schema não contém PAN/CVV/carteira/saldo e preserva FORCE RLS | PASS |
| Plano financeiro é idempotente e hash rejeita payload alterado | PASS |
| CHECKs financeiros não aceitam nulos como confirmação ou tipo de sinal | PASS |

### Configuração segura

Evidência: `reports/config-security-results.json`.

| Caso | Resultado local |
|---|---|
| secret key | PASS |
| service_role JWT | PASS |
| privileged VITE variable | PASS |

### Integração HTTP fictícia

Evidência: `reports/demo-http-results.json`.

| Caso | Resultado local |
|---|---|
| Upload, download, isolamento, ticket único e envio com anexo | PASS |

### Ferramentas Fundação

Evidência: `reports/homologation-tooling.tap`.

| Caso | Resultado local |
|---|---|
| Aceita configuração explícita de homologação | PASS |
| Recusa configuração sem confirmação de dados fictícios | PASS |
| Recusa referência e URL de projetos diferentes | PASS |
| Recusa HTTP, caminho extra e domínio externo | PASS |
| Recusa service role e secret key | PASS |
| Recusa conta repetida e placeholders | PASS |
| Recusa IDs de empresas iguais | PASS |
| Não copia mensagens sensíveis para o relatório | PASS |
| Sem configuração, runner encerra antes de autenticar | PASS |
| Preparação fictícia e inspeção SQL funcionam sem alterar proteções | PASS |

### Ferramentas Empresa

Evidência: `reports/company-tooling.tap`.

| Caso | Resultado local |
|---|---|
| Conversão monetária preserva centavos sem arredondamento binário | PASS |
| Preço inválido não é convertido silenciosamente | PASS |
| Modalidades mantêm rótulos de estimativa e consulta | PASS |
| Runner externo da Empresa para antes de rede sem configuração | PASS |
| Inventário SQL da Empresa é somente leitura e confere as 16 tabelas | PASS |

### Ferramentas Consumidor

Evidência: `reports/consumer-tooling.tap`.

| Caso | Resultado local |
|---|---|
| Configuração exige projeto dedicado e ausência de clientes reais | PASS |
| Configuração rejeita service role, tokens repetidos e token expirado | PASS |
| Configuração aceita apenas slugs fictícios distintos | PASS |
| Ferramentas externas recusam ausência de configuração sem conectar | PASS |
| Scripts Node do gateway e homologação têm sintaxe válida | PASS |
| Storage permanece privado e nenhum client recebe escrita no bucket | PASS |
| Nenhuma chave privilegiada é lida pelo código frontend | PASS |

### Imagens

Evidência: `reports/phase-4-local-validation.txt`.

| Caso | Resultado local |
|---|---|
| Decodifica e regrava jpeg sem metadados | PASS |
| Decodifica e regrava png sem metadados | PASS |
| Decodifica e regrava webp sem metadados | PASS |
| SVG renomeado .jpeg é rejeitado | PASS |
| MIME adulterado é rejeitado | PASS |
| Assinatura válida com corpo truncado é rejeitada | PASS |
| Arquivo acima de 5 MB é rejeitado | PASS |
| Dimensão excessiva é rejeitada antes do processamento final | PASS |
| Bomba acima de 20 milhões de pixels é rejeitada | PASS |

### Navegador Chromium

Evidência: `reports/browser-results.json`.

| Caso | Resultado local |
|---|---|
| Empresa: salva configuração por RPC com escopo e revisão | PASS |
| Empresa: serviço com preço a partir de usa centavos inteiros | PASS |
| Empresa: adicional e pergunta ficam vinculados ao serviço selecionado | PASS |
| Empresa: contradição de autonomia é rejeitada sem enviar alteração | PASS |
| Empresa: grava limite de desconto consistente | PASS |
| Empresa: backend rejeita publicação com seção incompleta | PASS |
| Empresa: publica manual, ativa atendimento e cria nova versão | PASS |
| Empresa: prontidão impede ativação antes da publicação | PASS |
| Empresa: troca de URL não carrega empresa B | PASS |
| Empresa: atendente não recebe controles de edição nem rascunhos | PASS |
| Empresa: FAQ pública mostra apenas snapshot aprovado e escapa HTML | PASS |
| Empresa: nova revisão concorrente causa conflito sem falso sucesso | PASS |
| Empresa: layout móvel não transborda e permite navegar | PASS |
| Fase 4 ampliada: portfólio publicado e recusa de proposta | PASS |
| Fase 4 ampliada: admin configura rascunho visual e preparação financeira | PASS |
| Publicação mobile, tablet e desktop sem conteúdo privado ou overflow | PASS |
| Filtro de categoria, FAQ e ajuda funcionam sem sessão | PASS |
| Fluxo completo: identificação, revisão, envio e agenda | PASS |
| Proposta enviada pelo admin é revisada e aprovada pelo consumidor | PASS |
| Trocar URL não concede acesso a pedido; página suspensa indisponível | PASS |
| Falha de rede no envio mantém os dados preenchidos | PASS |
| Visitante é enviado ao login antes da administração | PASS |
| Login, empresa autorizada e logout | PASS |
| Administrador empresarial não abre área global por URL | PASS |
| Troca de organização por URL não mostra seus dados | PASS |
| Superadmin cria empresa através do RPC autorizado | PASS |
| Resposta de permissão negada nunca vira confirmação de sucesso | PASS |
| Suspensão remove painel após revalidação de acesso | PASS |
| Recuperação mantém resposta sem enumerar contas | PASS |
| Cadastro pede confirmação e não cria permissões | PASS |
| Senha nova exige link válido | PASS |
| Painel funciona em tela de celular sem transbordamento | PASS |
| Administração desktop sem erros de renderização | PASS |
