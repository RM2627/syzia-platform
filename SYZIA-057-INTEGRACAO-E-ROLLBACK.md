# SYZIA 057 — Integração e rollback

Base exata: `33e04ca8ba14be73e7050ae84c5299410d5c7011`. A branch preparada é local, `syzia-057-ativacao-automatica`; nenhum commit remoto foi criado. Extraia o ZIP fora do repositório. Escolha patch ou overlay, nunca ambos.

## Integração local pelo PowerShell

```powershell
$Repo = 'C:\Projetos\syzia-platform'
$Pacote = 'C:\Entregas\SYZIA-057-INCREMENTAL'
Set-Location $Repo
git status --short
git rev-parse HEAD
# Preservar alterações locais. Não usar reset/clean.
git switch -c syzia-057-ativacao-automatica
if ($LASTEXITCODE -ne 0) { throw 'Confira a branch local existente.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" before "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Base diferente. Comparar antes de integrar.' }
git apply --check --ignore-space-change "$Pacote\SYZIA-057.patch"
if ($LASTEXITCODE -ne 0) { throw 'Patch não aplicável.' }
git apply --ignore-space-change "$Pacote\SYZIA-057.patch"
if ($LASTEXITCODE -ne 0) { throw 'Confira o estado local.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Arquivos divergentes.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Instalação falhou.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou.' }
node --test --test-concurrency=1 tests/commercial-057/*.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Teste 057 falhou.' }
node --experimental-strip-types --test --test-concurrency=1 tests/billing-056-hf02/*.test.mjs tests/commercial-056/preregistration.test.mjs tests/commercial-implementation/control.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Regressão falhou.' }
npx playwright install chromium
npx playwright test --config=playwright.commercial057.config.ts
if ($LASTEXITCODE -ne 0) { throw 'Navegador falhou.' }
```

Esses testes iniciam bancos descartáveis locais e dependências simuladas; usar ambiente sem credenciais reais e portas 5173/5174/54321 livres. Nenhum comando acima aplica SQL em Supabase ou envia e-mails externos. Não copiar os dados fictícios de consentimento/documento para produção.

## Migration e futura homologação

A versão SYZIA 057 inclui a migration **058**, pois a 057 numérica já pertence ao HF02 financeiro. Não renumerar nenhuma delas.

Após revisão, backup e autorização separada, o proprietário deverá aplicar **somente** `202610220058_invitation_activation.sql` no banco operacional já atualizado até `202610210057_billing_completed_change_recovery.sql`. Não aplicar ao Neon, não reaplicar a cadeia, não usar reset. O arquivo é transacional; diante de erro, interromper e verificar rollback antes de tentar outra ação.

O frontend novo depende dessa migration. Não publicar a interface contra banco ainda no fluxo antigo. Não executar nenhuma etapa de publicação automaticamente.

Para homologação externa futura, conferir: convite individual da conta destinatária; e-mail confirmado e sessão real; revisão e plano; aceites jurídicos; checkout oficial; assinatura validada server-side; reconciliação comercial; serviços remapeados; ausência de dados demonstrativos operacionais. Acesso com outra conta, convite revogado e segunda tentativa não podem criar outra empresa. A configuração não é publicada automaticamente. Datas e trial seguem exclusivamente o checkout existente.

## Rollback de código antes da publicação

```powershell
Set-Location $Repo
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Há alterações posteriores. Revisar a reversão.' }
git apply --reverse --check --ignore-space-change "$Pacote\SYZIA-057.patch"
if ($LASTEXITCODE -ne 0) { throw 'Reversão exige revisão.' }
git apply --reverse --ignore-space-change "$Pacote\SYZIA-057.patch"
if ($LASTEXITCODE -ne 0) { throw 'Reversão falhou.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" before "$Repo"
```

Esse procedimento foi validado em checkout limpo e reverte somente arquivos locais. Se já houver commit posterior, usar o inventário para uma reversão revisada, preservando o trabalho posterior; não executar reset.

## Se a migration já tiver sido aplicada

Reverter arquivos não desfaz o banco. **Não há down destrutivo automático.** Preservar colunas, claims, verificação, histórico e organizações materializadas. Não restaurar o antigo `commercial_claim_request` sem validação do destinatário. O contrato RPC antigo permanece compatível, mas a interface antiga voltaria a mostrar instruções de análise desatualizadas; isso não representa reversão da política no banco.

Se for necessário suspender novas ativações após uma publicação futura, interromper a distribuição de convites e planejar uma correção incremental autorizada que bloqueie novas preparações, sem desfazer empresas nem assinaturas. Não cancelar cobranças ou assinaturas como parte do rollback. Uma reversão de política no banco exige revisão específica e não está sendo executada nesta rodada.
