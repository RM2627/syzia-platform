# SYZIA 038 — atualização da 037 sem reset

Esta entrega usa exclusivamente o consolidado 037. A 038 exige uma migration incremental: `supabase/migrations/202609250038_multiservice_requests.sql`. As 34 migrations anteriores (001–033 e 036) permanecem intactas. As rodadas 034, 035 e 037 não acrescentaram SQL.

## Preparação

1. Preserve a pasta 037, os arquivos de configuração e um backup do banco antes da homologação. Utilize dados fictícios no ambiente destinado aos testes.
2. Extraia o ZIP em uma pasta nova e abra `foundation`. Não sobrescreva uma pasta antiga enquanto seus processos estiverem rodando.
3. Copie suas configurações locais (`.env.local`/`.env.server`) sem transportar segredos para arquivos `VITE_*`. O pacote contém apenas exemplos.
4. Execute `npm ci` e `npm run build`. No PowerShell, `npm.cmd` pode ser necessário.

## Banco e aplicação

Em uma instalação que já está na 037, aplique **somente** `202609250038_multiservice_requests.sql`, uma vez, pelo mecanismo de migrations já utilizado no seu ambiente. O arquivo é transacional; qualquer erro deve provocar rollback. Não executar reset, não apagar tabelas e não reaplicar migrations antigas. Se sua base ainda não inclui a 036, atualize primeiro seguindo o guia correspondente.

A migration acrescenta seleção original/alertas à solicitação existente, explicação à proposta e a configuração de relações entre serviços. Não apaga nem converte pedidos antigos. Os campos singulares permanecem para compatibilidade. O orçamento continua usando `quote_versions`/`quote_items`; o acesso continua usando os tokens/sessões existentes.

Depois da migration, confirme que o PostgREST atualizou o cache de schema das novas RPCs. Caso seu ambiente exija recarga explícita, use o procedimento habitual; a instrução SQL é `NOTIFY pgrst, 'reload schema';`. Não altere grants para contornar erro de função não encontrada.

Encerre os processos da pasta anterior. Inicie frontend, Platform API e gateway de mídia a partir da pasta 038, cada um no seu terminal (`npm run dev`, `npm run platform:dev`, `npm run attachments:dev`, conforme sua instalação). Recarregue o navegador. Aplique o banco antes de disponibilizar o frontend 038: ele chama a RPC multisserviço nova. Não deixe duas versões de frontend disputando as mesmas portas.

Se sua empresa usa atendimento humano com manual/autonomia publicados, mantenha a revisão do manual e a ativação em dia após alterações operacionais, como já é exigido pelo produto.

As páginas já publicadas continuam válidas, sem relações configuradas. Cadastre relações em **Configurações → Serviços → Relações com outros serviços** e depois revise/publique em **Página da empresa**. Salvar uma relação não muda silenciosamente o snapshot público nem pedidos anteriores. Desativar um serviço impede novas operações que o utilizem, mas preserva o histórico.

Não remova a migration para reverter a interface. Se precisar interromper a homologação, preserve a base e investigue com backup disponível: versões antigas não apresentam todos os detalhes de pedidos multisserviço. Não apagar as novas colunas ou os registros para “voltar”.

## Conferência pelo proprietário

- Em **Página da empresa**, confira “Revise a prévia para publicar”, “✓ Prévia revisada” e a invalidação após editar. Portfólio vazio continua opcional.
- Configure tema escuro/claro e cores claras/escuras/saturadas. Na prévia e página publicada, abra um pedido e percorra Serviços, Detalhes, Seus dados e Revisão, em desktop e celular.
- Adicione/remova serviços e confira o indicador do pedido. Preencha perguntas e adicionais diferentes para cada serviço. Envie uma única solicitação.
- Confira valores fixos, a partir de e sob consulta. Valores desconhecidos não podem aparecer como zero; a combinação mista não apresenta total final.
- Configure A inclui B, incompatível e requer revisão. Confira direção, mensagens e seleção preservada. Ao mudar uma relação existente, remova-a explicitamente e adicione a nova definição.
- Na solicitação recebida, confira o pedido original e os alertas. Prepare a proposta no editor de orçamentos existente: mantenha/remova itens, informe valores e explique ao cliente. Na Central, o atendente continua limitado à autonomia publicada; remoção de linhas exige também “Alterar itens do orçamento”. Serviços sob consulta/a partir de exigem decisão empresarial.
- Pelo acompanhamento existente, confira a proposta discriminada e a explicação. Teste recusar, receber nova versão e aprovar. O original continua visível. Aprovação não registra pagamento.
- Confira o link seguro, sua revogação/expiração, a conversa e a agenda existente. Pedidos antigos de serviço único continuam abrindo normalmente.
- Teste o olho no login, nova senha, confirmação e self-service. A recuperação administrativa usa o mesmo fluxo de nova senha. Código temporário não é senha.
- Com usuários de empresas A/B, confira que catálogo, relações, solicitações e tickets permanecem isolados. Atendimento não concede gestão do catálogo.

Limites atuais: até 10 serviços e 30 linhas incluindo adicionais; no máximo 10 adicionais por serviço, conforme a validação existente. Não há combos, descontos automáticos, nova conta obrigatória ou nova Central do consumidor.

## Reprodução local

```text
npm run test:038
npm run test:038:browser
npm run build
```

O teste de navegador inicia a demo local descartável, com dados fictícios e SQL real em PGlite. Deixe 5173/54321 livres. Utilize o Chromium do Playwright; `FOUNDATION_CHROMIUM_PATH` permite indicar um executável instalado. O teste SQL inclui upgrade da 037 populada. Auth/provider/Storage da demo não são os serviços reais.

Homologação externa de Supabase/Auth/PostgREST/Storage/SMTP e concorrência PostgreSQL nativa permanecem separadas. Não foram executadas nesta rodada. Este guia prepara a conferência, sem iniciar automaticamente a homologação completa de atendimento, deploy ou produção.
