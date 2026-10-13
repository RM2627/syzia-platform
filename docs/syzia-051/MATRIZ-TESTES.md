# SYZIA 051 — matriz de testes

Os resultados definitivos estão em `RESULTADO-GATE.json` e no relatório da entrega. Fixtures usam identidades fictícias, rede do provider substituída e browser local. Nenhum PASS local significa homologação financeira real.

| Cobertura | Arquivo/caso | Evidência esperada |
|---|---|---|
| HTTP 400/401/403/404/408/409/422/429/500/503/desconhecido | `tests/syzia-051/financial.test.mjs` | Status/etapa seguros; corpo e causas arbitrárias descartados |
| Plano inexistente | Mesmo arquivo | 404 de consulta de plano classificado sem presumir recusa do cartão |
| Recusa definitiva e recuperação | Mesmo arquivo | `done/payment_pending`, mesma reserva e contrato, sem acesso |
| Estado contraditório antigo | Mesmo arquivo | Contexto legível sem reescrever histórico |
| Duas abas e lease | Mesmo arquivo | Um POST, uma assinatura, um trial, CTA bloqueado durante lease |
| Timeout depois de criar | Mesmo arquivo | Reconciliação consulta recurso oficial; não cria novamente |
| Busca vazia/paginação incompleta | Mesmo arquivo | Não limpa marca de criação; falha fechada |
| Trial incompatível | Mesmo arquivo e `tests/billing-047/mp01.test.mjs` | `billing_trial_mismatch` preservado |
| Webhook repetido, tenant divergente, acesso indevido | Mesmo arquivo e regressões 047/049/050 | Sem concessão duplicada, sem acesso A/B, service RPC protegida |
| HMAC e modo de observação 050 | Regressões MP-01/049/050 e âncora 051 | Verificação preservada, observação sem efeitos comerciais |
| Logs e frontend sem segredo | Testes HTTP, integridade e inspeção de bundle | Sem corpo, credencial, token ou identificação |
| Upgrade populado e rollback | `tests/syzia-051/upgrade.test.mjs` | Históricos financeiro/jurídico e RLS/FORCE preservados; falha atômica |
| Nome e CPF/CNPJ | `tests/syzia-051/fields.test.mjs` | Validação local sem persistência e sem inferência financeira |
| Preservação completa 050 | `tests/syzia-051/integrity.test.mjs` | 46 migrations e todos os arquivos fora da autorização idênticos |
| Responsividade 1440/768/390/320 | `tests/demo-browser/checkout051.spec.ts` | Sem overflow ou sobreposição; resumo e CTA acessíveis |
| Teclado, foco, contraste, labels e erros | Mesmo arquivo | Relações semânticas, snapshot de acessibilidade, redução de movimento |
| Vazios/inválidos e validade do SDK | Mesmo arquivo | Erro junto ao campo; sem POST; sem exibir mensagem bruta do SDK |
| Tokenização/envio/duplo clique | Mesmo arquivo | Botão desabilitado; somente token no payload da SYZIA |
| Recusa e retorno oficial | Mesmo arquivo | Nova tentativa expressa somente segura; confirmação só por estado local oficial |
| Incerto/timeout/retorno adulterado | Mesmo arquivo | Sem formulário de reenvio nem falso sucesso |
| Rede e consulta indisponíveis | Mesmo arquivo | Estado conservador e sem segundo POST |
| Excesso de membros/elegibilidade | Mesmo arquivo | Bloqueio contextual, sem alterar vínculos |
| Ciclo completo histórico | `tests/demo-browser/billing047.spec.ts` | Todas as ofertas, retorno, recusa, contratação, cancelamento e reativação |
| Produto cumulativo e jurídico | `npm run test:current-gate` | 28 etapas anteriores mantidas + 2 etapas 051 |

## Ajuste do teste histórico de interface

A 047 exigia visualmente `Hoje: R$ 0,00` antes da confirmação. A autorização 051 proíbe essa afirmação antecipada. O caso foi mantido e fortalecido: exige os dois valores “A confirmar”, proíbe o antigo “Hoje”, preenche os campos com fixture segura e mantém todas as verificações de ciclo financeiro. O caso financeiro 047-27 mantém todo o ciclo de recusa/timeout/recuperação e passa a exigir o código `billing_provider_invalid_request`, status 400 e etapa `create`, em vez da categoria genérica anterior. Os testes de hash históricos usam transições exatas aprovadas, sem recriar seus manifests nem ignorar arquivos fora do escopo.

## Não executado nesta rodada

Cartão/SDK reais, recursos externos do Mercado Pago, notificações reais MP-01, Supabase/Auth/PostgREST real e concorrência PostgreSQL multiprocesso. Snapshot semântico e navegação por teclado não equivalem a uma sessão assistiva com NVDA/VoiceOver; essa verificação humana e os iframes reais do SDK permanecem na homologação externa. Máscara e validação interna do cartão continuam sob responsabilidade dos campos oficiais, sem acesso da SYZIA ao conteúdo do iframe.
