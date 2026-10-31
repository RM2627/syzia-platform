# SYZIA Academy 066 — decisão antes da implementação

Base oficial: `0d8503b82ae422b1f23d288c5c540592b617ff84`, main consultada em 31/10/2026. Os 1.290 blobs foram comparados com a árvore Git. Trabalho em cópia isolada; nenhum push/commit/deploy.

## Persistência

Nesta primeira versão, esquema privado `academy` no Supabase existente, sem tabelas públicas de alunos, vínculos empresariais ou mudanças no Auth SaaS. RLS/FORCE RLS sem políticas de acesso direto. Dois contratos: `academy_admin`, restrito ao Super Admin ativo com sessão válida existente, e `academy_service`, executável somente pelo backend. Nenhuma credencial privilegiada no build público. Um projeto separado oferece isolamento de recursos mais forte, mas exige outro provisionamento e ponte de autorização administrativa; não é necessário para esta lista inicial. O esquema não isola CPU, quotas ou administradores de banco. Reavaliar projeto separado antes de crescimento relevante; os registros não dependem de organizações operacionais.

## Reutilização e fronteiras

Backend único, rota `/academy/`, módulo desativado por padrão. Reuso do transporte SMTP `server/access-mail.mjs` (TLS, timeouts e diagnóstico sanitizado); não há comprovação de provedor ou quotas da conta ativa. Sem novo gateway financeiro. Público React/Vite separado, assets de marca existentes; gestão em `/admin/academy` no workspace oficial. Não há tokens SaaS na aplicação pública.

Alunos: acesso proporcional ao risco por link de e-mail de uso único, token aleatório de 256 bits, hash no banco, expiração e sessão própria em cookie HttpOnly. Confirmar inscrição não cria usuário Auth, empresa ou trial. Cursos gratuitos sem cartão. Tokens ficam no fragmento da URL, removido após leitura; GET não confirma nem cancela inscrição.

## Comunicação

Consentimento somente para o curso; nenhum consentimento comercial inferido. Outbox com conteúdo criptografado, limites persistentes, expiração, resultados e idempotência. Envio de lançamento exige prévia congelada, confirmação e operação administrativa explícita. Deploy e timers não iniciam campanhas. Resultado SMTP é aceitação pelo provedor, não prova de entrega. Resultado incerto não é reenviado automaticamente.

## Publicação e arquivos

Rascunhos e versões publicadas separados; controle de revisão evita sobrescrita concorrente. Aulas inéditas não vazam no catálogo. Modo inicial: lista de espera, sem aulas acessíveis. Lançamento exige curso publicável, documentos/contato definidos e confirmação administrativa. YouTube é externo e só carregado após ação; não listado não equivale a privado. Upload de vídeo bloqueado até decisão de fornecedor/orçamento. Materiais limitados a PDF/TXT/CSV, imagens reencodificadas; bucket privado próprio, download autorizado. Nenhum vídeo no banco.

## Retenção proposta implementada

Inscrições não confirmadas e canceladas: 30 dias sem atividade. Alunos confirmados: 365 dias sem atividade. Sessões: 7 dias. Links de confirmação: 24 horas; login: 15 minutos. Tokens vencidos e payloads de e-mail: até 7 dias após vencimento/finalização. Eventos de auditoria sem conteúdo pessoal: 180 dias. Limpeza explícita pelo painel; deve entrar na rotina operacional. Exclusão pelo titular autenticado ou link de preferências, com confirmação. Sem rastreamento de abertura de e-mail.
