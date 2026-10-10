# Relatório técnico — revisão integrada VIRELOQ

Data: 18/09/2026. Entrega cumulativa das Fases 2–8 e revisões posteriores. Esta revisão não é uma nova fase.

**Resultado:** identidade VIRELOQ aplicada; acesso empresarial por convite implementado; gestão de pessoas, descoberta de assinatura e preservação de rascunhos revisadas e testadas localmente. **Homologação externa não realizada. Cobrança real não implementada:** há contrato de integração server-side, ainda dependente de provedor, adaptador e persistência específicos. A produção do vídeo foi cancelada e não foi retomada.

## 1. Auditoria e preservação

A auditoria anterior está em `docs/vireloq/audit-before.md`. A entrega recebida foi usada como base, sem reconstruir os módulos existentes.

- Preservados catálogo, publicação, página pública única, portfólio multissegmento, consumidores, orçamentos, agenda, atendimento humano, comercial, métricas, onboarding, trial, billing fictício e seus controles de acesso.
- As migrations **001–024 permanecem byte-identical** à entrega anterior. Foi feita comparação com o ZIP anterior e há baseline SHA-256 e script reproduzível de verificação.
- Nova migration exclusivamente aditiva: **025**. Não houve reset nem alteração de banco externo.
- Inventário local após aplicação das 25 migrations: **68 tabelas públicas com RLS e FORCE RLS**, 68 policies SELECT. Operações continuam por comandos autorizados; não foram concedidas escritas diretas aos clientes.
- O nome técnico interno do pacote foi mantido para compatibilidade. Ele não é a identidade exibida ao usuário.

## 2. Identidade e experiência

Marca centralizada em `src/brand/platform.ts`, componente `Brand.tsx` e estilos institucionais `vireloq.css`.

Entregues símbolo de dois caminhos conectados sugerindo V, logotipo horizontal em fundo claro/escuro, símbolo isolado colorido/branco/monocromático, ícone de aplicativo, favicons PNG e apresentação visual autossuficiente em HTML/PNG. Os SVGs do logotipo contêm contornos e não dependem de fonte instalada. Licença da fonte usada nos contornos incluída.

Paleta: azul-noturno `#141B3A`, roxo `#5533A8`, violeta `#7047EB`, lilás `#BCA9F5`, branco e neutro `#F6F5FA`. Sem referências astronômicas. Slogan: **Onde caminhos se conectam.**

Login e recuperação recebem a identidade institucional. O painel permanece predominantemente claro. Cabeçalho identifica a pessoa conectada, função e organização atual a partir da sessão/contexto, sem pessoa real hardcoded. Título, metadados, favicon, carregamento, mensagens institucionais e templates de e-mail foram alinhados.

A marca da organização permanece protagonista em `/empresa/:slug`. Nenhuma segunda página pública ou portfólio foi criada. Foram inspecionadas capturas reais da demo em desktop e celular; o brand board usa essas telas, com dados fictícios, sem representar recursos inventados.

## 3. Acesso B2B, primeiro acesso e equipe

- Removido o autocadastro administrativo da interface de entrada. A proibição no provedor Auth ainda exige a configuração externa documentada; a mudança de tela sozinha não bloqueia o endpoint externo.
- Superadministrador pode criar organização e convidar seu administrador inicial por nome/e-mail, sem escolher a senha do destinatário. O fluxo autorizado legado com conta existente foi preservado.
- Gestor pode convidar administrador, colaborador ou atendente próprio usando vínculos/papéis existentes. Não recebe nem concede papel global implicitamente.
- Destinatário confirma o link de Auth e define a própria senha. A associação à organização exige sessão válida, e-mail correspondente e convite vigente. UUID isolado não é credencial.
- Convites têm validade de sete dias, revogação, chave de idempotência, controle de duplicidade e histórico. Revogar o convidador ou suspender a organização impede o uso de convite anteriormente emitido; um convite não reativa vínculo revogado.
- Backend separado autentica a pessoa e solicita autorização/reserva de envio ao banco. Credenciais administrativas ficam somente no servidor. Há limite de corpo, origem exata, cooldown de um minuto, até cinco tentativas e lease de envio.
- Em conta já existente, o servidor prepara recuperação no próprio endereço. Templates usam token no fragmento e confirmação explícita antes de `verifyOtp`, sem depender do navegador que originou o convite.
- Na demo, e-mail e Auth são simulados e o link fictício fica visível para exercício. Essa resposta não existe no servidor real. Nenhum e-mail real foi enviado.

## 4. Migration, tabela, políticas e funções

Arquivo: `supabase/migrations/202609180025_b2b_invitations.sql`.

| Objeto | Finalidade |
|---|---|
| `organizations.activated_at` | Registra primeira ativação com administrador; backfill de empresas existentes. Não concede trial. |
| `organization_invitations` | Organização, convidador, destinatário, papel, estado, prazo, aceite e controle de entrega. |
| `invitation_pending_email` | Impede dois convites pendentes simultâneos para o mesmo endereço/organização. |
| Unicidade convidador/chave | Repetição idempotente; payload divergente é conflito. |
| Checks de papel/e-mail/estado/tentativas e validação de vigência nos RPCs | Restringem valores e coerência do convite. |
| `invitation_managers_read` | Leitura limitada a gestor da organização ou superadministrador elegível. RLS/FORCE RLS; sem escrita cliente. |
| `foundation_invite` | Cria convite após autorização atual. |
| `foundation_provision_organization` | Cria empresa e convite do administrador inicial. |
| `foundation_revoke_invitation` | Revoga convite no escopo autorizado. |
| `foundation_accept_invitation` | Aceita com identidade confirmada e aplica vínculo autorizado. |
| `foundation_claim_invitation_delivery` | Reserva envio, exclusiva de `service_role`, verificando ator e convidador. |
| `foundation_finish_invitation_delivery` | Finaliza lease de envio, exclusiva de `service_role`. |
| Helpers privados e triggers | Elegibilidade do convidador, ativação da organização e auditoria. |

Há seis novos RPCs públicos: quatro destinados a usuários autenticados mediante autorização interna e dois exclusivos do backend. `search_path` explícito, grants/revokes e locks existentes foram respeitados. Catálogo completo: `reports/vireloq-sql-catalog.json`.

## 5. Trial, assinatura e cobrança

A revisão reutiliza a elegibilidade/histórico/identificadores, prevenção de novo benefício, extensões administrativas e auditoria anteriores. Não cria outro trial. O registro da organização e o convite não consomem automaticamente o período; ativação e concessão são eventos distintos. A demo usa política persistida de 15 dias, não constante do frontend.

“Plano e assinatura” e “Pessoas e acessos” estão na navegação permanente. O trial mostra plano, vigência, dias restantes, preservação de dados e acesso ao catálogo. O CTA “Assinar agora” leva à seção correspondente e informa a indisponibilidade do checkout real.

`server/billing/hosted-checkout.mjs` prepara um contrato de integração: identidade e organização verificadas, preço obtido server-side, associação imutável, idempotência, validação de origem de checkout, autenticação de webhook, consulta do contrato no provedor, sequência de eventos e comandos de cancelamento/reativação. A URL de retorno não ativa assinatura. Não há fallback silencioso para mock.

**Limite material:** os testes desse novo contrato usam adapter/store em memória. Ainda faltam provedor escolhido, adapter concreto, store durável transacional, normalização dos eventos reais e endpoints HTTP financeiros. O domínio existente de invoices/webhooks permanece mock-only. Isso é **pendência de implementação da integração concreta**, além da futura homologação; não é apenas preencher uma chave. Nenhuma cobrança, transação, plano pago ou fornecedor foi ativado.

## 6. Perda de campos não salvos

Causas encontradas:

1. Limpeza do contexto de acesso em cada evento Auth desmontava os formulários mesmo com a mesma identidade.
2. Chave do shell derivada do objeto integral de vínculos recriava a árvore.
3. Chaves baseadas na revisão recebida por polling/foco recriavam formulários.
4. Em alguns formulários, valores locais antigos podiam ser enviados com revisão recém-recebida.
5. Cadastro básico usava nome/status como chave, descartando edição em atualização externa.

Correções: identidade estável do shell, renovação de contexto sem desmontagem na mesma sessão, rascunhos em memória por escopo, revisão-base do início da edição e conflito explícito. Configurações, serviços, regras, manual, permissões e configurações da Central preservam a concorrência otimista já existente. Cadastro básico também preserva edição e bloqueia salvar quando detecta mudança externa de nome/status.

Revalidação de autorização por foco, sessão e polling continua ativa. Negação explícita remove a área protegida. Erro de transporte mantém o rascunho, mas bloqueia a interação enquanto o acesso não for revalidado. Logout/troca de identidade/organização não reaproveita rascunho de outro escopo.

**Limites:** rascunhos não são autosave, não são persistidos em localStorage e não prometem sobreviver ao fechamento/recarregamento completo da página. O cadastro básico mantém o RPC legado sem parâmetro de revisão; seu bloqueio de conflito é de interface e não equivale a compare-and-swap no banco. As entidades que já têm revisão continuam validadas no banco. Nenhuma autorização foi removida para preservar formulário.

## 7. Testes efetivamente executados

Ambiente: Node/TypeScript/Vite, Chromium headless, PGlite PostgreSQL WASM com fixtures Auth, HTTP em loopback e dados exclusivamente fictícios. A execução de SQL/RLS é real dentro do PGlite; não é Supabase, GoTrue, PostgREST ou Storage reais.

| Grupo | Casos únicos aprovados |
|---|---:|
| Fundação/RLS | 68 |
| Empresa | 71 |
| Consumidor | 35 |
| Presença/portfólio/preparação de pagamento | 28 |
| Central | 40 |
| Comercial | 54 |
| Métricas | 27 |
| Billing fictício | 50 |
| Trial | 42 |
| Onboarding | 13 |
| Operação | 16 |
| Página da empresa | 7 |
| Multissegmento | 5 |
| Convites — SQL | 10 |
| Upgrades Comercial/Métricas/Billing/Trial | 4 |
| Ferramentas, imagens, provedor fictício e contratos server-side | 68 |
| Smoke HTTP da demo e configuração segura | 4 |
| Interface com contratos/mocks locais | 57 |
| Interface integrada à demo local | 42 |
| **Total de casos únicos após correções** | **641** |

Além desses casos: typecheck, build, verificação de marcador server-only no bundle, comparação das 24 migrations, inspeção visual desktop/mobile e verificação integral SHA-256 do pacote/MANIFEST. A varredura do bundle não substitui revisão de segredos da futura infraestrutura.

Cobertura inclui isolamento de empresas e consumidores, ausência de dados privados na projeção pública, autorização revogada, papéis, convites cruzados/expirados/repetidos, trial anterior e reativação, preços e versões de orçamento, anexos, agenda, publicação, períodos/filtros/métricas, onboarding, três segmentos fictícios e formulários em foco/polling. Os testes da demo aguardaram 16 segundos reais em seis formulários (configuração, serviço, portfólio, cliente, orçamento e agenda). A Central também testa preservação e conflito. Navegação de assinatura e aceitação de convites foram exercitadas em desktop/mobile.

### Tentativas, falhas e correções

Os logs das tentativas não foram substituídos por uma alegação de execução única perfeita:

- A fixture Auth passou a conter e-mail; um teste de trial tentava adicionar novamente a coluna. Ajustado para operação condicional e repetido com sucesso, incluindo upgrade.
- Testes antigos pressupunham autocadastro, título genérico e criação por UUID como padrão. Foram atualizados para o fluxo autorizado; o caminho legado é selecionado explicitamente.
- Um novo teste de revisão externa chamou helper com assinatura incorreta e depois usou relógio simulado instalado após os timers. Corrigido para chamada correta e espera real; passou.
- A regressão UI ampla teve 55/56 aprovados na primeira execução; o caso corrigido passou na repetição. A suíte da Fundação foi repetida após a última correção e inclui o 57º caso.
- A regressão da demo teve 40/42 aprovados na execução ampla. Um caso dependia do seletor antigo de criação; o outro ocorreu durante edição dos fontes com HMR. Com seletor atualizado e fontes estáveis, os oito casos focalizados (trial e VIRELOQ, incluindo todos os formulários) passaram. A interferência por HMR é a explicação provável, não uma medição de produção.
- O teste adicional de cadastro básico inicialmente apontava para a Home e seu mock não fornecia lista de convites. Corrigidos rota e contrato do mock; o formulário é exercitado em Pessoas e acessos. A última execução confirmou 14/14 casos em `vireloq-final-foundation-ui-results.json`. O log de texto de tentativas sobrepostas foi preservado como `vireloq-foundation-interleaved-attempt.log`; ele não representa uma execução limpa e o resultado final vem do JSON identificado.

Evidências: `reports/vireloq-regression*.log`, `vireloq-ui-full-results.json`, `vireloq-ui-correction-results.json`, `vireloq-final-foundation-ui-results.json`, `vireloq-demo-full-results.json`, `vireloq-demo-correction-results.json`, `vireloq-validation-summary.json`, logs de build/bundle, catálogo SQL e capturas em `reports/vireloq/`. Reexecuções não são somadas como novos casos.

## 8. O que não foi executado / pendências

| Item | Estado e motivo |
|---|---|
| Supabase dedicado, migração externa e tokens reais | PENDENTE DE HOMOLOGAÇÃO EXTERNA; execução proibida nesta tarefa. |
| Auth/convite/recuperação/SMTP reais | PENDENTE DE HOMOLOGAÇÃO EXTERNA; depende de configuração e credenciais do proprietário. |
| PostgREST/Storage/RLS reais, URLs temporárias e abuso | PENDENTE DE HOMOLOGAÇÃO EXTERNA; guias cumulativos preservados. |
| Concorrência em conexões independentes | Preparada em `tests/invitations-native.test.mjs`; executor recusou mapeamento de UID não-root. PostgreSQL nativo não iniciou, portanto nenhum resultado concorrente foi declarado aprovado. Repetir localmente em ambiente compatível e no dedicado. |
| Cobrança real | PENDENTE DE ESCOLHA DO PROVEDOR, IMPLEMENTAÇÃO CONCRETA E HOMOLOGAÇÃO. Contrato isolado não é gateway pronto. |
| CAPTCHA, rate limits e SMTP na infraestrutura | Instruções preparadas; controles do provedor/proxy precisam ser configurados e testados externamente. |
| Backup/restauração do ambiente dedicado | Estratégia/guias anteriores preservados; não houve restauração externa nesta revisão. |
| Vídeo | CANCELADO. Planejamento anterior arquivado; somente nova solicitação autoriza produção futura. |

## 9. Arquivos, atualização e reprodução

O ZIP contém o projeto completo e cumulativo: código, assets, 25 migrations, scripts, testes, fixtures, configurações de exemplo, package.json, lockfile, documentação, relatórios, guias, AGENTS e MANIFEST. Dependências instaladas, caches de navegador, build descartável, segredos e estado local não são necessários no ZIP.

Inventário de arquivos novos/alterados em relação ao ZIP recebido: `reports/vireloq-changes.json`. Principais grupos: `src/brand`, `src/access`, `src/ui/useDraft.tsx`, `FoundationApp.tsx`, formulários de Empresa/Central, navegação e assinatura, `server/invitations.mjs`, `server/platform.mjs`, `server/billing/hosted-checkout.mjs`, templates, migration 025, testes, demo e documentação.

Para ambiente local: `npm ci`, `npm run dev:demo`. Para regressão: `npm run test:local` (Chromium instalado ou `FOUNDATION_CHROMIUM_PATH` definido), `npm run check:bundle`, `node scripts/verify-historical-migrations.mjs`. Para reconstruir a entrega: `python3 scripts/package-project.py /caminho/Projeto-Fase-8-Final.zip`.

O guia `docs/vireloq/upgrade-and-homologation.md` contém atualização incremental sem reset, Auth, backend, variáveis, templates, cenários e dependências. Não é autorização para executar serviços externos.

**Encerramento:** entrega local preparada para revisão do proprietário; não declarada homologada nem pronta para cobrança real. Nenhum deploy, produção ou vídeo foi realizado. Parar e aguardar autorização.
