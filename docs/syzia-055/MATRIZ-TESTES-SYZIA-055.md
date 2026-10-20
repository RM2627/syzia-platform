# SYZIA 055 — matriz de validação

Os resultados desta execução estão em `RESULTADOS-055.json` e no pacote de evidências. Resultados históricos da 054/051 não são resultados atuais. PGlite executa SQL local real, mas não comprova a concorrência de múltiplas conexões PostgreSQL em produção.

| Área | Casos e evidência automatizada | Natureza |
|---|---|---|
| Preparação | `foundation.test.mjs`: sem lead/plano, slug normalizado/colisão, chave idempotente, nomes reservados, autorização, salvar/retomar, revisão, versões imutáveis, suspensão | SQL local PGlite |
| Histórico e upgrade | `upgrade.test.mjs`: 054 populada, falha intencional no fim da 055, rollback de DDL/dados, nova aplicação e backfill de versão/vínculo, organizações preservadas | SQL local PGlite |
| Sessão administrativa | F08: JWT com session_id original; ausência, outro usuário e revogação negados; RPC sintética sem EXECUTE | Controller + SQL local |
| Interessados e convites | F05b + `control.test.mjs`: dois interessados na mesma versão, links distintos, vínculo obrigatório, autorização por finalidade, revogação, expiração, vínculo aprovado somente pelo Super Admin | SQL + HTTP/controlador simulado |
| E-mail | `control.test.mjs`: prévia sem envio, seleção alterada recusada, confirmação, duas abas, deduplicação, timeout incerto, descadastramento | Transporte em memória; zero e-mail real |
| Configuração | F05c + `preparation.test.mjs`: allowlist, referências externas rejeitadas, remapeamento, ausência de tabelas operacionais/financeiras | SQL e adaptador local |
| Página pública e painel | `demos.test.mjs`: RPCs reais, configuração, publicação, visitante A/B, aceite direto sem proposta manual, rastreio do mesmo registro, limites | Dois bancos PGlite separados |
| Arquivos | `demos.test.mjs` e `transport.test.mjs`: sanitização de imagem, upload/download por HTTP loopback, hash e namespace de destino, conflito sem overwrite | HTTP e Storage simulado |
| Checkout/trial | `control.test.mjs` A05–A06c + regressões 047/049/051: organização pendente sem trial/capabilities/importação, motor existente confirma estado, elegibilidade, falhas, duplicações, recuperação | Gateway financeiro simulado |
| Materialização | A06b: falha parcial em trigger → rollback → retomada, duas chamadas sem duplicação, configuração real remapeada e sem clientes/histórico fictícios | SQL local e controlador |
| Isolamento e segurança | Grants, usuário sem autorização, org divergente, RPC financeira/global negada na demo, dados privados fora de projeções, snapshot e RLS/FORCE RLS | Suites comerciais e históricas |
| Integridade | I01/I02: 1.151 arquivos oficiais, 50 migrations históricas e lockfile; transições explícitas, negativo de adulteração/predecessor errado, LF/CRLF | Hashes locais |
| Frontend | `npm run build`; build demonstrativo com origens locais explícitas; inspeção de bundle pelo gate | Typecheck/build; sem homologação visual implícita |
| Navegador | `commercial055.spec.ts`: gestão, editor, salvar/retomar, revisar/publicar, página pública 1440/390/360, foco/overflow e capturas | Navegador real com fixtures locais; resultados e capturas no pacote de evidências |
| Integrações externas | Auth, SMTP, Storage, Neon/PostgreSQL hospedado, Mercado Pago/MP-01, infraestrutura e CSP | Não executadas; precisam de homologação autorizada |
| Windows | PowerShell, navegador e comportamento nativo do sistema | Não executados nesta rodada; equivalência LF/CRLF testada localmente |

O teste de navegador configura parte dos dados por RPC dentro da fixture; não é uma prova de preenchimento manual de todos os campos. As capturas reais produzidas pelo teste ficam em `reports/syzia-055/ui`. Nenhuma imagem foi criada artificialmente para substituir a aplicação.

## Comandos reproduzíveis

```text
npm ci
npm run test:commercial:055
npm run test:commercial:054
npm run test:commercial:regression
npm run build
node scripts/commercial/check-demo-build.mjs
npm run test:current-gate
npm run test:commercial:055:browser
```

No ambiente desta execução, os testes Node utilizaram `NODE_OPTIONS=--max-old-space-size=512`. Nenhuma variável de produção é necessária para fixtures. O teste nativo opcional existente exige PostgreSQL local isolado e usuário comum; não constitui autorização para conexão remota.

## Critério de liberação

Gate completo, fluxo visual e integrações efetivamente necessárias devem passar antes de liberação. Não ignorar testes, não alterar hashes para aprovar mudanças desconhecidas, não interpretar INCOMPLETE como PASS, nem inferir aceite real do Mercado Pago a partir dos mocks. Esta entrega não autoriza implantação.
