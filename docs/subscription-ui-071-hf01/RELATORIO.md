# SYZIA 071-HF01 — Plano e assinatura

Base oficial conferida: `f3eace355c136d37d53fc5bd72392ddb04bd9e10` (071 integrada). Branch local: `syzia-subscription-ui-071-hf01`. Entrega incremental; sem commit, push, deploy, alteração de configuração externa ou execução de migrations.

## Diagnóstico

A tela foi reproduzida no Chromium com o componente real, `Workspace`, dependências CSS do `FoundationApp` e respostas sintéticas. Os problemas comprovados foram:

- O checkout dependia de `.card`, com margem inferior global de 24 px somada ao gap da grade. Os cards não possuíam estrutura interna para alinhar as ações.
- O texto de trial e a previsão de cobrança eram repetidos três vezes; títulos, totais, limites e ações disputavam a hierarquia. Na reprodução desktop, os cards tinham aproximadamente 563 px de altura.
- O CSS usava seletores compartilhados `.stripe-offers` e regras amplas para `strong`, também aproveitados pelo catálogo administrativo. Os estados desabilitados herdavam opacidade global de 0,5, reduzindo o contraste.
- Não existia resumo de estado para quem ainda não tinha assinatura. Uma falha inicial também deixava a mensagem de carregamento junto ao erro.
- A data da primeira cobrança era calculada com o relógio do navegador + sete dias. Isso não era uma data confirmada pelo provedor.
- O componente descartava algumas respostas de outra organização, mas o tratamento de erro/finalização e a reinicialização visual não cobriam todo o ciclo assíncrono.

**Limite da reprodução:** os cards permaneceram visíveis com os estilos da base oficial carregados. O desaparecimento completo relatado em produção não foi reproduzido. Não se confirmou falha de cache, CSS ausente ou mistura de artefatos publicados; essas hipóteses não são apresentadas como causas comprovadas. A captura anterior e as medidas estão em `evidencias/`.

## Correção

1. Cabeçalho “Plano e assinatura”, estado atual compacto, modalidades, revisão da escolha, gestão contextual e informações de segurança.
2. Cards com superfície, borda, cores e espaçamentos próprios, sem depender de `.card`. Três colunas no desktop, empilhamento no celular, ações alinhadas e foco visível. Na mesma reprodução desktop os cards passaram para aproximadamente 393 px, incluindo totais, equivalência mensal, cobrança integral, economia e limites.
3. Mensal R$ 59,90; semestral R$ 299,40 integrais, equivalente a R$ 49,90/mês; anual R$ 478,80 integrais, equivalente a R$ 39,90/mês. Os valores continuam provenientes do catálogo; a equivalência é apenas informativa. Nenhum preço é enviado pelo navegador ao comando financeiro.
4. Escolher uma modalidade apenas seleciona o card. A solicitação só ocorre após revisar a escolha, aceitar as condições e clicar em “Continuar no checkout seguro”. Trocar a seleção limpa o aceite local. Mantidos payload, chave de idempotência e comandos existentes.
5. Datas são exibidas somente quando presentes e válidas na resposta do backend. Não há previsão inventada com `Date.now()+7 dias`. “Cadastro preparado” deriva do registro `pending` já retornado por `billing_context`; nenhum parâmetro de retorno do navegador confirma uma assinatura.
6. Instância e estado do componente separados por organização; respostas/erros tardios e redirecionamentos de uma instância encerrada são ignorados. Há trava síncrona contra duplo clique. Após resultado incerto, a interface exige atualização antes de nova tentativa e preserva a chave da mesma operação.
7. O catálogo administrativo recebeu classes próprias para grade, formulário e campos. RPCs de edição, permissões, revisão e persistência não foram modificados.

## Gestão e preservação financeira

Foi necessário acrescentar **um booleano de leitura** à resposta autenticada de `/billing/checkout`: `stripe_operations_available`, derivado de `gateway.cfg.operationsEnabled`. Isso evita confundir “novas contratações suspensas” com “gestão de contratos existentes desabilitada”. Não é uma nova variável de ambiente e não habilita operações. Sem o indicador, a interface falha de forma fechada para gestão; a autorização definitiva continua no backend e no SQL.

Cancelamento e reativação usam exclusivamente `cancel` e `resume`, com confirmação explícita e condições de estado/período. A integração Stripe atual não possui comando operacional de alteração de modalidade; a interface informa essa limitação e não inventa uma ação financeira. Mercado Pago continua no componente e provedor originais.

Preservados: todos os preços/mapeamentos, trial, contratos históricos, SDK/adaptadores de criação, controladores financeiros, webhooks, reconciliação, autenticação e permissões. Nenhum arquivo de migration foi criado ou modificado. Nenhum serviço externo foi acessado para operações financeiras.

## Testes e evidências

**25 casos direcionados distintos aprovados:** 6 testes novos Node, 6 testes existentes de transporte Stripe, 9 testes novos de navegador e 4 regressões de catálogo da 071. TypeScript e build Vite aprovados (399 módulos). A reprodução anterior e reexecuções de captura não foram somadas como novos casos.

| Verificação | Resultado |
| --- | --- |
| Três cards, valores, equivalentes e cobrança integral | PASS |
| Larguras 1440, 1024, 390 e 360 px; sem overflow; botões alinhados | PASS |
| Contraste dos textos e controles críticos | PASS; menor razão medida 4,83:1 |
| Foco por teclado e seleção sem comando financeiro | PASS |
| Consentimento, payload e retry com mesma chave | PASS |
| Checkout bloqueado, falha de comunicação e retorno sem concessão de acesso | PASS |
| Cadastro preparado, trial, ativo, pendente, cancelamento e cancelado | PASS |
| Cancelamento/reativação e ausência de ação de modalidade não suportada | PASS |
| Resposta tardia e checkout de outra organização | PASS |
| Autenticação, delegação de autorização e indicador de leitura | PASS com serviços simulados |
| Transporte/HMAC existente e convivência Mercado Pago | PASS nos testes existentes direcionados |
| Catálogo administrativo, página pública e cadastro | 4 regressões existentes PASS |
| Build e `git diff --check` | PASS |

Uma execução intermediária detectou contraste transitório insuficiente ao mudar o fundo do botão selecionado. Foi removida a transição de fundo; a verificação permaneceu exigindo 4,5:1 e passou. Não se enfraqueceu o teste.

As capturas são do navegador e dos componentes executados, com dados fictícios e transporte simulado; não são telas geradas por IA nem evidência de produção. Incluem desktop, mobile, seleção semestral, trial, bloqueio e catálogo administrativo. Os testes de concorrência cobrem requisições/interações da interface; não são testes de concorrência do banco. Não se executaram gate geral, migrações, cobranças ou homologação real de Stripe/Supabase. O desaparecimento dos cards em produção e a publicação final permanecem sujeitos à conferência após deploy autorizado.

## Arquivos

Modificados: `Billing.tsx`, `SubscriptionCheckout.tsx`, `CommercialCatalog.tsx`, `stripe-checkout.css` e uma linha de `server/billing/stripe/runtime.mjs`. Adicionados: helper de apresentação, testes/configuração, documentos. O inventário do pacote contém todos os caminhos e hashes anteriores/novos. A verificação do patch também confere migrations, configurações, dependências e arquivos financeiros protegidos byte a byte.
