# Atualização da instalação existente (001–025 já aplicadas)

**Guia para execução posterior pelo proprietário. Nenhuma etapa externa foi executada pelo agente.** O vídeo continua cancelado. Esta revisão altera o acesso e invalida autorizações empresariais antigas até a adesão ao novo login; programe uma janela de homologação e mantenha backup da instalação anterior.

## 1. Arquivos e migration

1. Preserve o código anterior e o backup do projeto dedicado seguindo a estratégia já entregue. Não use dados reais.
2. Extraia o ZIP completo numa pasta nova. Copie manualmente seus `.env` e `.env.server` existentes; não foram fornecidos, recriados nem preenchidos nesta entrega. Não copie `node_modules`/`dist` antigos.
3. Execute `npm ci` e `node scripts/verify-historical-migrations.mjs`. O verificador cobre **001–025** contra hashes da entrega completa anterior.
4. Com 001–025 já aplicadas, execute **somente `supabase/migrations/202609190026_enterprise_access.sql`**, integralmente. É uma transação incremental; não use reset nem reaplique 001–025. Não execute 026 novamente após sucesso.
5. Se o histórico CLI estiver consistente, o proprietário pode inspecionar `supabase migration list` e `supabase db push --dry-run`; prossiga somente se listar apenas 026. Se as anteriores foram pelo SQL Editor sem histórico CLI, use apenas o arquivo 026 pelo SQL Editor e não misture os métodos antes de conciliar o histórico. Em falha, investigar; nunca retirar RLS/constraints.
6. Execute `scripts/homologation/access-inspect.sql` no projeto dedicado para conferir estrutura/grants. O script é somente leitura e não imprime segredos.

## 2. Auth e processos

- Preserve `SUPABASE_URL`, chave pública e `SUPABASE_SERVICE_ROLE_KEY` **somente em `.env.server`**. `PLATFORM_APP_ORIGIN` deve coincidir com a origem do Vite. Nenhuma variável nova secreta foi criada.
- Frontend: `VITE_SUPABASE_URL`, chave pública, `VITE_PLATFORM_API_URL` (obrigatória para este login) e `VITE_ATTACHMENT_GATEWAY_URL`. Nunca usar prefixo `VITE_` em credencial privilegiada.
- Inicie em terminais separados: `npm run platform:dev`, `npm run attachments:dev`, `npm run dev`. Ambos os backends foram atualizados; reinicie os dois. `npm run build` verifica TypeScript e gera a build local.
- Supabase Auth continua sendo a autoridade de senha. Mantenha provider de senha habilitado para o identificador técnico. Ative o **Before User Created hook** apontando para `public.access_before_user_created`; confira execute apenas para `supabase_auth_admin`. Ele permite consumidores anônimos e criação administrativa correspondente a reserva válida; recusa signup público e metadata forjada. **Esse hook ainda exige validação real.**
- Preserve anonymous sign-ins para a jornada do consumidor. Não desligue indiscriminadamente a opção global de criação de usuários se ela bloquear consumidores/provisionamento. Desabilite signup por e-mail no provider quando compatível com essas operações e mantenha o hook como restrição por tipo. Provedores sociais/telefone não usados não devem abrir caminhos paralelos. Teste signup direto, não apenas ausência de botão.
- Site URL/redirects devem corresponder à instalação local. O novo fluxo `/ativar-acesso` não usa callback/link de e-mail. Templates/SMTP antigos foram preservados como infraestrutura legada para outros usos, não como requisito desta ativação.
- Mantenha política de senha (frontend/API: 12–128 caracteres), controles Auth e CAPTCHA conforme capacidades do projeto. Configuração de provedor, limites e eventual MFA do operador precisam ser conferidos pelo proprietário; não foram alterados externamente.
- A API escuta em loopback e aplica origem exata, limite de corpo, erros seguros e rate limits persistentes. Reverse proxy/HTTPS futuro exige configuração explícita; cabeçalhos de IP enviados pelo cliente não são confiados. Não publicar servidor de demo.

## 3. Validar Super Admin e adotar usuários existentes

1. Abra `/entrar` → **Acesso da operação VIRELOQ**. Informe e-mail/senha Auth já utilizados pelo Super Admin. Nenhuma organização fictícia é exigida; não há cadastro ou promoção automática. Uma nova sessão passa pela API e fica registrada. Tokens antigos sem registro não autorizam operações.
2. Abra a empresa → Pessoas e acessos. O **Código da empresa** foi gerado no banco, é estável, não secreto, diferente do UUID e do slug. Não edite diretamente.
3. Em **Usuários existentes**, escolha **Preparar username**. Informe nome/sobrenome e confirme o username sugerido; ajuste conflitos explicitamente. Confirme contato válido para administradores. A adoção preserva Auth ID, membership, histórico e papel; não cria outra pessoa nem promove silenciosamente.
4. Copie as instruções exibidas e entregue à pessoa correta por canal confiável. O código temporário não pode ser consultado novamente. Se perdido, use Redefinir acesso. Se a criação parou antes da conclusão, use **Concluir preparação**, que retoma a mesma reserva/identidade.
5. Contas Auth existentes confirmadas conservam o identificador Auth. Contas adotadas ainda não confirmadas recebem identificador técnico aleatório; o e-mail de contato permanece separado e **não verificado**. Nenhum contato informado vira prova de propriedade. Contas globais existentes não são automaticamente convertidas em contas empresariais.
6. Um Auth usuário com mais de um vínculo empresarial precisa de username explicitamente preparado pelo Super Admin em cada vínculo utilizado. Como essa identidade tem uma senha única no Auth, preparação/recuperação fica restrita ao Super Admin; administradores de uma empresa não podem redefinir acesso que também pertence a outra. A sessão é limitada à empresa escolhida no login. Trocar empresa requer novo login; não combina dados entre organizações.

## 4. Primeiro acesso e operação

- `/ativar-acesso`: código da empresa + usuário + código temporário → validar → senha e confirmação. Padrão do código: 48h, cinco tentativas; código inválido/expirado/revogado/reutilizado não avança. Login posterior: código da empresa + usuário + senha.
- Nova empresa: o primeiro administrador recebe gate de Termos/Privacidade antes de qualquer operação empresarial. Documentos nesta entrega são minutas. Após aceite, abra a empresa e o onboarding existente. Staff entra sem assumir o contrato comercial; se faltar aceite institucional, aguarda o administrador.
- Empresas preexistentes não recebem aceite presumido nem são obrigadas por migração a aceitar um contrato fictício. A ativação da exigência para esse grupo depende da decisão/revisão do proprietário (guia externo). Seus membros continuam sujeitos ao novo login/sessão.
- Administrador cria sua própria equipe; e-mail e telefone de funcionário são opcionais. E-mail é obrigatório antes de criar/promover administrador. Funcionário/atendente não ganha gestão de pessoas.
- Redefinir acesso invalida código/sessões anteriores e gera novo código. O destinatário define a senha; o administrador não conhece a anterior. O primeiro administrador é recuperado pelo Super Admin; não se autorrecupera. Desativação impede uso; reativação exige novo código.
- `uncertain`: falha entre Auth e banco deixa acesso fechado. Redefinir acesso gera nova operação. `changing`: aguarde o prazo de segurança (até 15min desde validação) antes de resetar operação interrompida. Login confere o marcador da última operação aprovada para rejeitar gravação Auth tardia de operação antiga. Não altere estado manualmente para `active`.
- Histórico de convites da 025 fica em Pessoas e acessos → Convites anteriores: consultar/revogar. Links antigos não ativam vínculo; não há reenviar e-mail no fluxo atual.

## 5. Inatividade e aceite

Teste 29min sem interação: sessão continua, aviso aos 60s finais. Em 30min, logout e limpeza da tela; token antigo deve ser recusado em RPC e mídia privada. Clique/teclado/toque e **Continuar conectado** contam; foco, polling e refresh não. Duas abas compartilham a referência da mesma sessão; logout numa limpa a outra. Rascunhos ficam durante trabalho ativo e são descartados no logout/troca de identidade. Sem rede, dados não são enviados, e o banco ainda aplica seu próprio limite.

Política global configurável via RPC autorizado `access_policy_set`: `p_idle` 300–14400 segundos, `p_warning` 15–120 e menor que idle, `p_hours` 1–168, `p_attempts` 3–10. Só Super Admin. Padrão 1800/60/48/5. Não há configuração empresarial para desativar a expiração.

Legal e privacidade mostra documentos, versão, data e responsável do aceite. Revisar minutas, dados do fornecedor, retenção e condições comerciais antes de uso comercial; `scripts/homologation/legal-version.example.sql` é somente modelo para revisão. Nunca reescrever versão histórica.

## 6. Fechamento

Execute a matriz `docs/access/external-homologation.md`. Esta entrega não constitui homologação real nem autorização de produção. Trial/billing não são iniciados/reiniciados por provisionamento, reset ou migração. Não houve contratação, checkout real, publicação ou vídeo.
