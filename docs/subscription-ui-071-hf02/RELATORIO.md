# SYZIA 071-HF02 — Página de assinaturas

## Resultado

Defeito reproduzido na aplicação completa, corrigido e validado localmente. Pronto para revisão e integração; a sessão autenticada online não foi acessada e o resultado publicado ainda precisa ser conferido pelo proprietário. Não houve push, commit, deploy, SQL, cobrança, contratação nem alteração de credenciais.

Base oficial confirmada no GitHub: `16f01c815c1d457b2aef4b8ce713c945a2de0dc2` (071-HF01). Branch local isolada: `syzia-subscription-ui-071-hf02`.

## Causa comprovada

`FoundationApp.tsx` insere `PreparedCompany` antes de `Billing` no caminho de administrador da empresa, com `VITE_COMMERCIAL_PREPARATION_ENABLED=true`. Esse componente usava `<aside className="notice">`.

`src/style.css` aplica a **todo** `aside` `height:100vh`, `position:sticky`, `top:0` e flex em coluna. `src/brand/vireloq.css` aplica fundo escuro e cor de links de sidebar a `.app-shell aside`. Assim, um aviso de conteúdo recebeu o layout de barra lateral. Os cards não estavam ausentes do DOM nem ocultos por `test_allowed=false`: estavam muito abaixo do aviso, que também permanecia sobre a página durante a rolagem.

Medições na mesma rota e viewport 1440 × 1000, build de produção servido localmente:

| Medição | Antes, commit 16f01c8 | Depois |
|---|---:|---:|
| Altura do aviso | 1.000 px | 62,59 px |
| Posição do aviso | sticky | static |
| Topo do cabeçalho | 1.128 px | 128 px |
| Topo dos cards | 1.559,31 px | 637,91 px |
| Largura do documento | 1.440 px | 1.440 px |

As capturas `antes-desktop.png`, `depois-1440.png`, `depois-768.png` e `depois-390.png` registram a aplicação real executada no navegador. A falha foi reproduzida antes da alteração por uma asserção de altura, sem modificar o código da base. CSS empacotado/carregado foi exercitado pelo `index.html` oficial, imports lazy e rota protegida. Não foi necessário alterar CSS global, sidebar ou cache.

**Lacuna do HF01:** seu harness carregava estilos e Workspace, mas não montava o ramo `Shell → PermissionProvider → CompanyExperience → PermissionRoute → PreparedCompany → Billing`. O aviso responsável pelo defeito não participava daquelas capturas. A nova suíte usa `src/main.tsx` e `/painel/:org/assinatura` no build completo.

## Correção

- `PreparedCompany.tsx` passa a usar `section` com CSS próprio, sem regras de sidebar. Na assinatura, o aviso fica dentro da situação financeira, depois do cabeçalho. Demais páginas mantêm aviso compacto e link para modalidades.
- A pendência de configuração comercial deixa de oferecer “Verificar confirmação”. Esse botão agora consulta o fluxo financeiro existente somente quando há contrato local identificado e operação pendente/reconciliação. Sem contratação, aparece apenas atualização de consulta e seleção autorizada de modalidade.
- A consulta financeira bem-sucedida atualiza a mensagem de configuração pelo mecanismo existente de finalização/materialização, cujas regras server-side permanecem intactas. Nenhuma confirmação visual ou retorno de URL concede acesso.
- Uma falha na segunda consulta, `stripe/status`, não apaga o catálogo já obtido pelo seletor autorizado da mesma organização. A interface indica que o status não foi atualizado e bloqueia os comandos até atualização bem-sucedida. Falha no seletor inicial limpa o contexto; não reutiliza autorização antiga.
- Troca de organização continua remontando o checkout, descartando seleção, consentimento, chaves locais e respostas antigas. O aviso também associa seu resultado ao ID da organização.
- Preços, equivalentes, economia e elegibilidade continuam provenientes do backend. Não foram adicionados preços de fallback ou ofertas que desrespeitem a visibilidade configurada.

O catálogo de 071 já distingue visibilidade e contratação: `billing069_context` preserva autorização e acrescenta `acquisition_plans()`. `test_allowed=false` impede o comando financeiro; não remove ofertas. O cenário simulou Ateliê Aurora autorizado e Estética Animal JW fora da lista Stripe, com IDs fictícios. Nenhuma lista real foi consultada ou alterada.

## Validação

| Conjunto | Resultado |
|---|---|
| Novos testes de contexto/segurança HF02 | 2 PASS |
| Helpers e runtime HF01 | 6 PASS |
| Transporte Stripe existente, simulado | 6 PASS |
| Rota completa no build: layout, bloqueio, seleção, confirmação, estados, troca de empresa, falhas, permissões e aviso em outra página | 7 PASS |
| Regressão visual/comandos HF01 | 9 PASS |
| **Total distinto** | **30 PASS, 0 FAIL final** |
| TypeScript + build Vite | PASS |
| Aplicação e reversão do patch em base limpa | Ver `VERIFICACAO-PACOTE.json` |

Viewports: 1440, 1024, 768, 390 e 360 px. Conferência visual realizada nos arquivos desktop, tablet, celular e trial. Sem overflow horizontal nos cenários medidos; seleção e comandos sem duplicação, valores 59,90/299,40/478,80 e economias 60/240 conferidos. A suíte HF01 manteve verificações de contraste mínimo 4,5:1, foco, cancelamento/reativação e resposta tardia. Um seletor de teste foi adaptado ao novo nome contextual do botão; nenhuma asserção financeira foi removida.

O teste antes da correção falhou como esperado, medindo 1.000 px. Na primeira montagem da nova suíte, cinco testes falharam por uma RPC auxiliar ainda não simulada, expectativa equivocada para o breakpoint de 768 px e escolha da rota Ajuda, que substitui seus filhos. As fixtures foram completadas e a rota Legal foi usada para conferir o aviso fora da assinatura; não foram alteradas funções desses módulos. Logs inicial e final acompanham a entrega. Reexecuções não entram novamente no total.

Avisos de build: chunk superior a 500 kB e diretiva `use client` em dependência React Router; build concluído. Não houve otimização fora do escopo.

## Preservação e limites

Backend inteiro, 67 migrations, Auth, permissões/RLS, checkout-api, Mercado Pago, valores/mapeamentos, webhooks, reconciliação, contratos, manifests históricos, dependências e variáveis existentes permanecem sem alterações. Não houve mudança em `CommercialCatalog.tsx` ou `stripe-checkout.css`: a causa era o ancestral externo aos cards.

Sessão, respostas HTTP e confirmações financeiras dos testes são **simuladas**, exclusivamente em localhost. Não houve autenticação online, Stripe real, banco real ou demonstração de contratação real. As capturas são do frontend real compilado, com dados fictícios, não mockups ou imagens geradas. Não se declara o problema online definitivamente resolvido antes da publicação e conferência autorizadas.

Alteração de modalidade de contrato Stripe existente continua indisponível, conforme o backend atual; não foi inventado comando. Nenhuma nova contratação foi habilitada. Guia de aplicação/rollback em `INTEGRACAO-E-ROLLBACK.md`; inventário e hashes acompanham o ZIP.
