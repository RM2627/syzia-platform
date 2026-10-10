# Testes — revisão de trial

**545 casos únicos aprovados localmente**, incluindo 45 novos: 42 SQL de trial, 1 upgrade e 2 jornadas UI. Não contar reexecuções, build/inventário nem concorrência nativa bloqueada. Regressão UI 54/54 e demo 14/14; após ajuste de rótulos, os dois casos de trial foram reexecutados e passaram novamente. Reforços finais de unicidade/guardas foram revalidados em trial, billing, upgrade e demo.

| Comando | PASS | Evidência em reports/ |
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
| test:homologation-tools | 10 | trial-foundation-tools.txt |
| test:company-tools | 5 | trial-company-tools.txt |
| test:consumer-tools | 7 | trial-consumer-tools.txt |
| test:central-tools | 5 | trial-central-tools.txt |
| test:commercial-tools | 5 | trial-commercial-tools.txt |
| test:analytics-tools | 2 | trial-analytics-tools.txt |
| test:images | 9 | trial-images.txt |
| test:billing-provider | 8 | trial-provider.txt |
| test:billing-tools | 3 | trial-billing-tools.txt |
| test:demo | 1 | trial-demo-http.txt |
| test:ui | 54 | trial-ui-results.json |
| test:demo:browser | 14 | trial-demo-browser-results.json + trial-demo-final-ui-results.json |
| test:trial | 42 | trial-results.json |
| test:trial-upgrade | 1 | trial-upgrade-results.json |

**Não executados:** três cenários de concorrência em conexões nativas independentes. Runner saiu com código 2 antes de iniciar banco, por restrição de UID não-root. Interleavings seriais e teste do índice único no PGlite são provas locais específicas, não homologação de concorrência. Supabase/Auth/OTP/Storage/PostgREST reais e prova externa de identidade também pendentes.

Build/TypeScript, scanner de bundle, inventário e hashes das primeiras 20 migrations passaram. Capturas novas em reports/visual-trial; capturas cumulativas anteriores preservadas. Sem deploy ou dados reais.
