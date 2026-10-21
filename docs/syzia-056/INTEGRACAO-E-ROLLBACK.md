# Integração e rollback — SYZIA 056

## Antes de integrar

Base exata: `ba6546816a0dc1cf1fb6e9333851974b6fea1674`. O pacote foi preparado da main oficial, sem mudanças em serviços externos. A branch entregue existe localmente no ambiente de preparação; não foi criada remotamente por push.

Extraia o ZIP fora do repositório. `overlay/` contém somente arquivos novos/modificados; `SYZIA-056.patch` é uma alternativa equivalente à sobreposição. **Use apenas uma modalidade.** `INVENTARIO.json` descreve os hashes anteriores/novos. `VERIFICAR-PACOTE.mjs` faz somente leituras e não conecta a nenhum serviço.

Salve seu trabalho local. Se houver commit posterior ou alterações nos arquivos afetados, não sobrescreva: compare e integre os diffs. Não use reset, clean ou checkout destrutivo para forçar a base.

## PowerShell — aplicação local pelo patch

Adapte somente os dois caminhos:

```powershell
$Repo = 'C:\Projetos\syzia-platform'
$Pacote = 'C:\Entregas\SYZIA-056-INCREMENTAL'
Set-Location $Repo
git status --short
git rev-parse HEAD
# Continue apenas com a base esperada e sem trabalho local conflitante.
git switch -c syzia-056-commercial-ux
if ($LASTEXITCODE -ne 0) { throw 'Confira a branch local antes de continuar.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" before "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Preflight recusado: não sobrepor arquivos.' }
git apply --check --ignore-space-change "$Pacote\SYZIA-056.patch"
if ($LASTEXITCODE -ne 0) { throw 'Patch não aplicável: revisar diferenças.' }
git apply --ignore-space-change "$Pacote\SYZIA-056.patch"
if ($LASTEXITCODE -ne 0) { throw 'Aplicação interrompida: conferir estado local.' }
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Conteúdo final difere do pacote.' }
npm ci
npm run build
```

Execute a matriz local antes de qualquer homologação externa. O verificador aceita unicamente CRLF/LF nos arquivos textuais declarados; não altera a configuração global do Git. Não é necessário modificar o lockfile. Se a branch já existir, confira sua origem e use-a conscientemente, sem recriá-la à força.

Alternativa por sobreposição: depois de `before` aprovado, copiar os arquivos de `overlay/` aos mesmos caminhos relativos e executar `after`. O patch e a sobreposição foram preparados com o mesmo inventário. Não copiar `evidencias/` como código da aplicação.

## Banco — revisão posterior obrigatória

A migration `202610210056_commercial_preregistration.sql` deve ser revisada pelo proprietário. **Os comandos acima não a executam.** O pré-cadastro sem e-mail/empresa só funcionará no banco que já tiver recebido a 056.

Antes de uma aplicação futura autorizada, confirmar backup, base 055 existente, ausência de edição concorrente durante a breve transação e permissões de manutenção. Ela preserva dados, ACLs e RLS/FORCE RLS e usa timeouts; se falhar, a transação não deve ser parcialmente aproveitada. Revisar o erro e executar `ROLLBACK` na mesma sessão, sem tentar ignorar falhas.

É uma alteração do cadastro comercial operacional. Não reaplicar 054/055, não executar o bootstrap de demo contra o Neon existente, não recriar bases e não alterar `schema_version = 55` da demonstração por causa desta entrega. Não há operação de infraestrutura necessária nesta rodada.

## Rollback de código

Antes de integrar, guarde o pacote e o estado do repositório. Com somente a 056 aplicada e sem alterações posteriores conflitantes:

```powershell
Set-Location $Repo
node "$Pacote\VERIFICAR-PACOTE.mjs" after "$Repo"
if ($LASTEXITCODE -ne 0) { throw 'Há alterações posteriores: revisar rollback manualmente.' }
git apply --reverse --check --ignore-space-change "$Pacote\SYZIA-056.patch"
if ($LASTEXITCODE -ne 0) { throw 'Rollback não aplicável sem revisão.' }
git apply --reverse --ignore-space-change "$Pacote\SYZIA-056.patch"
npm run build
```

Isso restaura somente os arquivos do patch e remove seus arquivos novos; não exclui dados de aplicação nem histórico. Não faz push, deploy ou SQL.

Se a migration 056 já tiver sido aplicada futuramente, **não restaurar NOT NULL automaticamente**: novos interessados podem legitimamente não ter empresa/e-mail. Não preencher valores inventados nem apagar registros para permitir downgrade. Manter a adaptação de banco, que conserva as assinaturas dos RPCs e aceita payloads completos antigos, até definir uma reversão específica com os dados então existentes. A interface antiga voltará a exigir mais campos e a ocultar contatos inelegíveis; esse efeito deve ser considerado antes do rollback.

## Pendências de outra rodada

1. Destinatário da ativação: decisão e correção da vinculação ao primeiro solicitante autenticado (056-P01). Não relaxar análise do Super Admin para compensar.
2. Reconciliação da integridade histórica com a main (056-P02). Não substituir hashes de `.env.demo.example` apenas para obter PASS.
3. Homologação externa autorizada: conta nova/conta existente, e-mail real, configuração publicada e checkout/MP. Nenhum desses serviços foi utilizado nesta entrega.

Nenhum comando deste guia autoriza commit, push, merge, deploy ou aplicação da migration real automaticamente.
