# SYZIA 055 — auditoria direcionada

Base consultada e clonada: `61fa6d2f745128f7763850e64060fd818c7bf74f`, main, SYZIA 054. Trabalho local em `codex/syzia-055-commercial`; nenhum push. O checkpoint inicial preserva os 1.151 arquivos rastreados. Esta execução tem validações próprias; não reaproveita resultados da execução perdida.

| Elemento | Existe | Reutilizável | Alteração necessária |
|---|---|---|---|
| Configurador | `CompanyModule`, `CompanyPage`, `PublicCompany` | Sim, componentes reais via transporte demonstrativo | Edição dentro da gestão, preservando JWT e sessão administrativa |
| Demonstrações | `Management`, controller/store e migration 054 | Sim | Preparação sem lead/plano, rascunho persistente, revisão e versões imutáveis |
| Convites | Tokens com hash, finalidade, expiração, revogação, lotes confirmados | Sim | Relação N:N, versão fixada, revalidação da sessão no envio |
| Cadastro/ativação | Claims com análise Super Admin e self-service | Sim | Organização técnica pendente, importação somente após confirmação financeira |
| Checkout/trial | Motor billing 047–053, snapshots, HMAC e reconciliação | Integralmente | Nenhuma mudança no motor; consumir somente confirmação local validada |
| Materialização | Allowlist e remapeamento em `commercial_config_apply` | Sim | Versão aprovada, mídia em namespace novo, transação idempotente e recuperação |

## Constatações no código

- `commercial_editor_service` e `commercial_editor_publish` (054) reconstroem claims apenas com `sub`/`is_anonymous`. `private.access_session_valid` (026) exige `session_id` correspondente para usuários sujeitos ao controle reforçado. Isso explica uma condição real de recusa; não prova que todo HTTP 403 tenha a mesma causa.
- `commercial_service/mail_begin` repete a reconstrução incompleta; a autorização do operador deve usar a sessão original no momento de iniciar o envio.
- `commercial_demos.lead_id` e `plan_version_id` são NOT NULL na 054. A criação e a gestão usam joins obrigatórios com o interessado.
- O editor já reaproveita componentes reais; não precisa de outro configurador. A instância Neon recebe apenas identidades demonstrativas e RPCs permitidas. O JWT administrativo não deve ser entregue ao iframe ou a visitantes.
- A 054 aplica a configuração na conclusão do self-service antes de confirmar assinatura; os serviços ficam inativos e as capabilities bloqueadas. A 055 deve adiar a aplicação e fixar snapshot/versão até confirmação do contrato existente.
- A promoção de mídia da 054 conserva o caminho demonstrativo; o destino operacional precisa de namespace próprio, conteúdo verificado e repetição segura.

## Limites de execução

Sem banco operacional, SQL externo, credenciais reais, envios, cobranças, commits, push ou deploy. As migrations históricas permanecem intactas. Testes locais e simulados serão identificados como tais. A homologação real de Mercado Pago (MP-01), Auth, Storage, SMTP e Neon não é inferida de mocks.
