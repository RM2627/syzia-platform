# Atualização da instalação que já está na 026

Esta atualização é incremental. Não executar reset. Não reaplicar 001–026. Os arquivos dessas 26 migrations são byte-identical à entrega completa anterior; a comparação está em `historical-migrations-sha256.json` e no relatório de consolidação.

1. Pare os processos locais da versão anterior. Preserve sua pasta anterior e suas configurações `.env` e `.env.server` preenchidas. Elas não foram fornecidas ao Work e não estão no ZIP.
2. Extraia o ZIP completo em uma nova pasta. Copie manualmente suas configurações locais existentes para essa nova instalação. Não substitua suas credenciais pelos exemplos.
3. Faça o backup/snapshot do ambiente de homologação pelo procedimento que você já utiliza. Este trabalho não executou backup remoto.
4. No projeto de homologação que já tem a 026, execute **somente** `supabase/migrations/202609200027_organization_activation.sql`. O arquivo possui `begin/commit`. Não executar os fixtures, seed da demo ou arquivos `tests/auth-fixture.sql` no Supabase. Registre a 027 no mecanismo de migrations que você já utiliza; não misture reaplicação manual e automática do mesmo SQL.
5. Execute `npm ci` com Node compatível com o projeto (validação local: Node 24). O lockfile inclui Nodemailer 10.0.10, utilizado exclusivamente no servidor.
6. Execute `npm run build`. Opcionalmente execute `npm run test:activation` e `npm run test:access` localmente; esses comandos usam banco descartável e adapters, não seu Supabase.
7. Por padrão, deixe `ACCESS_MAIL_ENABLED=false`. O acesso será criado e as instruções poderão ser copiadas, com aviso explícito de envio não configurado. Para habilitar envio real posteriormente, siga `smtp.md`; a configuração é sua responsabilidade e requer provedor existente/escolhido por você.
8. Inicie a Platform API (`npm run platform:dev`), o gateway de mídia já utilizado e o frontend (`npm run dev`, ou o procedimento local anterior). Preserve `VITE_PLATFORM_API_URL`, a origem da aplicação, URL/chave pública Supabase e os endereços de mídia da sua instalação. Nenhuma chave privilegiada deve ter prefixo `VITE_`.
9. Entre como Super Admin pelo acesso da operação VIRELOQ. Não refaça o bootstrap se o acesso já está funcionando. Teste a listagem de empresas, criação sem administrador, abertura, definição posterior e criação com administrador.
10. Confirme código da empresa, username, código temporário e validade. Abra `/entrar` em uma sessão separada, informe código da empresa + usuário + código temporário, defina a senha, aceite os documentos pendentes e acesse a empresa. Saia e entre com a senha escolhida; o código antigo deve falhar.
11. Teste envio/reenvio conforme `external-homologation.md`. Reenvio gera um novo código e invalida o anterior; respeite o intervalo mínimo de 60 segundos e cinco tentativas por hora por acesso. Uma falha de e-mail não apaga o acesso.
12. Teste Auditoria global com Super Admin; repita a URL/RPC com administrador empresarial, colaborador e atendente — nenhum deve obter Auditoria global. O histórico da própria empresa continua separado e sujeito à RLS.
13. Em empresas fictícias, teste Desativar/Reativar. Sessões empresariais anteriores à suspensão não voltam a valer após reativação: faça novo login. Identidades, trial e histórico permanecem.
14. Exclua apenas uma empresa fictícia vazia criada para esse teste: é necessário digitar seu nome exato. Se houver acesso reservado/provisionado, trial, assinatura, aceite ou outro histórico, a aplicação deve recusar e orientar desativação. Não remover registros diretamente para contornar a proteção.

## Por que existe a 027

Persistência da criação idempotente sem administrador, rastreio das tentativas de entrega, RPC global de auditoria, proteção de exclusão e revogação de sessões empresariais na suspensão exigem alterações no banco. As tabelas novas ficam no schema privado, com RLS/FORCE RLS e sem acesso direto por navegador.

A FK de `audit_logs.organization_id` passa a referenciar um registro privado permanente de identificadores de organizações, preenchido com todas as organizações existentes. Assim, uma empresa vazia pode ser excluída sem apagar ou alterar uma única linha de auditoria. O histórico continua append-only e a integridade referencial permanece obrigatória.

Não há alteração no provider de billing, concessão automática de trial, documentos jurídicos, marca, catálogo, página pública ou dados existentes. Os documentos jurídicos mantêm o estágio de revisão que já possuíam na 026.
