> **LEGADO — anterior à revisão de acesso empresarial (026).** Preserve como histórico. Para instalação/login/primeiro acesso atuais, siga `docs/access/upgrade.md` e `docs/access/demo.md` (caminhos relativos à raiz do projeto). Convite por e-mail não é mais o fluxo operacional. Não reaplique migrations antigas.

# Demonstração local — Fase 7

Use Node.js 22.12+ com npm. Windows: abrir `INICIAR-DEMO.cmd` dentro de `foundation`. Se npm não for reconhecido, instalar Node com npm e PATH e reabrir terminal. Linux/macOS: `sh iniciar-demo.sh`. Alternativa: `npm ci` e `npm run dev:demo`. A primeira instalação exige internet; a execução não exige Supabase real. Aguarde aparecer Local e abra http://127.0.0.1:5173/empresa/ms-auto-ficticia. Não abrir index.html diretamente nem publicar no Pages para testar.

Empresa B: `/empresa/horizonte-ficticio`. Login em `/entrar`: admin@example.invalid, adminb@example.invalid, agenta@example.invalid, backup@example.invalid, agentb@example.invalid, shared@example.invalid ou root@example.invalid; qualquer senha **fictícia** não vazia. Root acessa `/admin/metricas`; admin A → empresa → Métricas e resultados. Consumidor navega sem login e recebe sessão simulada quando necessário.

A demo é exclusivamente loopback: cliente Supabase real da aplicação → emulação HTTP/Auth local → PGlite com migrations completas. Não usar como autenticador real ou expor na rede. SELECT administrativo limitado é parametrizado e executado com papel/RLS do chamador. Chave e endpoints locais substituem explicitamente configuração real. Imagens em memória. Parar com Ctrl+C e iniciar novamente recria os dados; links anteriores deixam de existir. Reabrir página pública e, se necessário, sair/limpar dados do site local.

A massa acrescenta 24 interesses aos dois exemplos anteriores, com empresas, consumidores e cinco origens fictícios, três modalidades de preço, rascunhos, propostas, aprovações, reservas, perdas, resoluções e tentativas. Transições usam RPCs existentes. Apenas fixtures locais ajustam datas de criação/vencimento e inserem mensagens com horários exemplificativos para coortes/SLA; históricos imutáveis não são reescritos nem triggers desligados. Não há arrays de KPIs no frontend.

A falha reportada da Fase 6 era CORS: `content-profile` enviado pelo cliente Supabase não constava nos cabeçalhos permitidos. O navegador bloqueava o POST e mostrava “Seu atendimento / Não foi possível concluir”. A demo agora aceita content-profile/accept-profile, mantém origem restrita e preserva defaults omitidos de RPC. O teste anterior de POST direto não cobria preflight. A nova suíte de navegador não intercepta HTTP e verifica páginas, solicitações, métricas e administração.

Isso não é homologação de Auth/PostgREST/Storage externo. Usar exclusivamente dados fictícios; nunca inserir credenciais ou dados pessoais reais na demo.
