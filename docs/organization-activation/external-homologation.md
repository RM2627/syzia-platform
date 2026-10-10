# Homologação externa — correção de ativação empresarial (027)

**PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Não executada pelo Work. O acesso de Super Admin na 026 foi homologado anteriormente pelo proprietário, conforme seu relato. Não presumir que isso homologa a 027 ou SMTP.

Use somente empresas e identidades fictícias em ambiente dedicado. Não é necessário publicar a aplicação. Se o destinatário abrir no celular, o endereço configurado deve ser acessível a esse aparelho por um ambiente de teste autorizado pelo proprietário; `127.0.0.1` no celular aponta para o próprio celular. Não configurar domínio/produção para contornar isso.

## Preparação

- Seguir `upgrade.md`, aplicando somente 027 após backup conforme o procedimento do proprietário.
- Manter Auth/Platform API e configurações do modelo 026. Não reativar convites/magic links.
- Manter a service role exclusivamente no servidor. Confirmar que o navegador usa apenas a chave pública e tokens próprios.
- Usar o hook de criação de usuários e as proteções de Auth descritas no guia 026; não reduzir RLS, e-mail de administrador, limites ou constraints.
- Se habilitar SMTP, configurar `smtp.md` manualmente com provedor autorizado. Nenhum serviço é contratado por este projeto.

## Matriz de validação real

| Cenário | Resultado esperado |
|---|---|
| Super Admin cria sem ADM | Organização + código empresarial; zero Auth/profile/membership novos; status aguardando administrador. |
| Nome, slug sugerido e slug editado | Sugestão normalizada; edição manual preservada; conflito recusado sem organização duplicada. |
| Abrir empresa sem ADM | Gestão global existente disponível sem membership artificial. |
| Definir ADM depois / criar com ADM | Mesmo fluxo de reserva, Auth, profile, membership e código temporário. |
| Consulta/criação Auth indisponível | Organização/reserva preservadas, etapa segura no erro e Continuar configuração. Não criar usuário manualmente no Supabase. |
| Finalização sem resposta | Verificar o estado antes de retomar; se já preparado, usar instruções novas; mesmos IDs. |
| Primeiro acesso em `/entrar` | Código válido abre criação de senha; nenhum Auth/profile/membership extra. |
| Código errado, expirado, consumido | Nenhuma sessão nem etapa autorizada; respeitar cinco tentativas configuradas. |
| Confirmação divergente | Não consumir a prova nem alterar senha. |
| Ativação concluída | Nova senha funciona; código anterior não funciona; aceite institucional aparece quando pendente. |
| Ativação por A usando código de B | Negada, sem divulgar existência de usuário de B. |
| SMTP configurado | Mensagem chega ao contato cadastrado, com dados da empresa e `/entrar`; sem link autenticador. |
| SMTP desligado/falha/limite | Acesso e membership permanecem; código pode ser copiado; falha atual claramente exibida. |
| Reenviar instruções | Nova geração; anterior inválida; mesmo usuário; intervalo e limite respeitados. |
| Duas tentativas simultâneas | Uma reserva por chave/username; um reenvio aceito no intervalo; sem duas gerações utilizáveis. |
| Revogação do operador/empresa | Novas operações negadas com JWT previamente existente. |
| Auditoria global | Super Admin ativo acessa; admin_empresa, colaborador e atendentes não acessam menu, URL ou `foundation_global_audit`. |
| Histórico empresarial direto | RLS permite apenas escopo autorizado; nunca registros globais ou de outra organização. |
| Desativar/Reativar | Operações bloqueadas; sessão anterior fica revogada; identidade e trial preservados. |
| Exclusão vazia | Nome exato obrigatório; organização removida; auditoria original e evento de exclusão preservados. |
| Exclusão com acesso reservado ou histórico | Recusada; usar Desativar. Não apagar Auth/profile para tornar uma empresa elegível. |
| Trial após tentativa de exclusão | Fingerprints, grants, consumed keys e evidências permanecem. Não concede novo trial. |
| Demais módulos | Repetir jornadas de página pública, solicitação, orçamento, agenda, Central, Comercial, métricas e mídia dos guias anteriores. |

Para observar o inventário sem expor segredos, utilize `scripts/homologation/organization-activation-inspect.sql`. Não listar `code_hash`, tokens, códigos temporários, senhas ou credenciais em logs/relatórios.

## Concorrência local nativa preparada

`npm run test:activation:native` cria um PostgreSQL local descartável e usa conexões independentes. Cobre criação idempotente, exclusão versus reserva e reenvio concorrente. `npm run test:access:native` mantém os cinco casos anteriores de reserva/ativação. Nesta execução, ambos dependeram de capacidade do ambiente de mapear um usuário não root; o runner retornou código 2 antes de iniciar o banco. Executar em Linux com usuário comum e depois repetir os cenários com Auth/PostgREST reais. PGlite e adapters não equivalem a essa validação.

## Registro do proprietário

Registrar data, versão/ZIP, migration aplicada, resultado de cada linha, requests IDs seguros e correções necessárias. Não registrar conteúdos de mensagens com códigos reais. Parar diante de erro de autorização; nunca conceder grants amplos para fazer o fluxo funcionar.
