# Integração e rollback — Cadastro/Confirmação 070

Este documento prepara ações posteriores do proprietário. Nada aqui foi executado na infraestrutura de produção.

## 1. Aplicar o incremental em cópia isolada

Base exata: `3860f6046fbd4c8875df579be279b52247e9f6d8`. O pacote contém o patch, arquivos novos/modificados, inventário de SHA-256, evidências e esta documentação. Usar o patch ou a sobreposição, nunca ambos. Preferir patch para detectar conflitos.

No PowerShell, no repositório sem alterações locais pendentes:

```powershell
git status --short
git rev-parse HEAD
git switch -c syzia-auth-confirmation-recovery
$patchPath = (Resolve-Path '..\SYZIA-CADASTRO-CONFIRMACAO-070\SYZIA-CADASTRO-CONFIRMACAO-070.patch').Path
git apply --check --binary $patchPath
if ($LASTEXITCODE -ne 0) { throw 'Patch incompatível: não prosseguir.' }
git apply --binary $patchPath
if ($LASTEXITCODE -ne 0) { throw 'Aplicação falhou: revisar a cópia isolada.' }
git diff --check
```

Ajustar somente o caminho do ZIP extraído. Se o HEAD tiver evoluído, preservar os commits posteriores e revisar diferenças dos arquivos afetados; não resetar a main para forçar aplicação. Não contornar conflitos com sobrescrita indiscriminada.

Instalar pelo lockfile somente se necessário (`npm ci`). Executar os comandos direcionados de `TESTES.md`; nenhum deles precisa de credenciais reais. Não executar scripts de implantação ou migrations remotas nesta conferência.

## 2. Revisão de banco e configuração externa

Antes da autorização de publicação:

1. Conferir que a base e o banco possuem o histórico até a 069 e que não há outra migration usando a sequência 070. Havendo colisão, interromper a aplicação dessa migration e reconciliar a sequência sem editar migrations já aplicadas.
2. Produzir backup verificável do banco e registrar o commit/configuração atualmente em uso. Não colocar exportações, dados de usuários ou segredos no Git ou neste pacote.
3. Revisar `202611020070_registration_recovery.sql`. É uma operação aditiva, em `BEGIN/COMMIT`; não altera dados de contratos nem grants históricos. A execução de teste ocorreu somente em banco descartável. Para o Supabase operacional, aguardar autorização específica do proprietário.
4. No Supabase Auth, conferir a allowlist para `${PLATFORM_APP_ORIGIN}/confirmar-email`, usando o domínio HTTPS real da aplicação. Preservar `/cadastrar` e URLs de recuperação existentes. Não usar curingas amplos.
5. Manter confirmação de e-mail habilitada. Verificar que o template de confirmação usa a URL de confirmação oficial, normalmente `{{ .ConfirmationURL }}`, e não um link que pule a verificação. Não alterar automaticamente templates aprovados.
6. Conferir SMTP do Supabase Auth, remetente/domínio autorizado, CAPTCHA e limites de envio. Examinar Auth Logs e registros do provedor sem copiar endereços completos, tokens, senhas, URLs de confirmação ou bodies privados para relatórios.
7. Planejar frontend e backend coordenados: o backend novo emite `/confirmar-email`, portanto essa rota deve estar disponível antes de enviar novos links. Não publicar somente uma metade do patch.

Não há nova variável secreta. O transporte de confirmação continua sendo Supabase Auth, com as variáveis existentes. Não alterar Resend Academy/Demo, Stripe, Mercado Pago ou credenciais.

## 3. Homologação posterior autorizada

Não executada nesta rodada. Usar um destinatário controlado e autorizado, sem contratação financeira:

1. Abrir um convite válido no notebook; cadastrar uma identidade uma única vez. Conferir a tela de confirmação e metadados esperados pelos canais administrativos já autorizados.
2. Abrir o e-mail no celular; confirmar e continuar. Conferir a identidade e o nome da mesma preparação, sem criar outra empresa.
3. Voltar ao notebook. Selecionar “Já confirmei meu e-mail”; se não houver sessão, entrar com a conta cadastrada. Retomar a mesma preparação, sem novo formulário com nome/username já válidos.
4. Testar reenvio de forma controlada somente se necessário, respeitando o intervalo. Não interpretar resposta neutra como confirmação de entrega.
5. Conferir a recusa de convite expirado/revogado e de outra conta sem alterar registros operacionais para fabricar o cenário. Usar dados de homologação aprovados.
6. Parar antes do checkout. A confirmação de identidade não é confirmação financeira e não libera recursos pagos.

Critério de aprovação externa: recebimento real do e-mail, callback válido, retomada da mesma preparação nas duas sessões e ausência de duplicação. Se falhar, guardar somente data/hora, request ID existente, etapa e código sanitizado.

## 4. Rollback

### Antes de publicação

Na mesma cópia isolada, sem alterações posteriores nos arquivos do patch:

```powershell
git apply -R --check --binary $patchPath
if ($LASTEXITCODE -ne 0) { throw 'Rollback exige revisão de conflitos.' }
git apply -R --binary $patchPath
```

Não executar `reset --hard`, excluir usuários ou restaurar um banco antigo sobre dados novos.

### Depois de uma publicação autorizada

- A migration 070 é aditiva. **Manter tabela, contextos e funções**, mesmo revertendo código. Não fazer DROP, não apagar cadastros e não reaplicar a migration.
- Preferir correção adiante se já houver e-mails emitidos. Um rollback integral removeria `/confirmar-email` e quebraria links ainda válidos.
- Se for necessário reverter o fluxo principal, preservar temporariamente `src/access/SignupConfirmation.tsx`, `src/access/registration-core.ts`, a rota em `src/main.tsx` e a exclusão de consumo automático nas rotas de cadastro em `src/api.ts`. Revisar o conjunto resultante antes de qualquer publicação; não aplicar reversão parcial às cegas. A rota precisa continuar validando o callback até expirarem os links emitidos, conforme prazo configurado no Auth.
- Se também for revertido o endpoint de reenvio, a opção não poderá afirmar sucesso; comunicar a indisponibilidade até uma correção coordenada. Não redirecionar envios para outro transporte automaticamente.
- A reversão do código reintroduz as limitações anteriores. Não é recuperação de dados nem solução para uma falha do SMTP externo.

Nenhum procedimento de rollback autoriza deploy ou SQL remoto por si só.
