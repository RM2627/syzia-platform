# SYZIA 071-HF01 — Integração, testes e rollback

Base: `f3eace355c136d37d53fc5bd72392ddb04bd9e10`. Não aplicar sobre uma versão anterior à 071 nem sobrescrever commits posteriores. Nenhuma migration ou alteração de credencial é necessária.

## Aplicação local pelo PowerShell

Extrair o pacote fora do repositório. Em uma cópia limpa da base:

```powershell
git status --short
git rev-parse HEAD
# Conferir o SHA acima; preservar mudanças locais e commits posteriores.
git switch -c syzia-subscription-ui-071-hf01
$patchUI = "C:\caminho\SYZIA-071-HF01-ASSINATURA-UI\SYZIA-071-HF01.patch"
git apply --check $patchUI
git apply $patchUI
git diff --check
```

Em caso de divergência, interromper e conciliar; não usar `--reject` nem copiar arquivos sobre alterações posteriores. `arquivos/` contém cópias para inspeção, não uma segunda etapa obrigatória de aplicação.

## Testes direcionados

Usar o lockfile existente; nenhuma dependência nova:

```powershell
npm ci
node --experimental-strip-types --test tests/subscription-ui/view.test.mjs tests/subscription-ui/runtime.test.mjs tests/stripe-online/transport.test.mjs
npx playwright test --config=playwright.subscription-ui.config.ts
npx playwright test --config=playwright.catalog-071.config.ts --reporter=list
npm run build
git diff --check
```

Executar os dois comandos de navegador sequencialmente. Usam portas 4192 e 4191 e recusam reutilização de servidor existente. Utilizar o Chromium do Playwright local; o caminho `FOUNDATION_CHROMIUM_PATH` usado nas evidências é específico do ambiente Linux desta execução e não deve ser copiado para o Windows.

Os testes são isolados e interceptam serviços externos. Não conectar a interface de testes a projetos reais. `tests/subscription-ui/harness.html` é uma entrada de testes, não uma rota a publicar. O build oficial continua usando os pontos de entrada existentes.

## Publicação futura — exige autorização

1. Revisar patch, relatório e evidências. Preservar integralmente as variáveis e habilitações atuais do Render; este pacote não altera nenhuma delas.
2. Publicar a linha aditiva do backend e o frontend correspondente em janela coordenada, preferencialmente backend primeiro. O frontend anterior ignora o novo booleano. O frontend novo, com backend anterior, mantém a gestão Stripe sem ação por ausência de confirmação explícita do indicador.
3. Não executar SQL, cadastrar produtos/preços, criar chaves ou habilitar contratação global. `stripe_operations_available` é um campo da resposta, **não uma variável a cadastrar no Render**.
4. Conferir Administração → Plano e assinatura em uma organização autorizada: identidade da empresa no workspace, estado real, datas confirmadas, três modalidades conforme visibilidade do catálogo e situação financeira efetiva.
5. Conferir desktop/mobile, botão Atualizar, seleção e resumo sem finalizar uma contratação. Quando o backend bloquear contratações, os controles devem continuar bloqueados.
6. Conferir um contrato existente em consulta; cancelamento/reativação só devem ser executados se houver autorização própria para modificar esse contrato. A alteração de modalidade permanece indisponível na integração Stripe atual.
7. Confirmar que frontend/backend publicados pertencem à mesma revisão. Se o sintoma de conteúdo invisível persistir, coletar versão dos assets, Console, requisições e estilos computados da tela; não presumir que limpar cache resolveu sem verificar.

## Rollback

Não há dados novos nem schema a reverter. Antes de incorporar outras mudanças, em uma cópia limpa com apenas este patch aplicado:

```powershell
git apply --reverse --check $patchUI
git apply --reverse $patchUI
git diff --check
```

Se já publicado, o proprietário poderá republicar os artefatos anteriores de frontend/backend após autorização. Reverter primeiro o frontend evita esconder temporariamente ações por falta do novo indicador. Nenhum SQL, cancelamento de assinatura, alteração de mapeamento, exclusão de histórico ou mudança de credencial faz parte do rollback.

O pacote não muda o modo financeiro. Não utilizar a reversão como justificativa para habilitar contratações ou alterar contratos existentes. Após alterações posteriores, preparar reversão específica em vez de aplicar o patch inverso indiscriminadamente.
