# Integração e rollback — SYZIA Academy 066

Base: `0d8503b82ae422b1f23d288c5c540592b617ff84`. Nenhum comando abaixo foi executado em serviços reais. Não faça push antes de conferir se o repositório dispara deploy automático.

## Aplicação do incremental no Windows

Em uma cópia limpa da base, mantenha as configurações privadas fora do pacote. O ZIP traz um patch e os mesmos arquivos por sobreposição; escolha **um** método.

```powershell
git status --short
git rev-parse HEAD
git switch -c syzia-066-academy
git apply --check "C:\entregas\SYZIA-066.patch"
git apply "C:\entregas\SYZIA-066.patch"
npm ci
npm run test:academy
npm run build
```

Os testes criam apenas um PostgreSQL local em memória, com dados fictícios e transportes simulados. Não definem credenciais reais. A fixture carrega a cadeia de esquema para representar a integração; não executa testes financeiros nem gate histórico.

Prévia pública com API configurada: copie `.env.academy.example` para `.env.academy.local`, defina somente o endereço público da API de homologação e execute `npm run academy:dev`. O backend não é substituído por essa prévia Vite.

Prévia **totalmente isolada**, com dados descartáveis, sem serviços externos:

```powershell
node tests/academy-066/preview.mjs --port 5196
```

Abra `http://127.0.0.1:5196/` e `/admin/academy`. A identidade administrativa é simulada exclusivamente nessa fixture. Nunca publique `tests/academy-066/preview.mjs`, seu endpoint `__fixture` ou o harness. O build da Academy não os inclui.

Em outro terminal, o runner automatizado opcional usa somente essa fixture loopback:

```powershell
npx playwright install chromium
npm run test:academy:browser
```

Esse runner foi entregue para reprodução; nesta execução a navegação foi feita pelo navegador gerenciado, conforme discriminado no relatório.

## Migration e habilitação — execução futura pelo proprietário

1. Revisar e manter backup. Confirmar que a 065 já está aplicada. Não repetir migrations históricas.
2. Revisar `supabase/migrations/202610310066_academy.sql`. É transacional; cria somente o esquema Academy, duas RPCs públicas controladas e um bucket privado próprio quando Storage está disponível. Não altera Auth, organizações, billing ou políticas históricas.
3. Aplicar **somente 066** primeiro em homologação autorizada. Validar que `academy` não está nos esquemas expostos do PostgREST, que o bucket `syzia-academy` é privado e que não há políticas abrangentes de Storage que incluam esse bucket. As RPCs executam por `public`, com EXECUTE restrito.
4. Configurar as variáveis de `server.env.example` como complemento do ambiente atual. Não substituir as variáveis existentes. `ACADEMY_SECRET`: 32 bytes criptográficos aleatórios em hexadecimal, exclusivamente no servidor. Não gravar segredo no Git, Vite ou relatórios. Sua troca invalida desafios e impede ler e-mails ainda cifrados na fila; planejar rotação com fila drenada.
5. `ACADEMY_ENABLED=false` e `ACADEMY_MAIL_ENABLED=false` são o padrão. Habilitar o módulo somente após validar o esquema, origem HTTPS e credenciais existentes. O transporte reaproveita `ACCESS_MAIL_*`/`ACCESS_SMTP_*`; não escolhe nem contrata fornecedor. Nenhum e-mail sai na inicialização.
6. Publicar o SaaS futuramente com `VITE_ACADEMY_ENABLED=true` para disponibilizar `/admin/academy`. Somente o Super Admin ativo, com a sessão vigente, obtém acesso. Não foram criadas permissões empresariais adicionais.
7. Pelo painel, preencher identificação pública e contato, revisar termos/privacidade, e autorizar o modo **Lista de espera**, mantendo as aulas fechadas. Minutas não são documentos definitivos. Não inserir CPF completo, endereço residencial ou dados fictícios. Confirmar fornecedores e requisitos jurídicos antes da publicação.
8. Homologar um e-mail de confirmação com destinatário autorizado e infraestrutura de teste. Verificar domínio remetente, TLS, entregabilidade, cotas e descadastro. Não habilitar envio real apenas porque os mocks passaram.

## Cloudflare Pages — preparo, sem execução

- Projeto público independente, domínio futuro `academy.usesyzia.com.br`; nenhum DNS/certificado foi configurado.
- Comando: `npm ci && npm run academy:build`; diretório de saída: `dist-academy`.
- Definir `VITE_ACADEMY_API_URL` com a origem HTTPS do backend unificado, sem caminho final. A configuração local padrão aponta para loopback e **não serve para produção**.
- O build copia apenas as marcas necessárias e gera `_redirects` (SPA) e `_headers` (CSP, no-referrer, nosniff e política de recursos).
- API: `ACADEMY_PUBLIC_ORIGIN` deve coincidir exatamente com a origem pública. O administrativo continua em `PLATFORM_APP_ORIGIN`; uma origem não autoriza a outra. Não habilitar `*` nem adicionar cookies do SaaS na Academy.
- O cookie do aluno é `__Host-syzia-academy`, Secure, HttpOnly, SameSite=Lax, Path=/ e sem Domain quando `NODE_ENV=production`. A Academy e a API planejadas são HTTPS no mesmo site registrável. Homologações em domínios distintos podem ser bloqueadas por políticas de cookies; use subdomínios de teste no mesmo site. Não enfraqueça o cookie para contornar isso.
- O player externo usa `youtube-nocookie.com` e só carrega após escolha do aluno. Não listado não é DRM; não garante confidencialidade. Validar incorporação e direitos de cada vídeo real antes de publicar.

## Abertura do curso e comunicações

1. Cursos → editar estrutura, capa, descrições, módulos, aulas, links YouTube e materiais.
2. Salvar rascunho, revisar a prévia e liberar cada aula preparada. A publicação integral exige capa, módulos não vazios, vídeos e orientações. Rascunhos não entram no catálogo do aluno.
3. Publicar a versão. No modo Lista de espera, as aulas continuam fechadas.
4. Configurações → Curso disponível → confirmação explícita. A ação é auditada e não envia mensagens.
5. Comunicações → preparar prévia de até 25 confirmados elegíveis → conferir texto e destinatários → confirmar envio. Nenhum destinatário recebe endereços dos demais.
6. Atualizar resultados para consultar fila, aceitação pelo provedor, falhas ou incerteza. O processamento ocorre após a resposta HTTP para não depender do tempo de envio do lote. A confirmação autoriza somente aquele lote; o deploy não dispara campanhas.
7. A fila respeita orçamento persistente e intervalo de 1 segundo entre envios por processador. Orçamento inicial Academy: 80/dia e 2.400/mês, configurável, **não é a quota total da conta SMTP**. Reserve capacidade para os demais módulos. Resultados incertos não são reenviados automaticamente. Falhas definitivas ficam registradas para intervenção, sem botão que possa criar duplicidade silenciosa.
8. Se o processo reiniciar ou a quota acabar, confirmações pendentes podem ser processadas pelo botão próprio; lotes de lançamento pendentes exigem nova ação explícita de processamento. Envios em andamento abandonados tornam-se incertos ao reavaliar a fila, após dois minutos.
9. O aviso de lançamento inicial é único por inscrito. Campanhas de novos cursos/marketing não foram implementadas. Não usar esse fluxo como ferramenta de disparos recorrentes.

## Operação, privacidade e limites

- Aplicar regularmente pelo painel a política de retenção documentada. Não há cron de limpeza habilitado. O titular pode cancelar comunicações ou excluir inscrição/progresso; isso não altera o SaaS. Para voltar a receber avisos, deve refazer a inscrição e confirmar o e-mail.
- Rate limit persistente por origem de rede e por hash do e-mail; honeypot e desafio assinado mínimo de dois segundos. Em proxy, conferir o último `X-Forwarded-For` inserido pelo ingresso antes de habilitar `ACADEMY_TRUST_PROXY`. Sem essa configuração, o limite usa o peer TCP e pode agrupar visitantes da hospedagem. Validar o caminho real e proteção de borda em homologação; não confiar em cabeçalhos controláveis pelo cliente.
- Materiais: até 5 MB; PDF sem ações ativas, TXT/CSV em UTF-8; imagens JPG/PNG/WebP reencodificadas em WebP, até 20 milhões de pixels. Conteúdo autenticado sai como download com nosniff. Isso não substitui antivírus especializado; somente administradores podem enviar material autorizado. Upload de vídeos está indisponível.
- Publicação e mudança de modo não alteram assinatura, trial ou clientes reais. Métricas são eventos agregados, sem pixels de e-mail; não são pessoas únicas nem conversões em assinaturas.
- O backend unificado continua em um processo/porta. Vídeos ficam no YouTube. PDF/imagens são processados em memória de forma limitada; monitorar RAM e tráfego antes de aumentar limites. Free tiers compartilham recursos, não são garantia de capacidade.

## Rollback

Antes de aplicar a migration ou usar o módulo:

```powershell
git apply --reverse --check "C:\entregas\SYZIA-066.patch"
git apply --reverse "C:\entregas\SYZIA-066.patch"
```

Depois de haver dados, primeiro pausar inscrições, retornar ao modo Lista de espera e manter o histórico de envios. Desabilitar `ACADEMY_ENABLED`/`VITE_ACADEMY_ENABLED` na próxima publicação autorizada. Não apagar o esquema, bucket, estudantes ou notices como rollback; preserve dados e execute reversão de código com revisão, sem reaplicar migrations antigas. Exportação CSV contém dados pessoais e exige guarda restrita. Um e-mail já aceito pelo provedor não pode ser desfeito pelo rollback.

## Fontes oficiais conferidas em 31/10/2026

- Supabase: https://supabase.com/docs/guides/platform/billing-on-supabase — Free: banco 500 MB/projeto e Storage 1 GB; não há isolamento de quotas entre schemas.
- Supabase: https://supabase.com/pricing — conferir limites atuais, inatividade e condições do projeto antes da implantação.
- Cloudflare: https://developers.cloudflare.com/pages/platform/limits/ — Free: 500 builds/mês; assets de até 25 MiB. Vídeos grandes não entram no build.
- Resend, **somente se for o SMTP efetivamente escolhido**: https://resend.com/docs/knowledge-base/account-quotas-and-limits — Free: 100 e-mails/dia e 3.000/mês. Limites reais dependem da conta/provedor; não foram consultados ou alterados.
- YouTube: https://developers.google.com/youtube/player_parameters — incorporação por identificador do vídeo, dimensões e parâmetros do player.
