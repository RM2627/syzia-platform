# Matriz de testes — Fase 8 / produto completo

**500 casos únicos aprovados localmente; zero falhas locais conhecidas restantes.** Reexecuções não aumentam a contagem. A regressão UI teve 53 PASS/1 falha de seletor; após correção, o caso de suspensão foi reexecutado e passou. Não se declara que o primeiro relatório teve 54 PASS. A demo final completa teve 12 PASS. Build, inventário, hashes e inspeção visual são verificações adicionais, não novos casos.

| Comando npm | Casos PASS | Evidência em reports/ |
|---|---:|---|
| test | 68 | security-results.json |
| test:company | 71 | company-security-results.json |
| test:consumer | 35 | consumer-results.json |
| test:presence-payments | 28 | presence-payments-results.json |
| test:central | 40 | central-results.json |
| test:commercial | 54 | commercial-results.json |
| test:commercial-upgrade | 1 | commercial-upgrade-results.json |
| test:analytics | 27 | analytics-results.json |
| test:analytics-upgrade | 1 | analytics-upgrade-results.json |
| test:billing | 50 | billing-results.json |
| test:billing-upgrade | 1 | billing-upgrade-results.json |
| test:config | 3 | config-security-results.json |
| test:homologation-tools | 10 | phase-8-foundation-tools.txt |
| test:company-tools | 5 | phase-8-company-tools.txt |
| test:consumer-tools | 7 | phase-8-consumer-tools.txt |
| test:central-tools | 5 | phase-8-central-tools.txt |
| test:commercial-tools | 5 | phase-8-commercial-tools.txt |
| test:analytics-tools | 2 | phase-8-analytics-tools.txt |
| test:images | 9 | phase-8-images.txt |
| test:billing-provider | 8 | phase-8-provider.txt |
| test:billing-tools | 3 | phase-8-tools.txt |
| test:demo | 1 | phase-8-demo-http.txt |
| test:ui | 54 | phase-8-ui-regression.json + phase-8-ui-suspension.json (53+1, correção direcionada) |
| test:demo:browser | 12 | demo-browser-results.json |
| **Total** | **500** | 431 anteriores + 69 novos |

## Segurança e regras

Os casos SQL executam RLS/constraints/RPCs no PGlite com claims simuladas: A/B, consumidor A/B, URL/UUID, telefone sem autenticação, manual/publicação, snapshots, preços manipulados, propostas imutáveis, versões antigas, aprovação idempotente, serviço desativado, anexos, suspensão/revogação, agenda e rollback. Central e Comercial preservam autorização, consentimentos, intervalos, tentativas, perda/conversão e histórico. Analytics testa agregados isolados, filtros, timezone, dataset vazio, SLA e valores comerciais sem receita.

Billing acrescenta 50 casos de planos/versões, trial único, estados, cancelamento/renovação, quotas, rollback, recursos, uso mensal, direct write negado, autorizações revogadas, mock desabilitado, eventos repetidos/fora de ordem e separação de pagamentos do consumidor. Oito casos do provider cobrem assinatura, adulteração, janela, schema/limites e falha transacional. Upgrade 017→020 preserva registros antigos e não inventa assinatura/pagamento.

Demo final usa HTTP local sem interceptar RPCs, incluindo duas sessões independentes de navegador e tentativa de outro visitante acessar a solicitação. Isso demonstra isolamento no transporte simulado, não Auth/PostgREST reais. Touch é evento sintético de navegador, não aparelho físico. Testes visuais de nomes extensos, 24 serviços, proporções de foto e rede lenta/erro usam respostas controladas e não constituem prova de RLS.

## Não executado / limites

PostgreSQL nativo: runner executado, bootstrap bloqueado por UID não-root; código 2, **nenhum teste de concorrência independente executado**. Testes PGlite de interleaving/rollback não substituem conexões simultâneas. Auth/JWT/SMTP/Storage/PostgREST reais, concorrência, expiração de URL real, backup/restauração e performance de infraestrutura permanecem PENDENTES DE HOMOLOGAÇÃO EXTERNA. Windows, Safari/Firefox, aparelhos físicos e auditoria assistiva completa também pendentes.

Ambiente: Linux, Node 24.19.0, PostgreSQL 18.3 WASM/PGlite 0.5.8, Playwright/Chromium local. Build TypeScript/Vite e verificação de marcador server-only passaram. Migrations 001–017 idênticas ao ZIP aprovado; inventário mostra 63/63 RLS+FORCE RLS e 63 policies SELECT. Nenhum deploy ou serviço externo real.
