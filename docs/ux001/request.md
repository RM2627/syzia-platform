# SYZIA --- CORREÇÃO FINAL UX-001 + FEATURE FREEZE

## Preservar o contexto empresarial ao abrir tickets e encerrar alterações pré-lançamento

> **LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.**
>
> Base de trabalho: **`SYZIA-044-UX-Final-Consolidado`**, resultante da
> auditoria final de usabilidade e desempenho.
>
> Esta é uma intervenção **cirúrgica**.
>
> Está autorizada exclusivamente a correção do **UX-001**.
>
> O **UX-002 NÃO está autorizado** e deve permanecer adiado para
> pós-lançamento.
>
> Depois da correção, regressão e entrega, a base entra em **FEATURE
> FREEZE**.

------------------------------------------------------------------------

# 0. CONTEXTO

A auditoria final de usabilidade e desempenho já:

-   corrigiu o carregamento duplo ao abrir empresa;
-   eliminou o desaparecimento do shell durante carregamento de módulos
    lazy;
-   reduziu `onboarding_context` duplicado;
-   aplicou otimizações seguras de contexto, mídia, Central, categorias
    e capacidades;
-   preservou regras de negócio, permissões, migrations e segurança;
-   executou o gate cumulativo vigente com sucesso.

Restaram somente dois itens que exigiam decisão do proprietário:

-   `UX-001` --- navegação empresarial/global de tickets;
-   `UX-002` --- ciclo de login/troca de contexto.

Decisão do proprietário:

> **UX-001 --- APROVADO PARA CORREÇÃO AGORA.**

> **UX-002 --- ADIADO PARA PÓS-LANÇAMENTO. NÃO ALTERAR.**

------------------------------------------------------------------------

# 1. PROBLEMA UX-001

No ambiente empresarial, ao abrir um ticket, a navegação atual leva
para:

`/central/:code`

Isso provoca mudança de contexto:

-   desaparece a navegação da empresa;
-   o usuário entra na Central global;
-   o filtro/fila empresarial pode voltar ao padrão;
-   ao retornar ou abrir outro ticket, pode ser necessário selecionar
    novamente a fila/filtro;
-   a experiência dá a impressão de que o usuário "saiu da empresa" para
    atender aquele cliente.

A operação funciona, mas a navegação não preserva adequadamente o
contexto empresarial.

------------------------------------------------------------------------

# 2. DECISÃO DE PRODUTO APROVADA

A SYZIA possui dois contextos distintos de atendimento.

## A. Atendimento dentro da empresa

Quando ADM, funcionário próprio ou outro usuário autorizado está
operando **dentro de uma empresa**, abrir/trocar um ticket deve
preservar o contexto empresarial.

Direção aprovada:

`/painel/:empresa/atendimento?ticket=...`

ou a representação equivalente já compatível com a arquitetura atual.

O usuário deve continuar vendo:

-   navegação da empresa;
-   empresa atual;
-   contexto empresarial;
-   aba/fila coerente;
-   possibilidade de voltar para a operação da empresa sem atravessar a
    Central global.

## B. Central global

A rota:

`/central/:code`

continua válida para a **Central global**, especialmente para operação
compartilhada da Equipe SYZIA e demais fluxos globais que legitimamente
utilizam esse contexto.

> **NÃO remover a Central global.**

> **NÃO transformar toda abertura de ticket em rota empresarial.**

A correção é preservar corretamente o contexto de origem.

------------------------------------------------------------------------

# 3. COMPORTAMENTO ESPERADO

## Origem empresarial

Exemplos:

-   Home da empresa → Atendimento;
-   Home → Pendência ligada a atendimento;
-   Comercial da empresa → ticket;
-   Clientes → atendimento;
-   `/painel/:empresa/atendimento`;
-   outra tela empresarial com link para ticket.

Ao abrir o ticket:

> permanecer no contexto empresarial.

Preferencialmente:

`/painel/:empresa/atendimento?ticket=<codigo>`

Ao trocar de ticket:

-   atualizar o ticket sem abandonar o painel empresarial;
-   preservar o filtro/fila empresarial quando fizer sentido;
-   não obrigar o usuário a selecionar novamente "Todos" apenas porque
    abriu um ticket;
-   não carregar contexto de ticket anterior;
-   manter autorização e isolamento.

## Origem global

Quando o usuário está legitimamente na Central global:

`/central`

ou rota global equivalente,

abrir ticket continua usando:

`/central/:code`

ou estrutura global equivalente.

A Central global continua independente.

------------------------------------------------------------------------

# 4. FILTROS E ABAS

A auditoria identificou perda/reinicialização de filtro ao sair do
contexto empresarial para a Central global.

Corrigir de maneira previsível.

## Dentro do ambiente empresarial

Ao abrir e trocar tickets:

-   preservar a aba/fila selecionada quando ela continuar válida;
-   preservar filtros locais relevantes durante a mesma experiência;
-   não resetar silenciosamente para uma aba diferente sem necessidade;
-   não reutilizar filtro de outra empresa;
-   ao trocar Empresa A → Empresa B, limpar/recalcular o que for
    específico de A.

## Atendimento × Pendências

Definir comportamento determinístico ao alternar:

-   Atendimento;
-   Pendências.

Não deixar o resultado depender acidentalmente do estado interno
anterior do mesmo componente.

Se cada área tiver aba inicial própria, documentar e testar.

Se o filtro puder ser preservado legitimamente, preservar apenas dentro
do mesmo escopo empresarial.

------------------------------------------------------------------------

# 5. LINKS DE OUTRAS ÁREAS

Revisar todos os links que abrem tickets a partir do contexto
empresarial, principalmente:

-   Home;
-   Precisa da sua atenção;
-   Pendências;
-   Atendimento;
-   Comercial;
-   Clientes;
-   notificações/retornos quando existentes.

Regra:

> **Origem empresarial deve abrir o ticket no ambiente empresarial,
> salvo quando a ação for explicitamente "Abrir na Central global".**

Não deixar metade dos links usando `/central/:code` e metade usando o
painel empresarial sem razão.

------------------------------------------------------------------------

# 6. VOLTAR / HISTÓRICO DO NAVEGADOR

Validar:

-   abrir ticket;
-   trocar ticket;
-   voltar;
-   avançar;
-   fechar/limpar seleção quando aplicável;
-   atualizar a página com `?ticket=...`;
-   abrir link diretamente;
-   copiar URL empresarial do ticket;
-   sessão já autenticada;
-   acesso sem autorização.

O histórico não deve criar loop nem devolver o usuário a contexto
incorreto.

------------------------------------------------------------------------

# 7. AUTORIZAÇÃO E SEGURANÇA

Esta correção é de navegação/UX.

NÃO alterar:

-   RLS;
-   FORCE RLS;
-   grants;
-   capabilities;
-   autonomia;
-   papéis;
-   regras de atribuição;
-   isolamento multiempresa;
-   regras de preço;
-   regras de atendimento compartilhado.

A presença de `?ticket=<codigo>` NÃO concede acesso.

Servidor/banco continuam sendo a fronteira de autorização.

Testar:

-   Empresa A não abre ticket B;
-   usuário sem grant continua bloqueado;
-   vínculo revogado continua bloqueado;
-   Equipe SYZIA não recebe permissão nova;
-   ADM não ganha controle global;
-   URL direta não contorna autorização.

------------------------------------------------------------------------

# 8. NÃO ALTERAR UX-002

O item `UX-002` permanece deliberadamente adiado.

Não modificar nesta rodada:

-   ciclo de login;
-   `window.location.assign` apenas para eliminar verificações;
-   `AuthProvider`;
-   estratégia global de sessão;
-   verificações de permissões na entrada;
-   inatividade;
-   termos;
-   verificação cadastral;
-   revalidação de contexto;
-   cache persistente de autorização.

As verificações repetidas de login/troca de contexto são aceitas
temporariamente porque removê-las exige revisão arquitetural de Auth e
autorização.

> **Não aproveitar esta correção para "otimizar" UX-002.**

Registrar no relatório:

`UX-002 — ADIADO_PARA_POS_LANCAMENTO`

------------------------------------------------------------------------

# 9. NÃO REABRIR OUTRAS OTIMIZAÇÕES

Preservar as correções já entregues na auditoria de desempenho:

-   `PERF-001` a `PERF-013`;
-   shell estável;
-   um `onboarding_context` na montagem;
-   reuso seguro de `company_context`;
-   lock de clique duplo;
-   chave de `PermissionProvider`;
-   atualizações paralelas da Central;
-   carregamento concorrente de imagens;
-   reuso de categorias;
-   reuso de capabilities;
-   compartilhamento temporário de downloads;
-   correção de preview de imagem;
-   mensagens de erro refinadas.

Não refatorar esses itens sem necessidade direta do UX-001.

------------------------------------------------------------------------

# 10. TESTES OBRIGATÓRIOS

Executar pelo menos:

## Contexto empresarial

1.  empresa → Atendimento → abrir ticket;
2.  confirmar que shell/navegação empresarial permanecem;
3.  confirmar URL empresarial com ticket;
4.  trocar ticket;
5.  confirmar filtro/fila preservado;
6.  voltar;
7.  avançar;
8.  atualizar página com ticket selecionado;
9.  abrir ticket a partir da Home;
10. abrir a partir de Pendências;
11. abrir a partir do Comercial;
12. abrir a partir de Cliente quando houver link;
13. alternar Atendimento ↔ Pendências;
14. confirmar comportamento determinístico da aba/filtro.

## Central global

15. abrir Central global;
16. abrir ticket global;
17. trocar ticket global;
18. confirmar que permanece na Central global;
19. confirmar que a correção empresarial não quebrou a Central.

## Isolamento/autorização

20. Empresa A → ticket A;
21. tentar ticket B por URL;
22. usuário sem autorização;
23. vínculo/grant revogado quando fixture permitir;
24. Equipe SYZIA atribuída;
25. Equipe SYZIA não atribuída.

## Responsividade

26. desktop;
27. 390 px;
28. 320 px quando suportado;
29. navegação/filtro/ticket sem overflow novo.

## Performance percebida

30. abrir ticket empresarial não deve provocar troca desnecessária para
    shell global;
31. não introduzir novo loading global;
32. não duplicar consultas apenas por mudança da URL do ticket;
33. não reaparecer contexto do ticket anterior durante a troca.

------------------------------------------------------------------------

# 11. REGRESSÃO

Depois da correção:

-   executar testes focados do UX-001;
-   executar navegador relevante;
-   executar `npm run test:current-gate`;
-   build/typecheck;
-   verificar integridade das migrations;
-   confirmar que `PERF-001` a `PERF-013` permanecem funcionais.

Não afrouxar teste para obter verde.

Se algum teste histórico representar comportamento deliberadamente
substituído pelo UX-001, preservar o teste histórico e atualizar apenas
o gate vigente/documentação conforme a política já aprovada para testes
históricos × atuais.

------------------------------------------------------------------------

# 12. MEDIÇÃO ANTES × DEPOIS

Registrar especificamente o UX-001.

Exemplo:

## Antes

-   origem: painel empresarial;
-   abertura leva a `/central/:code`;
-   shell empresarial desaparece;
-   filtro precisa ser refeito;
-   número de cliques para trocar ticket;
-   requests relevantes.

## Depois

-   origem empresarial permanece no painel;
-   ticket abre pelo contexto empresarial;
-   shell permanece;
-   filtro permanece quando válido;
-   troca de ticket direta;
-   Central global preservada.

Não inventar números.

------------------------------------------------------------------------

# 13. SEM NOVA MIGRATION, SALVO NECESSIDADE REAL

A expectativa é que esta seja uma correção de navegação/frontend.

Se não houver mudança de banco:

> **NÃO criar migration.**

Não criar migration apenas para numerar rodada.

------------------------------------------------------------------------

# 14. ENTREGÁVEIS

Entregar:

1.  projeto consolidado com UX-001 corrigido;
2.  `RELATORIO-UX001-FINAL.md`;
3.  matriz antes × depois do UX-001;
4.  inventário de arquivos alterados;
5.  evidências desktop/mobile;
6.  resultados dos testes focados;
7.  resultado do gate cumulativo;
8.  confirmação explícita:
    -   UX-001 corrigido;
    -   UX-002 não alterado;
    -   PERF-001 a PERF-013 preservados;
    -   migrations históricas preservadas;
    -   sem deploy/publicação.

------------------------------------------------------------------------

# 15. FEATURE FREEZE

Se:

-   UX-001 estiver corrigido;
-   Central global continuar correta;
-   autorização/isolamento permanecerem;
-   gate cumulativo passar;
-   não surgir bug crítico/alto novo diretamente causado pela alteração;

declarar no relatório:

> **SYZIA --- FEATURE FREEZE FUNCIONAL PRÉ-LANÇAMENTO**

A partir desse ponto:

-   NÃO adicionar novas funcionalidades;
-   NÃO fazer redesign;
-   NÃO reabrir arquitetura;
-   NÃO alterar fluxo aprovado;
-   NÃO implementar UX-002 antes do lançamento.

Exceções: - bug sério; - segurança; - perda/corrupção de dados; -
bloqueio de lançamento; - alteração explicitamente aprovada pelo
proprietário.

------------------------------------------------------------------------

# 16. APÓS O FEATURE FREEZE

Não executar automaticamente.

Próximas atividades serão tratadas separadamente:

-   homologações externas realmente necessárias;
-   preparação de lançamento;
-   propaganda em imagens/carrosséis;
-   página/CTA comercial;
-   demonstrações por videochamada;
-   eventuais materiais de marketing.

Não misturar essas atividades com esta correção.

------------------------------------------------------------------------

# 17. PARADA OBRIGATÓRIA

Depois de:

-   corrigir UX-001;
-   testar;
-   executar gate;
-   documentar;
-   consolidar;
-   declarar feature freeze se os critérios forem atendidos;

> **PARAR.**

Não fazer deploy. Não publicar. Não iniciar UX-002. Não adicionar
funcionalidades. Não iniciar marketing. Não iniciar nova auditoria.
