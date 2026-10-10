# Guia de atualização — refinamento UX da base 044

1. Guarde sua cópia atual e preserve seus arquivos locais `.env` e `.env.server` fora do ZIP.
2. Extraia o projeto consolidado. Ele contém o projeto completo, todas as migrations anteriores, lockfile, scripts, testes e documentação.
3. Use Node 24 e instale exatamente as dependências do lockfile com `npm ci`.
4. Aponte a configuração local para seu ambiente de homologação conforme o guia já existente. Nenhuma migration adicional deve ser executada por causa desta rodada. Em uma instalação existente na 044, o banco permanece como está.
5. Execute `npm run build`. Para a regressão local com dados sintéticos, instale Chromium com `npx playwright install chromium`, ou informe `FOUNDATION_CHROMIUM_PATH` com seu executável compatível, e execute `npm run test:current-gate`.
6. Execute os testes adicionais de isolamento dos downloads: `node --experimental-strip-types --test tests/ux-performance-media.test.mjs`.
7. Confira “Minhas empresas → Abrir empresa”, mudança entre FAQ/manual/regras, salvar categoria, Plano e assinatura, enviar mensagem, prévia e recorte de imagem. Ao abrir a empresa, as etapas de autorização continuam existindo, mas a estrutura não deve desaparecer quando o módulo carrega.

Não há deploy, alteração de plano, configuração de provedor ou serviço pago neste guia. Publicação continua sendo decisão do proprietário.

## Reproduzir as medições

As medições usam a fixture SQL/HTTP já existente; não configure credenciais reais. As portas locais 5173 e 54321 precisam estar livres. Execute as sessões em sequência.

Crie um build local com valores exclusivamente sintéticos:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture_only \
VITE_ATTACHMENT_GATEWAY_URL=http://127.0.0.1:54321 \
VITE_PLATFORM_API_URL=http://127.0.0.1:54321 \
VITE_LOCAL_DEMO=true npm run build
node scripts/ux-performance/run-local.mjs scripts/ux-performance/measure.mjs depois-local
node scripts/ux-performance/run-local.mjs scripts/ux-performance/actions.mjs depois-acoes-local
node scripts/ux-performance/run-local.mjs scripts/ux-performance/guards.mjs depois-guardas-local
```

No PowerShell, defina essas variáveis usando `$env:NOME="valor"` antes de executar `npm run build`. O runner cria uma cópia temporária da fixture para servir o build de produção e a remove ao encerrar; não altera o servidor original nem as migrations. Para comparar uma cópia preservada do build anterior, `AUDIT_DIST` pode apontar para essa pasta. Os resultados medidos desta entrega já estão incluídos, portanto reproduzi-los não é requisito para ler o relatório.

O medidor acrescenta 120 ms por requisição à API/mídia e 250 ms por chunk JS. Isso torna visíveis transições sob latência controlada; não representa uma rede ou servidor real. `durationMs` inclui espera de estabilização de 650 ms e não deve ser interpretado como tempo puro de resposta. Os timestamps de início/fim das requisições permitem inspecionar paralelismo.

Os ZIPs de trace abrem com `npx playwright show-trace caminho/do/trace.zip`. Contêm exclusivamente a fixture sintética, incluindo credenciais e tokens descartáveis dessa fixture. Nunca execute este medidor contra dados reais.

## Reversão

Como não há mudança persistente de banco, voltar ao código anterior da 044 basta para reverter este refinamento. Não faça rollback de migrations ou reset de banco por causa destas alterações de interface.

## Reempacotar fontes e evidências

Use `python scripts/ux-performance/package.py CAMINHO_FORA_DO_PROJETO.zip` para regenerar o manifesto e incluir também os traces ZIP desta auditoria. O script valida os hashes do arquivo completo; não executa build, publicação ou banco.
