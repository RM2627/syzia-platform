# Integração local — SYZIA 056-HF01

Base: `8f061f0002e4a7d7db54927628382686a1cb90f3`. Patch pequeno, sem migrations e sem alterações de configuração. `overlay/` contém somente arquivos novos/modificados; usar o patch **ou** a sobreposição, nunca ambos. A branch de preparação é local, sem push.

## PowerShell

Extraia o pacote fora do repositório e ajuste os caminhos:

```powershell
$Repo = 'C:\Projetos\syzia-platform'
$Pacote = 'C:\Entregas\SYZIA-056-HF01-INCREMENTAL'
Set-Location $Repo
git status --short
git rev-parse HEAD
# Conferir base e preservar qualquer trabalho local. Não usar reset/clean.
git switch -c syzia-056-hf01-invitations
if ($LASTEXITCODE -ne 0) { throw 'Confira a branch local existente.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" before "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Preflight recusado: revisar diferenças.' }
git apply --check --ignore-space-change "$Pacote\SYZIA-056-HF01.patch"
if ($LASTEXITCODE -ne 0) { throw 'Patch não aplicável.' }
git apply --ignore-space-change "$Pacote\SYZIA-056-HF01.patch"
if ($LASTEXITCODE -ne 0) { throw 'Confira o estado local antes de continuar.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Arquivos finais diferem do pacote.' }
npm ci
npm run build
node --experimental-strip-types --test --test-concurrency=1 tests/commercial-implementation/control.test.mjs tests/commercial-implementation/ui-contracts.test.mjs
node --test tests/commercial-056/integrity.test.mjs tests/commercial-056-hf01/integrity.test.mjs
npx playwright install chromium
npx playwright test --config=playwright.commercial056.config.ts
```

O verificador é somente leitura, confere conteúdo/commit e aceita exclusivamente LF/CRLF nos textos inventariados. Se a main tiver avançado, comparar as diferenças em vez de sobrescrever. Não modificar globalmente `core.autocrlf`.

Os testes de navegador iniciam fixtures locais nas portas 5173/5174/54321. Usar ambiente sem credenciais de produção. As autorizações criadas pelo teste são dados fictícios, nunca uma configuração para uso real. Não copiar instruções ou valores da fixture para cadastrar consentimento de interessados reais.

## Homologação pelo proprietário

Conferir a tela com e sem e-mail, autorização ausente/expirada/vigente, supressão, demonstração expirada e permissão de operador. Somente contatos já autorizados poderão emitir links e enviar. A tela não registra novas autorizações; isso permanece uma pendência explícita. Testar e-mail externo depende de autorização própria; nenhum comando acima envia e-mail real.

## Rollback de código

Sem alterações posteriores conflitantes:

```powershell
Set-Location $Repo
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Há alterações posteriores; revisar a reversão.' }
git apply --reverse --check --ignore-space-change "$Pacote\SYZIA-056-HF01.patch"
if ($LASTEXITCODE -ne 0) { throw 'Reversão requer revisão manual.' }
git apply --reverse --ignore-space-change "$Pacote\SYZIA-056-HF01.patch"
npm run build
```

O rollback restaura a interface anterior, inclusive os formulários removidos, sem afetar os registros de convites e autorizações. Nenhum SQL, deploy, push ou merge é necessário ou autorizado por este guia.
