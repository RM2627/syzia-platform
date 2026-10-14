# Aplicação e rollback — complemento do e-mail pagador 051

Não é uma base completa. Não executar SQL nem reaplicar a migration 051. Não fazer deploy automático ao aplicar estes arquivos.

## Conferir antes de sobrepor

1. Preserve uma cópia local da base e dos arquivos listados no inventário, fora da pasta servida e do repositório. Não inclua dados privados em arquivos que serão enviados a terceiros.
2. Extraia o complemento em uma pasta separada. Confira seu SHA-256 no arquivo de hashes da entrega.
3. Execute o verificador do complemento, apontando para a raiz do projeto original:

```text
node CAMINHO-DO-COMPLEMENTO/scripts/payer-email-051/verify.mjs before CAMINHO-DA-BASE
```

Use aspas nos caminhos que contiverem espaços. O comando apenas lê os arquivos técnicos explicitamente inventariados; não lê `.env` de execução, pastas privadas, serviços externos ou banco. Aceita exclusivamente equivalência LF/CRLF comprovada para os arquivos textuais listados; binários exigem bytes exatos. O manifesto tem âncora própria.

O esperado é PASS: 924 arquivos da referência, com os novos arquivos ausentes. Os três arquivos necessários do complemento diagnóstico anterior são opcionais nesta conferência: se já existirem, seus hashes anteriores conhecidos são exigidos. Outros relatórios históricos daquele complemento não são alterados.

**Se falhar, não troque hashes nem force a sobreposição.** Envie apenas o JSON de diferenças e a identificação completa obtida com `git rev-parse f316db5`, se esse commit estiver disponível. Depois, somente os arquivos técnicos apontados como divergentes serão necessários. Não envie credenciais ou a pasta privada. O PASS da referência local não comprova por si só o commit Git informado.

Dois PDFs fictícios versionados em `reports/syzia-049/documents/` podem ter sido regenerados pelos testes. Se forem as únicas divergências, compare-os com a referência do seu Git em uma cópia local limpa; não substitua seus hashes nem confunda resultado regenerado com alteração do código. Faça a conferência antes de rodar o gate, pois ele gera esses PDFs novamente.

## Aplicar localmente

4. Após a conferência, copie os arquivos do ZIP sobre a raiz da base, preservando os caminhos. O complemento contém somente arquivos alterados/adicionados e documentação desta rodada. Não substitui pastas inteiras.
5. Frontend, backend e `shared/billing-payer-email.*` formam uma alteração conjunta. Não publique só uma parte. Cliente antigo sem `payer_email` receberá rejeição segura no backend atualizado; não existe fallback para o e-mail administrativo.
6. Antes de executar testes, confira a sobreposição:

```text
node scripts/payer-email-051/verify.mjs after .
npm ci
npm run test:051
node --test tests/integrity-eol.test.mjs
node --test tests/mp400-051/diagnostic.test.mjs
npm run build
npm run test:current-gate
```

O gate inclui os testes novos por importação da suíte financeira existente; continua com 30 etapas. Não há novas dependências nem mudança no lockfile. O navegador utiliza a infraestrutura de testes já existente. No Windows, se não houver Chromium, siga o procedimento oficial da base para instalar o navegador do Playwright; não desabilite etapas.

O ambiente desta rodada foi Linux/Node/Chromium. A equivalência LF/CRLF e os negativos foram executados localmente; **não foi executado um Windows nativo nesta rodada**. O gate Windows do proprietário continua sendo uma confirmação adicional da aplicação sobre seu checkout oficial.

## Rollback local

Restaure os dez arquivos preexistentes alterados a partir da cópia feita antes da aplicação. Remova somente os arquivos novos listados no inventário que não existiam nessa cópia. Se o diagnóstico HTTP 400 anterior já estava aplicado, restaure seu teste anterior e mantenha suas dependências originais, em vez de apagá-las. Use a coluna de proveniência do inventário.

Restaure frontend e backend em conjunto. Não reverta migrations, contratos, reservas de trial, aceites ou histórico financeiro. Este complemento não modifica o esquema e não exige rollback de dados. Não reproduza uma criação externa incerta para testar o rollback.

Depois da restauração local, rode os comandos oficiais da base anterior. Nenhuma instrução deste guia autoriza commit, push, deploy, cobrança ou mudança em Render/Supabase.
