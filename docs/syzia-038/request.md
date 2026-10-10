# SYZIA --- RODADA 038 PÓS-HOMOLOGAÇÃO 037

## Publicação + dark mode + multissserviço + relações entre serviços + visualizador de senha

> **Base exclusiva:** consolidado SYZIA 037 mais recente.
>
> Esta rodada reúne os achados posteriores à 037. Depois dela, o
> proprietário pretende homologar separadamente o **fluxo completo de
> atendimento**.
>
> Não reconstruir funcionalidades já existentes.

## 0. Regras gerais

-   Inspecionar a 037 antes de alterar.
-   Reutilizar solicitações, orçamento por itens, acompanhamento seguro
    do consumidor, serviços, adicionais, página pública, temas,
    permissões e auditoria existentes.
-   **Não criar outra Central do cliente.**
-   Não criar sistema paralelo de pedidos/orçamentos.
-   Não hardcodar regras de estética automotiva; tudo deve ser
    multissegmento.
-   Preservar solicitações antigas de serviço único.
-   Preservar Auth, RLS, grants, isolamento multiempresa e Storage.
-   Sem reset, deploy ou produção.
-   Não repetir auditoria mestre; usar testes focados + build/typecheck.
-   Preservar migrations existentes. Nova migration somente se realmente
    necessária, incremental e com upgrade sem reset.

# 1. UX DE PUBLICAÇÃO

Hoje **Publicar alterações** fica desabilitado até o administrador abrir
**Visualizar como cliente**. A regra é válida, mas parece defeito.

Corrigir a UX sem remover a revisão obrigatória:

-   antes da revisão, explicar claramente: **Revise a prévia para
    publicar**;
-   depois da revisão da versão atual: **✓ Prévia revisada**;
-   então habilitar **Publicar alterações**;
-   não usar cursor/animação que pareça loading infinito quando o estado
    é apenas bloqueado;
-   se a versão mudar depois de revisada, preservar a regra existente de
    revisão da versão correta;
-   Portfólio continua opcional e não bloqueia publicação;
-   desktop e celular.

# 2. BUG --- ORÇAMENTO/AGENDAMENTO NO TEMA ESCURO

Na visualização do cliente, tema claro funciona. No tema escuro, o modal
fica com superfícies claras e textos claros, tornando o conteúdo
ilegível.

Corrigir pelo Design System/tokens existentes, não com remendo para uma
empresa específica.

Revisar as quatro etapas:

**Serviço → Detalhes → Seus dados → Revisão**

e todos os elementos relevantes:

-   modal/backdrop;
-   cabeçalho e fechar;
-   progresso/etapas;
-   títulos/textos;
-   labels;
-   inputs/selects/textarea/checkbox;
-   adicionais;
-   upload quando aplicável;
-   resumo de preço;
-   divisores;
-   links;
-   erros;
-   botões;
-   disabled/loading;
-   revisão final.

A cor empresarial fica em CTA, foco, seleção e destaques. Textos comuns
continuam neutros.

Testar light/dark, desktop/celular, cores de marca
claras/escuras/saturadas e outros overlays públicos que reutilizem o
mesmo padrão afetado. Tema claro não pode regredir.

# 3. PEDIDO / ORÇAMENTO MULTISSERVIÇO

O consumidor deve poder selecionar vários serviços antes de enviar.

Exemplo:

-   Higienização interna;
-   Lavagem detalhada;
-   Polimento.

Isso gera **uma única solicitação**, não uma solicitação por serviço.

A página deve permitir:

-   **Adicionar ao pedido**;
-   adicionar/remover vários serviços;
-   visualizar seleção;
-   indicador como **Seu pedido · 2 serviços**;
-   continuar para os detalhes.

Fluxo:

**Serviços → Detalhes → Seus dados → Revisão → Enviar**

Resultado:

-   um consumidor;
-   uma solicitação;
-   vários itens de serviço;
-   detalhes/adicionais vinculados ao item correto;
-   um orçamento consolidado;
-   um acompanhamento seguro.

Serviço único continua funcionando e histórico antigo não pode quebrar.

# 4. DETALHES E ADICIONAIS POR SERVIÇO

Cada item mantém seus próprios:

-   adicionais;
-   perguntas;
-   detalhes;
-   condições;
-   preço/modalidade.

Não misturar adicionais entre serviços.

Na revisão:

**Serviço A → detalhes → adicionais → condição/preço**

**Serviço B → detalhes → adicionais → condição/preço**

Preservar distinção entre:

1.  o que o consumidor pediu;
2.  o que o atendente propôs;
3.  o que o consumidor aprovou.

# 5. PREÇOS MULTISSERVIÇO

## Preço fixo

Pode compor total quando determinístico.

## A partir de

Não apresentar como total final. Quando válido, usar linguagem como
**Estimativa inicial: a partir de R\$ X**.

## Sob consulta

Não inventar preço nem tratar como zero. Informar que a empresa
confirmará o orçamento.

Em combinação mista, não mostrar um "total final" falso. Separar valores
conhecidos, estimativas e itens pendentes.

# 6. RELAÇÕES ENTRE SERVIÇOS

A empresa configura as relações. A SYZIA não deve adivinhar.

## Já incluído

Ex.: A inclui B.

Se o consumidor selecionar A e tentar incluir B:

-   informar que B já está contemplado;
-   evitar item/cobrança redundante;
-   explicar qual serviço o inclui.

A relação é direcional: A incluir B não significa B incluir A.

## Incompatível

-   impedir combinação;
-   explicar;
-   não remover seleção silenciosamente.

## Requer revisão

-   permitir envio;
-   sinalizar combinação;
-   marcar para revisão humana;
-   mostrar ao atendente os itens que geraram o alerta;
-   não apresentar orçamento final falso.

Validar configuração contra auto-relação, duplicidade, contradições e
ciclos problemáticos de inclusão quando detectáveis.

# 7. CONFIGURAÇÃO PELA EMPRESA

Adicionar à configuração de serviço uma área equivalente a:

## Relações com outros serviços

Selecionar outro serviço da mesma organização e definir:

-   **Já incluído**
-   **Incompatível**
-   **Requer revisão**

A UI deve deixar clara a direção quando necessária.

Regras:

-   relações somente dentro da mesma organização;
-   serviço sem relação continua normal;
-   somente permissão adequada de gestão de serviços pode alterar;
-   preservar integridade/histórico de serviços desativados/excluídos;
-   auditar conforme padrão existente.

# 8. REVISÃO PELO ATENDENTE

A seleção do consumidor é intenção inicial, não necessariamente proposta
final.

Fluxo:

**Consumidor seleciona → solicitação chega → atendente revisa → ajusta →
explica → apresenta orçamento → consumidor aprova/recusa**

Permitir:

-   alerta de sobreposição;
-   remover item redundante da proposta;
-   ajustar valores pelas regras existentes;
-   manter pedido original no histórico;
-   mostrar alterações relevantes ao consumidor;
-   orçamento final discriminado.

Não reconstruir nesta rodada todo o atendimento; implementar apenas o
necessário para o multissserviço chegar corretamente ao fluxo já
existente.

# 9. REUTILIZAR O ACOMPANHAMENTO SEGURO EXISTENTE

**Não criar nova Central do cliente.**

Reutilizar o mecanismo existente de link/token/acesso à solicitação.

Uma solicitação multissserviço deve aparecer como uma única solicitação
contendo:

-   serviços;
-   adicionais/detalhes;
-   status;
-   orçamento discriminado;
-   ajustes;
-   proposta final;
-   aprovação/recusa;
-   conversa/atualizações existentes.

Preservar expiração, revogação, autorização e isolamento.

Não exigir nova conta/senha apenas para acompanhar.

# 10. COMBOS --- NÃO IMPLEMENTAR AGORA

A arquitetura não deve impedir combos futuros, mas nesta rodada:

-   não criar combos;
-   não criar descontos automáticos;
-   não sugerir pacotes inexistentes.

# 11. MOSTRAR / OCULTAR SENHA

Adicionar ícone de olho aos campos reais de senha, após inventário da
interface, incluindo:

-   login;
-   primeiro acesso;
-   confirmação da nova senha;
-   recuperação/redefinição;
-   alteração no perfil;
-   self-service quando houver criação de senha;
-   demais campos reais de senha.

Regras:

-   começa oculta;
-   alternar não perde valor;
-   cada campo controla sua visibilidade;
-   compatível com autofill/gerenciadores;
-   teclado;
-   acessibilidade **Mostrar senha / Ocultar senha**;
-   preservar autocomplete adequado;
-   não tratar código temporário como senha;
-   não alterar regras de Auth.

# 12. PERMISSÕES E ISOLAMENTO

Reutilizar grants existentes quando semanticamente corretos.

Se gestão das relações exigir nova capacidade, criar grant granular.
Poder atender não concede automaticamente permissão para alterar
catálogo/relações.

Testar organização A/B:

-   serviço A não relaciona serviço de B;
-   solicitação A não inclui item de B;
-   consumidor A não acessa B;
-   atendente A não recebe B.

# 13. BANCO / UPGRADE

Inspecionar primeiro o schema existente, especialmente
solicitação/orçamento por itens.

**Não criar schema paralelo se estruturas atuais já suportarem parte do
multissserviço.**

Se persistência nova for necessária:

-   migration incremental posterior à base atual;
-   migrations anteriores intactas;
-   sem reset;
-   upgrade sobre banco populado;
-   preservar solicitações antigas;
-   preservar acompanhamento seguro;
-   preservar histórico.

Documentar a necessidade de cada tabela/coluna/índice novo.

# 14. TESTES FOCADOS

## Publicação

Prévia não revisada, revisada, alteração após revisão, publicação,
portfólio opcional, desktop/celular.

## Tema

Quatro etapas em claro/escuro; cores de marca diferentes;
erro/loading/disabled; preview/publicado.

## Multissserviço

1 serviço; 2+; adicionar/remover; adicionais diferentes; fixo; a partir
de; sob consulta; combinação mista; revisão; envio único.

## Relações

A inclui B; incompatível; requer revisão; auto-relação; contradição;
isolamento A/B.

## Atendente

Solicitação sinalizada → revisão → ajuste → proposta discriminada →
consumidor visualiza → aprova/recusa pelo acompanhamento existente.

## Acompanhamento

Link seguro existente abre uma solicitação multissserviço; sem novo
sistema de acesso.

## Senhas

Mostrar/ocultar em todos os campos reais, teclado, autofill, mobile e
confirmação.

## Compatibilidade

Solicitação antiga de serviço único; orçamento antigo; página pública;
agenda; conversa; permissões; isolamento.

# 15. FORA DO ESCOPO

Não implementar:

-   combos;
-   nova Central do cliente;
-   conta obrigatória do consumidor;
-   novo sistema de tokens;
-   reconstrução completa do atendimento;
-   deploy;
-   domínio;
-   mudanças de billing sem relação com esta rodada.

# 16. ENTREGA

Entregar consolidado completo e relatório com:

1.  UX de publicação;
2.  correção dark mode;
3.  modelagem multissserviço;
4.  relações entre serviços;
5.  revisão pelo atendente;
6.  reutilização do acompanhamento;
7.  visualizador de senha;
8.  permissões;
9.  migration/upgrade, se houver;
10. testes;
11. compatibilidade;
12. limitações.

# 17. CRITÉRIOS DE ACEITE

-   [ ] Publicação explica claramente a prévia obrigatória.
-   [ ] Modal funciona em tema claro e escuro.
-   [ ] Consumidor seleciona vários serviços em uma solicitação.
-   [ ] Adicionais/detalhes permanecem por item.
-   [ ] Preços fixo/a partir/sob consulta são tratados corretamente.
-   [ ] Relações Já incluído/Incompatível/Requer revisão funcionam.
-   [ ] Relações são configuráveis por empresa e isoladas por tenant.
-   [ ] Atendente recebe e revisa pedido multissserviço sem perder a
    seleção original.
-   [ ] Consumidor vê a proposta final discriminada.
-   [ ] Acompanhamento seguro existente é reutilizado.
-   [ ] Nenhuma Central paralela é criada.
-   [ ] Combos não são implementados.
-   [ ] Campos de senha possuem mostrar/ocultar acessível.
-   [ ] Solicitações antigas continuam funcionando.
-   [ ] Isolamento A/B permanece.
-   [ ] Build/typecheck e testes focados passam.
-   [ ] Sem reset.
-   [ ] Migrations anteriores permanecem intactas.

# 18. REGRA FINAL

Esta é a rodada de consolidação pós-037.

Primeiro inspecionar e reutilizar a arquitetura existente. Depois
implementar somente o necessário.

**Não iniciar automaticamente a homologação completa do fluxo de
atendimento.**

Ao concluir:

**ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
