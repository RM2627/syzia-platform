# SYZIA 048 — hospedagem com uma porta

Este guia prepara uma configuração futura. Nenhum serviço, DNS, deploy ou credencial real foi configurado na 048.

## Entrada e contratos

`npm start` executa `node server/unified.mjs`. Há um processo Node e um único `http.Server` ouvindo `0.0.0.0:PORT` (padrão 10000). Os handlers extraídos dos três módulos recebem diretamente `req`/`res`. Não há proxy interno, subprocessos de módulos nem duplicação da implementação. Threads nativas do Sharp/Node não são servidores separados.

| Caminho | Handler e contrato preservado |
|---|---|
| `POST /access/*` | Plataforma; mesmas operações permitidas, JWT quando requerido e RPCs de autorização; JSON até 4 KiB |
| `/invitations/send` | Compatibilidade do handler antigo quando usado com `deliver`; o runtime empresarial continua usando `access`, como na 047 |
| `POST/GET /attachments/f_*` | Anexos privados; JWT verificado, sessão e ticket de download |
| `POST/GET /company-media/m_*` | Mídia da empresa; JWT, sessão, autorização por organização |
| `GET /media/m_*` | Somente mídia pública autorizada pela RPC existente; permite imagem sem header Origin |
| `POST /billing/config`, `/billing/command`, `/billing/status` | Contratos 047; Origin exato e autenticação quando prevista pelo handler; JSON até 16 KiB |
| `POST /billing/notifications` | Exceção server-to-server ao Origin; mecanismo/verificação do recurso oficial da 047, sem confiar no payload |
| `GET/HEAD /health` | Sem credenciais/Origin: estado do listener e módulos carregados; não atesta conectividade do Supabase ou Mercado Pago |

Uploads continuam limitados a 5 MiB, JPEG/PNG/WebP, imagem única, até 20 milhões de pixels e dimensão máxima de 8000. O sanitizador real remove metadados e reencoda; o armazenamento continua no Supabase Storage. O gateway carrega imagem em memória; não cria um disco local de anexos. Os códigos e corpos de erro de cada módulo foram mantidos, incluindo os erros de acesso da Plataforma retornados como HTTP 400 pelo contrato histórico. Erros inesperados do roteador retornam somente código seguro e referência.

## Configuração futura de uma instância Render

Diretório raiz do serviço: `foundation`, se o repositório mantiver a pasta contêiner do ZIP; caso o conteúdo esteja na raiz do repositório, usar a raiz.

- Runtime: Node 24 (validação local em 24.19.0).
- Instalação do backend: `npm ci --omit=dev`. Não usar `--omit=optional`: Sharp depende de binários opcionais de plataforma. Chromium/Postgres opcionais do gate podem ocupar disco, mas não são carregados pelo servidor de produção.
- Start Command no Render: `node server/unified.mjs`, diretamente, para manter um único processo Node da aplicação e entregar SIGTERM sem um wrapper npm. O script de produção `npm start` também está disponível e executa a mesma entrada. Não iniciar os três comandos `*:dev` na hospedagem.
- Health Check Path: `/health`.
- `NODE_ENV=production`; `PORT` fornecido pela hospedagem; `HOST=0.0.0.0`.
- `PLATFORM_APP_ORIGIN=https://app.usesyzia.com.br`; `CONSUMER_ORIGIN=https://app.usesyzia.com.br`.
- Variáveis Supabase exclusivamente server-side conforme `.env.server.example`. O processo não lê `.env.server` em produção; usa o ambiente da hospedagem.
- `MERCADO_PAGO_ENABLED=false` até a homologação externa autorizada. MP-01 continua aberta.
- Não executar migrations como efeito colateral do startup. Aplicação de SQL é procedimento separado do proprietário.

O frontend é um build estático separado: `npm ci --include=dev`, `npm run build`, saída `dist`. Isso não cria outro backend Node da aplicação. Para o frontend planejado em `app.usesyzia.com.br`, configurar os três valores públicos abaixo com o mesmo endereço:

```dotenv
VITE_PLATFORM_API_URL=https://api.usesyzia.com.br
VITE_ATTACHMENT_GATEWAY_URL=https://api.usesyzia.com.br
VITE_BILLING_API_URL=https://api.usesyzia.com.br
VITE_PUBLIC_SITE_URL=https://usesyzia.com.br
```

`usesyzia.com.br` representa a presença institucional planejada. O backend não passa a aceitar automaticamente esse Origin: formulários autenticados/acesso permanecem no domínio da aplicação. Não foram criadas rotas, redirecionamentos, configuração DNS nem nova separação do frontend nesta rodada.

CORS preserva a comparação exata por módulo; não há wildcard/reflexão automática de Origin. O ambiente de produção rejeita origens HTTP, com credenciais, caminho, query ou fragmento. CORS não substitui JWT, sessão, grants ou RLS. Não configurar credenciais privilegiadas em nenhuma variável `VITE_*`.

## Reconciliação e encerramento

Com Mercado Pago habilitado futuramente, o servidor agenda o mesmo `billing.reconcile()` da 047 no próprio processo. `BILLING_RECONCILE_INTERVAL_SECONDS=300` é o intervalo após terminar a rodada anterior; permitido de 60 a 86400. Não há sobreposição de rodadas no mesmo processo. O algoritmo existente consulta até 1000 vínculos por rodada, usa leases/idempotência do banco e não cria cobrança paralela. O comando `billing:reconcile` continua disponível para diagnóstico autorizado, mas não é necessário manter outro processo residente para o agendamento normal.

`SIGTERM`/`SIGINT` impedem novas requisições e novos agendamentos, fecham conexões ociosas e aguardam requisições/reconciliação em curso. Prazo local de drenagem: 25 segundos; se excedido, fecha conexões e a entrada de produção termina com código não zero. Operações incertas continuam sujeitas à reconciliação e aos leases da 047. O shutdown padrão de Render documentado é 30 segundos.

Limites HTTP do listener: headers em 15 s, recebimento da requisição em 60 s, socket inativo em 90 s e keep-alive em 5 s. O timeout de 10 s das chamadas ao Mercado Pago permanece no adaptador 047. Supabase e SMTP continuam com seus contratos; o encerramento tem teto mesmo se um serviço externo não concluir.

Logs são eventos/códigos/referências seguros. Não incluir URL completa/query, cabeçalhos, body, JWT, senha, Access Token ou card token. O health check não retorna ambiente ou segredos.

## Memória, CPU e limitações

Ponto inicial sugerido para homologação de carga: **1 vCPU e 1 GiB de RAM**, com instância que permaneça ativa. É uma estimativa de capacidade inicial, não um mínimo certificado nem uma promessa de throughput. Não foi feito benchmark no Render.

Uma imagem de 20 milhões de pixels pode exigir cerca de 80 MB apenas para um buffer RGBA decodificado, além de entrada, saída, buffers de processamento, cache nativo, Node e clientes HTTP. Uploads simultâneos multiplicam esse uso. A instância de 512 MB precisa de medição específica e não está homologada para picos de upload. A configuração não impõe uma nova quota comercial nem altera os limites de imagem existentes. Medir RSS, CPU, latência, concorrência de upload e tempo de reconciliação antes de escolher a instância final.

Um processo significa que pressão de CPU/memória afeta todos os módulos. Rate limits em memória são locais e reiniciam com o processo; idempotência financeira e autorização permanecem no banco. O código conserva `socket.remoteAddress` e não confia cegamente em `X-Forwarded-For`: atrás do balanceador, a limitação por IP pode agrupar clientes. Homologar esse comportamento com o proxy real antes de produção; a 048 não inventa uma política de confiança em cabeçalhos. Futuro scale-out exige revisão dos limitadores e operação da reconciliação, embora os leases financeiros já sejam persistentes.

Não depender do filesystem efêmero para dados. Supabase/Auth/Storage continuam externos. Uma instância que hiberna interrompe a reconciliação periódica; na retomada, a próxima rodada consulta o estado corrente. O plano gratuito Render hiberna após inatividade e não é indicado pela própria documentação para produção.

## Desenvolvimento local preservado

Copiar `.env.server.example` para `.env.server`, com dados do ambiente de teste do proprietário, e executar `npm run api:dev`; configurar os três endpoints públicos do frontend para `http://127.0.0.1:10000`. `npm run dev` inicia o frontend. Alternativa histórica: `attachments:dev` (8787), `platform:dev` (8788), `billing:dev` (8789), com os três endpoints correspondentes. Não executar modos simultâneos apontando para portas conflitantes.

A demo/gate usa PGlite, Auth fictício e Vite local; ela não é a entrada de produção nem deve ser hospedada.

## Fontes oficiais consultadas em 09/10/2026

- [Render: Web Services](https://render.com/docs/web-services): PORT, bind e TLS no balanceador.
- [Render: Deploys](https://render.com/docs/deploys): SIGTERM e prazo de encerramento.
- [Render: Free](https://render.com/docs/free): hibernação e filesystem efêmero.
- [Render: Health Checks](https://render.com/docs/health-checks).
- [Node 24: HTTP](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html): timeouts e fechamento de conexões.
