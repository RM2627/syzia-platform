# SYZIA 055 — resultado do gate completo

Execução em uma extração nova da base limpa. Código, testes e migrations da entrega são idênticos aos validados, conferidos por SHA-256.

| Etapa | Resultado | Tempo (s) | Testes Node reportados |
|---|---|---:|---:|
| commercial-055 | PASS | 9.22 | 13 |
| commercial-054 | PASS | 22.83 | 118 |
| commercial-054-regression | PASS | 8.22 | Ver log/JSON |
| commercial-054-demo-build | PASS | 0.71 | Ver log/JSON |
| checkout-financial-051 | PASS | 42.24 | 134 |
| legal-versioning-050 | PASS | 4.94 | 22 |
| legal-historical-050 | PASS | 4.63 | Ver log/JSON |
| hotfix-050 | PASS | 14.55 | 21 |
| hotfix-049 | PASS | 6.88 | 17 |
| focused-049 | PASS | 18.82 | 35 |
| focused-048 | PASS | 12.88 | 24 |
| billing-047 | PASS | 22.04 | 49 |
| gate-contracts | PASS | 0.56 | 11 |
| flexible-upgrade | PASS | 4.47 | Ver log/JSON |
| flexible-support | PASS | 7.23 | Ver log/JSON |
| team-upgrade | PASS | 3.85 | Ver log/JSON |
| team-availability | PASS | 7.98 | Ver log/JSON |
| ux001-security | PASS | 4.56 | Ver log/JSON |
| focused | PASS | 8.49 | Ver log/JSON |
| upgrade | PASS | 4.24 | Ver log/JSON |
| regression-040-042 | PASS | 26.19 | Ver log/JSON |
| gateways | PASS | 0.48 | 62 |
| build | PASS | 1.21 | Ver log/JSON |
| browser | PASS | 308.63 | Ver log/JSON |
| team-browser | PASS | 41.06 | Ver log/JSON |
| ux001-browser | PASS | 77.96 | Ver log/JSON |
| browser-hotfix-049 | PASS | 40.96 | Ver log/JSON |
| browser-049 | PASS | 31.82 | Ver log/JSON |
| browser-048 | PASS | 20.14 | Ver log/JSON |
| billing-browser | PASS | 14.23 | Ver log/JSON |
| flexible-browser | PASS | 73.44 | Ver log/JSON |
| checkout-browser-051 | PASS | 121.63 | Ver log/JSON |
| browser-legal-050 | PASS | 18.21 | Ver log/JSON |
| commercial-browser-055 | PASS | 16.05 | Ver log/JSON |
| browser-hotfix-050 | PASS | 12.36 | Ver log/JSON |

**35 etapas PASS; nenhuma etapa omitida.**

As etapas agregadoras e de browser possuem subtestes nos logs/JSON. Os números não devem ser somados como se todos fossem casos únicos: algumas etapas repetem regressões históricas.

Comandos adicionais: npm ci PASS, npm run build PASS, npm run test:commercial:055 13/13 PASS. O gate contém 118 casos na regressão comercial ampliada. Não foram executados serviços externos nem Windows.
