# SYZIA 049 — Segurança do cadastro

## Diagnóstico

Incompatibilidade confirmada no código da 048: o endpoint de cadastro individual chamava `signUp()` enquanto `access_before_user_created` aceitava apenas consumidor anônimo ou usuário empresarial previamente reservado. Ativar o hook antigo bloquearia o cadastro individual legítimo. Não alteramos o painel do Supabase.

## Correção mínima

Após rate limit, validação de email/senha/nome/usuário e verificação de identidade existente, o servidor gera nonce aleatório de 32 bytes. A RPC restrita a service role guarda apenas hashes de email/nonce, username e validade de cinco minutos. A chamada oficial `signUp` leva o nonce transitório em metadata. O hook confere email, username, hash e prazo, consumindo a autorização atomicamente. O servidor remove a autorização no `finally`, mesmo na falha; expirações são limpas nas emissões seguintes.

Metadata criada pelo cliente, por si só, nunca autoriza cadastro. O consumidor anônimo continua permitido e o provisionamento empresarial reservado com metadata privilegiada continua intacto. A RPC de emissão não é executável por anon/authenticated; o hook só é concedido ao papel do Auth, além do proprietário da função. Nenhum bypass público ou role fornecida pelo usuário foi criado.

Não houve alteração de confirmação de email, CAPTCHA, senha, limites, autenticação ou grants. Nonce já consumido eventualmente retido pelo Auth em user metadata não é reutilizável; nenhum segredo durável é colocado no cliente. Access Token, card token e CVV não são registrados.

## Testes

S01–S06: acesso direto privado negado, nonce ausente/falso/reutilizado/expirado, email/username divergentes, anonimato, emissão server-side, liberação na falha e confirmação de email preservada. Gate mantém os testes anteriores de acesso/provisionamento. A execução real do hook pelo GoTrue hospedado, SMTP e entrega de email não foram homologadas nesta rodada.

## Ativação segura — AÇÃO DO PROPRIETÁRIO

1. Instalar a migration 049 e o servidor atualizado primeiro em ambiente separado. Não habilitar o hook antigo antes de atualizar o endpoint.
2. Em Authentication → Hooks, selecionar a função Postgres `public.access_before_user_created` para Before User Created. Conferir concessão a `supabase_auth_admin`. Não conceder execução pública para contornar erro.
3. Testar consumidor anônimo, cadastro individual válido com confirmação de email, tentativa direta sem autorização, funcionário provisionado e login de conta existente. Não usar dados reais.
4. Resolver entrega de email com a configuração disponível no Supabase e seus limites antes de abrir cadastro comercial. SMTP pago não é requisito desta entrega; capacidade/entrega continuam pendentes de verificação.
5. Só após esses ensaios o proprietário decide ativar no projeto de lançamento. Em falha, manter cadastro indisponível para novas inscrições até diagnóstico; não publicar nonce fixo, conceder permissão ampla ou desativar validações como correção.

Contrato oficial consultado: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook .
