# Instalação, build e preparação de lançamento futuro

**Somente Marcelo decide e executa publicação/produção.** Nenhuma etapa deste guia foi executada externamente. Não usar fixtures, servidor de demonstração, clientes reais ou banco real da MS nesta homologação.

1. Extrair o ZIP; guardar todos os arquivos do diretório `foundation`; versionar em repositório escolhido por Marcelo. Conferir `MANIFEST.json` e manter secrets fora do Git.
2. Instalar Node compatível, executar `npm ci`; para inspecionar sem contas externas, `npm run dev:demo`. Encerrar com Ctrl+C.
3. Para desenvolvimento com Supabase dedicado, aplicar migrations em ordem, configurar Auth e os dois buckets privados conforme guias das Fases 4 e 5. Preencher `.env.local` apenas com valores públicos e `.env.server` com os segredos do servidor.
4. `npm run test:local` e `npm run build`. Build estático fica em `dist/`; migrations e gateway não são executados por esse comando. Testes nativos/externos devem ser registrados separadamente.
5. Antes de futura publicação, concluir homologação de Auth, RLS, Storage, concorrência, links, abuso e recuperação. Escolher hospedagem do frontend e runtime Node do gateway. Site estático sozinho não processa imagens com segurança. O gateway permanece ligado a loopback, destinado a ficar atrás de proxy autorizado; não expor service role nem o bucket.
6. Preparar fallback de SPA para `/empresa/:slug`, `/acompanhar/:code` e demais rotas. `vercel.json` é um exemplo histórico de configuração, não implantação; pode ser adaptado pelo responsável a outro host. Não usar o servidor de fixtures.
7. Definir CSP com origem exata do gateway em `connect-src` e `img-src`; preservar `blob:` para imagens privadas carregadas após autorização. Se Turnstile for escolhido, permitir somente `https://challenges.cloudflare.com` em `script-src`/`frame-src`, conforme documentação do provedor. Não liberar `unsafe-eval`, scripts arbitrários, origens wildcard de upload ou chaves privilegiadas.
8. Habilitar TLS, `no-referrer`, `nosniff`, `frame-ancestors 'none'`, logs sem tokens/segredos/PII, backups de banco **e** objetos, limites de Auth/IP e gateway. Definir retenção/limpeza de órfãos e gestão de credenciais pelo responsável.
9. Revisar conteúdo empresarial e autorizações de imagem; publicar snapshots aprovados. Revalidar preços, fuso Recife, capacidade, prazos e consentimentos. Somente dados fictícios até concluir ambiente apropriado por decisão de Marcelo.
10. Pagamentos integrados continuam desativados: a preparação da Fase 4 não autoriza conectar gateway, processar dinheiro ou activar plano pago. Uma futura fase precisará implementar e homologar fluxos financeiros sem impor o uso do gateway às empresas.

Não iniciar Fase 6 automaticamente, mesmo que todos os testes locais passem.
