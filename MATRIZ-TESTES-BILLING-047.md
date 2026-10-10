# Matriz de testes — billing 047

Ambiente: PGlite/PostgreSQL embarcado, HTTP e provider offline, Chromium real com SDK MP substituído explicitamente por fixture. Sem credenciais reais. A matriz separa evidência local de homologação externa.

| IDs / arquivo | Cobertura | Resultado local |
|---|---|---|
| 01–02 `subscriptions.test.mjs` | Essencial, trial, token, preço server-side, capabilities; duas abas, clique duplo, adulteração, assinatura existente | PASS |
| 03–04 | Webhook duplicado e retorno concorrente, isolamento A/B, papel/grant, referência divergente | PASS |
| 05–06 | Mensalidade, recusa, tolerância, recuperação, cancelamento pago e reativação | PASS |
| 07–09 | Upgrade condicionado a pagamento, downgrade com membros, cancelamento durante trial | PASS |
| 10–11 `edge-cases.test.mjs` | Retorno sem liberação, reserva sem token, Profissional em duas abas | PASS |
| 12–13 | Equipe, prazo vencido, restrição sem exclusão, expiração na autorização sem cron | PASS |
| 14–16 | Recuperação por referência sem novo POST, atualizar cartão, cancelamento simultâneo, fim do período, não repetir trial, evento de contrato antigo não sobrescreve o atual | PASS |
| 17–18 | Catálogo alterado durante checkout, suspensão administrativa preservada | PASS |
| 19–20 `gateway.test.mjs` | Assistido recusado, moeda/plano/URL inválidos, credencial ausente, indisponibilidade, timeout, resposta inválida, redirects | PASS |
| 21–22 | HMAC quando aplicável, adulteração, indício sem HMAC não libera acesso | PASS |
| 23–25 | Pagamento oficial/recebedor, fim do mês/calendário, HTTP/origem/retorno, logs sem segredos | PASS |
| 26 `upgrade.test.mjs` | Upgrade populado sem modificar linhas antigas, 42 hashes históricos, seis tabelas com RLS/FORCE RLS, grants | PASS |
| 27–30 `lifecycle.test.mjs` | Rejeição definitiva versus resposta perdida, disputa leitura/cancelamento, snapshot positivo antigo, evento payment | PASS |
| 31–33 | Downgrade próximo ciclo revalida membros, decisão explícita preserva dados, onboarding restrito, responsável/CPF bloqueia novo trial, RPC antigo e histórico imutável | PASS |
| `billing047.spec.ts` | Retorno adulterado, catálogo sem Assistido, 1440/390/320 px sem overflow, comunicação do trial, confirmação server-side, cancelar/reativar | Executado novamente no gate da base limpa |

A suíte 047 possui 33 testes automatizados Node; alguns incluem vários cenários e asserções. O relatório final do gate informa o resultado efetivo do navegador e das regressões a partir da base limpa, sem somar tentativas antigas como se fossem novos testes.

## Gate vigente e regressões

`npm run test:current-gate` executa billing 047, contratos do gate, upgrade e regressão 046 sobre 047, upgrade/funcional 045, segurança UX-001, correções 044, upgrade populado, regressões 040–042/onboarding, gateways de segurança, build/typecheck e inspeção de segredo no bundle, navegador geral, Equipe/Agenda, UX-001, billing e suporte flexível.

Os testes históricos permanecem byte a byte. Adaptações de execução ficam nos runners e fixtures atuais. Casos legados “trial sem cartão” exercitam somente `mock_enabled=true` explícito; a 047 testa `mock_enabled=false`, bloqueio do RPC antigo e trial condicionado a meio de pagamento. A mudança não transforma comportamento legado em autorização de produção.

## Homologação externa — PENDENTE

| Item | Critério |
|---|---|
| MP-01 | Confirmar mecanismo oficial de configuração de notificações de Assinaturas e entrega real; lacuna documental explicitada no guia |
| MP-02 | SDK/tokenização e criação associados aos planos de teste |
| MP-03 | Sete dias oficiais, primeira mensalidade, renovações, recusa e retries |
| MP-04 | Pausa/cancelamento/reativação sem primeira cobrança ou renovação indevida |
| MP-05 | Atualização de valor em assinatura associada preservando datas/trial |
| DB-01 | Upgrade em cópia populada do Supabase real, RLS/roles e ambiente de rede real |

Esses itens não foram executados e não são classificados como PASS local. MP-01 precisa ser resolvido antes de considerar a integração externa concluída.
