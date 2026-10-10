# Atualização 031 → 032

Esta entrega é para homologação pelo proprietário. Não houve deploy nem conexão com o projeto real.

1. Preserve um backup e as configurações atuais. Confirme que 001–031 estão aplicadas; compare o manifesto `migrations-001-031.json`.
2. Sobre a instalação 031, aplique **somente** `supabase/migrations/202609220032_syzia_people_experience.sql`. Não resete o banco nem reaplique migrations históricas.
3. Atualize juntos frontend e gateways Node deste pacote. A interface nova depende das RPCs 032. Preserve variáveis de ambiente e segredos somente no servidor.
4. Instale com `npm ci`; valide `npm run build`. Para desenvolvimento local fictício: `npm run dev:demo`.
5. Testes desta rodada: `npm run test:syzia` e `npm run test:syzia:browser`. O navegador usa Chromium instalado ou `FOUNDATION_CHROMIUM_PATH`.
6. Homologue pessoa sem empresa, futuro ADM, vínculos múltiplos e desvínculo; equipe global com permissões mínimas; plano com/sem atendimento compartilhado; operação solo; configuração da agenda; identidade clara/escura; mídia e revalidação do Super Admin sem ADM.

A migration é transacional, mantém registros existentes e não exclui auditoria. Não há rollback destrutivo automático: após criação de contas pessoais, voltar a exigir organização em toda conta exigiria planejar tratamento dessas contas. Não tente reverter removendo pessoas ou histórico.

## Diagnóstico de mídia no ambiente do proprietário

- `VITE_ATTACHMENT_GATEWAY_URL` precisa apontar para o gateway de mídia disponível ao navegador, com transporte compatível com a aplicação. `CONSUMER_ORIGIN` deve corresponder exatamente à origem autorizada; não usar curinga.
- `SUPABASE_URL` e as chaves do servidor precisam pertencer ao mesmo projeto da aplicação. A chave privilegiada permanece exclusivamente no gateway.
- Confira o bucket privado `company-media`, MIME JPEG/PNG/WebP e 5 MB, conforme `supabase/storage/company-media.sql`. A policy deliberadamente proíbe acesso direto de anon/authenticated. Não a remova para corrigir upload: leitura/escrita passam pelo gateway.
- Confira a sequência `consumer_reserve_company_media` → gateway → `access_media`/autorização → sanitização → upload Storage → finalização → leitura.
- Os logs do gateway registram operação, categoria, motivo seguro e status; a reserva/RPC no frontend registra também organização quando `VITE_AUTH_DIAGNOSTICS=true` (ou em desenvolvimento). Não capturar cabeçalhos/tokens, corpo de login ou códigos temporários.
- Reproduza logo, capa, imagem de serviço e portfólio: enviar, ler, trocar, remover a referência. Mídias de publicações antigas permanecem preservadas.

## Diagnóstico do alerta de autorização

O cenário local de Super Admin sem ADM foi exercitado em três ciclos de RPC e três ciclos de focus/timer no navegador, sem membership artificial e sem recusa. A mensagem real anterior não foi reproduzida. Para identificar a causa externa, registre **qual RPC** recusou, organização, status e categoria, além do estado do responsável/suporte/sessão/capacidade no momento. Verifique se frontend, gateway e migrations são da mesma versão.

Uma falha de imagem é exibida no controle de imagem; não revoga o acesso empresarial. Uma recusa explícita de sessão/permissão continua bloqueando operação. Não esconda recusa real nem habilite acesso universal. Desative diagnóstico adicional depois de concluir a coleta necessária.
