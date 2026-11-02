# Testes direcionados — Cadastro/Confirmação 070

Base `3860f6046fbd4c8875df579be279b52247e9f6d8`; Node 24.22.1; dependências do lockfile existente. Sem novas dependências. Sem chamadas a Auth hospedado, e-mail real, Stripe ou Mercado Pago.

## Resultados

| Conjunto | Resultado | Natureza |
| --- | --- | --- |
| Servidor/contratos | 71 PASS, 0 FAIL | 16 novos casos e 55 regressões relacionadas; Auth/provedores simulados. |
| SQL 070 | 9 PASS, 0 FAIL | PGlite descartável com schema da base; funções reais de autorização/convites. |
| Navegador | 10 cenários distintos PASS no acumulado | React real, Chromium; rede Auth/backend simulada; sem e-mails reais. |
| TypeScript + Vite | PASS | `npm run build`; avisos de dependência/tamanho sem falha. |
| Patch e preservação | Ver `verificacao-pacote.json` | Aplicação/reversão em checkout isolado; comparação SHA-256 com arquivos entregues. |
| Supabase Auth/SMTP real | NÃO EXECUTADO | Depende de configuração e homologação autorizada. |
| Gate geral/financeiro | NÃO EXECUTADO | Fora do escopo; código financeiro inalterado. |

**Ocorrência de infraestrutura/tempo de carregamento:** a execução final dos dez cenários teve 9 PASS e 1 timeout de asserção no cenário 390 px. A evidência mostrava apenas o fallback de carregamento do `Suspense`, antes de montar a tela testada. A repetição isolada teve 1 PASS sem alterar aplicação, teste, asserção ou timeout. A causa exata da demora não foi determinada; não se afirma que a primeira execução inteira passou. Incluídos os dois logs, sem omitir a ocorrência. O JSON do navegador corresponde à execução de dez cenários, antes da repetição isolada.

## Cobertura

| Caso | Evidência local |
| --- | --- |
| Novo cadastro, metadados e nonce | Unitário `signup persists metadata…`; testes históricos 049-S04/S05. |
| Cadastro já existente e duplicidade | Unitário `existing pending identity…`; zero chamadas extras a signUp. |
| Falha parcial/incerta | Unitário `interrupted signup…` e navegador `signup partial failure…`. |
| Confirmação no mesmo aparelho | Navegador `partial profile…`; callback oficial simulado. |
| Notebook → celular → notebook | Navegador principal; contextos de browser independentes, login no notebook, mesmo convite/snapshot. |
| Retorno implicit anterior com cliente PKCE | Reprodução com Supabase SDK instalado e teste do callback antigo em `/cadastrar`. |
| Link expirado/reutilizado | Três cenários de viewport e unitários do parser/consumo. |
| Reenvio e espera | Unitários e SQL com dois handlers/IPs; apenas um envio simulado por janela. |
| Enumeração e diagnóstico seguro | Resposta neutra; mensagens arbitrárias do Auth não retornam ao usuário. |
| Recuperação de senha separada | Parser nega tipos recovery/invite; regressão `auth-communication/recovery.test.mjs`. |
| Nome/username preservados | SQL antes/depois da criação da identidade e alteração posterior de metadados; browser só pede campo ausente. |
| Perda de sessão/armazenamento | Login obrigatório; marcador local sem PII; recusa de armazenamento tratada. |
| Duas sessões, um vínculo | SQL com duas identidades de sessão do mesmo usuário; mesmo claim e snapshot. |
| Sessão revogada/usuário suspenso | SQL recusa retomada, sem registrar novamente sessão inválida. |
| Destinatário incorreto e mudança de e-mail comercial | SQL nega pendência/retomada. |
| Convite expirado, revogado ou de demonstração | SQL e unitários negam os caminhos indevidos. |
| Nenhum acesso financeiro antecipado | Contagens SQL inalteradas de organização/contrato/trial; navegador não chama billing ou complete. |
| RLS/FORCE RLS, grants e rollback | SQL com papéis reais do fixture, transação com falha proposital. |
| Login comum com convite antigo no navegador | Browser confirma que não envia a pista fora do contexto de retomada. |
| Falha na consulta de identidade | Browser: erro 503 não abre criação empresarial. |
| Desktop/mobile/teclado | 1440, 390 e 360 px; ausência de overflow, campos e sequência de foco. Não é auditoria WCAG completa. |

## Reproduzir somente o escopo afetado

Com dependências do lockfile já instaladas, na raiz do projeto:

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/registration-recovery/flow.test.mjs tests/syzia-033-server.test.mjs tests/syzia-049/http.test.mjs tests/syzia-057-hf-identidade/endpoint.test.mjs tests/enterprise-access-server.test.mjs tests/auth-communication/recovery.test.mjs
node --test --test-concurrency=1 tests/registration-recovery/database.test.mjs
npx --no-install playwright test --config=playwright.registration-recovery.config.ts
npm run build
```

O runner abre somente Vite local na porta 4190, com um worker, sem reaproveitar servidor externo. O navegador precisa estar instalado para o Playwright existente; não usar sessões de produção. O fixture intercepta endpoints de Auth/backend e recusa destinos externos. No ambiente desta execução foi utilizado Chromium já disponível, via `FOUNDATION_CHROMIUM_PATH`, sem nova dependência no projeto.

Se houver falha de inicialização do navegador ou porta ocupada, registrar como infraestrutura. Não remover verificações de identidade para obter PASS. A conexão com Supabase remoto não integra esses testes.

Arquivos de evidência: `unit-final.log`, `database-final.log`, `browser-final.log`, `browser-390-recheck.log`, `browser.json` e `build-final.log`, em `evidencias/` do pacote.
