# Entradas preservadas e saídas reproduzíveis

A base limpa 048 não transporta resultados históricos de execução. Os testes e fixtures continuam em `tests/`; o gate cria seus diretórios e resultados a cada execução.

Entradas mantidas por dependência explícita:
- `phase-6-migration-integrity.json`: `scripts/commercial-inventory.mjs`.
- `ux001/{before,after}/measurements.json`: verificadores/comparadores UX-001 existentes.
- `ux-performance/{before,after,before-actions,after-actions,after-guards}/measurements.json`: verificadores/comparadores existentes.

Esses JSON são referências de comparação, não atestados de execução da 048. Screenshots, traces e logs históricos continuam nas entregas anteriores. Referências históricas a capturas em documentos antigos apontam para aqueles arquivos, não para a base limpa. Geradores editoriais históricos (por exemplo `build-brand-board.mjs`) exigem recuperar as capturas da entrega correspondente; não são dependências da aplicação, do build nem do gate vigente.

O resultado completo da validação da base limpa fica em `SYZIA-048-EVIDENCIAS.zip`.
