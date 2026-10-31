# SYZIA 066 — relatório de entrega

31/10/2026. Base: `0d8503b82ae422b1f23d288c5c540592b617ff84` (SYZIA 065). A `main` foi conferida pelo conector GitHub; todos os 1.290 arquivos foram comparados com seus blobs oficiais antes das alterações. Desenvolvimento em cópia isolada, sem commit, push, merge ou deploy.

## Implementado

- Landing page independente React/TypeScript/Vite, identidade oficial, programa de cinco módulos, FAQ, cadastro nativo, documentos próprios e CTA opcional para conhecer a SYZIA.
- Esquema privado Academy, RLS/FORCE RLS, RPC administrativa limitada ao Super Admin ativo e RPC de serviço exclusivamente server-side. Sem contas Auth, organização, trial, cartão ou assinatura SaaS para estudantes.
- Inscrição validada, duplicidade por e-mail normalizado, resposta não enumerável, origem/UTMs permitidas, consentimento específico, desafio assinado, honeypot e limites persistentes.
- Confirmação e acesso por tokens aleatórios de uso único e expiração; sessão própria em cookie protegido, cancelamento de avisos e exclusão de inscrição/progresso.
- Gestão integrada: Visão geral, Lista de espera, Cursos, Aulas e vídeos, Materiais, Comunicações, Resultados e Configurações. Filtros, exportação CSV e indicadores agregados.
- Cursos/módulos/aulas editáveis, ordenação, duplicação, arquivamento, revisão otimista, rascunho e snapshots imutáveis. Publicação integral exige conteúdo completo; publicar/despublicar uma aula preserva os outros rascunhos.
- YouTube externo por URL validada e carregamento voluntário. Upload de vídeo expressamente indisponível. Materiais PDF/TXT/CSV e capas reencodificadas, bucket privado e downloads autorizados.
- Transporte SMTP existente reutilizado, outbox cifrada, limites e resultados individuais. Prévia de lançamento, autorização explícita de até 25 destinatários e idempotência por inscrito. Não há disparos no deploy. Resultados incertos não geram reenvio automático.
- Modo inicial Lista de espera, com aulas fechadas. Inscrições também ficam desabilitadas até configuração e revisão administrativa. O modo Curso disponível exige publicação válida e confirmação no painel.

## Testes efetivamente executados

| Verificação | Resultado / limite |
|---|---|
| `npm run test:academy` | **15/15 PASS**, zero falhas ou ignorados. Somente casos Academy. |
| JSON/campos, spam, duplicidades, confirmação, expiração | PASS em controlador real e SQL local. |
| Permissões, RLS/FORCE RLS, funções privadas, identidades empresariais | PASS; aluno e usuário empresarial não obtêm administração. |
| CRUD, snapshots, concorrência de revisão, publicação/despublicação | PASS; rascunhos não aparecem na leitura do aluno. |
| Materiais/imagens, PDF com ação ativa, executáveis, CSV perigoso | PASS; armazenamento substituído por adaptador local. |
| Lançamento, duas confirmações concorrentes, quota, falha e incerteza SMTP | PASS; sem duplicação. Aceitação SMTP não é tratada como leitura. |
| Progresso, isolamento de sessão, cancelamento/exclusão, retenção | PASS; organizações operacionais preservadas. |
| HTTP, CORS, corpo limitado, cookie Secure/HttpOnly, logs sem e-mail/token | PASS em listener local. |
| Navegador: inscrição → confirmação → painel; aulas fechadas | PASS usando interface real, SQL local e envio simulado. |
| Navegador: salvar rascunho e tentar publicar curso incompleto | PASS: revisão incrementa; publicação incompleta é recusada. |
| Navegador: público/admin, 360/390/1440 px e teclado | PASS: seis combinações sem overflow horizontal, foco por Tab. Frames locais equivalentes aos tamanhos de viewport; scrollbar ocupa 15 px quando presente. |
| `npm run build` | PASS, incluindo TypeScript. Avisos existentes de chunks grandes/directivas do Vite não impediram o build. |
| `npm run academy:build` | PASS; build público separado, sem configuração privilegiada. |
| Aplicabilidade e equivalência do patch | Verificação isolada registrada no inventário. |
| Gate geral, suítes históricas/financeiras | **NÃO EXECUTADOS**, conforme escopo. |
| Windows nativo, Supabase Auth/PostgREST/Storage reais, SMTP real, YouTube real, Cloudflare | **NÃO EXECUTADOS**. Dependem de homologação externa autorizada. |

A fixture usa o esquema integrado anterior como preparação, sem executar a bateria histórica. O PGlite serializa conexões locais; `Promise.all` verificou idempotência do controlador, mas não comprova concorrência entre processos PostgreSQL remotos independentes. Não foram usados dados reais ou credenciais reais. O runner `test:academy:browser` foi entregue para reprodução local; nesta execução a navegação foi realizada pelo navegador gerenciado, e não por esse runner.

Durante os testes foram corrigidos conflitos de aliases SQL, o relógio fixo da fixture de navegador e a herança de navegação vertical do CSS global no painel. O resultado final SQL é PASS. O feedback de inscrição fica junto ao formulário; o botão aguarda o intervalo mínimo do desafio antispam. O relatório de navegador registra os fluxos observados; o último ajuste de posição do feedback/capa e a configuração de origem do build foram verificados por TypeScript/build, sem repetir toda a navegação.

## Alterações de integração

Somente quatro arquivos históricos mudaram: `src/FoundationApp.tsx` (rota/menu administrativo), `server/unified.mjs` (módulo isolado), `package.json` (comandos) e `.gitignore` (exceção para o exemplo público, mantendo arquivos preenchidos protegidos). Os demais arquivos são novos e estão discriminados em `INVENTARIO.json`.

Migration nova: `202610310066_academy.sql`. Todas as migrations anteriores e os módulos protegidos permanecem byte a byte iguais à base oficial. A migration foi aplicada apenas em banco descartável local.

## Pendências e limitações reais

1. Aplicação da 066 e validação das duas RPCs, sessão reforçada do Super Admin e Storage privado em Supabase de homologação. Nenhuma alteração remota foi executada.
2. Configurar origem/API/HTTPS/DNS e cookies entre os subdomínios planejados. Nenhum domínio foi ativado.
3. Confirmar SMTP adotado, domínio remetente, quotas compartilhadas com o SaaS, capacidade e entregabilidade. Os limites da Academy não descobrem nem substituem os limites da conta do provedor.
4. Rever identificação e documentos da Academy antes da abertura. São campos administrativos e minutas não publicadas automaticamente, não parecer jurídico. Não há CPF, residência ou identidade fictícia nos defaults públicos.
5. Produzir/revisar os vídeos reais, direitos de uso e materiais. Não há aula fictícia publicada. A disponibilidade de vídeos foi validada por formato, não por acesso externo ao YouTube.
6. Escolher e aprovar provedor/orçamento antes de implementar o upload direto de vídeo. A interface o mostra indisponível; não é declarado como implementado.
7. Inspecionar origem de rede no ingresso da hospedagem antes de confiar em proxy. Sem configuração, o rate limit pode agrupar usuários por peer TCP.
8. Aplicar regularmente a limpeza pelo painel. Não há agendador de retenção automático. PDFs passam por validação restritiva, mas não por antivírus remoto.
9. Aviso de lançamento inicial único por inscrito. Não foram implementadas campanhas recorrentes, reenvio automático de resultados incertos, certificados, gamificação ou instrutores múltiplos.
10. A prévia do aluno e os fluxos principais foram preparados; a integração externa e a qualidade dos conteúdos reais ainda precisam de homologação. Não se declara a Academy publicada ou pronta para receber dados reais sem essas verificações.

Entrega: incremental, fontes novos/modificados, migration, exemplos sem segredo, testes, arquitetura, guia, evidências textuais e hashes. Nenhum push, merge, deploy, SQL remoto, anúncio, cobrança ou e-mail real foi realizado.
