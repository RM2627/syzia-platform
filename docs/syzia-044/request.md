# SYZIA 044 --- CORREÇÕES APROVADAS DA AUDITORIA 043

## Correção cirúrgica dos achados AUD-001 a AUD-004

> **LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.**

Base exclusiva: **SYZIA 042 consolidada**, auditada pela rodada 043. A
043 foi somente diagnóstico e não alterou o produto.

Estão autorizadas exclusivamente: - **AUD-001 --- APROVAR_CORRECAO** -
**AUD-002 --- APROVAR_CORRECAO** - **AUD-003 --- APROVAR_CORRECAO** -
**AUD-004 --- APROVAR_CORRECAO**

**Não corrigir, refatorar ou melhorar qualquer outro item fora desses
quatro IDs.**

# 0. OBJETIVO

Corrigir os quatro achados confirmados, executar testes focados e
regressão necessária, entregar evidências e PARAR.

A bateria final ampla pós-correções será solicitada separadamente.

# 1. REGRAS INEGOCIÁVEIS

-   Partir da SYZIA 042 consolidada e intacta.
-   Usar os achados 043 como fonte.
-   Não usar uma cópia modificada durante a auditoria.
-   Preservar migrations históricas byte a byte.
-   Se banco precisar de alteração, criar somente **migration 044
    incremental**, transacional e compatível com banco populado.
-   Não inventar migration 043.
-   Sem reset, deploy, publicação, cobrança/provider real ou dados
    reais.
-   Não hardcodar empresa, pessoa, plano ou segmento.
-   Não enfraquecer RLS/FORCE RLS, grants, isolamento, auditoria ou
    versionamento.
-   Não alterar comportamento aprovado apenas para teste passar.
-   Não apagar testes históricos.
-   Não corrigir pendências externas.
-   Não iniciar 045 automaticamente.

# 2. AUD-001 --- CRÍTICO --- RESERVA ANTES DA APROVAÇÃO

A auditoria confirmou que uma solicitação de serviço sob avaliação, com
`accepted_version` nulo e `proposal_required`, pode ser reservada pelo
comando empresarial, criando appointment confirmado e avançando a
oportunidade para `contracted`.

Isso viola a regra aprovada.

## Regra

Para jornada que exige avaliação/proposta:

**solicitação → horário pretendido → avaliação → proposta → aprovação do
consumidor → revalidação → reserva**

Antes da aprovação: - horário pode ser apenas pretendido; - não ocupar
capacidade; - não criar appointment confirmado; - não avançar
oportunidade para `contracted` por reserva indevida.

Aplicar em UI, comandos empresariais, wrappers legadas, RPC/API e
caminhos que alcancem o motor de reserva.

Não corrigir somente o botão.

# 3. PRESERVAR AGENDAMENTO MANUAL LEGÍTIMO

A correção não pode quebrar agendamento manual real originado de
WhatsApp, telefone, presencial, indicação ou cliente recorrente.

Distinguir:

## A. Pedido público sob avaliação

Ligado a solicitação que exige proposta → aprovação válida obrigatória
antes da reserva.

## B. Agendamento manual empresarial legítimo

Continua permitido conforme autorização, cliente, serviço, horário,
duração, capacidade, conflito, histórico e origem.

O fluxo manual não pode virar bypass para reservar a própria solicitação
sob avaliação pendente.

# 4. AUD-001 --- VALIDAÇÕES

-   proposta ausente → negar com causa específica;
-   proposta enviada mas não aprovada → negar;
-   proposta recusada → negar;
-   proposta aprovada → permitir se Agenda permitir;
-   horário ocupado → manter proposta aprovada e negar apenas reserva;
-   contratação direta continua sem proposta artificial;
-   agendamento manual legítimo continua;
-   repetição não duplica appointment;
-   tentativa negada não muda oportunidade para `contracted`;
-   aprovação/reserva não significam pagamento.

Não retornar falso `unauthorized` quando a causa for proposta ainda não
aprovada.

# 5. AUD-002 --- ALTO --- BUFFER NA REMARCAÇÃO

A auditoria confirmou: serviço de 180 min reservado com buffer 0;
empresa altera buffer vigente para 30 min; ao remarcar, a nova janela
continua ocupando somente 180 min.

## Regra aprovada

> Agendamento existente mantém sua configuração histórica enquanto não
> for alterado. Ao remarcar para uma nova janela, usar a configuração
> vigente naquele momento, inclusive buffer.

Exemplo: - `service_minutes = 180` - buffer vigente = 30 - nova janela
ocupada = 210 min

Preservar separadamente duração do serviço, buffer e janela ocupada.

Buffer não deve aparecer como duração real do serviço ao consumidor.

# 6. AUD-002 --- REVALIDAÇÃO

Na remarcação: - recompor a janela; - revalidar funcionamento,
capacidade, bloqueios, antecedência, horizonte, grade, conflitos e
demais regras; - se a nova janela não couber, negar; - preservar
integralmente a reserva anterior; - não deixar estado parcial.

Aplicar também à remarcação de uma parte de execução múltipla.
Replanejamento integral revalida todas as partes.

# 7. AUD-003 --- MÉDIO --- ORDEM DAS PARTES

A auditoria permitiu que Parte 2 fosse remarcada para antes da Parte 1
mantendo `part_number = 2`.

## Regra aprovada

> Remarcação isolada não pode quebrar a ordem cronológica das partes do
> mesmo `execution_group`.

Não renumerar automaticamente o histórico em remarcação isolada.

Se Parte 1 = segunda e Parte 2 = terça, tentar mover Parte 2 para
domingo deve ser negado.

Mensagem equivalente:

**Este horário alteraria a ordem das etapas do atendimento. Use
Replanejar atendimento para reorganizar todos os períodos.**

# 8. REPLANEJAMENTO É O CAMINHO PARA REORGANIZAR

`Replanejar atendimento` pode recalcular o conjunto inteiro, desde
que: - preserve histórico; - mantenha ordem cronológica; - mantenha
`part_number` coerente; - revalide todas as partes; - seja atômico; -
não deixe órfãos; - preserve registros históricos
cancelados/substituídos.

Não usar remarcação isolada como replanejamento disfarçado.

# 9. AUD-004 --- MÉDIO --- GATE CUMULATIVO DE TESTES

A auditoria confirmou que parte das suítes históricas usa seletores,
telas, textos, loaders, contagens e expectativas de versões anteriores.

Isso não significa que os testes históricos devam ser apagados.

## Separar

### Testes históricos

Registro do que cada rodada validava naquele momento.

### Gate cumulativo vigente

Representa os requisitos atualmente aprovados da SYZIA consolidada.

# 10. NÃO REESCREVER A HISTÓRIA

Não: - apagar suíte porque falha; - editar expectativa antiga apenas
para ficar verde; - substituir snapshot histórico silenciosamente; -
fingir que regra antiga ainda é requisito atual; - usar históricos como
única prova de regressão atual.

# 11. CRIAR GATE CUMULATIVO ATUAL

Criar comando claramente identificável, seguindo o padrão real do
projeto, conceitualmente como `test:current-gate`.

Deve: - executar suítes vigentes; - cobrir requisitos atuais; -
incorporar regressões ainda válidas; - não depender de seletores/textos
substituídos; - não ignorar falhas reais; - retornar status não-zero em
falha; - produzir relatório reproduzível; - documentar quais suítes
pertencem ao gate.

Reutilizar testes existentes; não duplicar centenas sem necessidade.

# 12. MAPA HISTÓRICO × VIGENTE

Criar `docs/testing/current-regression-gate.md` contendo: - suítes do
gate atual; - suítes preservadas somente como histórico; - requisitos
atuais cobertos; - substituições legítimas; - lacunas; - pendências
externas.

Para cada falha histórica da 043: - verificar se requisito ainda
existe; - se existe, garantir cobertura vigente equivalente/melhor; - se
foi substituído por decisão aprovada, documentar; - não simplesmente
remover.

# 13. TESTES OBRIGATÓRIOS --- AUD-001

1.  avaliação sem proposta → reserva negada;
2.  proposta enviada não aprovada → negada;
3.  proposta recusada → negada;
4.  proposta aprovada → permitida se Agenda permitir;
5.  horário ocupado após aprovação → proposta continua aprovada;
6.  contratação direta continua funcionando;
7.  agendamento manual legítimo continua;
8.  manual não contorna pedido sob avaliação;
9.  wrapper legada não contorna;
10. RPC/API direta não contorna;
11. tentativa negada não muda oportunidade;
12. replay não duplica appointment;
13. Empresa A não agenda pedido B.

# 14. TESTES OBRIGATÓRIOS --- AUD-002

14. reserva antiga permanece histórica sem alteração;
15. remarcação após aumento de buffer usa buffer vigente;
16. remarcação após redução usa regra vigente;
17. duração de serviço continua separada do buffer;
18. conflito causado pelo buffer bloqueia;
19. falha preserva reserva antiga;
20. remarcação de uma parte usa buffer vigente;
21. replanejamento integral revalida buffers;
22. capacidade/bloqueio/funcionamento continuam válidos.

# 15. TESTES OBRIGATÓRIOS --- AUD-003

23. Parte 2 não vai antes da Parte 1;
24. Parte 1 não vai depois da Parte 2;
25. parte intermediária respeita anterior/posterior em 3+ partes;
26. remarcação válida funciona;
27. tentativa inválida preserva agenda;
28. acompanhamento mantém ordem;
29. Agenda mantém ordem;
30. replanejamento pode reorganizar conjunto;
31. histórico preservado;
32. cancelamento continua correto.

# 16. TESTES OBRIGATÓRIOS --- AUD-004

33. gate oficial executa;
34. sucesso quando vigentes passam;
35. falha controlada retorna status não-zero;
36. documentação lista suítes vigentes;
37. históricos permanecem preservados;
38. requisitos antigos ainda válidos têm cobertura atual;
39. requisitos substituídos estão documentados;
40. build/typecheck no gate ou pipeline documentado;
41. migrations/upgrade/integridade com cobertura vigente;
42. fluxos válidos 040/041/042 continuam cobertos.

# 17. REGRESSÃO NECESSÁRIA

Cobrir ainda: - contratação direta; - avaliação; - proposta/aprovação; -
horário pretendido; - agenda direta/manual; - múltiplos períodos; -
remarcação/replanejamento/cancelamento; - conclusão; - Home; - Equipe
SYZIA; - autonomia; - planos/capabilities; - isolamento A/B; -
RLS/grants; - revogação em sessão; - multissserviço; -
Financeiro/Métricas afetados por conclusão; - build/typecheck; - upgrade
042→044 em banco populado se houver migration.

# 18. PENDÊNCIAS EXTERNAS --- NÃO CORRIGIR

Continuam fora: - Auth real; - SMTP real; - Storage/gateway real; -
PostgREST/schema cache real; - concorrência PostgreSQL independente; -
backup/restauração; - volume/performance real; - provider real.

Não declarar homologados.

# 19. NÃO ADICIONAR

Não adicionar nova funcionalidade, novos planos, IA, gateway, cobrança,
demo oficial, vídeo, tutorial, marketing, integração ou redesign.

Corrigir somente AUD-001, AUD-002, AUD-003 e AUD-004.

# 20. ENTREGA

Entregar: - projeto consolidado pós-correções; - migration 044 somente
se necessária; - guia de upgrade sem reset; - relatório técnico; -
inventário de arquivos alterados; - relatório separado de AUD-001 a
AUD-004; - evidência antes/depois; - testes focados; - resultado do gate
cumulativo vigente; - mapa histórico × vigente; - regressão
necessária; - pendências externas preservadas.

Para cada AUD informar causa, correção, arquivos, testes, risco residual
e resultado.

# 21. CRITÉRIO DE CONCLUSÃO

Somente concluir localmente se: - AUD-001 não for reproduzível; -
AUD-002 não for reproduzível; - AUD-003 não for reproduzível; - gate
cumulativo do AUD-004 estiver definido e executável; - regressões
necessárias passarem; - nenhuma autorização for ampliada; - nenhuma
migration histórica for alterada; - nenhum histórico for apagado.

Se não puder comprovar, marcar PENDENTE/BLOQUEADO.

# 22. PARADA OBRIGATÓRIA

Depois de corrigir, testar, documentar e entregar:

> **PARAR.**

Não iniciar bateria final ampla automaticamente. Não iniciar 045. Não
fazer deploy. Não publicar. Não preparar demo ou vídeo.

A próxima etapa será a **bateria final pós-correções**, solicitada
separadamente pelo proprietário.
