# Integração e rollback — Fase 3

Base do patch: `980bedb22f1da437031ad61335d1f574ad4fe794` de `RM2627/syzia-platform`. A branch de trabalho criada foi `syzia-stripe-fase3-online`, sem commit ou push. O pacote não contém SQLite, `node_modules`, `dist`, credenciais ou cópia de versões antigas.

O patch modifica o backend e frontend operacionais. Não se aplica à pasta isolada da POC. Arquivos da POC já presentes podem permanecer: não são modificados nem importados pelo runtime.

## Aplicação local para revisão

No checkout limpo da base oficial, preservando alterações legítimas posteriores:

```powershell
git status --short
git switch -c syzia-stripe-fase3-online
git apply --check --whitespace=error-all C:\caminho\SYZIA-STRIPE-FASE3.patch
git apply --whitespace=error-all C:\caminho\SYZIA-STRIPE-FASE3.patch
```

Se `--check` falhar, interromper a aplicação e comparar os arquivos conflitantes. Não usar `--reject`, sobrescrever a base ou alterar hashes para forçar aprovação. O inventário contém hashes dos arquivos anteriores e novos; diferenças só de CRLF/LF devem ser avaliadas como representação textual, não como autorização de mudanças funcionais.

Não é necessário iniciar servidores locais para usar a integração online. Para CI/revisão técnica, os comandos direcionados são:

```powershell
npm ci
npm run test:stripe:online
npm run build
# Opcional, ambiente com Chromium do Playwright disponível:
npm run test:stripe:online:browser
```

Não foram adicionadas dependências; lockfile permanece inalterado. Não executar os 79 testes da POC nem o gate histórico para aplicar este pacote. A revisão remota segue `RENDER-E-HOMOLOGACAO.md` e exige autorização para migration e publicação.

## Desativação imediata

Para suspender novas contratações, manter `BILLING_CHECKOUT_MODE=disabled` no Render e no runtime do banco. Não apagar contratos, reservas, eventos ou mapeamentos. Não trocar credenciais e não redirecionar contratos Stripe para o Mercado Pago.

`STRIPE_OPERATIONS_ENABLED=false` também bloqueia POSTs de gestão na Stripe. As consultas oficiais podem continuar com `STRIPE_ENABLED=true`; desativar este último indisponibiliza inclusive o receptor Stripe. Escolher a contenção conforme a ocorrência, preservando o processamento de contratos já existentes.

## Reversão do código

Antes de existirem contratos Stripe, em árvore que contenha exatamente o patch aplicado:

```powershell
git apply --reverse --check C:\caminho\SYZIA-STRIPE-FASE3.patch
git apply --reverse C:\caminho\SYZIA-STRIPE-FASE3.patch
```

Não usar `git reset --hard`. Se houver outras alterações, reverter somente os arquivos desta entrega após comparar o inventário.

**Após existirem contratos Stripe, preferir desabilitar aquisições mantendo este runtime.** O binário antigo não administra esses contratos. Reverter o código sem um plano de gestão e reconciliação deixaria operações pendentes, embora as proteções do banco continuem bloqueando mutações pelo adaptador errado.

## Banco de dados

A migration não foi aplicada em produção. Não há script destrutivo automático de downgrade: exclusão de tabelas ou reescrita de histórico financeiro não é um rollback seguro. Depois de aplicada, manter a migration aditiva e aquisições bloqueadas, preservando os objetos e registros para revisão. Qualquer reversão estrutural requer autorização e análise de uso, com restauração administrativa a partir de backup quando adequada.

Os arquivos das migrations anteriores não devem ser editados, renumerados, agrupados ou reaplicados por este procedimento.
