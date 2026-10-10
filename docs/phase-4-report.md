# Relatório de entrega — Fase 4: Consumidor

Data: 16/09/2026 · Versão do projeto: 0.4.0.

**DESENVOLVIMENTO LOCAL: implementado e testado. HOMOLOGAÇÃO EXTERNA: PENDENTE. PRODUÇÃO/LANÇAMENTO: responsabilidade exclusiva de Marcelo.**

A entrega reúne o projeto completo das Fases 2, 3 e 4, incluindo a ampliação autorizada em `scope-phase-4-amendment.md`. Não houve deploy, publicação, contratação, ativação de plano pago, acesso ao banco real da MS Auto Details, uso de clientes reais ou processamento de pagamentos. A Fase 5 não foi iniciada. Aguardar aprovação de Marcelo.

## 1. Resultado implementado

### Presença pública e jornada

- `/empresa/:slug`: identidade, descrição, informações públicas, regiões, horários, pagamentos aceitos, catálogo/categorias, duração, preço fixo, “a partir de” explicitamente estimado e “sob consulta”, FAQ e ações de orçamento/agendamento/ajuda.
- Personalização controlada de logo, capa, cinco cores e ordem de categorias/serviços. Não aceita HTML/CSS/JavaScript arbitrário. Portfólio de até 30 trabalhos por empresa, com 1–4 imagens por item; antes/depois exige duas. Até 150 imagens empresariais no MVP.
- Publicação explícita congela a projeção autorizada do manual e da presença empresarial. Rascunhos não modificam o que já foi publicado. A projeção exclui manual, regras privadas, permissões, notas, contatos internos, informações administrativas e UUIDs internos.
- Wizard com serviço, adicionais, perguntas, observações, imagens, identificação, consentimentos, revisão e envio. Dados em memória permanecem após erro de rede; retomada do rascunho já criado evita duplicação. Não há armazenamento indiscriminado de dados pessoais em localStorage.
- A navegação não exige login. Quando necessário, usa identidade técnica anônima do Supabase, separada da sessão da equipe. Telefone é dado de contato, jamais autenticação. O mesmo telefone não une cadastros nem libera pedidos, na mesma empresa ou em empresas diferentes.
- Consentimentos registram finalidade, versão do aviso, data e revogação aplicável. Autorização de contato é separada; não implica marketing. Recorrência consulta apenas o perfil da identidade atual naquela empresa e não pré-marca consentimento.

### Orçamentos, clientes, agenda e acompanhamento

- Clientes por organização/identidade, oportunidades, solicitações e versões com itens/valores congelados. Total e duração são calculados no banco; valor esperado divergente é recusado. Serviço/adicional desativado e publicação alterada são revalidados.
- Proposta final enviada é imutável; edição gera nova versão. Aprovação/recusa exigem versão atual, válida, autorização e idempotência. A apresentação inclui empresa, serviço, adicionais, respostas, itens, valores, validade, versão e estado.
- Timeline mostra eventos efetivamente gravados: envio, análise, proposta, aprovação/recusa, agendamento/cancelamento/remarcação. Não simula execução de serviço nem etapas da Central futura.
- Um recurso de agenda por empresa. Considera jornada, duração do serviço/adicionais, antecedência, intervalo, bloqueios, janela disponível e prazo de cancelamento/remarcação. Apenas serviços elegíveis admitem contratação direta; propostas finais exigem aprovação quando aplicável.
- Reserva e bloqueio disputam a mesma constraint EXCLUDE GiST por recurso/intervalo. Uma reserva ativa por solicitação. Remarcação ocorre em transação e preserva o horário anterior se a nova tentativa falhar.
- `/minhas-solicitacoes` e `/acompanhar/:code`: acesso por identidade autorizada ou resgate de link restrito. UUID/código sozinho não autoriza. Segredo de 256 bits, hash no banco, escopo consulta/gestão, validade de sete dias, resgate único e revogação. O segredo é removido da URL antes da chamada de resgate. A autorização é reavaliada a cada nova operação.
- Estrutura interna de tags, notas, horário preferido, origem e indicação básica. Relação de indicação não atravessa empresas nem gera recompensas. Contexto inclui histórico e próxima ação para futura Central, sem implementar a Fase 5.

### Anexos e mídia pública

- JPEG, PNG e WebP, até 5 MB por arquivo e até cinco anexos por solicitação. Assinatura, conteúdo decodificado, MIME, dimensões e limites são verificados no servidor; máximo 8.000 pixels por dimensão e 20 milhões de pixels. Regravação remove metadados; não aceita animação, SVG ou arquivo renomeado sem conteúdo válido.
- Buckets privados separados para anexos e mídia empresarial. O gateway Node verifica usuário no Auth, chama RPCs autorizadas, sanitiza e grava sem sobrescrever objetos existentes. A conclusão do upload exige hash/dimensões reais.
- Download de anexo exige sessão e ticket de 60 segundos, de uso único e vinculado a usuário/arquivo. O consumidor recebe um blob autorizado, não uma URL pública de Storage. Link/ticket revogado não permite nova leitura; nenhum mecanismo consegue retirar bytes já baixados legitimamente.
- Imagem empresarial somente é servida publicamente quando aparece no snapshot publicado ativo. Trocar identificador de anexo por identificador de mídia não a torna pública. Suspensão interrompe novas leituras.

### Pagamentos opcionais: somente preparação

- Regras futuras por empresa/serviço, meios externos, opt-in integrado, ausência de antecipação, presencial, sinal opcional/obrigatório e integral antecipado. Todas permanecem `preparation_only`; não ativam cobrança nem bloqueiam a agenda atual.
- Sinal fixo/percentual calculado no banco, plano congelado associado à versão aprovada e valor autorizado, idempotência e relacionamentos compostos que impedem troca de cliente/empresa/versão/valor.
- Modelo de pagamentos e histórico com estados explícitos, valores confirmado/reembolsado e origem/confirmador. Confirmação manual externa é distinta de confirmação pelo provedor. Não há RPC operacional para marcar pagamento como pago; escrita direta de usuários é negada.
- Contrato futuro de gateway independente de fornecedor e tipo de reserva pendente com expiração. Não há gateway, Pix/cartão real, webhooks, cobrança, carteira, saldo, split, custódia, saque, repasse ou armazenamento de PAN/CVV. Registros financeiros dos testes são fixtures privilegiadas fictícias, não operações financeiras reais.

## 2. Inventário técnico

### Migrations

Aplicadas em ordem **somente nos bancos descartáveis PGlite locais**: 001–010. As migrations 001–005 foram comparadas por SHA-256 com o manifesto da entrega anterior e permanecem idênticas. Nenhuma migration foi aplicada em Supabase real.

| Nova migration | Conteúdo |
|---|---|
| `202609160006_consumer_schema.sql` | Modelo do consumidor, RLS/FORCE RLS, FKs, imutabilidade, agenda/exclusão e acesso restrito |
| `202609160007_consumer_commands.sql` | Publicação, solicitação, versões, links, consentimentos, agenda e administração mínima |
| `202609160008_consumer_attachments.sql` | Upload autorizado, finalização, tickets e acesso pelo gateway |
| `202609160009_consumer_presence.sql` | Branding, portfólio, mídia separada, recorrência, contexto, origem e recusa |
| `202609160010_payment_preparation.sql` | Regras/planos/modelo financeiro futuro, cálculo e constraints |

São **25 tabelas novas**, total de **41 tabelas públicas com RLS e FORCE RLS**, e **25 novas policies SELECT**, total de 41. Nenhuma escrita direta concedida ao cliente. São **43 funções públicas novas e 19 helpers privados**; seis RPCs de gateway/finalização são exclusivos do servidor privilegiado. O inventário completo de tabelas, policies, assinaturas, grants, constraints e triggers está em `phase-4-sql-inventory.md` e nos SQLs.

Principais garantias: FKs compostas por empresa/solicitação, versão única, versões/itens/publicações/eventos imutáveis, EXCLUDE de agenda, unicidade de reserva ativa, regras financeiras com NULLS NOT DISTINCT, CHECKs de valor/modalidade/estado/confirmação, autorização atual antes da operação, trava transacional compartilhada com revogação e auditoria sem copiar segredos/dados pessoais. Não foram relaxadas as proteções da Fundação ou Empresa.

Scripts Storage `supabase/storage/consumer-private.sql` e `company-media.sql`: buckets privados e policies restritivas para impedir acesso direto de clientes. **Preparados; execução real pendente.**

### Páginas, componentes e servidor

| Caminho | Responsabilidade |
|---|---|
| `src/consumer/Consumer.tsx` | Página pública, wizard, solicitações e acompanhamento |
| `src/consumer/Admin.tsx` | Publicação, agenda/bloqueios, propostas e anexos autorizados |
| `src/consumer/PresenceAdmin.tsx` | Identidade visual e portfólio |
| `src/consumer/InternalContext.tsx` | Contexto/notas/tags/origem/indicação internos |
| `src/consumer/PaymentPreparation.tsx` | Configurações financeiras futuras explicitamente inativas |
| `src/consumer/api.ts` / `consumer.css` | Sessão separada, RPCs/gateway, erros e layout responsivo |
| `src/Captcha.tsx` | Integração opcional de CAPTCHA preparada para Auth real |
| `src/payments/contracts.ts` | Estados financeiros, distinção manual/provedor e reserva futura com validade |
| `server/images.mjs` / `attachments.mjs` | Sanitização, gateway privado e mídia publicada autorizada |
| `server/payments/provider-contract.ts` | Abstração de provedor futuro, processamento desabilitado |
| `scripts/dev-consumer-demo.mjs` | Demonstração loopback, descartável, com empresas/contas fictícias |

Rotas novas: `/empresa/:slug`, `/minhas-solicitacoes`, `/acompanhar/:code`, `/painel/:orgId/consumidor`. Rotas da Fundação e Empresa preservadas. `main.tsx` integra navegação e carregamento separado das telas. `README`, exemplos de ambiente, lockfile, testes, fixtures, instruções de build e preparação futura acompanham o pacote completo.

## 3. Testes executados e resultados

**270 testes locais aprovados, zero falhas na rodada final de cada suíte.** Resultado consolidado a partir das execuções individuais; não se afirma que o primeiro comando agregado `test:local` terminou com sucesso. Ele foi interrompido após a suíte de imagens; as suítes restantes foram executadas separadamente. A última bateria de navegador terminou com 33/33, sem testes ignorados ou flaky.

| Comando/suíte | Resultado | Evidência |
|---|---:|---|
| `npm test` — Fundação SQL | 68/68 | `reports/security-results.json` |
| `npm run test:company` — Empresa SQL | 71/71 | `reports/company-security-results.json` |
| `npm run test:homologation-tools` | 10/10 | `reports/homologation-tooling.tap` |
| `npm run test:company-tools` | 5/5 | `reports/company-tooling.tap` |
| `npm run test:consumer` | 35/35 | `reports/consumer-results.json` |
| `npm run test:presence-payments` | 28/28 | `reports/presence-payments-results.json` |
| `npm run test:images` | 9/9 | `reports/phase-4-local-validation.txt` |
| `npm run test:consumer-tools` | 7/7 | `reports/consumer-tooling.tap` |
| `npm run test:demo` | 1/1 integração | `reports/demo-http-results.json` |
| `npm run test:config` | 3/3 | `reports/config-security-results.json` |
| `npm run test:ui` | 33/33 | `reports/browser-results.json`, `phase-4-ui-final.txt` |

Além desses casos: `npm run check:bundle` aprovado (TypeScript/build e inspeção); bundle gerado com marcador fictício em variável server-only e inspecionado, sem marcador/chave privilegiada do servidor no frontend; hashes das cinco migrations anteriores preservados. Build gera aviso de chunk inicial de aproximadamente 502 kB (144 kB gzip); não é falha de compilação nem comprovação de desempenho em rede móvel real.

Ambiente: Node 24.19.0, PGlite 0.5.8 com PostgreSQL 18.3 WASM, Chromium/Playwright, Vite/TypeScript. SQL, constraints e RLS são executados pelo motor local; Auth/claims/Storage são fixtures ou simuladores. A integração HTTP usa loopback com sanitização real e SQL local. Não é PostgREST/GoTrue/Storage real.

A matriz individual e a correspondência com requisitos obrigatórios estão em `phase-4-test-matrix.md`. Evidências de interface inspecionadas: celular 390×844, tablet 820×1180 e desktop 1440×1000, além de acompanhamento móvel, em `reports/visual-phase4/`. Conferidos hierarquia, leitura, ações, catálogo, preços, portfólio e ausência de transbordamento. Não equivale a teste em aparelhos físicos/Safari.

## 4. Falhas encontradas e correções

- Ambiguidade de nomes/aliases em PL/pgSQL corrigida para que criação/contexto e SQL de publicação funcionem sem colisão entre variável e coluna.
- Validação da versão do aviso reforçada para recusar valor ausente. CHECKs financeiros reforçados com exigência explícita de campos não nulos onde SQL poderia aceitar expressão desconhecida.
- Bloqueado agendamento de proposta final ainda não aprovada; cálculo, congelamento e revisão são revalidados no banco.
- Repetição segura de finalização de imagem exige mesmo hash; objetos não são sobrescritos. Idempotência de origem preserva reenvio sem autorizar alteração posterior indevida.
- Estilo global de `aside` vazava para a experiência pública; CSS escopado corrigiu a apresentação. Mensagens de acesso negado e estados da timeline foram ajustados.
- Um teste de vazamento confundia a descrição pública “acabamento interno” com segredo; passou a testar sentinelas privadas e chaves/UUIDs proibidos, mantendo a cobertura de confidencialidade.
- Chromium opcional ficou inválido/ocupado durante tentativas sobrepostas do harness. Preparação passou a escrever em arquivo temporário e renomear atomicamente. Logs intermediários concorrentes foram descartados; evidência final é a execução única de 33/33.
- Seletor exato de label não localizava a cor por incluir opções do select; teste passou a usar papel acessível `combobox` com nome exato. O fluxo de salvar/publicar cor e preparar regra financeira passou.

## 5. Pendências externas e limitações

| Item | Estado e motivo |
|---|---|
| Projeto Supabase dedicado e aplicação das migrations/Storage | **PENDENTE DE HOMOLOGAÇÃO EXTERNA** — depende da conta/projeto de Marcelo |
| Auth anônimo/confirmado, refresh, logout, SMTP, confirmação e recuperação | **PENDENTE** — local usa simuladores/fixtures, não valida provedor real |
| PostgREST com JWTs reais e revogação em sessões existentes | **PENDENTE** — scripts preparados, credenciais reais ausentes |
| Storage privado, uploads, tickets, revogação e mídia publicada real | **PENDENTE** — gateway implementado; serviço real não conectado |
| Concorrência com conexões independentes | **PENDENTE** — PostgreSQL nativo não inicia sob UID 0 neste contêiner; nenhum controle foi removido. Teste local valida exclusão/rollback em um motor, não simultaneidade independente |
| CAPTCHA, limites distribuídos/Auth/IP, SMTP e abuso real | **PENDENTE** — dependem da configuração de provedores/infraestrutura |
| Backup/restore de banco e objetos Storage | **PENDENTE** — estratégia preparada, sem ambiente seguro real para restauração |
| Gateway financeiro/cobranças/confirmação operacional | Fora desta fase; há apenas preparação opcional, exige futura autorização |

Limitações conhecidas:

- Trava transacional global prioriza consistência e revogação no MVP, limitando paralelismo. Não removê-la sem novo desenho/testes.
- Gateway limita por usuário/IP em memória de um processo. Limites distribuídos e proteção de perímetro precisam ser configurados e homologados antes de uso real. A política de quotas do banco complementa, mas não substitui esses controles.
- Gateway fornecido escuta somente loopback. Sua futura hospedagem/reverse proxy, TLS, origens e CSP são decisões de Marcelo. O servidor de demo nunca deve ser publicado.
- Perda completa da sessão e do link não pode ser resolvida digitando telefone. Recuperação manual/verificada pela futura equipe não foi antecipada. Preenchimento ainda não salvo pode ser perdido ao recarregar a página.
- Não há limpeza automática de objetos órfãos, retenção operacional final nem remoção retroativa de arquivos já baixados; preparar rotina autorizada e política antes de lançamento. Não executar exclusões automáticas inseguras.
- Sem chat, atendimento em tempo real, conclusão de serviço automatizada, campanhas ou recuperação comercial. Ajuda usa apenas informações públicas aprovadas e informa a futura integração.
- Preparação financeira não cria reservas aguardando pagamento. O contrato futuro exige expiração explícita; a implementação efetiva deve testar liberação de capacidade e callbacks antes de ativação.

As instruções completas, inclusive testes HTTP e duas conexões SQL, estão em `phase-4-homologation.md`. O registro para preencher é `phase-4-external-report-template.md`. Guias e ferramentas da Fundação/Empresa permanecem preservados.

## 6. Parecer de encerramento

A Fase 4 está entregue para revisão e continuidade do **DESENVOLVIMENTO**, com resultados locais documentados. **Não pode ser declarada homologada em Supabase real nem pronta para lançamento enquanto as validações externas críticas permanecerem pendentes.** Essas pendências não impedem nova fase de desenvolvimento se Marcelo a autorizar expressamente.

Nenhum serviço foi publicado. Nenhum pagamento real foi processado. **Parar e aguardar aprovação antes de iniciar a Fase 5.**
