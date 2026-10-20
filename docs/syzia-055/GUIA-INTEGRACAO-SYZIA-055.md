# SYZIA 055 — integração, homologação e rollback

Entrega para revisão local. A integração, o banco real e a publicação NÃO estão autorizados por este guia. O resultado final do gate e as pendências estão em `SYZIA-055-ESTADO-FINAL.md` e no pacote de evidências. Não tratar build aprovado como homologação concluída.

## Base e arquivos privados

Base oficial consultada: `61fa6d2f745128f7763850e64060fd818c7bf74f`, 054. Trabalho isolado na branch local `codex/syzia-055-commercial`, sem commit/push. O ZIP consolidado contém o código completo, lockfile, testes, assets, exemplos e toda a cadeia de migrations. Não contém node_modules, builds, caches, credenciais locais ou ZIPs anteriores.

Mantenha a 054 original. Extraia em uma pasta nova; não sobreponha a instalação publicada. Não copie a pasta privada inteira. Configure apenas as variáveis necessárias à homologação isolada, por arquivo local ignorado ou pelo mecanismo de segredos já adotado. Os exemplos nunca devem receber credenciais versionadas.

No PowerShell, com Node 24 e npm compatíveis:

```powershell
Get-FileHash .\SYZIA-055-ENTREGA-PARA-HOMOLOGACAO.zip -Algorithm SHA256
Expand-Archive .\SYZIA-055-ENTREGA-PARA-HOMOLOGACAO.zip -DestinationPath C:\Homologacao\SYZIA055-entrega
cd C:\Homologacao\SYZIA055-entrega
# Compare o hash da base com SHA256SUMS.txt antes de extrair.
Get-FileHash .\SYZIA-055-BASE-LIMPA-CONSOLIDADA.zip -Algorithm SHA256
Expand-Archive .\SYZIA-055-BASE-LIMPA-CONSOLIDADA.zip -DestinationPath C:\Homologacao\SYZIA055
cd C:\Homologacao\SYZIA055\syzia-055
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou' }
npm run test:commercial:055
if ($LASTEXITCODE -ne 0) { throw 'Testes 055 falharam' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou' }
node scripts/commercial/check-demo-build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Build demonstrativo falhou' }
npm run test:current-gate
if ($LASTEXITCODE -ne 0) { throw 'Gate completo não aprovado; não integrar' }
```

Os testes locais não precisam de credenciais reais. O gate prepara navegador local quando disponível. Se faltar Chromium no Windows, instale somente o navegador de testes com `npx playwright install chromium` antes de repetir. Falha de navegador não autoriza ignorar etapas nem alterar expectativas.

`npm run test:current-gate -- --local-nonbrowser` é um diagnóstico parcial existente; retorna **INCOMPLETE/código 2** mesmo se todas as verificações não visuais passarem. Não serve para liberação.

Os manifests em `docs/syzia-055/` registram os 1.151 arquivos oficiais e transições autorizadas. Arquivos textuais identificados admitem apenas equivalência comprovada LF/CRLF; binários continuam exatos. Não recalcular hashes para aceitar modificações locais desconhecidas.

## Migrations: dois destinos diferentes

Nenhum comando abaixo foi executado em serviço externo nesta rodada. Depois de homologação e nova autorização, o proprietário deverá planejar backup e janela de atualização.

| Destino | Procedimento preparado |
|---|---|
| Supabase operacional já na 054 | Aplicar somente `supabase/migrations/202610200055_commercial_versions.sql`, com o mecanismo oficial de migrations e registro de versão |
| Banco demonstrativo exclusivo já na 054 | Aplicar a migration operacional 055 também nesse schema demonstrativo; depois `server/commercial/demo-upgrade-055.sql` |
| Banco demonstrativo local vazio | O bootstrap aplica a cadeia inteira e os schemas demonstrativos; recusa banco com schemas existentes |

O arquivo `demo-upgrade-055.sql` **não pertence ao Supabase operacional**. Ele exige `demo_private.identity` com finalidade demonstrativa. Não misture esses destinos e não reaplique migrations já registradas. A migration 055 usa transação, locks, RLS/FORCE RLS e preserva versões, aceites e histórico existentes.

Exclusivamente em banco demonstrativo local vazio, após configurar suas variáveis privadas:

```powershell
npm run demo:initialize -- --initialize-empty-demo-database
```

Não use a opção remota do inicializador nesta homologação. O marcador de finalidade `syzia-commercial-demo-054` permanece deliberadamente igual para reconhecer o banco exclusivo; o schema adicional passa a 55.

## Origens e editor integrado

Preservar as flags desativadas por padrão. A preparação depende de `COMMERCIAL_ENABLED`, `VITE_COMMERCIAL_PREPARATION_ENABLED`, URL da API, banco demonstrativo separado e origens exatas. Use os exemplos existentes e `.env.demo.example`.

O build demonstrativo exige `VITE_APP_REALM=demo`, `VITE_COMMERCIAL_APP_ORIGIN`, `VITE_COMMERCIAL_DEMO_ORIGIN` e `VITE_COMMERCIAL_API_URL`. Deve manter vazias as integrações operacionais de Supabase e Turnstile. A origem da gestão hospeda o JWT; o iframe demonstrativo recebe apenas a sessão de edição opaca.

`https://demo.usesyzia.com.br` é o domínio planejado; DNS, HTTPS, hospedagem, CORS e CSP não foram configurados. Homologar `frame-ancestors` permitindo somente a origem administrativa autorizada e verificar o editor em iframe sem enfraquecer outras políticas.

O runtime comercial recusa banco sem marcador/schema compatível. Habilitar a flag antes de preparar o banco pode impedir a inicialização da API; não altere a flag publicada durante os testes locais.

## Roteiro de conferência

1. Super Admin cria demonstração sem interessado/plano; salva, sai, retorna e confere o slug.
2. Configura dados, serviços, horários, identidade visual, template e página usando o configurador integrado. Salva rascunho; página pública continua indisponível.
3. Revisa, confirma e publica; abre link local e duas sessões distintas. Executa aceite direto e orçamento conforme configuração real. Confere isolamento e o mesmo registro em cliente/painel.
4. Altera o rascunho sem publicar; a versão pública deve permanecer igual. Publica nova versão e confirma a invalidação de sessões/convites anteriores.
5. Vincula dois interessados autorizados; confere links individuais, prévia de lote, exclusão de inelegíveis, revogação e expiração. Usar transporte simulado, nunca envio real.
6. Interessado autentica, solicita vínculo, aguarda análise do Super Admin e revisa a configuração. Faz contratação somente com gateway simulado nesta rodada.
7. Sem confirmação financeira: nenhuma importação/trial/capability por simples retorno. Com confirmação simulada: uma única organização recebe a configuração; IDs são novos, dados fictícios não migram e a página real continua sem publicação automática.
8. Simula falha, repetição, timeout e duas abas. Confere recuperação, histórico e ausência de duplicações. Executa desktop 1440 e mobile 390/360, teclado e upload/download.

O teste visual novo é `npm run test:commercial:055:browser`. A fixture usa apenas loopback, Auth simulado e dois bancos locais descartáveis. Esse teste foi executado com Chromium e gerou capturas reais da preparação, prévia, revisão, página pública e gestão em celular. Repita a homologação no ambiente local do proprietário; consulte o resultado completo da extração limpa.

## Rollback

Antes de integrar arquivos na cópia de homologação, preserve a cópia 054 e o inventário. Para rollback de arquivos, descarte a cópia 055 isolada e retome a 054 preservada. Não reverta por sobreposição indiscriminada sobre uma pasta com alterações posteriores.

Antes de qualquer uso, uma falha dentro da migration 055 reverte sua transação; isso foi testado localmente com base populada. **Depois de aplicada com sucesso e de haver dados 055, não há downgrade destrutivo automático.** Reverter código não reverte schema, versões, convites, claims, mídia ou organizações. Suspender a integração e elaborar recuperação/forward fix com backup e autorização específica, preservando histórico.

Os scripts desta entrega não fazem deploy, push, alterações de DNS ou SQL externo. A homologação real de Mercado Pago/MP-01 continua separada e pendente.
