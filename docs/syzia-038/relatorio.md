# SYZIA 038 — relatório técnico

Data: 25/09/2026. Base exclusiva: consolidado SYZIA 037. Rodada local concluída para homologação do proprietário. Não houve reset, deploy, acesso a banco real ou início da homologação externa completa do atendimento.

## 1. Publicação

A interface explica “Revise a prévia para publicar” e confirma “✓ Prévia revisada” para o token atual. Publicar continua bloqueado até a revisão; alterações salvas/não salvas invalidam a revisão anterior. A validação do token no banco permanece. Estado desabilitado usa cursor de impedimento, não de carregamento. Portfólio continua opcional. A prévia permite percorrer o pedido sem enviar solicitações.

## 2. Tema público

O modal usava fundo claro literal com texto do tema escuro. As superfícies de dialog, campos, adicionais, resumos, progresso, divisores, backdrop, erros e galeria agora seguem os tokens existentes. Marca fica nos controles/destaques; textos comuns são neutros. Campos receberam seletor com prioridade suficiente para não serem sobrescritos pelas regras gerais da página. Claro e escuro foram conferidos em desktop/celular, com marcas branca, quase preta e vermelha saturada. Falha de rede simulada verificou carregamento, erro e preservação do formulário; desabilitado também foi testado.

## 3. Solicitação multisserviço e preço

A página permite adicionar/remover serviços, ver “Seu pedido · N serviços” e continuar. O wizard mantém quatro etapas: Serviços, Detalhes, Seus dados e Revisão. Cada serviço conserva perguntas, respostas, detalhes, condições e adicionais próprios.

Um envio cria um consumidor por organização, uma oportunidade e **uma solicitação**, com a estimativa inicial discriminada nas estruturas já existentes. A criação é transacional e idempotente. Serviço único e solicitações antigas permanecem compatíveis.

Valores fixos conhecidos são separados de estimativas a partir de e itens sob consulta. Consulta continua nula, nunca um zero presumido. Combinações sinalizadas para revisão não apresentam total final nem liberam agendamento direto. Orçamento final só é apresentado após confirmação dos itens/valores pelas regras existentes.

## 4. Relações configuráveis

A área “Relações com outros serviços” fica no serviço existente. Permite “Já incluído”, “Incompatível” e “Requer revisão”, sempre dentro da mesma organização. Inclusão tem direção e considera cadeias de inclusão. A interface explica a cobertura/impedimento e não retira escolhas silenciosamente. Revisão permite enviar e guarda os nomes do par que gerou o alerta.

O banco rejeita autorrelação, par duplicado/contraditório, ciclos e contradição indireta com inclusão. Para redefinir, remova explicitamente a relação anterior. FKs preservam serviços referenciados; desativar mantém configuração/histórico. A publicação congela as relações com o catálogo e altera o token de revisão. Não há combos ou descontos automáticos.

## 5. Revisão empresarial e pela Central

O pedido original é imutável e aparece separadamente das propostas. O editor de orçamentos permite remover linhas, confirmar valores/duração e explicar os ajustes ao cliente. Campo vazio de preço não é convertido em zero. A proposta usa as mesmas versões/itens, preservando aprovação/recusa e versões antigas.

A Central recebe seleção original e alertas. O atendente pode selecionar as linhas propostas e usar os descontos já autorizados. Remover linhas exige também a autonomia publicada `quote_items`; consultar/atender não concede catálogo. Valores não determinísticos continuam exigindo decisão da empresa. A nova explicação integra a proposta enviada, imutável, visível ao consumidor; não é nota interna. O caminho novo da Central reconhece também a publicação da página pelo editor 031, mantendo as permissões do manual publicado.

## 6. Acompanhamento e módulos existentes

Não foi criada outra Central, conta obrigatória, senha de consumidor ou arquitetura de tokens. O acompanhamento existente mostra original, adicionais/respostas, alertas, proposta discriminada, explicação, versões e aprovação/recusa. Expiração, revogação, escopo view/manage e isolamento foram preservados/testados. Conversa continua vinculada à mesma solicitação.

Agenda calcula a duração conjunta antes de uma proposta e usa a duração da proposta aprovada depois. Aprovação não significa recebimento de pagamento. Indicadores/listagens legadas que segmentam por `service_id` mantêm o primeiro serviço como principal; os detalhes do pedido e a proposta apresentam todos os itens. Não houve reconstrução de métricas, Financeiro ou atendimento.

## 7. Mostrar/ocultar senha

Inventário: cinco campos reais — login, nova senha e confirmação no primeiro acesso/redefinição, senha e confirmação no self-service. Recuperação administrativa reaproveita a mesma tela de nova senha; não existe formulário independente de mudança no perfil nesta base.

O componente compartilhado inicia oculto, mantém o input e seu valor, preserva `current-password`/`new-password`, tem estado independente por campo, botão “Mostrar senha”/“Ocultar senha”, `aria-pressed`/`aria-controls` e suporte ao teclado. O código temporário não recebeu esse comportamento. Auth e suas regras não foram alterados. Foram verificados atributos e retenção de valor; integração com extensões comerciais de gerenciadores de senhas não foi homologada externamente.

## 8. Permissões e isolamento

Relações reutilizam `services.read`/`services.manage`, sem grant novo. A tabela tem RLS/FORCE RLS, duas FKs compostas com organização, unicidade de par, auditoria e escrita apenas por RPC autorizada. Solicitações validam cada serviço/adicional/pergunta na publicação da própria empresa.

Os wrappers de autorização existentes continuam em uso. Não foram criados memberships artificiais ou exceções cross-tenant. O contexto de propostas aplica a redação de valores existente. A seleção original em `quote_requests` não guarda centavos: valores continuam em `quote_items`, cuja RLS exige a permissão correspondente. O contexto autorizado reconstitui os preços por posição; a leitura direta da solicitação não contorna `quotes.values`.

## 9. Migration e necessidade de persistência

Arquivo novo: `202609250038_multiservice_requests.sql`. As 34 migrations anteriores foram comparadas à 037 e permanecem byte a byte. Não há backfill destrutivo.

| Persistência | Necessidade |
| --- | --- |
| `quote_requests.requested_items` | Seleção original por serviço, perguntas, detalhes, condições e posições das linhas iniciais; nulo preserva pedidos legados. |
| `quote_requests.review_alerts` | Snapshot dos pares sinalizados, preservado após mudanças de catálogo/proposta. |
| `quote_versions.customer_explanation` | Explicação pública imutável da proposta e seus ajustes; padrão vazio preserva versões anteriores. |
| `service_relations` | Configuração empresarial que não existia no catálogo; não é outro modelo de pedido. |
| Índice único de par + índice de destino | Rejeitar duplicidade/contradição do par e apoiar integridade/consultas dentro do tenant. |

A criação multisserviço reaproveita o engine existente de consentimento, limites, idempotência, cliente, oportunidade e solicitação. Cálculo por item usa `consumer_selection`; submit, aprovação e agenda passam pelo cálculo da mesma solicitação. Engines privados permanecem sem execução para clientes. Propostas usam `quote_versions`/`quote_items`, sem schema paralelo.

## 10. Validação executada

**36 casos automatizados aprovados**, sem repetir auditoria mestre:

| Grupo | Resultado e cobertura |
| --- | --- |
| SQL/PGlite | 22 cenários: upgrade populado 037→038, histórico/tokens/idempotência legados, singular/múltiplos, preços, adicionais/respostas, relações, auditoria, desativação, RLS/grants, Central, explicação, aprovação/recusa, agenda, conversa e isolamento A/B. |
| Cálculos/tokens | 4 testes: distinção de preços, inclusão direcional/transitiva, adicionais por item e contraste em cores extremas nos dois temas. |
| Navegador/Chromium | 10 cenários: publicação desktop/mobile, senhas e teclado, ativação/redefinição, 12 combinações de tema/viewport/cor com quatro etapas cada, galeria pública, falha de rede/carregamento e fluxo completo de pedido/revisão/recusa/aprovação. |
| Typecheck + build | Aprovados. |
| Inspeção do bundle | Aprovada: marcador fictício e variável server-only ausentes dos arquivos do navegador. |

Os testes de prévia também percorreram as quatro etapas em desktop/celular com envio bloqueado. Telas e medições estão em `reports/syzia-038/`. O upgrade foi aplicado sobre dados anteriores contendo solicitação, orçamento enviado, token e ticket, sem limpar/resetar a base.

Durante a execução foram corrigidos: prioridade do CSS dos campos sobre os tokens gerais; fixture de manual/autonomia que precisava reativar o atendimento após alterações operacionais; expectativas de texto/seletores e uso da revisão pela própria RPC no teste de permissão restrita. As execuções finais estão aprovadas. Não foram alteradas proteções para obter esse resultado.

Comandos: `npm run test:038`, `npm run test:038:browser`, `npm run build`. Evidências: `sql.json`, `pricing-run.log`, `browser.json`, quatro arquivos `temas-*.json`, capturas, `production-build.txt`, `production-bundle-scan.json` e `release-inventory.json`.

## 11. Preservação

O pacote é cumulativo: código, migrations desde a primeira, lockfile, assets/marca, scripts, testes, fixtures e documentação histórica. Não houve alteração dos arquivos existentes de servidor, da marca aprovada ou dos relatórios históricos. Dependências não mudaram. As regras 036 e a reapresentação de credenciais 037 permanecem.

A inspeção de preservação compara os arquivos da 037 por SHA-256. O empacotamento verifica CRC e hashes de todos os arquivos do manifesto. O arquivo salvo é novamente conferido antes da entrega, para evitar repetir uma entrega vazia/incompleta.

## 12. Limites e parada

- Validação local com SQL em PGlite e Auth/provider/mídia de demonstração. Não equivale a homologação de Supabase, PostgREST, SMTP, Storage ou provedores reais.
- PostgreSQL nativo e concorrência real não foram executados nesta rodada. O lock transacional e mecanismos existentes foram preservados.
- Até 10 serviços e 30 linhas incluindo adicionais; o limite existente de 10 adicionais por serviço permanece.
- Relações/catálogo só passam à página pública após publicação. Quem usa atendimento humano deve manter manual/autonomia revisados e ativação conforme a configuração existente.
- Não foram implementados combos, descontos automáticos, pagamentos reais, nova Central ou novos tokens.

**Entregar e parar para homologação do proprietário.** Nenhuma nova fase, publicação ou homologação completa de atendimento foi iniciada automaticamente.
