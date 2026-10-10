# SYZIA 033 — atualização da 032, sem reset

Esta entrega é desenvolvimento local. A aplicação da atualização e a homologação do ambiente do proprietário são etapas separadas. Não houve deploy, conexão a Supabase real, cobrança ou envio real de e-mail.

## Instalação já na 032

1. Preserve o projeto anterior, as configurações locais e um backup restaurável do banco. Confira que a instalação está na 032; não reaplique migrations antigas.
2. Compare os arquivos 001–032 com `docs/syzia-033/migrations-001-032.json`. O consolidado mantém esses arquivos byte a byte.
3. Aplique **somente** `supabase/migrations/202609240033_acquisition_selfservice_finance.sql`, com a mesma função administrativa usada nas migrations anteriores. É uma transação incremental. Não use reset nem edite o histórico.
4. Atualize frontend e gateways para o código deste pacote. Reutilize seus `.env` e `.env.server`, que não acompanham o ZIP. Instale as dependências com `npm ci` e execute `npm run build`.
5. Reinicie os processos locais de frontend, plataforma e mídia. Reautentique as sessões usadas para validar a nova escolha de contexto. Não apague identidades, vínculos ou dados empresariais.
6. No ambiente de homologação autorizado, reproduza o roteiro abaixo com contas e empresas fictícias. O ZIP e o build não publicam a aplicação.

Instalação local nova: siga as migrations na ordem 001–033 e os guias já existentes. Quem já está na 032 aplica apenas a 033.

## O que muda no banco

- Três controles explícitos nos planos: visibilidade no site, self-service e oferta de trial self-service. Todos começam desligados para planos existentes; nenhuma oferta antiga é publicada por inferência.
- Leads/eventos globais e grants de aquisição; rascunhos retomáveis, comprovantes de método fictício e consentimentos self-service.
- Recorrências/ocorrências financeiras, quatro grants específicos e projeção das despesas previstas na consulta financeira existente.
- Resolução de identidade e troca de contexto sobre Auth, enterprise_accounts e enterprise_sessions existentes. Não há membership artificial para Super Admin.
- Wrappers das funções existentes preservam suas verificações; tabelas novas têm RLS/FORCE RLS e não permitem escrita direta do cliente. Funções internas não são atalhos públicos.
- Nenhum registro empresarial antigo é apagado, resetado, convertido em lead ou cadastrado novamente.

## Configuração local

- `VITE_PLATFORM_API_URL`: endereço acessível do gateway da plataforma. `PLATFORM_APP_ORIGIN`: origem exata do frontend, incluindo protocolo e porta.
- `VITE_ATTACHMENT_GATEWAY_URL`: endereço acessível do gateway de mídia. `CONSUMER_ORIGIN`: origem exata autorizada para a interface.
- `VITE_SUPABASE_URL` e `SUPABASE_URL`: mesmo projeto. Chave pública/anon somente no frontend; credencial privilegiada somente no servidor. `SUPABASE_PUBLISHABLE_KEY` serve o cliente Auth isolado no gateway.
- Se Captcha já é usado, preserve `VITE_TURNSTILE_SITE_KEY` e a configuração Auth correspondente. Login e cadastro reutilizam o componente existente.
- `VITE_PUBLIC_SITE_URL` é opcional. Deixe vazio até a definição do domínio; canonical só é emitido com origem HTTPS configurada. Não existe domínio definitivo inventado.
- Confirmação de e-mail do self-service segue Auth. Configure, quando autorizado, o retorno para `/cadastrar` na origem correta. Uma identidade não confirmada não cria empresa nem trial.

`npm run diagnose:033` lê apenas a configuração local e mostra verificações booleanas, sem valores de chaves. `npm run diagnose:033 -- --probe` consulta somente `/health` em localhost/loopback, com a origem configurada. Saúde HTTP não comprova credencial Auth, bucket, policies nem comunicação com Supabase. O diagnóstico não realiza chamadas ao ambiente externo.

## Planos, pagamento e trial

A Administração continua sendo o local de configurar versões/preços reais do catálogo. Ative explicitamente **ativo**, **disponível comercialmente**, **visível no site** e **self-service**, conforme a decisão comercial. Duração e periodicidade vêm da versão. A oferta de trial é um controle próprio.

**INTEGRAÇÃO DE PAGAMENTO REAL PENDENTE.** `server/platform.mjs` não injeta adaptador comercial de pagamento. O botão da etapa de pagamento informa indisponibilidade e preserva o rascunho nesse ambiente. Não habilite mock em ambiente de clientes para contornar a integração.

`npm run dev:demo` usa exclusivamente PGlite/fixtures descartáveis e um adaptador identificado como fictício. Somente essa demonstração publica planos fictícios e habilita mock. A migration não faz isso. A RPC não aceita uma declaração de pagamento enviada pelo navegador; exige vínculo de método validado no servidor, revisão, prazo da proposta, plano atual e consentimento.

Contratação sem trial está preparada como cadastro salvo, sem ativação, aguardando integração de cobrança. Inelegibilidade para trial permanece em revisão, sem contornar o histórico antifraude. Não há concessão automática substituta. Trial manual, extensão, isenção e suporte conservam as regras/auditorias existentes.

A rotina service-only `selfservice_billing_due` é um contrato de simulação explícita, sem agendamento de cobrança real. Prepara uma fatura pendente no fim do trial; só evento de pagamento confirmado ativa a assinatura. Cancelamento anterior ao vencimento impede essa fatura. Falha conserva o billing para regularização e bloqueia novas operações conforme entitlements. Suspensão administrativa continua auditada; não foi inventado prazo automático de tolerância. Regularização usa os eventos e estados existentes. Dados e histórico são mantidos; a página pública retorna mensagem neutra de indisponibilidade.

**DECISÃO DE PRODUTO PENDENTE:** provider, retries, tolerância, cancelamento após conversão, reembolso/proporcionalidade, preços/regras finais, domínio e dados jurídicos. Não divulgar cobrança real antes dessas definições e da homologação própria.

## Diagnóstico da homologação informada

O evento `49eb147f-3216-43eb-b20a-5434651d31bc` demonstra uma falha na etapa `auth_identity`; isoladamente não identifica a causa. O catch antigo descartava categoria/status/motivo. O novo log preserva apenas motivos permitidos e correlação, sem senha, token, código temporário, documento ou resposta bruta do provider.

Ao reproduzir com autorização, correlacione o novo request_id com os logs de Auth: projeto das chaves/URLs, validade/escopo da credencial server-side, disponibilidade, erro de criação/recuperação e eventual conflito de e-mail. Use **Retomar provisionamento** na mesma identidade reservada. Não exclua pessoa/empresa para repetir. O servidor verifica o ID reservado, recupera a Auth existente quando possível e só emite código temporário após a finalização necessária. E-mail existente exige autenticação ou vínculo explícito à pessoa existente.

Para mídia, o erro de conexão informa falha navegador→gateway; não prova defeito em uma policy de Storage. Confira endereço, processo, origem/CORS, protocolo acessível e projeto das credenciais. Preserve `company-media` privado e `supabase/storage/company-media.sql`. Fluxo: reserva → autorização de sessão/organização → sanitização de imagem → upload privado → finalização → leitura autorizada. Tipos: JPEG/PNG/WebP, limite 5 MB e controles de dimensão existentes. Remover uma referência não apaga mídia histórica de publicações.

Recusa de autorização continua bloqueando a ação. Registre RPC, request_id disponível, organização, categoria/status e estados de sessão/ADM/suporte/capacidade, sem capturar credenciais. Super Admin sem ADM usa autorização global própria; com responsável, valem as regras de suporte da 029/032. Usuários empresariais permanecem limitados a vínculos ativos e grants.

## Roteiro de homologação do proprietário

1. Site, catálogo publicado, contato e lead global; confirmar que contato não cria Auth/empresa/trial.
2. Self-service: identidade nova/existente, colisão editável de username, abandono/retomada, plano, documento, etapa de pagamento e consentimento; ao concluir a simulação, aceite legal e checklist empresarial original.
3. Login por identidade com uma/várias empresas, equipe global e Super Admin; código empresarial para username ambíguo; troca de contexto e isolamento.
4. Provisionamento administrativo, falha Auth, retomada, código temporário, senha definida pelo titular, invalidação e reemissão. Não usar senha definitiva definida pelo administrador.
5. Recorrência R$700: previsão, confirmação de pagamento, retry, edição futura, cancelamento e grants sem acesso indevido a consolidados.
6. Trial manual sem pagamento, cancelamento antes da primeira cobrança, falha/regularização e bloqueio público neutro. Distinguir execução simulada de provider real.
7. Logo, capa, serviço e portfólio: enviar/ler/recarregar/trocar/remover no gateway real quando autorizado. Verificar também a matriz de cores e a sidebar em desktop/celular.

Não existe migration de downgrade destrutivo. Em falha de aplicação antes do commit, corrija a causa e reaplique a 033 inteira. Depois do commit e de novas escritas, não remova tabelas ou restaure backup às cegas; preserve os dados e prepare correção incremental autorizada. Restauração real e concorrência PostgreSQL nativa não foram executadas nesta rodada.
