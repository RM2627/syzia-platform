# SYZIA 071 — Testes direcionados

Base: `4c8749f2ff66aad285e6bfe6c08fe722ca1a7e02`. Ambiente executado: Linux, Node.js, PostgreSQL embarcado PGlite descartável e Chromium local. Não foram utilizados credenciais ou serviços de produção.

| Conjunto | Resultado final | Evidência |
| --- | --- | --- |
| Banco integrado 069 + 070 + 071 | 9 PASS | `database-final.log` |
| Novo transporte/política + regressões Stripe e recuperação 070 | 34 PASS | `regression.log` |
| Componentes de catálogo: administração, público, cadastro e assinatura | 4 PASS | `browser.log`, `browser.json` |
| Fluxo existente 070 entre dispositivos e callback legado | 2 PASS | `browser-070.log` |
| TypeScript + Vite | PASS, exit 0 | `build-final.log`, `build-result.json` |
| Aplicação/reversão do patch e arquivos preservados | Resultado no artefato | `VERIFICACAO-PACOTE.json` |

Os 49 casos não equivalem a 49 testes de navegador: são 43 testes Node/banco e 6 de navegador. Os 34 incluem testes 070 em seu fixture original; a integração com o SQL 071 é coberta separadamente pelos nove casos novos. Os testes de navegador usam componentes reais e serviços simulados. A rodada não valida Resend, Supabase Auth remoto, Stripe ou Mercado Pago reais.

## Cobertura

- Reprodução do filtro antigo que excluía ofertas Stripe; leitura consistente dos três períodos, valores e economias.
- Alteração de visibilidade pelo Super Admin, negativa para usuário não autorizado, sessão reforçada e conflito de revisão; tentativa de alterar preço/ID rejeitada.
- Contrato histórico Mercado Pago e mapeamento preservados; versão financeira não modificada.
- Cadastro preparado na versão mapeada; conclusão bloqueada e ausência de criação de organização, assinatura ou trial.
- Convite sem destinatário emitido explicitamente; finalidade demonstração rejeitada para ativação; e-mail não confirmado não toma posse; identidade confirmada vincula uma única solicitação e preserva snapshot.
- Segundo usuário recusado; destinatário específico e e-mail atual do interessado conferidos; revogação, expiração e acesso indevido recusados.
- Retomada por duas sessões registradas e recuperação 070 de nome/identificador. Teste de navegador notebook → celular → notebook e callback anterior preservados.
- SQL em transação com falha forçada não deixa objetos parciais. PGlite serializa transações; não se declara teste de corrida simultânea em PostgreSQL remoto. Locks/revisão e tentativas concorrentes lógicas foram verificados no código e nos testes direcionados.
- API pública sem sessão, CORS, `no-store`, nenhuma chamada ao provedor, nenhuma substituição de preço e modo financeiro bloqueado prevalecendo sobre disponibilidade antiga no banco.
- Desktop 1440 px e mobile 390/360 px: valores legíveis, seleção das três modalidades, ausência de overflow horizontal e botões financeiros bloqueados. Ocultar uma modalidade reflete no público ao recuperar foco e nas demais telas ao atualizar.

## Comandos reproduzíveis

Usar as dependências do lockfile da base; nenhuma nova dependência foi adicionada. Executar os navegadores sequencialmente. No Windows, usar o Chromium do Playwright instalado e não definir caminhos Linux.

```powershell
npm ci
node --test tests/catalog-071/database.test.mjs
node --experimental-strip-types --test --test-concurrency=1 tests/catalog-071/transport.test.mjs tests/stripe-online/transport.test.mjs tests/registration-recovery/flow.test.mjs tests/registration-recovery/database.test.mjs
npx playwright test --config=playwright.catalog-071.config.ts
npx playwright test --config=playwright.registration-recovery.config.ts --grep "notebook signup|old implicit" --reporter=list
npm run build
git diff --check
```

Portas exclusivas dos testes: 4191 e 4190. As configurações recusam reutilização de um servidor existente. Nesta execução foi utilizado `FOUNDATION_CHROMIUM_PATH` apontando para o Chromium local disponível, sem alterar código produtivo. O build emite avisos de tamanho de chunks/diretivas de bibliotecas, sem falha de compilação.

Não executados: gate histórico geral, produção, envio real de e-mail, criação de contratos financeiros ou teste nativo no Windows. São limites deliberados desta rodada direcionada, não resultados aprovados.
