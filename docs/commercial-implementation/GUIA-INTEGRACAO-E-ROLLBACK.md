# Integração local e rollback — comercial 054

Entrega incremental para homologação sobre a base oficial `4b33f423982e6d3703935ae2f18a738c0496b72e`. Não integrar automaticamente em produção. A migration 054 ainda depende de homologação e de nova autorização; os scripts abaixo não executam SQL, Git, deploy ou serviços externos.

## Conferência no PowerShell

Extraia o pacote em uma pasta separada da cópia local da SYZIA. Use Node.js compatível com a base (validação desta entrega: Node 24). Feche editores/processos que possam gravar os mesmos arquivos durante a aplicação. Preserve os arquivos privados fora do pacote.

```powershell
Get-FileHash .\SYZIA-COMERCIAL-054-INCREMENTAL.zip -Algorithm SHA256
cd .\SYZIA-COMERCIAL-054-INCREMENTAL
.\INTEGRAR.ps1 -Mode Verify -Project 'C:\Projetos\SYZIA-homologacao'
```

Compare o hash com o arquivo de hashes entregue. `Verify` confere os 1.090 arquivos da referência, a integridade do incremento e conflitos em arquivos novos. Nenhum arquivo funcional é alterado. O lock local é temporário. Caminhos redirecionados por symlink/junction são recusados; use os caminhos canônicos. Somente os arquivos textuais expressamente identificados aceitam CRLF/LF equivalentes. Binários e alterações de conteúdo continuam protegidos.

O verificador aceita base original ou arquivos já aplicados exatamente. Qualquer mudança local diferente interrompe a integração. Não edite manifests para contornar erro: compare a divergência e preserve-a para revisão.

## Aplicação somente na cópia de homologação

A pasta de backup deve ser nova, externa à SYZIA e ao pacote; seu diretório pai já deve existir. Ela guarda apenas os arquivos afetados e o registro do rollback, sem copiar pastas privadas.

```powershell
.\INTEGRAR.ps1 -Mode Apply -Project 'C:\Projetos\SYZIA-homologacao' -Backup 'C:\Backups\SYZIA-antes-comercial-054'
cd 'C:\Projetos\SYZIA-homologacao'
npm ci
npm run test:commercial:054
npm run test:commercial:regression
npm run build
node scripts/commercial/check-demo-build.mjs
npm run test:current-gate
```

O modo padrão do gate continua completo. O comando `npm run test:current-gate -- --local-nonbrowser` existe apenas para registrar verificações parciais quando o navegador estiver indisponível: termina com **INCOMPLETE e código 2**, mesmo se todas as etapas locais passarem. Não o use como critério de liberação.

A automação PowerShell não foi executada em Windows nesta rodada. Seu núcleo Node foi validado em cópia isolada da base, incluindo verificação, sobreposição, reaplicação, rollback e rejeição de adulteração. A validação nativa no Windows continua necessária.

## Configuração isolada

`COMMERCIAL_ENABLED`, `COMMERCIAL_MAIL_ENABLED` e a flag de frontend permanecem desativados por padrão. Não preencha exemplos com segredos. Use arquivos locais ignorados ou variáveis de sessão. `COMMERCIAL_LINK_ENCRYPTION_KEY` precisa de 32 bytes aleatórios em Base64; mantenha-a server-side e estável enquanto houver convites. A perda/rotação da chave impede o reenvio dos convites cifrados; revogue e gere novos mediante autorização.

Para a demonstração são necessários um banco PostgreSQL exclusivo e uma cópia local isolada da API/aplicação. A base demonstrativa recebe a cadeia real de migrations e o schema adicional; não use o Supabase operacional como destino. O bootstrap é destrutivo por natureza apenas sobre banco vazio e recusa schemas existentes. Nunca fornecer URL de produção.

```powershell
# Somente após preparar um banco local vazio e suas variáveis privadas:
npm run demo:initialize -- --initialize-empty-demo-database
npm run demo:dev -- --port 5174
```

O bootstrap exige `DEMO_DATABASE_PURPOSE=syzia-commercial-demo-054`. Por padrão aceita somente loopback. Não habilite a opção de banco remoto nesta homologação. O comando de desenvolvimento usa `.env.demo`/exemplos sem Auth ou credenciais financeiras operacionais. Consulte `ORIGENS-E-DOMINIO.md` e `.env.demo.example`.

O runtime comercial valida a identidade do banco no início. Com `COMMERCIAL_ENABLED=true`, banco indisponível ou configuração inválida impede a inicialização da API; confirme configuração e conectividade no ambiente isolado antes de habilitar. Não ativar esse modo na API publicada durante esta rodada.

Para testar e-mail, utilizar injeção de transporte simulado fornecida pelos testes; não habilitar SMTP externo. Para PostgreSQL nativo em Linux com usuário comum, `node scripts/commercial/native-local.mjs` cria e remove um cluster temporário de teste sem conexões externas. Não confundir seu resultado com homologação da hospedagem.

## Migration e dados

Somente `202610180054_commercial_preparation.sql` é nova. As 49 migrations anteriores estão preservadas integralmente. A nova migration é transacional, usa RLS/FORCE RLS e inclui testes de upgrade populado e falha com rollback. Nenhuma migration foi aplicada ao Supabase real.

Não há script de remoção automática de dados comerciais. Depois de qualquer uso real, reverter arquivos não reverte schema, contatos, consentimentos, envios ou reivindicações. Não apagar histórico para voltar de versão. Uma eventual reversão de banco exige procedimento separado, revisão e autorização.

## Rollback de arquivos

Na mesma pasta do pacote:

```powershell
.\INTEGRAR.ps1 -Mode Rollback -Project 'C:\Projetos\SYZIA-homologacao' -Backup 'C:\Backups\SYZIA-antes-comercial-054'
cd 'C:\Projetos\SYZIA-homologacao'
npm ci
```

O rollback confere o hash atual de cada arquivo antes de restaurar o original ou remover um arquivo adicionado. Se houver edição posterior, interrompe sem sobrescrevê-la. Diretórios vazios podem permanecer. A operação não altera banco, armazenamento, credenciais, publicação ou Git. Não executar simultaneamente à aplicação ou a outro editor. Um lock remanescente após interrupção deve ser investigado antes de removê-lo manualmente.
