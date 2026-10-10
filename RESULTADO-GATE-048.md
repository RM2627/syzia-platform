# Gate da SYZIA 048

Comando oficial: `npm run test:current-gate` (19 etapas). O relatório reproduzível é gerado em `reports/syzia-044/current-gate.json`, versão 048.

Esta cópia dentro do consolidado descreve o contrato de validação. O recibo da execução **posterior à extração do ZIP final**, com seu SHA-256, tamanho, `npm ci`, build/typecheck e resultado de cada etapa, é entregue separadamente com o mesmo título e no pacote `SYZIA-048-EVIDENCIAS.zip`. Não incorporar o próprio hash do ZIP em um arquivo dentro dele.

Os resultados brutos não são pré-requisitos para executar o gate. A extração deve conter código, testes, fixtures, lockfile, configs, cadeia completa de migrations e as entradas documentadas em `reports/README.md`.

PASS local não encerra MP-01 nem as pendências externas. Freeze funcional somente após a validação limpa aprovada; nenhum deploy ou cobrança real faz parte deste gate.
