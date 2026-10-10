# SYZIA 042 — cobertura e resultados

Os **62 requisitos** abaixo estão relacionados aos **124 casos aprovados**: 47 SQL focados, 35 regressões 040, 35 regressões 041 e 7 testes de navegador. Um caso pode atender mais de um requisito; a tabela não soma requisitos como se fossem testes adicionais.

S = número do teste SQL 042; B = teste de navegador 042; R040/R041 = casos das suítes anteriores reaplicadas sobre a 042. A 040 possui quatro variações do caso 09; por isso são 35 resultados, embora a numeração nominal termine em 32.

Toda marcação abaixo significa validação **local**. A API/gateway real, PostgreSQL nativo e concorrência independente permanecem pendentes; os casos SQL usam PGlite e fixtures de claims/Auth. Erros/estados vazios interceptados são identificados explicitamente.

| Item exigido | Verificação | Evidência local aprovada |
|---:|---|---|
| 1 | ADM vê Equipe SYZIA separada | S02; B03 |
| 2 | ADM não vê/usa gerar código global | S03–04; B03; R040-32 |
| 3 | ADM não edita username/e-mail/papel global | S03–05; B03 |
| 4 | ADM não desativa conta global | S03; B03; R040-21–22 |
| 5 | Tentativa direta RPC/API negada | S03–05,43; gateway representado por chamada SQL com ator e papel privilegiado |
| 6 | Super Admin preserva administração global | S06; R040-21–22,32 |
| 7 | Alteração local em A não altera B | S07; R040-23–24 |
| 8 | Funcionário próprio mantém fluxo | S06; B03; R040-19 |
| 9 | Autonomia SIM + grant SIM | S08 |
| 10 | Autonomia SIM + grant NÃO | S09 |
| 11 | Autonomia NÃO + grant SIM | S10–11 |
| 12 | Capacidade ausente | S12; matrizes e downgrade R040 |
| 13 | Revogação durante sessão | S10,13; R040-13,26; R041-09 |
| 14 | Preço tabelado | S08; R041-02–03 |
| 15 | Faixa previamente publicada | S14 |
| 16 | Desconto dentro/fora do teto | S15; R041-21–22,32 |
| 17 | Compartilhado tenta preço variável | S16; R041-06–07 |
| 18 | Encaixe sem/com autorização e capacidade | S17 (predicado); S27–29,39,43–44 (reserva/capacidade) |
| 19 | Home: carga normal | S18; B01 |
| 20 | Home: falha isolada de bloco | S18; B02 (interceptação controlada) |
| 21 | Home: autorização versus rede | B02 (interceptação controlada) |
| 22 | Home: Agenda de hoje | B01; S18 |
| 23 | Home: próximo atendimento | B01 |
| 24 | Home: atenção acionável | S19–20; B01,06–07 |
| 25 | Home: proposta aprovada sem agenda | S20; B06 |
| 26 | Home: amanhã | B01 |
| 27 | Home: ações rápidas | B01 |
| 28 | Home: estados vazios | B07 (interceptação controlada de seção vazia) |
| 29 | Links abrem objeto correto | S19; B01,03,06–07 |
| 30 | CTA de proposta explica bloqueio | B06 |
| 31 | Explicação obrigatória quando aplicável | S23–24; B06 |
| 32 | Caso simples sem burocracia | S22 |
| 33 | Prévia e versionamento preservados | B06; R041-23–24 |
| 34 | Duração exibida | B04–06 |
| 35 | Dia ocupado | S39; R041-12 |
| 36 | Serviço não cabe no expediente | S25; B04,06 |
| 37 | Próximos horários compatíveis | S39; B04 |
| 38 | Texto antes/depois da aprovação | B06; S40–41 |
| 39 | Horário pretendido preservado | S40–41; B06; R041-10–13 |
| 40 | Contínuo não é dividido | S25,38; B04 |
| 41 | Divisível gera combinação automática | S26,37; B05 |
| 42 | Combinação respeita bloqueio/capacidade | S27,29,39,44 |
| 43 | Reserva atômica de todas as partes | S28,47; B05 |
| 44 | Conflito impede confirmação parcial | S29,34,44,47; não equivale a concorrência externa |
| 45 | Consumidor vê períodos agrupados | S30; B05 |
| 46 | Agenda mostra períodos vinculados | S31; B05 |
| 47 | Remarcação de um período | S32; R041-27 conserva remarcação contínua |
| 48 | Replanejamento integral | S33–34; B05 verifica entrada no fluxo |
| 49 | Cancelamento integral | S35–36; B05 |
| 50 | Histórico | S31–36; B05; R041-27 |
| 51 | Multissserviço distribuível | S38 |
| 52 | Multissserviço com item contínuo | S38 |
| 53 | Fluxos A/B/C da 041 | R041-02–19,28–35 |
| 54 | Isolamento A/B | S07,21,30,43; R041-25; R040-23 |
| 55 | RLS/grants | S09–13,21,43; R041-06,09,25,31; R040 matrizes |
| 56 | Proposta/aprovação | S22–24,40–41,45; B06; R041-08–13,20–24 |
| 57 | Agenda direta | S25–39; B05; R041-02–03,14 |
| 58 | Agenda de avaliação | S40–41,45; B06; R041-04–13 |
| 59 | Claro/escuro | B04 claro; B05 escuro; não é auditoria de todos os módulos |
| 60 | Desktop/mobile | B01 desktop/mobile; B05 mobile e ficha desktop |
| 61 | Build/typecheck | npm run build e npm run check:bundle — PASS |
| 62 | Upgrade 041→042 em banco populado | S01: 119 tabelas; base-integrity.json: migrations/marca byte idênticas |

## Casos adicionais relevantes

S46 verifica conclusão após a última parte, métricas e valor realizado sem duplicar contratação nem pagamento recebido. S47 injeta erro de gravação no segundo appointment e confirma rollback do primeiro e da submissão. S37 confere limite de períodos; S44 rejeita adulteração de plano/duração.

## Adaptação de regressão

`scripts/syzia-042/regression.mjs` aplica as migrations posteriores antes de rodar os casos originais. As comparações de upgrade descartam somente campos novos da comparação com colunas antigas. Uma expectativa 040 de negação também aceita a causa específica `shared_identity_requires_superadmin`, mantendo a exigência de bloqueio. As suítes originais foram preservadas.

## Resultado por caso

### SQL 042

| Caso | Resultado |
|---|---|
| 01 Upgrade populado 041→042 preserva linhas e colunas anteriores | PASS |
| 02 Identidade compartilhada com membership legado sai de accounts/legacy e não vaza credenciais | PASS |
| 03 ADM não edita/desativa acesso compartilhado por RPC | PASS |
| 04 Gateway service_role recusa reset e reemissão pelo ADM | PASS |
| 05 Vínculo empresarial não permite mudar papel global ou cadastro legado | PASS |
| 06 Super Admin preserva administração global e funcionário próprio mantém edição | PASS |
| 07 Permissões da Empresa A não alteram B | PASS |
| 08 Autonomia SIM + grants SIM permite preço fixo e agendar | PASS |
| 09 Autonomia SIM sem grant bloqueia | PASS |
| 10 Revogar autonomia bloqueia antes de nova publicação | PASS |
| 11 Autonomia ainda não publicada não amplia poderes | PASS |
| 12 Plano sem atendimento compartilhado bloqueia apesar de legado empresarial | PASS |
| 13 Vínculo revogado em sessão aberta não volta ao membership legado | PASS |
| 14 Faixa não é inferida de a partir de; faixa explícita publicada é permitida | PASS |
| 15 Desconto explícito dentro e fora do teto publicado/atual | PASS |
| 16 Compartilhado não usa calculadora variável mesmo com grants | PASS |
| 17 Encaixe e condições publicados continuam sujeitos a grants e capacidade | PASS |
| 18 Home é VOLATILE, carregamento normal e seções independentes | PASS |
| 19 Home mostra solicitação real e link para pedido | PASS |
| 20 Home mostra proposta aprovada aguardando agenda, preservando aprovação | PASS |
| 21 Home respeita isolamento e não expõe agenda sem grant | PASS |
| 22 Proposta fixa sem mudança aceita explicação vazia | PASS |
| 23 Mudança de preço exige explicação server-side | PASS |
| 24 Desconto, item extra e condição explícita exigem explicação | PASS |
| 25 Serviço contínuo de 10h não é dividido e informa does_not_fit | PASS |
| 26 Divisível de 10h gera combinação automática de 2 dias | PASS |
| 27 Combinação respeita bloqueios e buffer por período | PASS |
| 28 Todos os períodos reservados uma vez, um pedido e um cliente | PASS |
| 29 Conflito no segundo período recusa plano obsoleto sem reserva parcial | PASS |
| 30 Consumidor vê partes agrupadas e apenas o próprio pedido | PASS |
| 31 Agenda empresarial e ficha mostram períodos vinculados e histórico | PASS |
| 32 Remarcar um período preserva outro e duração | PASS |
| 33 Replanejamento integral substitui períodos juntos sem apagar histórico | PASS |
| 34 Conflito ao replanejar preserva todos os períodos anteriores | PASS |
| 35 Cancelamento integral não deixa órfãos | PASS |
| 36 Cancelamento empresarial integral mantém histórico de cada parte | PASS |
| 37 Máximo de períodos é respeitado sem plano parcial | PASS |
| 38 Multisserviço divisível distribui duração; item contínuo impede divisão | PASS |
| 39 Busca próximos horários compatíveis evita dia ocupado | PASS |
| 40 Proposta aprovada mantém horário desejado e congela modo de execução | PASS |
| 41 Aprovação não reserva combinação diferente da apresentada | PASS |
| 42 Concluir parte não conclui atendimento nem duplica valor realizado | PASS |
| 43 RPCs e RLS negam cross-tenant e helpers privados permanecem fechados | PASS |
| 44 Duração/partes adulteradas não reservam nem mudam total | PASS |
| 45 UI empresarial agenda pedido aprovado pelo mesmo contexto comercial | PASS |
| 46 Métricas e valor realizado contam uma contratação somente após a última parte | PASS |
| 47 Falha injetada na segunda gravação reverte primeira parte e submissão | PASS |

### Regressão 040

| Caso | Resultado |
|---|---|
| 01 Upgrade 039→040 preserva todas as linhas anteriores em banco populado | PASS |
| 02 Trial novo automático: 7 dias configurados, consentimento, sem pagamento, onboarding existente e idempotência | PASS |
| 03 Trial consumido por mesma identidade/documento não gera novo trial nem análise | PASS |
| 04 Fallback inconclusivo respeita política manual, sem ativar trial | PASS |
| 05 Empresa existente confirma documento e ativa trial automaticamente sem fatura | PASS |
| 06 Trial configurado usa duração efetiva sem nome nem preço hardcoded | PASS |
| 07 Homologação aplica, troca e remove sem tocar assinatura, trial, pagamento ou dados operacionais | PASS |
| 08 Homologação é exclusiva SuperAdmin, auditada, com concorrência e replay | PASS |
| 09 Matriz Essencial: capabilities por RPC/RLS e limites reais | PASS |
| 09 Matriz Profissional: capabilities por RPC/RLS e limites reais | PASS |
| 09 Matriz Equipe: capabilities por RPC/RLS e limites reais | PASS |
| 09 Matriz Assistido: capabilities por RPC/RLS e limites reais | PASS |
| 10 Limite de membro real bloqueia inclusão sem apagar membros no downgrade | PASS |
| 11 Destaque troca exclusivamente a apresentação, sem nova versão/capacidade/preço | PASS |
| 12 Sem grant colaborador não assume; grant explícito permite fila geral→Minha fila | PASS |
| 13 Revogação de grant em sessão aberta impede próxima resposta | PASS |
| 14 Presença ausente retorna causa específica sem falso unauthorized | PASS |
| 15 Upgrade/downgrade e human_support revogam compartilhado sem apagar operação | PASS |
| 16 Identidade publicada acompanha contexto seguro sem expor rascunho ou outro tenant | PASS |
| 17 Agenda pendente de proposta, aprovada libera, erro e dia sem horários distinguíveis por RPC | PASS |
| 18 Engines, tabelas de homologação e edição global não são acessíveis diretamente | PASS |
| 19 Atendente próprio: papel explícito e grants permitem assumir sem human_support | PASS |
| 20 Dois atendentes não assumem o mesmo ticket; transferência move a responsabilidade | PASS |
| 21 Equipe SYZIA provisionada globalmente sem membership; ADM não altera identidade nem credenciais | PASS |
| 22 Equipe SYZIA suspende, desativa e reativa sem criar membership ou reativar atribuições automaticamente | PASS |
| 23 Atribuições A e B são independentes; suspender A conserva B e nega A | PASS |
| 24 ADM ajusta grants locais da equipe sem ultrapassar teto global ou liberar financeiro irrestrito | PASS |
| 25 Clientes existem antes da proposta/claim e leitura requer clients.read | PASS |
| 26 Revogar sessão global invalida RPC subsequente sem logout do navegador | PASS |
| 27 Homologação restaura isenção legítima e conserva evidência de concessão | PASS |
| 28 Limites e dados sobrevivem à retirada de plano em empresa sem assinatura | PASS |
| 29 Fallback de empresa existente permite concessão manual e extensão auditadas | PASS |
| 30 Trial usado em empresa existente é conclusivo e mantém todos os identificadores | PASS |
| 31 Financeiro por RLS: acesso permitido vê registro; downgrade na sessão oculta sem apagar | PASS |
| 32 Reemissão de credencial global exclusiva SuperAdmin invalida hash/link e preserva histórico | PASS |

### Regressão 041

| Caso | Resultado |
|---|---|
| 01 Upgrade populado 040→041 preserva todas as colunas e linhas anteriores | PASS |
| 02 Contratação direta: reserva sem atendente, proposta final ou pagamento | PASS |
| 03 Preço fixo + adicional: total e duração calculados e reservados | PASS |
| 04 A partir de vai direto ao atendente próprio elegível | PASS |
| 05 Sob consulta sem próprio autorizado é atribuído ao ADM | PASS |
| 06 Compartilhado não recebe nem abre ticket de avaliação por RPC ou RLS | PASS |
| 07 Compartilhado não altera preço por calculadora nem endpoint legado | PASS |
| 08 ADM e funcionário próprio autorizado montam proposta com grants | PASS |
| 09 Revogação de grant de orçamento impede próxima ação na mesma sessão | PASS |
| 10 Horário pretendido não ocupa agenda antes de aprovar | PASS |
| 11 Aprovação reserva horário desejado atomicamente com duração final | PASS |
| 12 Horário ocupado mantém proposta aprovada e permite novo horário | PASS |
| 13 Duração final maior que janela disponível pede nova escolha | PASS |
| 14 Multisserviço determinístico mantém pedido único e soma duração | PASS |
| 15 Multisserviço misto segue inteiro para empresa, com um ticket | PASS |
| 16 Foto obrigatória exige anexo privado do serviço correto; opcionais e recomendadas não bloqueiam | PASS |
| 17 Empresa pede foto; consumidor envia pelo acompanhamento sem tornar arquivo público | PASS |
| 18 Dúvida contextual cria somente rascunho e ticket, sem proposta ou reserva | PASS |
| 19 Continuar após ajuda reutiliza solicitação, oportunidade e ticket | PASS |
| 20 Calculadora: original, catálogo, adicional, item manual e desconto | PASS |
| 21 Desconto global em reais e por item são somados e auditados | PASS |
| 22 Desconto além da autonomia, negativo, decimal inválido e total negativo são negados | PASS |
| 23 Prévia não cria versão, e envio recalcula no servidor | PASS |
| 24 Versões enviadas são imutáveis; recusa e nova proposta conservam original | PASS |
| 25 Isolamento A/B em cálculo, serviços, fotos, rascunho e leitura | PASS |
| 26 Reserva atômica: conflito reverte envio e repetição não duplica appointment | PASS |
| 27 Agenda: remarcação e cancelamento mantêm histórico | PASS |
| 28 Perguntas condicionais, instrução, texto longo, quantidade e foto usam modelo existente | PASS |
| 29 Rascunho publicado e seleção antiga não aceitam preço ou catálogo obsoleto | PASS |
| 30 Roteamento não concede permissão a responsável pelo ticket | PASS |
| 31 Helpers privados novos não são RPCs e grants de tabelas continuam restritos | PASS |
| 32 Teto de desconto também bloqueia reduzir arbitrariamente item de catálogo fixo | PASS |
| 33 Endpoint legado não contorna fotos obrigatórias e anexo de outro serviço não satisfaz | PASS |
| 34 Publicação preserva política e rascunho não altera jornada já publicada | PASS |
| 35 Ajuda mantém idempotência, contexto e não revela rascunho a outro consumidor | PASS |

### Navegador 042

| Caso | Resultado |
|---|---|
| 01 Home carrega trabalho do dia, amanhã, links e ações existentes | PASS |
| 02 Falha de um bloco mantém demais; retry repete somente bloco; autorização distinta de rede | PASS |
| 03 Equipe SYZIA separada, sem controles globais; permissões locais abrem pessoa | PASS |
| 04 Serviço contínuo de 6h30 sem janela explica e busca próximos horários | PASS |
| 05 Divisível reserva 2 períodos; consumidor e Agenda mostram mesma execução; remarcação e cancelamento | PASS |
| 06 Calculadora explica bloqueio, exibe duração, prévia e após aprovação remove texto obsoleto | PASS |
| 07 Estados vazios localizados e link de retorno abre oportunidade correta | PASS |

Logs e JSON originais acompanham `reports/syzia-042/`. Build/typecheck, bundle e integridade são verificações adicionais; não entram na contagem de 124. Bateria mestre não executada.
