# SYZIA 042 --- PROMPT WORK PÓS-HOMOLOGAÇÃO 041

## Refinamento final da operação empresarial antes da bateria ampla

> **LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.**

Base exclusiva: **SYZIA 041 consolidada**.

Esta rodada vem da homologação manual real da 041. NÃO é nova fase e NÃO
autoriza reconstrução. O objetivo é corrigir divergências encontradas no
uso, melhorar UX/agenda e preparar uma homologação manual curta. A
bateria ampla/final da plataforma inteira será solicitada somente
depois.

# 0. PRINCÍPIO

Preservar a arquitetura principal:

**autoatendimento primeiro → humano somente quando necessário → empresa
decide julgamento técnico/preço variável → proposta → aprovação → agenda
→ execução**

Não complicar esse fluxo. Não adicionar burocracia.

Prioridades: 1. fronteira correta entre Equipe SYZIA e empresa cliente;
2. autorização efetiva coerente; 3. Home operacional funcionando; 4.
mensagens/estados claros; 5. execução em múltiplos dias quando
configurada.

# 1. REGRAS INEGOCIÁVEIS

-   Inspecionar integralmente a 041 antes de alterar.
-   Diagnosticar a causa real antes de corrigir.
-   Reutilizar identidades, vínculos, grants, autonomia, tickets,
    clientes, propostas, agenda, appointments, anexos, RLS e auditoria
    existentes.
-   Não criar sistemas paralelos.
-   Preservar migrations **001--041 byte a byte**.
-   Se persistência nova for indispensável, criar somente **migration
    042 incremental**, transacional e compatível com banco populado.
-   Sem reset, deploy, publicação, cobrança/provider real ou dados
    reais.
-   Não hardcodar MS Auto Details, Ranna, Marcelo, planos ou segmentos.
-   Não enfraquecer RLS/FORCE RLS, isolamento, grants, revogação ou
    auditoria.
-   Ocultar botão não substitui autorização server-side.
-   Não apagar histórico.
-   Não alterar comportamento validado da 041 sem motivo documentado.
-   Não executar ainda a auditoria/bateria mestre.
-   Executar testes focados + regressão necessária.
-   Ao finalizar, entregar e **PARAR**.

# 2. PRIORIDADE ALTA --- EQUIPE SYZIA NÃO É FUNCIONÁRIO DA EMPRESA

Na homologação, integrante da Equipe SYZIA atribuída à empresa apareceu
como colaborador empresarial comum, com ações como:

-   Gerar novo código de primeiro acesso;
-   Editar acesso;
-   Desativar.

O modal de edição expõe username, e-mail e papel.

Isso está incorreto.

> **A identidade global da Equipe SYZIA pertence à SYZIA.**
>
> **O ADM empresarial administra somente autonomia/permissões locais
> daquela pessoa na sua empresa.**

# 3. IDENTIDADE GLOBAL × ATRIBUIÇÃO EMPRESARIAL

## Identidade global --- somente Super Admin autorizado

Inclui: - identidade global; - username; - e-mail; - credencial; -
primeiro acesso; - redefinição de acesso; - sessões globais; -
papel/função global; - status global; -
suspensão/desativação/reativação; - empresas às quais pode ser
atribuída.

## Atribuição empresarial

Representa somente:

**Pessoa da Equipe SYZIA ↔ Empresa X**

O ADM da Empresa X administra apenas o que essa pessoa pode fazer **na
Empresa X**, dentro dos tetos aplicáveis.

# 4. REMOVER PODERES GLOBAIS DO ADM

Para Equipe SYZIA/atendimento compartilhado, ADM empresarial NÃO pode:

-   gerar/reemitir primeiro acesso;
-   redefinir senha/acesso global;
-   encerrar sessões globais;
-   editar username/e-mail/identidade;
-   trocar papel/função global;
-   desativar/reativar/suspender globalmente;
-   atribuir/remover de outras empresas;
-   visualizar controles administrativos globais.

Remover da UI e bloquear também em rota, API/RPC, helpers/policies/RLS
aplicáveis. Não basta esconder.

# 5. APRESENTAÇÃO DA EQUIPE SYZIA AO ADM

Não mostrar simplesmente `Colaborador`.

Mostrar algo equivalente a:

**Ranna Aghatta**\
**Equipe SYZIA · Atendimento compartilhado**\
Situação nesta empresa: Ativa\
Atendimento ao cliente: Permitido\
Escopo: Esta empresa

Ações apropriadas: - **Configurar autonomia nesta empresa** - **Revisar
permissões nesta empresa** - desvinculação local somente se o
fluxo/autoridade existente permitir, sem desativar identidade global.

Não mostrar Editar acesso global, Gerar código ou Desativar conta
global.

# 6. FUNCIONÁRIO PRÓPRIO CONTINUA DIFERENTE

Não quebrar gerenciamento de funcionários próprios.

Diferenciar claramente: - Administrador empresarial; -
Colaborador/funcionário próprio; - Atendente próprio; - Equipe
SYZIA/atendimento compartilhado.

# 7. AUTONOMIA × PERMISSÕES INDIVIDUAIS

A tela **Autonomia da equipe de atendimento** é teto operacional, não
substituto dos grants.

Acesso efetivo deve obedecer:

**capacidade do plano + autonomia da empresa + papel + grants/permissões
individuais + vínculo + escopo + estado**

Testar: - autonomia SIM + permissão SIM → permitir se demais condições
válidas; - autonomia SIM + permissão NÃO → bloquear; - autonomia NÃO +
permissão SIM → bloquear; - plano/capacidade NÃO + demais SIM →
bloquear; - vínculo/status revogado → bloquear nova operação em sessão
aberta.

Validar UI, rota, RPC/API e banco/RLS.

# 8. REVISAR AUTONOMIAS ANTIGAS À LUZ DA 041

Garantir que a tela antiga não reabra poderes proibidos.

## Informar preço tabelado

Somente preço fixo/publicado autorizado. Não altera preço.

## Informar faixa de preço

Somente faixa previamente cadastrada/publicada. Nunca inventar faixa a
partir de preço "a partir de".

## Aplicar desconto

Não pode liberar a calculadora empresarial de preço variável para Equipe
SYZIA. Qualquer desconto compartilhado precisa de regra/teto explícito e
validação server-side.

## Negociar condições

Definir tecnicamente o que significa. Não permitir inventar preço,
política, condição ou benefício. Se não houver semântica segura,
restringir/reformular.

## Criar orçamento tabelado

Somente composição determinística autorizada. Não define "a partir
de"/"sob consulta".

## Enviar orçamento

Pode enviar proposta já definida/autorizada quando permitido, sem ganhar
edição de preço variável.

## Alterar itens

Não pode permitir ao compartilhado criar item manual com preço
arbitrário, alterar preço-base ou inserir adicional técnico não
autorizado.

## Agenda

Agendar/remarcar/cancelar continuam sujeitos a autonomia + grants +
regras + estado + vínculo + escopo.

## Fazer encaixe

Ação sensível. Não furar capacidade só pelo checkbox. Revalidar
server-side.

## Acompanhamento/WhatsApp/pós-atendimento

Continuam sujeitos a consentimento, regras, plano, grants e escopo.

# 9. PRIORIDADE ALTA --- HOME OPERACIONAL

Na 041, a Home empresarial apareceu praticamente vazia e exibiu:

**Não foi possível concluir. Verifique a conexão e tente novamente.**

A Home deve ser a central diária **O que fazer hoje?**

# 10. DIAGNOSTICAR A FALHA DA HOME

Antes de alterar layout: - identificar qual chamada falha; - verificar
se uma falha derruba todo o conteúdo; - corrigir a causa real; - não
mascarar autorização/estado/resposta inválida como "conexão"; - quando
possível, falha de um bloco não derruba os demais; - erro localizado; -
`Tentar novamente` repete somente o necessário.

# 11. CONTEÚDO DA HOME

## Resumo de hoje

Exibir conforme dados existentes: - data; - agendamentos de hoje; -
próximo atendimento; - serviços em andamento; - solicitações
relevantes; - clientes aguardando ação; - propostas/orçamentos
aguardando ação; - propostas aprovadas aguardando conclusão da agenda; -
reagendamentos; - decisões/autorizações; - follow-ups/retornos quando
disponíveis; - outras tarefas acionáveis.

## Agenda de hoje

Mostrar horário, cliente, serviço, duração e situação. Cada item abre
sua ficha.

Estado vazio útil: **Nenhum atendimento agendado para hoje.**

## Precisa da sua atenção

Não mostrar só contadores. Mostrar cliente, motivo, objeto, ação e CTA
direto.

## Amanhã

Pequena visão de próximos agendamentos + acesso à Agenda completa.

## Ações rápidas

Reutilizar fluxos existentes: - + Novo agendamento - + Novo cliente - +
Novo orçamento, quando coerente.

Não criar entidades paralelas.

# 12. HOME NÃO É TELA DE MÉTRICAS

Não encher de gráficos gerenciais. Métricas e Financeiro continuam em
seus módulos. Priorizar trabalho do dia.

# 13. UX DA CALCULADORA --- BOTÃO BLOQUEADO

`Enviar proposta final` ficou desabilitado sem explicar que faltava
**Explicação da proposta para o cliente**.

Corrigir: - obrigatório mostra `*`; - informar por que botão está
bloqueado; - validação próxima ao campo; - não deixar CTA cinza sem
explicação.

# 14. OBRIGATORIEDADE DA EXPLICAÇÃO

Não burocratizar.

Se não houve alteração relevante, permitir explicação opcional ou texto
neutro seguro.

Quando houver preço final diferente da referência, item
adicional/removido, desconto ou condição especial, exigir explicação
quando necessário.

Não inventar justificativa técnica automaticamente.

Preservar prévia, versionamento e imutabilidade da versão enviada.

# 15. AGENDA --- COMUNICAR DURAÇÃO

Preservar o motor validado da 041.

Mostrar quando relevante:

**Duração estimada deste atendimento: 6h30**

e:

**Os horários disponíveis consideram o tempo necessário para realizar
todos os serviços.**

# 16. MOTIVO DE INDISPONIBILIDADE

Diferenciar quando conhecido:

## Dia ocupado/sem capacidade

Mensagem normal de indisponibilidade.

## Serviço não cabe no expediente

Exemplo:

**Este atendimento precisa de aproximadamente 6h30 e não cabe no período
disponível deste dia. Escolha outra data.**

Quando possível, oferecer **Ver próximos horários compatíveis**.

Não obrigar cliente a testar datas aleatoriamente.

# 17. TEXTO DESATUALIZADO APÓS APROVAÇÃO

Se a tela mostra **Proposta aprovada**, não pode continuar dizendo
"Serviços sob avaliação precisam de proposta aprovada".

Depois da aprovação: - mudar para **Escolha seu horário** ou **Confirme
seu horário**; - se houver horário pretendido, priorizar confirmação; -
se indisponível, explicar e mostrar novas opções; - preservar a proposta
aprovada.

# 18. NOVA MELHORIA --- EXECUÇÃO EM MÚLTIPLOS DIAS

Alguns serviços podem durar mais que o expediente diário.

Adicionar capacidade configurável por serviço:

-   **Execução contínua --- deve caber em uma única janela**
-   **Pode ser dividido em vários períodos/dias**

Não ativar divisão automaticamente para todos.

# 19. CONFIGURAÇÃO DE SERVIÇO DIVISÍVEL

Quando divisível, permitir configuração simples: - múltiplos
dias/períodos; - máximo de dias/períodos, se a empresa quiser limitar; -
regras compatíveis com a agenda existente.

Não criar planejador complexo.

# 20. BUSCA AUTOMÁTICA DE COMBINAÇÕES

Se duração não couber em um expediente e o serviço for divisível,
procurar combinações válidas.

Exemplo:

**Duração total: 10h**

Pode oferecer:

**Segunda 08:00--15:00 + Terça 08:00--11:00**

Considerar em cada período: - funcionamento; - disponibilidade; -
bloqueios; - capacidade; - buffers; - duração restante; - demais regras
existentes.

O consumidor não divide manualmente as horas.

# 21. MODELO PARA MÚLTIPLOS PERÍODOS

Continuar sendo: - uma contratação; - um pedido; - um contexto
comercial; - uma proposta; - um atendimento, quando aplicável.

Não duplicar cliente, solicitação, orçamento ou ticket por haver dois
dias.

A Agenda pode ter múltiplos períodos/appointments vinculados à mesma
execução usando a arquitetura existente ou extensão incremental mínima.

Não criar agenda paralela.

# 22. RESERVA ATÔMICA

Antes de confirmar: - revalidar TODOS os períodos; - validar
capacidade; - conflitos; - duração total.

Reserva = **todos os períodos ou nenhum**.

Nunca reservar primeiro dia e falhar silenciosamente no segundo.

# 23. PROPOSTA/CALCULADORA E MÚLTIPLOS DIAS

-   mostrar duração total;
-   alertar quando exceder expediente diário;
-   informar quando execução precisar de mais de um dia;
-   se composição multissserviço puder ser distribuída, somente fazê-lo
    quando regras dos serviços permitirem;
-   preservar pedido original e proposta versionada.

# 24. ACOMPANHAMENTO DO CONSUMIDOR

Quando houver múltiplos períodos, mostrar agrupado:

**Seu atendimento** - Parte 1 --- Segunda, 08:00--15:00 - Parte 2 ---
Terça, 08:00--11:00

Continuar parecendo uma única contratação.

# 25. REMARCAÇÃO E CANCELAMENTO

Para múltiplos períodos: - distinguir **Remarcar este período** de
**Replanejar atendimento** quando seguro; - cancelamento integral trata
todos os períodos; - validar conflitos novamente; - histórico registra
cada alteração; - não deixar períodos órfãos.

Serviço contínuo continua exigindo uma única janela completa.

# 26. COMPORTAMENTOS JÁ VALIDADOS --- PRESERVAR

Não tratar como bugs:

-   proposta final chegou ao consumidor;
-   consumidor aprovou proposta;
-   proposta mostra itens, subtotal, desconto, total, explicação e
    validade;
-   motor da Agenda considera duração final;
-   atendimento de 6h30 restringiu corretamente as opções;
-   horário que não cabe no expediente não é oferecido;
-   identidade publicada da empresa está aplicada ao acompanhamento;
-   calculadora funciona para usuário empresarial autorizado;
-   pedido original permanece preservado;
-   serviço variável é roteado ao escopo empresarial conforme 041.

Criar regressões para não quebrar esses comportamentos.

# 27. TESTES OBRIGATÓRIOS

## Equipe SYZIA / identidade

1.  ADM vê integrante SYZIA como atendimento compartilhado, não
    colaborador próprio.
2.  ADM não vê/usa Gerar código.
3.  ADM não edita username/e-mail/papel global.
4.  ADM não desativa conta global.
5.  Tentativa direta por RPC/API é negada.
6.  Super Admin continua administrando identidade global.
7.  Alteração local na Empresa A não altera Empresa B.
8.  Funcionário próprio mantém seu fluxo correto.

## Autonomia

9.  autonomia SIM + grant SIM.
10. autonomia SIM + grant NÃO.
11. autonomia NÃO + grant SIM.
12. capacidade do plano ausente.
13. revogação durante sessão.
14. preço tabelado.
15. faixa previamente publicada.
16. desconto dentro/fora do teto.
17. compartilhado tentando preço variável.
18. encaixe sem/ com autorização válida.

## Home

19. carga normal.
20. falha isolada de um bloco.
21. mensagem correta para erro de autorização versus rede.
22. Agenda de hoje.
23. próximo atendimento.
24. Precisa da sua atenção.
25. proposta aprovada aguardando agenda.
26. amanhã.
27. ações rápidas.
28. estados vazios.
29. links abrindo objeto correto.

## Proposta

30. botão bloqueado explica motivo.
31. explicação obrigatória quando aplicável.
32. caso simples sem burocracia desnecessária.
33. prévia e versionamento preservados.

## Agenda

34. duração exibida.
35. dia ocupado.
36. serviço que não cabe no expediente.
37. próximos horários compatíveis.
38. texto correto antes/depois da aprovação.
39. horário pretendido preservado.

## Múltiplos dias

40. serviço contínuo não é dividido.
41. serviço divisível maior que expediente gera combinação.
42. combinação respeita bloqueios/capacidade.
43. reserva atômica de todos os períodos.
44. conflito em um período impede confirmação parcial.
45. acompanhamento agrupa períodos.
46. Agenda mostra períodos vinculados.
47. remarcação de período.
48. replanejamento integral.
49. cancelamento integral.
50. histórico.
51. multissserviço com duração distribuível.
52. multissserviço com item não divisível.

## Regressão

53. fluxos A/B/C da 041.
54. isolamento A/B.
55. RLS/grants.
56. proposta/aprovação.
57. agenda direta.
58. agenda de avaliação.
59. claro/escuro.
60. desktop/mobile.
61. build/typecheck.
62. upgrade 041→042 em banco populado, se houver migration.

# 28. ENTREGA

Entregar: - consolidado completo 042; - migration 042 somente se
necessária; - guia de upgrade sem reset; - relatório técnico; -
inventário de arquivos alterados; - matriz de autorização Equipe SYZIA ×
empresa; - matriz de autonomia efetiva; - evidências da Home; -
evidências de serviço contínuo e múltiplos períodos; - resultados dos
testes focados/regressão; - pendências externas claramente separadas.

No relatório distinguir: - **CORRIGIDO NESTA RODADA** - **TESTADO
LOCALMENTE** - **PENDENTE DE HOMOLOGAÇÃO EXTERNA** - **PENDENTE DA
BATERIA FINAL**, quando aplicável.

Não declarar homologação externa que não ocorreu.

# 29. PARADA OBRIGATÓRIA

Depois de implementar, testar, documentar e entregar:

**PARAR.**

Não iniciar 043. Não fazer deploy. Não publicar. Não executar cobrança.
Não executar a bateria mestre automaticamente.

A próxima etapa será uma homologação manual curta do proprietário. Se
essa homologação estiver alinhada, então será solicitada separadamente a
**bateria final ampla da plataforma inteira**, com foco especial no que
o proprietário não testou manualmente.
