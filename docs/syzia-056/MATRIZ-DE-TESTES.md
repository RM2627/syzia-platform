# Matriz e comandos — SYZIA 056

Todos os testes desta entrega usam dados fictícios e ambiente local. Não iniciar serviços apontados a bancos reais.

| Conjunto | Resultado | Cobertura |
|---|---:|---|
| `npm ci --no-audit --no-fund` | PASS | Instalação pelo lockfile oficial intacto |
| `npm run build` | PASS | TypeScript e bundle |
| `tests/commercial-056/preregistration.test.mjs` | 22/22 asserções; 21 conformidade + 1 diagnóstico | Upgrade populado, ACL/RLS, só nome, NULL sem ficção, vínculo sem emissão, e-mail posterior, invalidação de autorização/histórico, idempotência, revisão, dados inválidos, papéis de empresa recusados, formulário público, elegibilidade, rollback e limitação do primeiro solicitante |
| `tests/commercial-implementation/control.test.mjs` | 18/18 | Convites distintos, revisão sem envio, lote confirmado, duas abas/idempotência, reenvio incerto, propriedade/identidade, aprovação, plano/termos, materialização após financeiro simulado, retomada, descadastramento e revogação; **com 056 aplicada** |
| `tests/commercial-implementation/ui-contracts.test.mjs` | 10/10 | Papéis/grants, etapas derivadas, marca preservada e reuso de componentes |
| `tests/commercial-implementation/preparation.test.mjs` | 41/41 | Regressão da preparação e isolamento na fixture histórica 054 |
| Fundação/upgrade 055 + HF01/HF02/HF03 | 29/29 | Publicação/versões, contexto administrativo, isolamento, mídia, expiração, reconciliação e filtros de mídias pendentes |
| `tests/commercial-056/integrity.test.mjs` | 3/3 | Base oficial integral, transições explícitas, 51 migrations históricas, mutações negativas, diferenças de EOL autorizadas |
| `playwright.commercial056.config.ts` | 1/1 | Jornada integrada descrita abaixo |
| Integridade histórica 055, na base oficial e depois | **FAIL preexistente: 2/2** | Primeira divergência: `.env.demo.example`; evidência preservada |
| Gate completo | Não executado | Escopo proporcional e bloqueio histórico comprovado; não há PASS global |

## Jornada no navegador

Cadastro com só nome → demonstração existente → vínculo automático na aba Convites → e-mail ausente bloqueia emissão/envio → completar endereço → registrar autorização real simulada → selecionar um, vários e todos → remover destinatário da prévia → cancelar sem enviar → confirmar lote individualizado para dois contatos → consultar aceitação pelo remetente **simulado** → trocar finalidade → registrar interesse explícito e autorização de ativação → gerar link individual → abrir em outro contexto sem sessão administrativa → login de conta existente → retorno automático ao convite → solicitar análise → recarregar mantendo a solicitação. Verificação de ausência de overflow a 1440, 390 e 360 px.

Não foi executada homologação de novo cadastro com entrega real de confirmação de e-mail, SMTP externo, Mercado Pago real, PostgreSQL nativo concorrente, Windows nem infraestrutura publicada. Dados e APIs do navegador são fixtures locais. 056-D01 é uma evidência de limitação, não aceite do requisito de correspondência de destinatário.

## Comandos reproduzíveis

```powershell
npm ci
npm run build
node --experimental-strip-types --test --test-concurrency=1 tests/commercial-056/preregistration.test.mjs tests/commercial-implementation/control.test.mjs tests/commercial-implementation/ui-contracts.test.mjs
node --test tests/commercial-056/integrity.test.mjs
node --test tests/commercial-implementation/preparation.test.mjs
node --test --test-concurrency=1 tests/commercial-055/foundation.test.mjs tests/commercial-055/upgrade.test.mjs tests/commercial-055/hf01.test.mjs tests/commercial-055/hf02-role.test.mjs tests/commercial-055/hf03-media.test.mjs
npx playwright install chromium
npx playwright test --config=playwright.commercial056.config.ts
```

O comando de navegador inicia somente fixtures locais com as flags `DEMO_TEST_MODE`/`DEMO_COMMERCIAL_056`, remetente falso e chave efêmera. Não usar `.env` de produção nem apontar a prévia para serviços externos. Porta 5173 (app), 5174 (demo) e 54321 (API simulada) precisam estar livres.

Para reproduzir o bloqueio histórico, separadamente:

```powershell
node --test tests/commercial-055/integrity.test.mjs
```

Os testes específicos 056 também aceitam CRLF/LF apenas nos caminhos textuais explicitamente inventariados; binários e arquivos não autorizados continuam exatos. Uma mudança real de código/SQL continua sendo rejeitada. A compatibilidade Windows é preparada no código de verificação, mas não foi executada em Windows nesta rodada.
