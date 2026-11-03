# SYZIA 071-HF02 — Integração e rollback

Base exata: `16f01c815c1d457b2aef4b8ce713c945a2de0dc2`. Patch incremental, sem migration, dependência, alteração de backend ou variável nova. Não copiar o `dist` dos testes para produção: ele usa URLs locais e nem está incluído no pacote.

## Aplicar em cópia/branch isolada — PowerShell

Extraia o ZIP e ajuste somente o caminho `$pacote`. Execute na raiz de uma cópia limpa do repositório:

```powershell
$pacote = 'C:\SYZIA-071-HF02-INCREMENTAL'
$patch = Join-Path $pacote 'SYZIA-071-HF02.patch'
$base = '16f01c815c1d457b2aef4b8ce713c945a2de0dc2'
if ((git rev-parse HEAD).Trim() -ne $base) { throw 'Base diferente: conferir alterações posteriores, sem reset ou sobrescrita.' }
if (git status --porcelain) { throw 'Existem alterações locais: preserve-as antes de aplicar.' }
git switch -c syzia-subscription-ui-071-hf02
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar a branch.' }
git apply --check $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch incompatível: interromper.' }
git apply $patch
if ($LASTEXITCODE -ne 0) { throw 'Falha na aplicação.' }
git diff --check
git status --short
```

`arquivos/` contém as mesmas versões finais para inspeção. Não aplicar o patch e depois sobrepor versões diferentes desses arquivos. Se a branch já existir, confira seu conteúdo antes de reutilizá-la; não force recriação. Não fazer commit/push/deploy automaticamente.

## Reproduzir os testes direcionados

Use Node compatível com a base (validado em Node 24), dependências do lockfile (`npm ci` em ambiente novo) e Chromium do Playwright (`npx playwright install chromium` se ausente).

```powershell
node --experimental-strip-types --test tests/subscription-hf02/security.test.mjs tests/subscription-ui/view.test.mjs tests/subscription-ui/runtime.test.mjs tests/stripe-online/transport.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes Node.' }
```

Em uma cópia local para testes, as variáveis abaixo existem **somente durante o build local**. Elas não são credenciais e não devem ser copiadas para Render/Cloudflare. O teste abre o frontend compilado e intercepta todas as requisições: nenhum backend ou banco precisa ser iniciado.

```powershell
$testEnv = @{
  VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
  VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_ui_test'
  VITE_PLATFORM_API_URL = 'http://127.0.0.1:54321'
  VITE_BILLING_API_URL = 'http://127.0.0.1:54321'
  VITE_COMMERCIAL_PREPARATION_ENABLED = 'true'
}
$savedEnv = @{}
try {
  foreach ($key in $testEnv.Keys) {
    $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $testEnv[$key], 'Process')
  }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Build reprovado.' }
} finally {
  foreach ($key in $testEnv.Keys) {
    [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process')
  }
}
npx playwright test --config=playwright.subscription-hf02.config.ts
if ($LASTEXITCODE -ne 0) { throw 'Rota completa reprovada.' }
npx playwright test --config=playwright.subscription-ui.config.ts
if ($LASTEXITCODE -ne 0) { throw 'Regressão HF01 reprovada.' }
```

Portas locais: 4193 para preview do build completo; 4192 para regressão HF01. Executar sequencialmente; os testes encerram os próprios servidores. Não encerrar processos desconhecidos para liberar portas.

## Publicação e conferência online — somente quando autorizadas

1. Revisar diff, inventário e capturas. Confirmar branch/base e testes.
2. Publicar apenas o frontend pelo processo existente, com as variáveis públicas reais já aprovadas. Nenhuma mudança de backend ou Supabase é necessária. Manter lista Stripe, `BILLING_CHECKOUT_MODE` e `STRIPE_OPERATIONS_ENABLED` exatamente como estão.
3. Em sessão de administrador da empresa, abrir Administração → Plano e assinatura na organização **sem autorização Stripe**, com preparação pendente. Conferir o nome da organização no cabeçalho, os três cards e o aviso compacto dentro da situação. Não clicar para criar assinatura.
4. Confirmar que não há “Verificar confirmação” sem contrato/operação. Botões de escolha continuam bloqueados nessa organização. “Atualizar status” é consulta do fluxo existente, não contratação.
5. Conferir desktop e celular, menu, foco e ausência de overflow. Na aba Network, verificar que os assets novos carregam sem erro. Se permanecer o aviso antigo como `<aside class="notice">`, o navegador ainda está executando a versão anterior; conferir artefato publicado e recarregar sem cache, sem alterar configurações de segurança.
6. Contratos realmente existentes podem exibir confirmação/gestão conforme o backend. Não criar assinatura nem modificar contrato para validar a aparência. Nenhum clique em retorno ou estado de UI libera acesso.

A conferência acima ainda não foi executada online nesta rodada.

## Rollback

Antes de novas alterações, com a correção ainda sem commit:

```powershell
git apply -R --check $patch
if ($LASTEXITCODE -ne 0) { throw 'Reversão exige revisão: não forçar.' }
git apply -R $patch
git status --short
```

Se já houver commit, preparar a reversão desse commit na branch apropriada e revisar antes de publicar. Não usar reset destrutivo nem apagar arquivos alheios. Caso o frontend tenha sido publicado futuramente, republicar o artefato anterior pelo procedimento autorizado; o defeito visual anterior retornará. Não há rollback SQL, alteração de contrato, reembolso ou mudança de credencial.
