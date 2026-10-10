# Homologação externa — acesso empresarial 026

**PENDENTE. Não executada pelo agente.** Use somente projeto dedicado e identidades fictícias. O proprietário fornece configuração/credenciais, aplica 026 conforme `upgrade.md` e executa esta matriz. Não rodar fixtures `tests/auth-fixture.sql` no Supabase real. Não publicar nem contratar serviços para isso.

## Preparação

- Snapshot/backup seguro do ambiente dedicado e verificação de histórico 001–025. Aplicar 026 sem reset, conferir `access-inspect.sql`, reiniciar Vite, Platform API e gateway de anexos.
- Confirmar que dados e IDs anteriores, histórico de convites, trial e assinatura permanecem. Os tokens antigos perderão autorização até login pelo gateway; isso é esperado.
- Configurar Before User Created hook, signup administrativo fechado, anonymous sign-ins de consumidor preservados, senha/abuso/CAPTCHA conforme o projeto. Nenhum segredo no frontend. SMTP não participa dos novos fluxos.
- Criar empresas fictícias A/B, usernames iguais em ambas, funcionário sem e-mail, administrador com e-mail de contato. Não presumir verificação do contato. Manter uma conta Super Admin existente de homologação.

| Área | Ações e resultado esperado |
|---|---|
| Super Admin | Entrar pela opção de operação em `/entrar` com conta já existente; mantém papel global sem org fictícia. Conta empresarial não consegue entrar por esse caminho. |
| Sem autocadastro | Chamar signup email/password/phone/OAuth diretamente com chave pública; conta administrativa não é criada. Forjar user_metadata não passa o hook. Anonymous consumidor continua operando sem membership. |
| Provisionamento | Criar empresa+admin; copiar código; nenhum trial/assinatura automática. Repetir request_key: mesma reserva, nunca outro usuário. Se Auth falhar após reserva, Concluir preparação retoma mesma identidade. |
| Primeiro acesso | Código correto → senha/confirmar → gate legal → empresa/onboarding. Errado/expirado/revogado/consumido não avança. Cinco tentativas bloqueiam o código (política padrão). Novo código invalida anterior. |
| Usuário existente | Adoção explícita preserva Auth ID e histórico; conflito de username pede correção. Conta confirmada conserva Auth email; contato informado continua sem prova de propriedade. |
| Login | Código inválido, username inexistente e senha errada dão mesma mensagem. Mesmo username em A/B resolve apenas a organização selecionada. JWT emitido diretamente pelo Auth sem registro do gateway não acessa dados empresariais. |
| Pessoas | Admin só provisiona sua empresa; colaborador, próprio e compartilhado não criam usuários ou Super Admin. Promoção sem contato falha. Último admin preservado. Reset do primeiro admin exige Super Admin. |
| Concorrência | Duas conexões independentes criando mesmo username/chaves distintas: uma criação. Mesma chave: mesma reserva. Duas ativações: apenas uma operação. Reset durante alteração bloqueado. Mudança de papel/desativação durante operação revalida estado. |
| Falhas entre Auth e SQL | Induzir falha controlada após updateUserById em ambiente descartável. Conta incerta não opera. Reset administrativo gera nova operação. Resposta tardia da operação antiga não libera login com senha obsoleta (marcador de operação). Não forçar estado `active` manualmente. |
| Isolamento | PostgREST com tokens reais A/B: trocar org/UUID não concede acesso. Agregados, diretório, manual, convites, clientes e anexos respeitam escopo. JWT de A com dois memberships continua só em A. |
| Revogação | Desativar pessoa/papel/empresa com sessão aberta; novas RPCs e mídia privada recusadas. Reativar não ressuscita código ou sessão antiga. |
| Inatividade | 29min mantém, aviso60s, 30min nega no banco e sai na UI. Polling, foco, refresh token, abas em background não renovam. Clique/teclado/toque e Continuar conectado renovam. Refresh token mantém o mesmo `session_id` esperado pelo Supabase. |
| Abas/dados locais | Duas abas coordenam atividade e logout; troca de conta limpa formulários e cache sensível. Empresa lembrada só guarda código/nome e não concede acesso. Testar suspensão do computador e perda de rede; server-side continua decisivo. |
| Legal | `/termos` e `/privacidade` públicos, minutas identificadas. Admin sem aceite não opera nem por URL/RPC. Funcionário aguarda admin sem assumir contrato. Versões/data/responsável auditados. Mudança material exige novo aceite; editorial com mesmo grupo conserva aceite. |
| Mídia privada | Gateway valida JWT real antes de repassar sessão ao RPC server-only. Upload, leitura, ticket único, sanitização, RLS e Storage: sessão válida funciona; expirada/revogada/outra empresa não. Projeção pública permanece autorizada/publicada. |
| Regressão comercial | Página pública, portfólio, serviços, perguntas, orçamentos, aprovação, agenda, Central, Comercial, Pendências, métricas, onboarding, trial/assinatura. Provisionar/resetar/reativar não renova trial nem cria cobrança. |
| Abuso | Limites persistentes sobrevivem restart da API; respostas429 seguras, temporárias. CAPTCHA real, limites Auth e origens/CORS. Revisar política de IP se houver proxy; não confiar em X-Forwarded-For enviado por cliente. |
| Segredos | Inspecionar build/rede/logs: somente sessão do próprio usuário; nenhuma service_role, código temporário em logs ou hash reutilizável de senha. Credencial temporária aparece só na resposta administrativa e em memória para entrega. |

## Ferramentas locais entregues

`npm run test:access`: SQL/PGlite + upgrade + adapter Node. `npm run test:access:native`: PostgreSQL descartável com conexões independentes, Linux não-root e dependência opcional nativa. Neste executor, esse último não iniciou por impossibilidade de mapear UID não-root; **nenhuma concorrência nativa foi declarada aprovada**. A demo serializa SQL e não substitui concorrência real. Os cinco casos nativos estão preparados no projeto.

`npm run test:demo:browser -- enterprise-access.spec.ts`: cliques/preenchimento reais em Chromium contra demo HTTP com Auth simulado; não é Supabase real. A matriz acima deve ser repetida com tokens e sessões reais.

Guias HTTP/SQL das fases anteriores permanecem para autorização/domínio. Nas verificações empresariais atuais, use tokens obtidos por `/access/login` ou `/access/global-login`, nunca apenas tokens de `signInWithPassword` direto. Não grave tokens, códigos ou senhas em relatórios.

## Documentos e decisões do proprietário

Revisar minutas juridicamente, preencher fornecedor/contato/prazos/papéis/bases legais/condições comerciais. Documento novo = nova versão imutável; mudar `acceptance_version` para revisão material. Modelo `legal-version.example.sql` recusa execução sem edição deliberada. Para exigir aceite das organizações anteriores, após aprovação dos textos, o proprietário deve decidir o momento e o grupo e atualizar `private.enterprise_codes.legal_required` em transação administrativa auditada; não há aceite automático/fabricado. Pode-se manter esse grupo em transição até decisão expressa.

Não validar assinatura financeira real: gateway continua não selecionado. Não usar esta entrega como autorização de produção, homologação concluída ou retomada de vídeo.
