# SYZIA 041 --- PROMPT WORK PÓS-HOMOLOGAÇÃO 040

## Autoatendimento, roteamento de atendimento, orçamento empresarial e agenda do consumidor

> **LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.**

Base exclusiva: **SYZIA 040 consolidada**.

Esta rodada nasce da homologação manual real da 040. O objetivo NÃO é
tornar o atendimento mais complexo. O objetivo é simplificar a jornada,
recuperar o autoatendimento como fluxo principal e encaminhar para
humanos somente o que realmente exige intervenção.

# 0. PRINCÍPIO DE PRODUTO

> **O cliente resolve sozinho tudo que for determinístico.**
>
> **A Equipe SYZIA resolve dúvidas e operações previamente autorizadas
> pelo sistema, manual e regras da empresa.**
>
> **Quando houver julgamento técnico, avaliação específica ou definição
> de preço variável, o caso vai diretamente para a equipe própria da
> empresa ou para o ADM.**

Não transformar atendimento humano em etapa obrigatória de toda
contratação.

A Central deve sempre deixar claro: 1. o que o cliente quer; 2. o que
falta; 3. qual é a próxima ação; 4. quem precisa executar essa ação.

# 1. REGRAS INEGOCIÁVEIS

-   Inspecionar a implementação real da 040 antes de alterar.
-   Diagnosticar causas antes de corrigir.
-   Reutilizar a arquitetura existente.
-   Não criar Central, agenda, orçamento, clientes, anexos ou tokens
    paralelos.
-   Preservar clientes, solicitações, oportunidades, tickets, mensagens,
    propostas versionadas, appointments, disponibilidade, anexos
    privados, grants, RLS e auditoria existentes.
-   Preservar migrations **001--040 byte a byte**.
-   Se persistência nova for indispensável, criar somente **migration
    041 incremental**, transacional e compatível com banco populado.
-   Sem reset, deploy, produção, provider de cobrança real ou dados
    reais.
-   Não hardcodar MS Auto Details, pessoas, planos ou segmentos.
-   Não implementar `if segmento == ...`.
-   Não enfraquecer RLS/FORCE RLS, isolamento, autorização,
    versionamento ou auditoria.
-   Não confiar somente em botão oculto/disabled.
-   Toda ação sensível continua validada server-side.
-   Não apagar histórico.
-   Aprovação, agendamento, execução e resolução não significam
    pagamento recebido.
-   Não executar nova auditoria mestre nesta rodada.
-   Executar testes focados, regressão necessária, build/typecheck e
    upgrade se houver migration.

# 2. CORRIGIR DUPLICIDADE DA EQUIPE SYZIA

Na 040, a navegação do Super Admin passou a apresentar **Equipe SYZIA**
em mais de um ponto.

-   Manter uma única entrada principal **Equipe SYZIA**.
-   Inspecionar a rota antiga antes de removê-la.
-   Consolidar qualquer função útil na área global correta.
-   Não manter duas telas concorrentes com o mesmo nome.
-   Equipe SYZIA = gestão global das pessoas da operação SYZIA.
-   Atendimento humano = operação de tickets.
-   Comercial e retornos = operação comercial/follow-up.
-   Revisar a sidebar por outras duplicidades.

# 3. AUTOATENDIMENTO COMO FLUXO PRINCIPAL

A página pública deve permitir que o consumidor resolva sozinho o máximo
possível.

Antes do atendimento humano, utilizar: - descrição; - informações
importantes; - FAQ; - respostas rápidas; - regras; - preço; -
adicionais; - perguntas necessárias; - disponibilidade; - agenda.

Serviço determinístico não deve exigir aprovação humana.

Atendimento humano é suporte ao autoatendimento.

# 4. FORMA DE CONTRATAÇÃO POR SERVIÇO

Evoluir a configuração do serviço para explicitar sua jornada.

## Contratação imediata

Preço, adicionais e regras determinísticos. Cliente pode concluir
sozinho.

## Avaliação da empresa

Quando exige análise antes da contratação final, por exemplo: - preço "a
partir de"; - preço "sob consulta"; - condição técnica; - decisão
empresarial.

A empresa configura a jornada dentro das regras suportadas. Não
hardcodar por segmento.

# 5. CONFIRMAÇÃO AUTOMÁTICA

Quando toda a composição for determinística:

**serviço → informações → adicionais → dia/horário → revisão →
confirmação**

-   preço fixo vem do catálogo autorizado;
-   adicionais determinísticos são calculados server-side;
-   duração considera serviço + adicionais;
-   não criar "proposta aprovada automaticamente" artificial;
-   registrar contratação/agendamento direto corretamente;
-   se algum item se tornar não determinístico, mudar para avaliação
    empresarial;
-   não inventar preço nem tratar "sob consulta" como zero.

# 6. RESTAURAR AGENDAMENTO DIRETO PELO CONSUMIDOR

Restaurar o fluxo usando o motor de agenda existente.

Para contratação imediata:

**serviço → dados → consultar disponibilidade → dia → horário → revisão
→ confirmar**

Ao confirmar: - revalidar disponibilidade server-side; - respeitar
duração, adicionais, funcionamento, bloqueios, antecedência, buffers e
capacidade; - prevenir conflito; - reservar atomicamente; - refletir
imediatamente na Agenda; - permitir cancelamento/remarcação conforme
regras.

Não exigir atendente para selecionar horário livre.

# 7. SERVIÇO COM AVALIAÇÃO TAMBÉM ESCOLHE HORÁRIO

Mesmo quando exige avaliação, o consumidor escolhe **dia e horário
desejados durante a solicitação**.

Fluxo:

**serviço → informações/fotos → horário pretendido → enviar → empresa
avalia → proposta → cliente aprova → revalidar horário → reservar se
disponível**

Antes da aprovação: - mostrar **Horário escolhido --- aguardando
confirmação**; - não ocupar capacidade; - não criar appointment
confirmado; - empresa visualiza o horário pretendido; - proposta
preserva esse horário.

Na aprovação: - revalidar disponibilidade e duração final; - disponível
→ reservar atomicamente; - indisponível → proposta continua aprovada e
cliente escolhe novo horário; - mostrar novas opções imediatamente; -
não refazer orçamento; - nunca chamar horário pretendido de "Agendado".

# 8. ROTEAMENTO POR NECESSIDADE DE DECISÃO

Não fazer a Equipe SYZIA receber preço variável para depois encaminhar.

## Preço fixo / determinístico

Pode seguir autoatendimento e Equipe SYZIA quando houver dúvida,
respeitando plano, vínculo, grants e autonomia.

## Preço "a partir de"

Direto para: 1. atendente próprio autorizado; 2. se não houver elegível,
ADM.

## Preço "sob consulta"

Mesma regra: 1. atendente próprio autorizado; 2. sem ele, ADM.

## Exceção técnica/comercial

Fora do manual/autonomia → empresa/ADM.

## Equipe SYZIA pode

-   FAQ e dúvidas comuns;
-   informações de serviços;
-   preço fixo cadastrado;
-   regiões;
-   horários;
-   formas de pagamento cadastradas;
-   regras publicadas;
-   acompanhamento;
-   agendamento direto;
-   remarcação/cancelamento permitido;
-   follow-up contratado/autorizado;
-   outras ações determinísticas autorizadas.

## Equipe SYZIA não pode

-   inventar preço;
-   alterar preço-base;
-   estimar custo técnico;
-   definir valor final de "a partir de";
-   definir "sob consulta";
-   tomar decisão comercial fora da autonomia.

Mostrar o motivo do roteamento, por exemplo: **Avaliação de preço
necessária**.

# 9. PEDIDO MULTISSERVIÇO

Continuar gerando uma única solicitação.

-   Todos os itens determinísticos → permitir conclusão direta quando as
    regras permitirem.
-   Pelo menos um item exige avaliação → solicitação inteira segue para
    a empresa.
-   Não dividir o mesmo pedido em dois tickets simultâneos.
-   Preservar itens, adicionais, respostas, fotos, relações, pedido
    original, horário pretendido e proposta consolidada.
-   Após aprovação, revalidar se o horário comporta a duração final da
    composição inteira.

# 10. AJUDA ANTES DE FINALIZAR

Na jornada do serviço, oferecer:

**Dúvidas sobre este serviço?**

Primeiro mostrar FAQ, respostas rápidas, informações e regras
pertinentes.

Se não resolver:

**Falar com atendimento**

Regras: - pode abrir atendimento antes da solicitação comercial
finalizada; - ticket leva contexto do serviço e ponto da jornada; -
Equipe SYZIA responde dentro do manual/regras/autonomia; - depois
oferecer **Continuar minha solicitação**; - retornar ao ponto correto; -
não exigir recomeçar; - não criar orçamento, appointment ou oportunidade
duplicada artificialmente.

# 11. FOTOS E INFORMAÇÕES PARA AVALIAÇÃO

Configuração simples por serviço: - não necessárias; - opcionais; -
recomendadas; - obrigatórias para avaliação.

Permitir instrução simples sobre o que fotografar.

Quando exige avaliação: - fotos acompanham diretamente equipe
própria/ADM; - se faltarem, atendente próprio/ADM solicita pelo
acompanhamento; - consumidor envia no acompanhamento seguro; -
reutilizar anexos privados existentes; - não tornar Storage público; -
não criar mídia paralela.

Mostrar estados claros: **Fotos necessárias / Fotos enviadas /
Aguardando análise**.

# 12. FORMULÁRIO POR SERVIÇO --- SIMPLES

Cada serviço pede somente o necessário.

Suportar, conforme arquitetura: - texto curto; - texto
longo/observação; - sim/não; - escolha; - quantidade; - foto; -
equivalentes já existentes.

Pergunta pode ser obrigatória/opcional e ter instrução.

Pergunta condicional somente quando agregar valor.

Exemplo:

**Há manchas? → Sim → Onde? / Envie foto**

Não criar construtor excessivamente complexo.

Respostas continuam vinculadas ao item correto.

# 13. MODELOS POR SEGMENTO SÃO SUGESTÕES

Segmento pode sugerir modelos iniciais de perguntas/jornadas.

A empresa pode usar, editar, remover ou ignorar.

Segmento não é autoridade de backend.

Não criar `if segmento == ...`.

# 14. CALCULADORA DE ORÇAMENTO DA EMPRESA

Para ADM e funcionário próprio autorizado, a proposta deve funcionar
como uma **calculadora simples de orçamento**.

Carregar automaticamente os serviços originalmente solicitados.

## Definir valor final

Para "a partir de" ou "sob consulta":

**Valor final: R\$ \[\_\_\_\_\]**

## Adicionar serviço do catálogo

**+ Adicionar serviço**

Seleciona serviço real da empresa.

## Adicionar item complementar

**+ Adicionar item**

Campos: - descrição; - valor; - duração, quando aplicável/suportada; -
observação necessária.

Item existe naquela proposta e não cria serviço novo no catálogo.

## Remover item da proposta

Permitido quando autorizado. Nunca apagar pedido original.

## Desconto

Permitir conforme autonomia: - percentual; - valor em R\$; - por item
quando necessário.

Calcular: - subtotal; - descontos; - total.

Impedir: - total negativo; - NaN; - valor inválido; - desconto acima do
teto; - manipulação client-side sem revalidação.

Registrar ator, valores e descontos.

## Explicação ao cliente

Campo público separado para avaliação/alteração/adicional/condição.

Nota interna permanece separada.

## Prévia

Adicionar **Visualizar como cliente**.

## Versionamento

-   proposta enviada imutável;
-   alteração cria nova versão;
-   preservar versão aprovada/recusada.

## Permissões

-   ADM: conforme autoridade existente;
-   funcionário próprio autorizado: conforme grants/autonomia;
-   atendente próprio sem permissão: bloqueado;
-   Equipe SYZIA: sem edição arbitrária de preços.

# 15. ADICIONAIS DURANTE A AVALIAÇÃO

ADM/funcionário próprio autorizado pode adicionar: - serviço do
catálogo; - item complementar específico; - adicional existente, quando
aplicável.

Não cobrar automaticamente apenas por foto.

Se alterar duração: - atualizar duração final; - usar duração final na
revalidação do horário.

# 16. CENTRAL --- MELHORAR SEM COMPLICAR

A Central deve responder rapidamente:

**O que o cliente quer?\
O que falta?\
Quem precisa agir?\
Qual é a próxima ação?**

Ajustes: - dar largura adequada ao Orçamento; - evitar coluna estreita e
textos quebrados; - reduzir espaço vazio; - manter conversa como área
principal; - pedido, fotos, respostas e horário pretendido fáceis de
consultar; - Orçamento abre como área de trabalho adequada; - próxima
ação com CTA direto; - se depende da empresa, indicar aguardando
empresa; - se depende do cliente, indicar aguardando cliente; - se
Equipe SYZIA pode resolver, permitir ação; - não criar repasse SYZIA →
empresa → SYZIA só para precificar; - serviço variável nasce roteado
para quem pode decidir.

# 17. EXPERIÊNCIA DO CONSUMIDOR

Manter a identidade publicada da empresa implementada na 040.

Melhorar a hierarquia.

## Progresso

Usar jornada coerente, por exemplo:

**Pedido → Análise → Proposta → Aprovação → Agendamento → Serviço**

Não mostrar etapas artificiais em contratação direta.

Mostrar: - etapa atual; - próxima ação; - horário
pretendido/confirmado; - pedidos de fotos/informações; - conversa; -
pedido resumido; - proposta quando existir.

Estado normal não deve parecer erro.

## Conversa

-   autoria;
-   horário;
-   mensagens legíveis;
-   anexos autorizados;
-   indicador de nova mensagem.

## Pedido

Mostrar resumo primeiro e detalhes sob demanda.

## Proposta

Quando existir, ganha destaque e mostra: - serviços; - adicionais; -
itens complementares; - subtotal; - desconto; - total; - explicação; -
validade; - horário pretendido.

CTA muda conforme etapa: - Continuar solicitação; - Enviar fotos; -
Responder; - Aprovar/Recusar; - Escolher novo horário; -
Remarcar/Cancelar quando permitido.

Depois de agendado, mostrar data, horário, serviços e ações permitidas.

# 18. PERMISSÕES

-   ADM e funcionário próprio autorizado podem montar/alterar proposta
    dentro do escopo.
-   Equipe SYZIA não define preço-base nem custo técnico.
-   Atendente próprio sem permissão de orçamento não edita valores.
-   Enforcement em UI, rota, RPC/API e RLS.
-   Revogação afeta nova operação em sessão já aberta.
-   Não ampliar permissão apenas por ser responsável pelo ticket.

# 19. AGENDA E DURAÇÃO FINAL

-   horário pretendido acompanha solicitação/proposta;
-   composição final define duração;
-   se duração final não couber, pedir novo horário;
-   proposta permanece aprovada;
-   reserva definitiva somente após validação server-side;
-   preservar histórico de remarcação/cancelamento.

# 20. TESTES OBRIGATÓRIOS

Executar testes focados cobrindo pelo menos:

1.  contratação imediata de preço fixo sem atendente;
2.  preço fixo + adicionais determinísticos;
3.  "a partir de" roteado para atendente próprio;
4.  "sob consulta" roteado para ADM quando não houver atendente próprio
    elegível;
5.  Equipe SYZIA impedida de alterar preço;
6.  ADM/funcionário autorizado montando proposta;
7.  dúvida resolvida por FAQ sem ticket;
8.  dúvida antes da solicitação → atendimento contextual → continuar
    jornada;
9.  agendamento direto pelo consumidor;
10. serviço variável com horário pretendido;
11. aprovação com horário disponível → reserva;
12. aprovação com horário indisponível → nova escolha sem perder
    proposta;
13. pedido multissserviço totalmente determinístico;
14. pedido multissserviço com item variável → inteiro para empresa;
15. fotos opcionais/recomendadas/obrigatórias;
16. solicitação de foto pelo acompanhamento;
17. calculadora: serviço, item manual, desconto, subtotal e total;
18. alteração de duração por adicional;
19. prévia como cliente;
20. proposta versionada;
21. claro/escuro;
22. desktop/mobile;
23. isolamento A/B;
24. revogação em sessão;
25. regressão da Agenda existente;
26. regressão de orçamento/multissserviço 038;
27. regressão de planos/permissões 039/040 afetados;
28. build/typecheck;
29. upgrade 040→041 em banco populado se houver migration.

# 21. O QUE NÃO FAZER

-   Não transformar atendimento em workflow burocrático.
-   Não obrigar humano em serviço que o cliente conclui sozinho.
-   Não permitir Equipe SYZIA estimar preço técnico.
-   Não dividir pedido multissserviço em solicitações paralelas sem
    necessidade.
-   Não reservar horário variável antes da aprovação.
-   Não remover novamente o agendamento direto do consumidor.
-   Não criar sistemas paralelos.
-   Não hardcodar MS Auto Details ou segmentos.
-   Não adicionar IA para decidir preço, adicional ou roteamento
    técnico.
-   Não selecionar provider de cobrança.
-   Não fazer deploy.

# 22. FLUXOS DE REFERÊNCIA

## A --- Contratação direta

**Serviço → informações → dia/horário → revisão → confirmação → reserva
definitiva → Agenda**

## B --- Serviço com avaliação

**Serviço → informações/fotos → dia/horário pretendido → envio → equipe
própria/ADM avalia → calculadora de proposta → cliente aprova →
revalidação do horário → reserva definitiva**

## C --- Dúvida antes de contratar

**Serviço → FAQ/respostas rápidas → ainda tem dúvida → atendimento
contextual → resposta → continuar solicitação de onde parou**

# 23. ENTREGA

Entregar: - projeto consolidado completo; - migration 041 somente se
necessária; - guia de upgrade sem reset; - relatório técnico; -
inventário de arquivos alterados; - testes focados e regressões; -
evidências dos três fluxos de referência; - matriz de roteamento
final; - permissões afetadas; - limitações e pendências externas.

No relatório distinguir: - **CORRIGIDO NESTA RODADA**; - **TESTADO
LOCALMENTE**; - **PENDENTE DE HOMOLOGAÇÃO EXTERNA**; - **DECISÃO DE
PRODUTO PENDENTE**, somente se realmente existir.

# 24. PARADA OBRIGATÓRIA

Depois de implementar, testar, documentar e entregar:

**PARAR.**

Não iniciar próxima rodada. Não fazer deploy. Não publicar. Não executar
cobrança. Não executar auditoria mestre automaticamente.

A próxima etapa será novamente a homologação manual do proprietário.
