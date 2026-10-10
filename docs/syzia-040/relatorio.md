# SYZIA 040 — relatório técnico

**Base:** SYZIA 039 consolidado. **Data:** 26/09/2026. **Entrega:** projeto completo com migration incremental 040. Desenvolvimento e validação locais; parada para homologação manual do proprietário.

## CORRIGIDO NESTA RODADA

### Trial e apresentação dos planos

O cadastro self-service 039 exigia uma forma de pagamento simulada antes de concluir o trial. A 040 remove essa dependência da confirmação: o servidor revalida a identidade, a política de elegibilidade, a oferta e a versão, registra o consentimento 040 e concede o período configurado. O início do benefício é calculado na confirmação. A identidade e o ADM legítimo usam a infraestrutura existente, e o usuário continua no onboarding existente.

Empresa já existente confirma documento e plano na área de assinatura. A validação estrutural usa os validadores e fingerprints existentes; não afirma consulta governamental. Identificadores anteriores permanecem registrados, sem substituição. Benefício consumido é uma recusa conclusiva, não uma nova análise. Situação inconclusiva mantém o fluxo administrativo. Concessões e extensões manuais permanecem auditadas.

Os cards apresentam o período gratuito com destaque e condições secundárias. Dias, nomes, preços e limites continuam vindos dos planos. A oferta destacada é configurável e exclusiva, com confirmação de substituição. Alterar o selo não cria uma versão de plano nem muda assinatura, preço ou recursos. Hover/foco não deslocam os outros cards e respeitam redução de movimento.

### Homologação de uma versão real em empresa existente

Foi adicionada uma aplicação temporária de versão comercial, independente da assinatura. Apenas o Super Admin pode aplicar, trocar ou encerrar, com motivo, auditoria, chave de idempotência e controle de revisão. O ADM real usa sua própria conta na empresa e vê o aviso:

> PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.

A camada central de entitlement e os limites consultam a versão temporária quando há aplicação ativa. Não são criados usuário, membership, trial, assinatura, fatura ou recebimento. A retirada volta a considerar a situação comercial legítima; o histórico e os dados operacionais não são removidos. Uma assinatura que tenha expirado durante o teste não é artificialmente reativada.

Capacidades retiradas bloqueiam novas ações por RPC/RLS. A retirada de `human_support` suspende atribuições compartilhadas atingidas. Recuperar a capacidade exige revisão explícita das atribuições, sem reativação silenciosa. Edição de plano, upgrade/downgrade comercial e condições antigas continuam seguindo o versionamento da 039.

### Atendimento e continuidade operacional

A criação do cliente junto à solicitação já existia na base. Foi preservada e testada, inclusive a recorrência sem duplicação e a leitura condicionada a `clients.read`. Não foi criado cadastro paralelo.

A causa de parte das recusas de claim era a combinação de grants com a elegibilidade antiga do atendente. Agora assumir exige leitura, gestão e resposta, além de papel/vínculo/atribuição, plano, escopo, usuário e empresa válidos. A leitura autorizada permanece distinta da autorização de operar. Um colaborador só recebe atendimento com grants explícitos; o papel de atendente próprio também não contorna grants revogados. A UI desabilita ações conhecidamente negadas e informa a causa. Presença indisponível tem mensagem própria.

Pedido original, itens, quantidades, adicionais, respostas, observações, modos de preço e alertas de revisão seguem o modelo 038. As imagens da solicitação conservam o acesso autorizado existente. Original, revisão, proposta enviada e versão aceita não foram mesclados. Solicitação, cliente, oportunidade, ticket, orçamento, agenda e histórico continuam usando as mesmas entidades. Resolver ticket, aprovar proposta e agendar não representam recebimento.

### Equipe SYZIA e autonomia local

A área Equipe SYZIA reutiliza a gestão de pessoas e os protocolos de provisionamento/primeiro acesso. Inclui lista filtrada, criação, ficha, edição global, reemissão/reset, revogação de sessões, suspensão, desativação/reativação e atribuições em empresas. A edição global revoga as sessões da identidade. Atribuições A/B são independentes.

A equipe global não vira colaborador de empresa. Apenas Super Admin administra identidade e credencial global. Pessoas e acessos empresarial distingue base de papel, atendimento permitido/não permitido, escopo da empresa e acesso à revisão de grants. O ADM gerencia somente permissões/autonomia locais dentro do teto. Consultar cadastros globais não concede acesso operacional privado.

### Experiência do consumidor

Acompanhamento, conversa, proposta, agendamento e Meus pedidos no contexto da empresa recebem sua identidade **publicada**, sem usar rascunho. Foram corrigidas superfícies de acompanhamento que permaneciam brancas no tema escuro. A revisão inclui contraste dos cards, foco, telas claro/escuro e sequência móvel.

O servidor projeta se o pedido está apto a agendar. Antes da proposta aprovada, quando exigida, a UI explica o bloqueio e oculta data/consulta. Depois, distingue consulta, opções, ausência de horários e falha. Os slots e a reserva continuam calculados/validados pelo motor existente. O histórico continua legível mesmo quando um serviço antigo é desativado.

FAQ e horários se alinham pelo conteúdo, com espaçamento consistente; mobile mantém FAQ → horários → ajuda. O indicador de acordeão alterna +/−. As onze categorias solicitadas do Manual foram traduzidas na apresentação, mantendo as chaves persistidas e a busca por ambas. Também foram tratados status de solicitações e origem exibidos na Central.

## TESTADO LOCALMENTE

| Verificação | Resultado |
|---|---|
| SQL focado 040 | 35 cenários aprovados em PGlite com fixture de Auth. |
| Regressão 038 aplicada sobre 040 | 22 cenários aprovados: multisserviço, versões, agenda, relações, valores e isolamento. |
| Regressão 039 aplicada sobre 040 | 26 cenários aprovados: planos, limites, cotas humanas, direitos contratados e transições. |
| Navegador Chromium | 9 cenários aprovados usando frontend real e RPCs reais na demo descartável. |
| Build/typecheck | Aprovado. |
| Bundle | Verificação existente aprovada; marcador server-only ausente. |
| Upgrade populado | Conteúdo das 117 tabelas anteriores preservado na aplicação da 040. Os dois campos aditivos de apresentação de planos são excluídos da comparação de conteúdo antigo. |
| Integridade da base | 36 migrations anteriores e 23 arquivos da marca byte a byte preservados; nenhum arquivo anterior removido. |

**Total: 92 cenários funcionais locais aprovados.** Não é auditoria mestre nem homologação de produção. Contas, empresas, contatos e documentos dos testes são fictícios. O erro de consulta de agenda no navegador foi simulado como falha de transporte, sem alterar o comportamento do backend.

Resultados detalhados: `reports/syzia-040/sql.json`, `regression-038.json`, `regression-039.json`, `browser.json`, logs de build/bundle e `base-integrity.json`. Capturas locais de planos, equipe, consumidor claro/escuro, FAQ móvel, onboarding e Manual estão na mesma pasta.

A matriz comercial, a matriz de papéis/grants e o mapeamento dos 34 cenários do pedido estão em `docs/syzia-040/matrizes.md`. O inventário de alterações é entregue em Markdown e JSON. O ZIP contém `MANIFEST.json` com hashes de seus arquivos e passa por leitura e teste de integridade após a criação.

## PENDENTE DE HOMOLOGAÇÃO EXTERNA

- Aplicação incremental 039→040 no ambiente escolhido pelo proprietário, seguida de validação manual com suas configurações e versões reais de planos.
- Auth real, SMTP/entrega de links e códigos, transporte/armazenamento de anexos e sessões nos dispositivos usados pela equipe.
- Concorrência com conexões independentes em PostgreSQL e PostgREST reais. Conflitos de revisão, replay, exclusividade e tentativas sequenciais com revisão obsoleta foram testados; isso não substitui carga/race real. O comando nativo adicional não executou porque este container não permite o usuário de sistema exigido pelo PostgreSQL. Evidência: `native.log`.
- Cobrança/provider real e eventual contratação paga seguem a homologação separada da base 039. Nenhum cartão, pagamento real, produção ou provedor externo foi acionado. Elegibilidade ao trial não comprova contratação paga nem verificação documental governamental.

Não há nova **DECISÃO DE PRODUTO PENDENTE** criada nesta rodada. A escolha/configuração/homologação externa de cobrança continua sendo a pendência já existente. A 040 não redefine ofertas comerciais nem promete conversão automática do trial em pagamento.

## Entrega e parada

Use `docs/syzia-040/guia-upgrade.md`; aplique somente a 040 sobre a 039 quando autorizado pelo proprietário. Não há reset, deploy, publicação ou migração externa executados. Após esta entrega, o trabalho para para validação manual; nenhuma próxima rodada é iniciada automaticamente.
