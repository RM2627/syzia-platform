# SYZIA 061 — integração, homologação e rollback

## Situação

Nenhuma ação remota autorizada nesta rodada foi executada. O pacote serve à conferência e homologação local. **Não promover enquanto o gate histórico estiver reprovado ou as pendências do relatório não forem aceitas/resolvidas.** Não substituir automaticamente a landing institucional ou a de pré-lançamento.

## Conferência local no PowerShell

Extraia a base em diretório novo. Ela não contém `.git`, node_modules, dist, caches ou segredos. Use Node 24 compatível com o lockfile. Na cópia de trabalho oficial, confirme `git status` limpo e o commit-base; se houver commits posteriores, faça revisão dos diffs, não sobrescreva.

```powershell
git switch -c syzia-061-integrada
# O patch é local; conferir primeiro:
git apply --check ..\SYZIA-061-INCREMENTAL.patch
git apply ..\SYZIA-061-INCREMENTAL.patch
npm ci
npm run build
npm run test:061
npm run test:061:browser
npm run test:current-gate
```

A extração consolidada também pode ser testada diretamente, sem aplicar patch. Use o inventário SHA-256 e a comparação de integridade da 061. Nenhum comando acima faz commit/push/deploy ou aplica SQL remoto. Não copie arquivos privados ou `.env` preenchido para o pacote. A execução Windows permanece pendente; a validação desta entrega ocorreu em Linux.

## Banco — somente aplicação posterior autorizada

Preserve toda a cadeia histórica. Novas migrations, nesta ordem:

1. `202610280061_service_quantities.sql` — B.
2. `202610280062_insights.sql` — A.
3. `202610280063_billing_environments.sql` — C, seleciona `legacy` por padrão.

Não reaplicar migrations anteriores. Cada novo arquivo tem transação e verificações de contrato. Falha de migração exige rollback e diagnóstico, não remoção dos guardas. Foram testados rollback por falha e upgrade sobre dados fictícios existentes. Snapshot/backup, permissões reais, limite de armazenamento e execução em Supabase/Neon continuam responsabilidade da homologação posterior. O ambiente demonstrativo requer revisão/aplicação da evolução de schema antes de disponibilizar a configuração de quantidade no Studio; não compartilhar os bancos.

## Render / frontend / Cloudflare — após nova autorização

Servidor permanece `npm start` conforme scripts existentes, uma porta `PORT`. Variáveis novas: `INSIGHTS_ENABLED=false`, `INSIGHTS_PUBLIC_ORIGIN`, `INSIGHTS_COOKIE_SECRET` (segredo aleatório, ao menos 32 caracteres), `BILLING_ENVIRONMENT=legacy`, `MERCADO_PAGO_PRODUCTION_ACCOUNT_CONFIRMED=false`. Reutiliza `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_APP_ORIGIN`. Somente servidor recebe segredos.

Frontend: `VITE_INSIGHTS_ENABLED`, `VITE_PLATFORM_API_URL`, `VITE_PUBLIC_SITE_URL` e as variáveis públicas de Supabase já existentes. Build de demonstração continua separado. Não prefixar Access Token, cookie secret ou service_role com VITE.

`examples/cloudflare-insights-worker.mjs` é exemplo para encaminhar **somente** `/blog` e descendentes ao Node, com `SYZIA_API_ORIGIN` configurado. Não foi instalado nem publicado. A rota deve conservar POST, cookies, origem e respostas SSR; `/admin/insights` continua na aplicação autenticada. Preparar `X-Robots-Tag: noindex, nofollow` para rotas administrativas. Mesclar no robots.txt da origem institucional a indicação de `/blog/sitemap.xml`; o arquivo `/blog/robots.txt` preparado não substitui sozinho o robots.txt raiz exigido por robôs. Não reescrever regras de outras aplicações ou `conheca`.

Memória e processamento: reutiliza o Node existente; imagens são processadas por Sharp e limitadas. Não houve benchmark de carga/Render real. Iniciar com monitoramento de memória, latência, storage e event loop; não afirmar capacidade de tráfego. Instância suspensa atrasa job e primeira resposta; publicação agendada pontual exige runtime acordado. Health/encerramento seguem servidor unificado, que encerra o job editorial.

## Pós-deploy autorizado

Validar SSR por leitura do HTML; sitemap/404/canonical; editor autorizado versus conta comum; imagem privada versus publicada; upload e redução; publicação agendada; formulário sem envio indiscriminado; quantidade e agenda em dados autorizados; HMAC e callbacks somente segundo o guia financeiro. Preservar MP-01 pendente sem evento externo real comprovado.

## Reversão

Antes de integrar, guardar patch/referência da base e backup autorizado. Sem uso dos novos recursos, reverter o patch em cópia limpa com `git apply --reverse --check` e `git apply --reverse`, reconstruir e validar. **Não reverter código antigo por cima de dados novos em produção.**

Insights: desabilitar flags e retirar rota pública; dados/revisões permanecem. Quantidade: desligar novas habilitações e revisar publicações; pedidos com múltiplas unidades precisam continuar no motor 061. Não descartar colunas ou histórico. Preferir correção incremental.

Financeiro: antes da configuração real, manter `legacy`. Depois de novos contratos de produção, não retornar para runtime legado nem trocar credenciais por teste. Bloquear novas contratações por configuração existente e preparar correção para o mesmo ambiente, preservando reconciliação/cancelamentos. Restauração de banco ou down migration destrutiva não é rollback seguro de cobrança. Qualquer operação remota exige autorização específica e plano de conciliação.
