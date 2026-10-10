# SYZIA --- RODADA 039 PÓS-038

## Planos, Entitlements, Billing Provider e limpeza pré-lançamento

> **Base:** consolidado SYZIA 038 mais recente.
>
> Objetivo: transformar a criação de planos em um configurador comercial
> claro, garantir que cada recurso vendido tenha enforcement real no
> backend e deixar a cobrança pronta para receber futuramente um
> provider sem reconstruir o domínio.
>
> **Não escolher nem integrar cobrança real nesta rodada.** Depois desta
> entrega, o proprietário pretende homologar separadamente o fluxo
> completo de atendimento.

# 0. Regras

-   Inspecionar a 038 antes de alterar.
-   Reutilizar planos, versões, assinaturas, trial,
    entitlements/capacidades e hosted checkout existentes.
-   Não criar sistemas paralelos de planos, assinatura ou trial.
-   Não acoplar o domínio a Stripe, Mercado Pago, Asaas ou outro
    provider.
-   Sem cobrança real, reset, deploy ou produção.
-   Não usar mock silencioso em ambiente real.
-   Preservar Auth, RLS, grants, isolamento, auditoria e service role
    server-side.
-   Preservar migrations anteriores; nova migration somente incremental,
    justificada e testada sem reset.
-   Não alterar contratos/assinaturas existentes silenciosamente.

# 1. Landing e resíduos de desenvolvimento

## Mockup Estúdio Horizonte

Atualizar mockup/captura antiga da landing: -
`Estúdio Horizonte • Fictício` → **Estúdio Horizonte**; - remover
`Demonstração local · dados fictícios`; - quando necessário, usar uma
única identificação profissional: **Exemplo de página criada com a
SYZIA**; - conferir outros mockups antigos sem redesenhar
desnecessariamente a landing.

## Varredura pré-lançamento

Pesquisar toda a experiência visível por resíduos como: `fictício`,
`fictícia`, `dados fictícios`, `preço fictício`, `demonstração local`,
`demo`, `mock`, `fixture`, `localhost`, `127.0.0.1` e mensagens
técnicas/provisórias.

Exemplo obrigatório: `Preço fictício (R$)` → **Preço (R\$)**.

Verificar Administração, Planos, empresa, landing, página pública,
consumidor, login, primeiro acesso, financeiro, atendimento, estados
vazios, erros, confirmações e ajudas.

Não remover termos necessários de testes/fixtures/documentação técnica;
limpar a experiência real/comercial.

# 2. Reformular "Criar plano"

Transformar em configurador comercial, não formulário técnico.

## Informações

-   Nome;
-   descrição curta;
-   **Preço (R\$)**;
-   periodicidade;
-   **Teste gratuito (dias)** em vez de "Avaliação";
-   **Ordem de exibição**;
-   ativo/inativo.

Não obrigar limites não utilizados.

## O que está incluído

Inventariar recursos reais e apresentar opções compreensíveis, como: -
Página pública; - Clientes; - Solicitações e orçamentos; - Agenda; -
Acompanhamento do consumidor; - Financeiro; - Métricas; - Portfólio; -
Pendências; - Follow-up/recuperação; - Métricas comerciais; - Membros; -
Papéis/permissões; - Atendentes próprios; - Atendimento humano
compartilhado SYZIA, quando suportado.

Não vender recurso sem implementação/enforcement correspondente.

# 3. Separar recurso de disponibilidade comercial

Ter seção própria para: - Plano ativo; - Disponível para novas
empresas; - Mostrar no site; - Permitir self-service; - Oferecer teste
gratuito.

Permitir plano interno/não público sem outro sistema paralelo.

# 4. Reavaliar limites

Por padrão, permitir representar explicitamente como **Ilimitado**: -
Solicitações; - Atendimentos feitos pela própria empresa; -
Orçamentos; - Agendamentos; - Follow-ups feitos pela própria empresa.

Campo sem teto deve aparecer como **Ilimitado**, não como configuração
faltando.

Não diferenciar planos artificialmente com cotas arbitrárias.

Limites podem fazer sentido em: - Membros da equipe; - Serviços ativos,
se houver decisão comercial; - Atendimento humano prestado pela SYZIA; -
Follow-up humano executado pela operação SYZIA.

Super Admin e atendentes compartilhados SYZIA não consomem vaga
empresarial.

# 5. Semântica das cotas

## Solicitação

Pedido multissserviço da 038 continua sendo **1 solicitação**, não uma
unidade por serviço.

## Atendimento

Se alguma modalidade tiver cota, consumir somente na **primeira ação
humana substantiva do ticket**.

Pode incluir primeira resposta pública ou ação substantiva de orçamento,
agenda ou contato externo registrada.

Não consumir por criar, visualizar, abrir, assumir, transferir ou
reabrir o mesmo assunto. O mesmo ticket não consome novamente por
mensagens sucessivas.

## Follow-up

Tentativa significa tentativa efetivamente registrada/executada. Criar,
visualizar ou assumir tarefa não consome.

Alinhar backend, UI, documentação e enforcement.

# 6. Diferenciar planos por valor

Permitir Essencial, Profissional, Equipe ou outros nomes futuros sem
hardcode.

Diferenças podem vir de: - membros; - funcionalidades; - capacidades
comerciais; - métricas; - permissões; - elegibilidade/capacidade
humana; - outros recursos reais.

Não definir preços finais automaticamente nesta rodada.

# 7. Entitlements reais

Cada recurso prometido precisa corresponder a entitlement/capacidade
aplicada server-side.

Auditar e reutilizar capacidades existentes, incluindo quando
aplicável: - `software`; - `commercial_followups`; - `human_support`; -
`setup`.

Não basta esconder botão no frontend.

Sem capacidade, o backend deve negar a operação.

# 8. Validação das atribuições

Adicionar bloco:

## Validação das atribuições

Exemplo: - ✓ Operação empresarial --- vinculada; - ✓ Follow-up ---
vinculado; - ✓ Atendimento compartilhado --- não incluído; - ✓ Limite de
membros --- aplicado.

Detectar quando a UI promete algo sem enforcement real.

Mostrar **Plano consistente** quando alinhado.

Não permitir publicar/vender silenciosamente plano inconsistente.

# 9. Resumo comercial

Antes de salvar/publicar, mostrar: - nome; - descrição; - preço; -
periodicidade; - teste; - recursos; - membros; - limites; - itens
ilimitados; - atendimento compartilhado; - publicação no site; -
self-service; - status.

O administrador deve conseguir responder: **"É exatamente isso que quero
vender?"**

# 10. Versionamento

Empresa contrata uma **versão específica**.

Alterar plano depois não modifica silenciosamente empresas existentes.

Preservar: - versão contratada; - histórico; - preço server-side; -
entitlements da versão; - upgrade/downgrade explícitos.

Criar nova versão para novas adesões quando necessário.

# 11. Pagamento → assinatura → entitlements

Fluxo:

**Plano → Versão → Checkout → Pagamento confirmado pelo provider →
Assinatura ativa → Entitlements**

O navegador nunca declara `paguei` e nunca ativa assinatura apenas pelo
retorno do checkout.

Confirmação precisa ser validada server-side.

Falha/suspensão/regularização: - preserva dados/histórico; - não apaga
empresa; - bloqueia novas operações sujeitas ao contrato quando
aplicável; - mantém acesso necessário à regularização; - não cria
gratuidade substituta.

# 12. Billing Provider Adapter

A SYZIA é dona de planos, versões, trial, assinaturas e entitlements. O
provider cuida da cobrança.

Criar/preservar uma fronteira única capaz de suportar: - criar
checkout; - consultar/confirmar estado; - validar webhook; - normalizar
eventos; - renovação; - falha; - regularização; - cancelamento; -
reativação; - upgrade; - downgrade; - idempotência.

Não espalhar código específico do provider.

Eventos externos devem virar eventos/estados internos estáveis da SYZIA.

# 13. Administração → Cobrança

Criar/organizar área como:

**Provedor:** Não configurado\
**Status:** Aguardando integração\
**Checkout:** Não disponível\
**Webhooks:** Não configurados

No futuro poderá mostrar provider, sandbox, checkout, webhook validado,
planos vinculados e estado operacional.

Nunca mostrar segredos completos no frontend.

A ausência de provider não impede configurar planos.

# 14. Não escolher provider agora

Nesta rodada não: - escolher fornecedor definitivo; - criar conta
externa; - integrar cobrança real; - ativar webhook real; - realizar
pagamento; - inventar credenciais; - ativar mock em ambiente real.

Preparar somente a fronteira para o adapter futuro.

# 15. Testar atribuições do plano

Adicionar ação:

**Testar atribuições do plano**

Não realiza cobrança e não altera empresas reais.

Usar cenário controlado para verificar enforcement real.

Exemplo: - ✓ Página pública --- permitido; - ✓ Orçamentos ---
permitido; - ✓ Agenda --- permitido; - ✓ Financeiro --- permitido; - ✓
Follow-up --- permitido; - ✕ Atendimento compartilhado --- bloqueado; -
✓ 3 membros --- permitido; - ✕ 4º membro --- bloqueado.

Resultados: **Permitido / Bloqueado / Inconsistência**.

Testar capacidades, membros, suspensão e isolamento A/B.

# 16. Preparar teste futuro da cobrança

Documentar/habilitar futura homologação em sandbox:

**checkout → pagamento confirmado → webhook → assinatura ativa →
entitlements**

Quando houver provider: - pagamento recusado não libera; - retorno sem
confirmação não ativa; - webhook duplicado é idempotente; -
cancelamento/suspensão atualiza entitlements; - regularização restaura
somente o permitido; - upgrade/downgrade usa versão correta.

Não executar pagamento real agora.

# 17. Permissões e segurança

-   Somente autoridade administrativa apropriada cria/altera planos.
-   Alterar plano não concede acesso operacional aos dados das empresas.
-   Mudanças comerciais relevantes ficam auditadas.
-   Segredos nunca vão ao navegador.
-   Service role permanece server-side.
-   Entitlements não dependem de campos editáveis pelo cliente.
-   Isolamento multiempresa permanece.

# 18. Compatibilidade e upgrade

Preservar: - assinaturas; - trials; - versões; - concessões
administrativas; - empresas legacy; - histórico; - planos já
cadastrados; - estados de billing.

Não converter empresas automaticamente.

Se migration for necessária: - incremental; - transacional; - sem
reset; - upgrade sobre banco populado; - migrations anteriores intactas.

# 19. Testes focados

## Criador

Criação, edição, plano interno/público, self-service, trial/sem trial,
ilimitado, limite numérico, resumo e consistência.

## Entitlements

Recursos incluídos/excluídos no backend; capacidades reais
identificadas; membros; suspensão.

## Versionamento

Empresa antiga mantém versão antiga; nova recebe versão nova;
upgrade/downgrade explícitos.

## Billing sem provider

Planos configuráveis; checkout real indisponível; ausência de provider
não libera assinatura; nenhum mock silencioso.

## Segurança

Usuário empresarial não altera plano global; cross-tenant negado;
segredo ausente do bundle; retorno de checkout não ativa.

## Limpeza

Percorrer principais rotas e confirmar ausência de resíduos de
desenvolvimento na experiência real.

# 20. Fora do escopo

Não: - escolher provider; - cobrar cartão/Pix real; - criar webhook
externo real; - fazer deploy; - reconstruir atendimento; - definir
automaticamente preços comerciais finais; - criar combos; - refazer
multissserviço; - criar nova Central do cliente; - alterar Auth sem
relação direta.

# 21. Relatório final

Entregar: 1. limpeza pré-lançamento; 2. novo criador; 3.
recursos/limites; 4. semântica das cotas; 5. mapa recurso → entitlement;
6. validação; 7. versionamento; 8. assinatura/entitlements; 9. Billing
Provider Adapter; 10. Administração → Cobrança; 11. Testar atribuições;
12. migration, se houver; 13. testes; 14. compatibilidade; 15.
pendências para provider real.

# 22. Critérios de aceite

-   [ ] `Preço fictício` removido da experiência real.
-   [ ] Resíduos de desenvolvimento removidos da experiência comercial.
-   [ ] Mockup do Estúdio Horizonte atualizado.
-   [ ] Criar plano é um configurador comercial compreensível.
-   [ ] Recursos e disponibilidade estão separados.
-   [ ] Ilimitado é explícito.
-   [ ] Uso normal do software não recebe cotas artificiais por padrão.
-   [ ] Semântica de solicitação/atendimento/follow-up está alinhada.
-   [ ] Cada recurso prometido possui enforcement real.
-   [ ] Plano inconsistente é detectado.
-   [ ] Existe resumo comercial.
-   [ ] Versão contratada permanece congelada.
-   [ ] Pagamento só ativa após confirmação server-side.
-   [ ] Domínio não depende de provider específico.
-   [ ] Existe fronteira clara de Billing Provider Adapter.
-   [ ] Administração mostra estado da cobrança sem expor segredos.
-   [ ] Nenhum provider real foi integrado.
-   [ ] Existe **Testar atribuições do plano** com verificação real de
    backend.
-   [ ] Assinaturas/trials/legacy existentes preservados.
-   [ ] Isolamento e segurança preservados.
-   [ ] Build/typecheck e testes focados passam.
-   [ ] Sem reset.
-   [ ] Migrations anteriores intactas.

# 23. Regra final

Esta rodada deve deixar a SYZIA preparada para criar **planos comerciais
reais** e conectar futuramente um serviço de cobrança sem redesenhar o
domínio.

Princípio:

> **O que vendemos = o que a versão do plano contém = o que o backend
> autoriza.**

Futuramente:

> **Pagamento confirmado = assinatura ativa = exatamente os recursos
> contratados.**

Ao concluir:

**ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**

Não iniciar automaticamente nova fase nem a homologação completa do
fluxo de atendimento.
