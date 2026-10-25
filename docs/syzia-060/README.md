# SYZIA 060 — Operação local e auditoria

Base oficial: `a5354a934f7052471bfdd89223f1f62b3a7610b8`, consultada em 25/10/2026. Branch somente local: `syzia-060-local`.

Esta árvore contém a implementação para auditoria independente. Nenhuma autorização de publicação está implícita.

## Validação local, sem credenciais

```sh
npm ci
npm run build
npm run test:060
npm run test:060:browser
npm run samples:060 -- ./output/pdf
```

O teste de navegador usa o Chromium instalado para o Playwright. Opcionalmente, `FOUNDATION_CHROMIUM_PATH` pode apontar para um executável Chromium local. `SYZIA060_EVIDENCE_DIR` define o diretório de evidências; o padrão é temporário. O teste inicia um Vite local, dois bancos PGlite descartáveis e Storage simulado. Nenhuma chamada a serviços reais é necessária.

## Integração futura

A única migration nova é `supabase/migrations/202610250060_demo_studio.sql`, destinada ao banco operacional. Ela está preparada, não aplicada remotamente. A cadeia anterior fica intacta. O Neon permanece com o esquema demonstrativo existente; a aprovação usa o adaptador atual de configuração e mídia.

O Studio reutiliza `commercial.manage` e o controle de sessão. Operadores veem seus próprios rascunhos; o administrador raiz pode revisá-los. A biblioteca compartilhada é editável pelo administrador raiz. Os objetos são privados no bucket existente `company-media`; o frontend não recebe chaves de serviço. Não há nova dependência npm nem serviço adicional.

Salvar não publica. Aprovar cria uma demonstração em preparação; publicação, convites e ativação continuam nos fluxos oficiais. Se a transferência de imagens falhar, repetir a aprovação retoma o mesmo vínculo. A limpeza explícita remove apenas objetos de preparações excluídas sem referências compartilhadas ou conversão.

Os relatórios da rodada, resultados completos, inventário e instruções detalhadas são entregues separadamente. O pacote preserva os pequenos arquivos históricos versionados exigidos pelos verificadores antigos de integridade; não incorpora logs ou capturas novos aos fontes.
