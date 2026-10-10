# SYZIA 047 — upgrade da base consolidada 046

Esta rodada acrescenta somente Checkout/Assinaturas Mercado Pago e remove resultados históricos do pacote principal. Sem deploy, reset, baseline, cobrança real ou ativação de Assistido. O código comercial anterior e as migrations existentes permanecem preservados.

## Validação local a partir do ZIP limpo

Extrair `SYZIA-047-BASE-LIMPA-CONSOLIDADA.zip`, entrar em `foundation/`, usar Node 24 e executar:

```sh
npm ci
npm run build
npm run test:current-gate
```

O build inclui `tsc --noEmit`. O gate inclui os testes de billing, regressões 040–046, onboarding, Agenda, Atendimento/Central, Comercial, Financeiro, Equipe, capabilities, UX-001, segurança de bundle e navegador. Registros detalhados são gerados em `reports/`, sem depender de resultados antigos.

No Linux x64 o gate usa Chromium Playwright já instalado ou o binário opcional empacotado em `@sparticuz/chromium`; sua extração vai para `.cache/`, fora da entrega. Em outros ambientes, instalar o navegador com `npx playwright install chromium` ou informar `FOUNDATION_CHROMIUM_PATH`. Bibliotecas de sistema do navegador continuam sendo pré-requisito do ambiente. Teste isolado de billing: `npm run test:billing:047`. Navegador isolado: `npm run test:billing:047:browser` com navegador Playwright instalado ou a variável acima.

## Banco populado

1. Em procedimento futuro do proprietário, obter backup verificável do banco real e aplicar primeiro em cópia de homologação. Nenhum acesso ao Supabase real foi feito nesta entrega.
2. Conferir o histórico já aplicado e os hashes de `docs/billing-047/migrations-046-sha256.json` (42 arquivos existentes). Não editar ou reaplicar migrations históricas como reset.
3. Aplicar somente a incremental `supabase/migrations/202610050047_mercado_pago_subscriptions.sql` após 046, via processo de migrations existente. Ela contém `begin/commit`, RLS/FORCE RLS, funções com grants explícitos e preservação das linhas anteriores.
4. Especialmente intactas: `202610030045_team_availability_assisted.sql` e `202610030046_flexible_shared_support.sql`.
5. Verificar que `private.billing_runtime.mock_enabled=false` no ambiente real. Mock é exclusivamente fixture local. Não usar `dev:demo` como backend de produção.
6. Não alterar versões comerciais já referenciadas. Configurar o mapeamento das três versões aprovadas conforme o guia Mercado Pago. A migration não cadastra preços/capabilities novos e não toma decisões sobre contratos legados.

A migration adiciona seis tabelas privadas e wrappers compatíveis para efetividade de billing, contratação antiga, catálogo público e conclusão self-service. Não há armazenamento de cartão/CVV. Contratos MP exigem confirmação server-side; o antigo RPC de trial sem cartão não concede benefícios em runtime real.

O ensaio local de upgrade compara todas as linhas anteriores, hashes de toda a cadeia e grants. Usa PostgreSQL embarcado PGlite; não equivale à homologação no PostgreSQL/Supabase real.

## Backend e configuração futura

Copiar exemplos para arquivos locais fora do controle de versão. `.env.example` contém apenas configuração pública Vite, inclusive `VITE_BILLING_API_URL`. `.env.server.example` contém nomes server-side e `MERCADO_PAGO_ENABLED=false` por padrão. Nunca colocar Access Token ou service role em variável VITE.

- `npm run billing:dev`: processo Node em loopback, porta 8789; requer variáveis server-side. Deve ficar atrás do proxy HTTPS do ambiente escolhido pelo proprietário.
- Rotas POST `/billing/config`, `/billing/status`, `/billing/command`: JWT e origem exata; permissões e escopo são rechecados no banco.
- POST `/billing/notifications`: público somente como receptor de indícios; estado deriva de API autenticada e vínculos privados.
- `npm run billing:reconcile`: job server-side com as mesmas credenciais. Recomenda-se execução a cada 5 minutos, alertando em saída não-zero; dimensionar frequência/lote ao volume. Não faz cobranças avulsas.

Na homologação, estabelecer limites e timeouts do proxy superiores à operação normal e não registrar cabeçalhos Authorization, corpos de comando ou SDK/card token. Não publicar serviços de fixture/teste. A interface estática isolada não executa backend, webhook ou cron.

Rollback operacional de integração: desabilitar novas contratações no serviço, preservar banco/histórico, continuar tratando assinaturas já existentes e reconciliação em ambiente controlado. Não apagar tabelas ou retornar à contratação sem cartão para contornar um incidente. Desligar o serviço não cancela assinaturas no provider.

## Limpeza e evidências

`reports/README.md` explica os oito JSON mantidos como entradas e os resultados regeneráveis. Testes e fixtures não foram removidos. O manifesto de hashes histórico permanece, mas o teste de preservação verifica código de testes/migrations; não exige carregar screenshots e logs antigos. Os casos históricos de trial sem cartão rodam somente em fixture offline explícita; a política real 047 tem testes próprios sem mock de billing.

O inventário da limpeza e o resultado do gate da extração nova estão no pacote separado de evidências. Não transportar `node_modules`, `dist`, `.cache`, `test-results*`, ZIPs antigos ou o conteúdo bruto de 040–046 para a próxima base.

## Pendências externas

Seguir `GUIA-MERCADO-PAGO-TESTE.md`, inclusive MP-01 (mecanismo de configuração de notificações de Assinaturas não comprovado pela referência pública). Nenhum PASS local autoriza produção ou comprova transação real. A 047 permanece desativada por padrão até a homologação do proprietário.
