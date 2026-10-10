# Atualização da base 030 — presença pública

Este pacote parte exclusivamente do consolidado 030. Não há reset, importação de dados reais ou reexecução de migrations aplicadas. A execução no ambiente real cabe ao proprietário após revisão e homologação.

1. Preservar o backup e as configurações do ambiente conforme o procedimento já existente. Confirmar que 001–030 estão aplicadas, na ordem original.
2. Revisar `backend-decision.md` e a migration `supabase/migrations/202609220031_public_presence_experience.sql`.
3. Aplicar **somente a 031**, como migration incremental, antes de usar o frontend atualizado. Ela é transacional. Não editar nem reaplicar 001–030.
4. Manter o gateway de imagens existente e suas variáveis de ambiente. Ele continua responsável por validar, sanitizar e armazenar os arquivos; nenhuma chave privilegiada é enviada ao navegador.
5. Instalar as dependências pelo lockfile e executar `npm run build`. O comando já inclui `tsc --noEmit`.
6. Homologar com dados fictícios: criar categoria dentro do serviço; enviar imagem; configurar logo/capa/cor; organizar catálogo; adicionar os três formatos de trabalho; revisar o rascunho; publicar; conferir como visitante; verificar uma segunda empresa sem acesso ao rascunho da primeira.

Para reproduzir apenas os testes desta correção localmente:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run test:presence-correction
node scripts/prepare-browser.mjs
FOUNDATION_CHROMIUM_PATH="$PWD/.browser-runtime/chromium" npm run test:presence-correction:browser
npm run build
```

O navegador usa o ambiente demonstrativo local e dados fictícios. Não configurar credenciais reais para esses testes. Os resultados ficam em `reports/presence-correction/`.

## Compatibilidade e preservação

- Categorias, serviços, identidade, imagens, trabalhos e publicações existentes não são regravados pela migration.
- URLs de imagem de serviços antigas continuam funcionando até a pessoa trocar/remover a imagem no novo formulário.
- Foto única é uma galeria existente com uma imagem; antes/depois mantém duas imagens identificadas. O limite existente de quatro fotos por trabalho é preservado.
- A publicação usa a mesma página e a mesma tabela de snapshots. Publicações antigas continuam vinculadas ao manual original; novas publicações de conteúdo público dispensam aprovar um manual de atendimento.
- Salvar/ocultar/excluir um trabalho altera o rascunho. O visitante só recebe essa mudança na próxima publicação explícita. Imagens de snapshots publicados não são apagadas.
- O manual e a autorização do atendimento humano seguem seus fluxos próprios. Publicar a página não os aprova nem altera a autonomia.

## Reversão

Não remover a 031 depois que novos vínculos de imagem ou publicações sem manual tiverem sido criados. Uma reversão do frontend exige avaliar esses dados; uma reversão completa deve usar o backup consistente e o procedimento de restauração já homologado pelo proprietário. Não há script destrutivo de downgrade neste pacote.

Nenhuma destas instruções foi executada em Supabase real. Concorrência PostgreSQL nativa, PostgREST, Storage remoto e demais integrações externas continuam dependentes de homologação do proprietário.
