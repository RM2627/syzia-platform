# SYZIA — decisão técnica da 032

Base exclusiva: consolidado 031 (`VIRELOQ-030-Correcao-Presenca.zip`, SHA-256 `d49feb0e790145b2dd55f2777156009748d764219b510e29763fc7ed0aec21e7`). Nenhuma migration 001–031 foi editada. A 032 é necessária por três mudanças persistentes: conta pessoal sem organização, permissões globais limitadas da equipe e tema público por empresa. A mesma migration corrige os pontos de entrada da agenda e da operação solo. Não há banco ou onboarding paralelo.

## Identidade e autorização

`enterprise_accounts` permanece a estrutura de provisionamento. `organization_id` pode ser nulo para uma conta pessoal. Índices parciais garantem unicidade do username pessoal e da identidade global. Contas empresariais mantêm unicidade por organização. O código `SYZIA` identifica o acesso pessoal; códigos empresariais hexadecimais existentes não mudam.

O gateway reutiliza reserva idempotente, criação Auth pelo ID reservado, código temporário, prova de ativação, senha e registro de sessão. Nenhuma senha/código é persistida em claro. Uma pessoa vinculada a duas empresas mantém um único `auth.users`; sua senha é compartilhada pelas contas autorizadas. Cada login empresarial continua delimitado pelo código da empresa. Um login pessoal comum não autoriza operar uma empresa. Para entrar em outra organização, usa-se o código empresarial e a mesma identidade/senha. Um funcionário global pode atuar nas atribuições autorizadas, respeitando verificação e aceite legal empresarial.

`people_grants` é privada, com RLS e FORCE RLS, sem leitura/escrita direta pelo cliente. Permissões globais iniciais: consultar pessoas, consultar cadastros de empresas e ser elegível ao atendimento compartilhado. Consultar cadastro não concede operação/financeiro empresarial. Atendimento usa `platform_roles.atendente` e `attendant_organizations`, sem membership artificial. Autonomia 029/030 e capacidade `human_support` permanecem obrigatórias.

Pessoas e acessos separa identidade, papel global, vínculo, atribuição e permissões. Suspensão utiliza a RPC existente; revogação encerra sessões da identidade. O desvínculo suspende a relação, preservando identidade, conta e histórico. Um Super Admin com acesso operacional autorizado pode deixar uma empresa sem ADM; o comando empresarial normal continua protegendo o último administrador. Empresa com responsável segue exigindo suporte aprovado/emergencial 029. Promoção a Super Admin é uma ação explícita e separada, protegida pela RPC global existente.

A listagem empresarial exclui identidades anônimas de consumidores. Auditoria não inclui tokens, senhas, códigos ou conteúdo de conversas. A retomada de preparação interrompida conserva o ID Auth reservado.

## Agenda e operação solo

Causa comprovada da tela vazia: o formulário dependia de `consumer_admin_context.schedule` não nulo. O recurso era criado pela publicação antiga; a publicação 031 permite página sem agenda, logo empresas novas chegavam sem recurso e sem formulário. Agora os valores iniciais aparecem inativos e o primeiro salvamento cria o mesmo `schedule_resources`. Revisão 0 significa criação; concorrência/revisões antigas são recusadas.

Horários seguem o cadastro/publicação existente; duração e agendamento direto seguem cada serviço. Não há novo motor de disponibilidade. Conflitos, antecedência, horizonte e buffer continuam no banco.

O ADM pode declarar disponibilidade, assumir e responder a tickets sem ser marcado como atendente. Solicitações/conversa também abrem no cenário solo, sem depender de habilitar suporte terceirizado. Orçamento editável permanece em Orçamentos, acessível da Central; agenda, execução e retornos reutilizam os comandos existentes. Autonomia dos atendentes compartilhados não foi ampliada.

## Aparência e mídia

`company_branding.theme` aceita `light`/`dark` e entra no snapshot de publicação. A marca da empresa gera tokens de ação, hover, ativo, superfícies, bordas, links e focus com contraste calculado. Mini-prévia reage imediatamente; a prévia completa representa o rascunho salvo. A publicação pública anterior continua intacta até publicar.

O gateway de mídia foi extraído em uma fábrica testável sem mudar a política de acesso: JWT verificado por Auth, `session_id` encaminhado por `access_media`, objetos privados, sanitização, limite 5 MB e finalização transacional. Erros de conexão, autorização, origem e Storage são diferenciados. Não se concedeu acesso direto ao bucket pelo navegador.
