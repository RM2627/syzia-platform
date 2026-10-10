# Presença pública, contexto e mídia — Fase 4

A página mantém um design-base; não é um construtor livre. `company_branding` permite logo/capa validados, cinco cores principais de contraste controlado e ordem de categorias/serviços. Nome, descrição, contatos, regiões, horários e formas de pagamento continuam vindo do manual aprovado da Fase 3. `portfolio_items` permite até 30 trabalhos por empresa, título, descrição até 600 caracteres, serviço opcional, ordem, ativação e 1–4 imagens; antes/depois exige exatamente duas.

## Publicação e segurança

Salvar personalização/portfólio cria ou altera rascunhos. “Publicar dados aprovados” cria nova publicação imutável que combina o manual aprovado com a projeção permitida da identidade e portfólio. O consumidor continua vendo a versão anterior até essa ação. Desativar empresa/página corta novas operações/leitura pública de imagens imediatamente. A retirada de um item do portfólio precisa ser publicada; o estado inativo em rascunho não altera um snapshot já aprovado.

Não há HTML, CSS ou JavaScript arbitrários. As propriedades aceitas são whitelist; a cor é enum, aplicada por classes CSS; texto é escapado por React. IDs internos, notas, autonomia, regras privadas, tags, origem e indicação não fazem parte da projeção pública. Identificadores públicos são referências, nunca credenciais.

## Duas classes de imagem sem conversão automática

- Anexos de consumidores: tabela `attachments`, bucket privado `consumer-private`, código `f_…`, ticket temporário + JWT + autorização por solicitação.
- Imagens de apresentação: tabela `company_media`, bucket **também privado** `company-media`, código `m_…`. Upload/finalização/prévia exigem administrador da empresa. O endpoint público `/media/m_…` consulta `consumer_gateway_public_media` server-side e transmite somente mídia referenciada pela publicação atual de uma empresa ativa/habilitada. Nunca recebe códigos de anexos `f_…` como alternativa.

Ambos passam por validação de assinatura, decodificação/regravação JPEG/PNG/WebP, remoção de metadados, limite de 5 MB, 8.000 pixels por lado e 20 milhões de pixels; imagens animadas não são aceitas. Até 150 imagens empresariais no MVP, incluindo prontas/pendentes válidas. O arquivo `supabase/storage/company-media.sql` prepara o bucket e a policy restritiva; execução real permanece pendente.

Imagens publicadas não usam URLs diretas do Storage. O gateway usa `no-store` para reavaliar publicação/suspensão a cada nova leitura; conteúdo já baixado não pode ser recolhido do dispositivo. O inventário limita quantidade e tamanho, mas exclusão/limpeza de órfãos será operação inspecionada do responsável, não tarefa destrutiva automática.

## Recorrência, origem e indicação

`consumer_returning_profile` preenche nome/WhatsApp/e-mail somente quando já existe sessão válida e cadastro dessa mesma identidade na mesma empresa. Não abre nova sessão apenas para preencher um formulário, não usa telefone como chave e não persiste PII de formulário em localStorage. Consentimentos continuam desmarcados e precisam ser revistos a cada pedido. Campos permanecem em memória durante falha de conexão; recarregar a página antes de salvar pode perdê-los.

A origem é declaratória e opcional: Instagram, Google, indicação, WhatsApp, direto, outro ou desconhecida. `opportunity_context` é interno; não é atribuição complexa, rastreador ou campanha. Origem não se torna prova de identidade.

`customer_context` contém tags simples, horário preferido, nota operacional, origem/contexto e referência opcional a outro cliente **da mesma empresa**. Somente administradores autorizados veem/editam. Autoindicação e referência a outra empresa são recusadas. Nenhuma recompensa, saldo, carteira ou automação é criada.

`consumer_work_context` reúne pedido, consumidor, versões, respostas, agenda, origem, histórico, contexto e próxima ação derivada para futura Central. Hoje é restrito ao administrador; a Fase 5 deverá integrar autorização efetiva dos atendentes em cada operação sem ampliar grants por conveniência.

## Orçamento e timeline

O acompanhamento exibe empresa, itens congelados, respostas, observações, valores, validade, versão e estado. Aprovação e recusa exigem a versão final atual/válida e são idempotentes. Recusa preserva versões e não apaga histórico; nova proposta cria nova versão. O administrador pode registrar início de análise, gerando evento real. A timeline lista somente eventos efetivamente gravados, sem “serviço realizado” fictício, etapas futuras concluídas ou eventos de outro consumidor.
