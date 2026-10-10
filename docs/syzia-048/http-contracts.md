# Inspeção dos contratos HTTP — 048

A inspeção foi feita na base 047 antes da extração dos handlers. Plataforma, Anexos e Billing já possuíam fábricas testáveis. A 048 conserva o corpo das rotas e extrai as funções de request; os construtores históricos passam a envolver essas mesmas funções com `http.createServer`.

- Plataforma: Origin exato, OPTIONS, lista explícita de POST /access, body de 4096 bytes, Bearer encaminhado ao serviço existente e tratamento `safeAccessError`. O runtime empresarial não habilitava /invitations/send simultaneamente com /access; a composição preserva isso.
- Anexos: Origin exato, exceção GET público sem Origin, Auth getUser antes de ler session_id do JWT, RPC access_media por empresa, headers de privacidade, Storage privado, reencodificação Sharp, proteção de retry/conteúdo por SHA-256. Limites existentes: 5 MiB e 20 milhões de pixels. A limpeza de janelas expiradas do limiter passou do timer solto para a própria consulta ao limiter, sem mudar quantidade/janela.
- Billing: Origin exato nas rotas de browser, notificações server-to-server sem essa exigência, 16 KiB, limitador de requests, tratamento por códigos seguros. Autorização, preços, confirmação, leases e reconciliação continuam no núcleo 047 intacto. POST /billing/config permite somente objeto vazio e retorna chave pública; não é endpoint de segredos.
- As entradas locais usam loopback e portas próprias. A entrada nova escuta uma porta por PORT, reutiliza todos os handlers e oferece ciclo de vida de hospedagem. O handler não registra body/Authorization/query.
- Timeouts dos listeners anteriores eram os defaults do Node. O listener comum explicita headers 15 s, body 60 s, inatividade 90 s e keep-alive 5 s; o timeout financeiro continua no adaptador 047.

O teste unificado injeta o mesmo motor de billing com SQL PGlite e provider fictício, e usa Auth/Storage fictícios com o sanitizador real para verificar os contratos pela porta única. As regressões antigas exercitam os construtores separados. Não se equiparam esses transportes à homologação externa.
