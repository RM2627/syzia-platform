# Guia de homologação externa — Fase 4: Consumidor

**Situação da entrega: PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Este guia prepara a execução por Marcelo. Não houve conexão a Supabase real, configuração de provedor, publicação, contratação ou uso de clientes reais. Testes locais com PGlite/Auth simulado não certificam GoTrue, PostgREST, Storage nem concorrência de processos PostgreSQL independentes.

O projeto continua dividido em DESENVOLVIMENTO autorizado por fase, HOMOLOGAÇÃO EXTERNA preparada e PRODUÇÃO/LANÇAMENTO exclusivos de Marcelo. Não iniciar a Fase 5 sem autorização. Os guias anteriores continuam válidos: `homologation-guide.md` e `phase-3-homologation.md`.

## 1. Projeto de teste e ordem dos arquivos

1. Escolher/criar pessoalmente um projeto Supabase dedicado, sem dados reais. Não reutilizar o banco real da MS Auto Details e não ativar plano pago para este roteiro.
2. Conferir as migrations já aplicadas; executar apenas as faltantes, em ordem. Projeto vazio: `202609150001_foundation.sql`, `202609150002_authorization.sql`, `202609150003_commands.sql`, `202609150004_company_schema.sql`, `202609150005_company_commands.sql`, `202609160006_consumer_schema.sql`, `202609160007_consumer_commands.sql`, `202609160008_consumer_attachments.sql`, `202609160009_consumer_presence.sql`, `202609160010_payment_preparation.sql`.
3. Conferir extensões `pgcrypto` e `btree_gist` no schema `extensions`. A 006 solicita ambas. Se uma já estiver em outro schema, interromper e revisar a instalação/extensão no projeto de teste; não remover constraints nem alterar search_path global para contornar erro. Verificar suporte GiST/exclusion no PostgreSQL do projeto.
4. Executar `supabase/storage/consumer-private.sql` e `supabase/storage/company-media.sql` uma vez. É separado porque o harness SQL local não imita as tabelas internas do Storage. Confirmar bucket privado e policy restritiva. Reexecução deliberada exige verificar a policy existente, não abrir o bucket.
5. Executar `scripts/homologation/consumer-inspect.sql`. Resultado esperado: **41 tabelas públicas com RLS/FORCE RLS**, 41 policies SELECT; nenhuma policy de INSERT/UPDATE/DELETE nas tabelas do produto. Seis RPCs do gateway executáveis somente por `service_role`; anon somente projeções públicas previstas (incluindo FAQ da Fase 3).
6. Preservar bootstrap restrito e contas de teste da Fundação. Não conceder papel a consumidor anônimo. Criar duas empresas fictícias, com administradores distintos, manual aprovado e página habilitada em `/painel/:orgId/consumidor`.

## 2. Auth, aplicação local e CAPTCHA

- Copiar `.env.example` para `.env.local`; preencher **somente URL do projeto de teste e chave publishable/anon**, gateway local e, quando configurado, sitekey pública de Turnstile. Nenhuma service role ou senha de banco em variável VITE.
- Executar `npm ci`, `npm run dev`. Site URL: `http://127.0.0.1:5173`; redirects exatos `/entrar` e `/atualizar-senha`, conforme guia da Fundação. Não cadastrar domínios de produção neste roteiro.
- Ativar Anonymous Sign-Ins no Auth para a sessão técnica do consumidor. Anônimo usa o papel PostgreSQL `authenticated`, mas não recebe papéis administrativos. A Fundação continua exigindo confirmação de e-mail e rejeitando usuários anônimos.
- Verificar navegação sem sessão; nova sessão somente ao enviar pedido ou resgatar link. Conferir chaves de sessão separadas entre equipe e consumidor. Repetir expiração/refresh/logout e troca de dispositivo.
- Repetir cadastro/login/recuperação de e-mail da Fundação com e-mail de teste. SMTP, entrega, confirmação e limites reais continuam pendentes até configuração por Marcelo.
- Configurar Turnstile no provedor e a secret no Supabase Auth. Preencher apenas sitekey no frontend. O componente suporta token em cadastro/login/recuperação e criação de sessão do consumidor; renovação e resgate de link em dispositivo novo também precisam ser homologados. Não desligar CAPTCHA para facilitar um teste que deve exercitá-lo. Permitir somente hostnames de teste apropriados; nunca uma chave secreta no frontend.
- Validar ausência, expiração, reuso e token inválido de CAPTCHA. O teste local não executa o provedor real. Configurar limites de Auth/IP e monitorar criação de sessões; o limite SQL de 10 solicitações/hora por usuário não substitui controle de criação de usuários.

Referências oficiais consultadas: [sessões anônimas Supabase](https://supabase.com/docs/guides/auth/auth-anonymous), [CAPTCHA Supabase](https://supabase.com/docs/guides/auth/auth-captcha), [widget Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/). A validação de CAPTCHA fica no Auth; o componente apenas encaminha o token.

## 3. Gateway e Storage privados

1. Copiar `.env.server.example` para `.env.server`, fora de versionamento; preencher URL, chave pública e service role do **mesmo projeto dedicado**. `CONSUMER_ORIGIN` deve ser a origem local exata. Executar `npm run attachments:dev`. O gateway escuta apenas em `127.0.0.1:8787`.
2. Conferir no navegador que somente a chave pública e JWT do próprio usuário aparecem. Service role fica no processo Node. Não habilitar acesso direto de clientes ao bucket. As funções `consumer_gateway_*` e `consumer_finalize_attachment` não podem ser invocadas com JWT de consumidor/admin de empresa.
3. Enviar JPEG, PNG e WebP válidos; verificar regravação, remoção de EXIF/metadados, orientação e hash do resultado. Testar SVG/PDF/GIF renomeado, MIME divergente, arquivo truncado, imagem animada, >5 MB, mais de 5 imagens, lado >8.000 pixels e >20 milhões de pixels.
4. Testar falha entre reserva/upload/finalização/envio. Reservas pendentes expiram em 15 min. Reenvio do mesmo upload não substitui objeto já finalizado; download/hash permite reconhecer reenvio idêntico após falha de resposta. Objeto pendente órfão não é exposto. Limpeza de órfãos exige inspeção e execução do operador; nenhuma exclusão automática nesta fase.
5. Consumidor B deve falhar ao reservar/baixar anexo de A, mesmo com código conhecido. Link revogado/expirado ou empresa suspensa deve negar nova leitura. Testar também revogação do membro administrador antes de baixar.
6. Cada leitura usa ticket de 256 bits, hash persistido, 60 s de validade, vinculado ao usuário/anexo, uso único e autorização reavaliada. Tentar outro usuário, segundo uso e expiração. Gateway devolve bytes `no-store`/`nosniff`, sem caminho de Storage para o navegador.
7. O projeto deliberadamente não devolve URLs assinadas do Storage ao consumidor. URLs já assinadas podem continuar válidas até expirar; o gateway evita essa janela nas novas operações. O `blob:` local existe apenas após leitura autorizada e é revogado pela interface. Bytes já recebidos por um destinatário não podem ser recolhidos retroativamente.
8. Confirmar limites do processo/reverse proxy local e resposta a rajadas. Limite em memória: 30 acessos/minuto por usuário por processo. Antes de qualquer futura publicação, Marcelo deve decidir limite global/IP, dimensionamento e observabilidade sem logar Authorization, corpo de pedidos ou fragmentos de links.

Referências: [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals), [downloads e URLs assinadas](https://supabase.com/docs/guides/storage/serving/downloads). A inspeção local cobre o validador de imagens e o contrato SQL, não o serviço real.

## 4. HTTP/PostgREST com sessões reais

Preparar manualmente dois consumidores fictícios em perfis de navegador separados; usar o mesmo telefone fictício para validar que isso não concede identidade. Capturar os JWTs válidos das próprias sessões apenas para arquivo local de teste. Preparar também JWT do administrador A. Não gravar esses tokens em prints, relatórios, repositório ou ZIP.

Copiar `scripts/homologation/consumer.example.json` para `.homologation/consumer.json`. Preencher referência exata, chave pública, tokens e slugs fictícios distintos; marcar `testOnlyAcknowledged: true` e `realCustomerData: false` somente após conferir o projeto dedicado. O runner verifica cada token via Auth `/user`; decodificação local serve apenas para rejeição antecipada, não autentica.

```sh
npm run homologation:consumer:read
npm run homologation:consumer:mutations
```

O primeiro verifica projeções, acesso indevido e proibição de escrita direta. O segundo cria dois pedidos fictícios, testa preço adulterado, idempotência, telefone igual, RLS via JWT, link limitado/revogação e duas requisições HTTP paralelas concorrendo pela mesma vaga. Os relatórios usam apenas nomes/status/códigos sanitizados. As solicitações de teste permanecem para inspeção; não há limpeza destrutiva automática. Estado técnico da rodada fica em `.homologation/consumer-state.json`, fora do pacote.

O runner não é certificação completa. Repetir manualmente e registrar:

- Admin A/colaborador/atendente não altera dados de B, permissões, preço ou papel por REST direto. Revogar vínculo e repetir sem trocar JWT.
- Navegar `empresa B` nunca retorna manual, notas, regras, autonomia, contatos de exceção ou IDs internos. Publicação nova exige ação explícita; rascunho não muda página.
- Serviço/add-on desativado no meio do fluxo é recusado; preço/publicação alterados exigem revisão. Empresa suspensa para operações públicas e acessos privados.
- Repetir envio e aprovação com a mesma chave e chave diferente; apenas um efeito. Mesma chave com payload alterado deve falhar.
- Enviar duas propostas finais: versão anterior recusada. Enviar uma versão com validade curta e esperar vencer: aprovação recusada. Não desabilitar trigger de imutabilidade para simular expiração.
- Tentativa de mutação de versão enviada/itens deve falhar. Atualização legítima gera nova versão.
- Contato opcional, revogação e histórico; ausência de marketing automático. Validar experiência de perda de rede e retomada de rascunho com imagens prontas.
- Link de consulta não pode aprovar/cancelar; link de gerenciamento pode agir somente no pedido vinculado. Resgate único, segredo errado, outro pedido, expiração, revogação e suspensão precisam ser testados.
- Validar Storage e tickets conforme seção anterior; não considerar essas verificações realizadas pelo runner HTTP genérico.

## 5. Concorrência PostgreSQL com conexões independentes

Após o runner de mutações, cancelar as reservas de teste pela interface. As duas solicitações devem permanecer enviadas, sem reserva ativa. O script requer estado gerado pela rodada HTTP, JWTs ainda válidos e conexão SQL do projeto de teste. Preferir endpoint direto ou pooler em modo sessão; transações longas/locks devem ser compatíveis com o modo escolhido.

Definir `CONSUMER_TEST_DATABASE_URL` de forma local e privada; não registrar valor no terminal compartilhado ou relatório. TLS verifica o certificado. Executar:

```sh
npm run homologation:consumer:concurrency
```

O script confere PIDs de backend distintos, segura a trava na conexão A, dispara B, confirma que B aguarda, confirma A e exige que B receba `23P01`. Depois testa remarcação para intervalo ocupado mantendo a reserva anterior. Reservas confirmadas ficam para inspeção/cancelamento pela interface.

Também repetir os roteiros concorrentes das Fases 2/3, suspensão/revogação intercalada com contratação, criação simultânea de bloqueio/reserva, propostas concorrentes com revisão esperada e duplo envio. A trava global compartilhada preserva a sequência de autorização, mas limita paralelismo no MVP. Não removê-la sem novo desenho e validação. A exclusão GiST permanece a última defesa mesmo fora das RPCs.

Referência: [range types e exclusion constraints PostgreSQL](https://www.postgresql.org/docs/current/rangetypes.html).

## 6. Backup, restauração e operação futura

- Preservar migrations, configurações sem segredos, código, lockfile e manifesto em versionamento privado escolhido por Marcelo.
- Seguir estratégia da Fundação para dump PostgreSQL/restore em **outro projeto descartável**, nunca sobrepor o ambiente de origem. Verificar opções disponíveis no plano escolhido sem ativar cobrança automaticamente.
- Incluir dados de clientes fictícios, solicitações, propostas congeladas, consentimentos, idempotência, agenda, tokens/grants e auditoria. Tokens já expirados não devem recuperar validade após restauração; conferir relógio e expiração.
- **Backup de banco não substitui backup dos objetos Storage.** Exportar bucket privado com credencial server-side de teste e manifesto de caminho/hash/tamanho. Armazenar separado e protegido; restaurar objetos antes de validar anexos prontos.
- Restaurar também configurações necessárias de Auth/Storage/RLS/CAPTCHA de forma controlada; segredos ficam fora do dump de código e exigem gestão própria. Repetir testes críticos após restauração.
- O teste nativo/externo e restauração real permanecem pendentes se não houver projeto/conexão/recursos seguros. Não chamar a cópia do ZIP de teste de recuperação de banco.
- Não há envio automático de e-mail, WhatsApp API, pagamentos, confirmação financeira, central de atendimento ou automação da Fase 6. “Preciso de ajuda” usa apenas os canais públicos aprovados e explica a indisponibilidade da futura conversa.

## 7. Critério de aceite externo

Preencher `phase-4-external-report-template.md` com ambiente/ref (sem segredos), migrations efetivas, configurações, evidências, resultados individuais, falhas/correções e limitações. Somente considerar homologada externamente após passar Auth, HTTP/RLS, Storage, links/tickets, agenda, concorrência independente, revogação em sessão existente e controles de abuso aplicáveis. Registrar a situação de restauração separadamente.

**A entrega de arquivos não autoriza lançamento. Não fazer deploy para este roteiro. Não iniciar a Fase 5 sem aprovação de Marcelo.**


## 8. Ampliação: identidade, portfólio e preparação financeira

Repetir todos os casos de `tests/presence-payments.test.mjs` com JWTs reais e registrar evidências. Conferir publicação explícita de logo/capa/cores/catálogo/portfólio, rascunhos invisíveis, HTML/CSS/JS recusados, antes/depois com duas imagens e limites de galeria. Tentar usar código/UUID/caminho de anexo privado como mídia empresarial: rejeição obrigatória. Testar imagem de B em A, mídia não publicada, retirada publicada e suspensão; nenhum objeto privado vira público por conhecer um ID.

Testar recorrência no mesmo dispositivo, novo usuário com mesmo telefone, outra empresa, consentimentos desmarcados, origem/indicação/notas/tags internos e timeline sem eventos inventados. Recusar proposta atual/válida, repetir recusa, tentar versão antiga ou pedido de outro consumidor.

Regras financeiras continuam em `preparation_only`. Validar RLS A/B, cálculo de sinal fixo/percentual, precedência por serviço, valor adulterado, versão incorreta, FK cruzada, confirmação manual distinta de automática e schema sem PAN/CVV. Preparar plano não pode criar cobrança, confirmar pagamento ou bloquear agendamento. Não conectar gateway, criar Pix/cartão real ou executar webhook para homologar essa preparação. A integração financeira efetiva exige nova fase/autorização.
