# SYZIA 049 — Documentos, imagens e WhatsApp

## Documentos privados

“Baixar orçamento em PDF” consulta `consumer_document` com código da solicitação, tipo e referência exata. A RPC autoriza consumidor associado ou usuário empresarial com escopo de orçamento e leitura de valores; seleciona versão enviada real. Preços, descontos, itens, totais, estado e emissão vêm do banco. O navegador apenas formata. Estimativa, proposta enviada/aprovada/recusada/expirada e versão substituída têm textos distintos. Nenhuma estimativa se torna proposta aprovada por download.

“Baixar comprovante” exige agendamento canônico `booking/confirmed` ligado à solicitação/empresa. Agendamento inexistente, não confirmado ou cancelado é rejeitado no banco, mesmo com botão ou referência adulterada. O PDF identifica versão, emissão, data, horário, fuso, serviços, local/região e instruções cadastrados. Informa consultar o estado atual após alterações. Não declara pagamento, quitação, nota fiscal ou presença física. Uma cópia antiga já baixada não pode ser remotamente revogada; por isso, versão e data constam do documento.

A marca principal é a empresa: nome, logo válido e cor primária. Logo WebP é convertido localmente para PNG, preservando compatibilidade com PDF; sem logo válido, usa nome. Texto escuro sobre branco mantém contraste e impressão monocromática. Fonte DejaVu embarcada, licença incluída; acentos e quebras de página testados. Biblioteca livre `pdf-lib` + `@pdf-lib/fontkit`, carregada sob demanda. Sem serviço pago, PDF armazenado no servidor, URL pública permanente, QR fictício ou telefone privado no documento. Abrir o arquivo baixado permite imprimir pelo leitor PDF do dispositivo.

## Imagens da solicitação na ficha

A ficha consulta as fotos `ready` da solicitação vinculada, com organização exata. Miniaturas têm carregamento, erro/retry, ampliação em modal e origem. O download usa a infraestrutura existente e ticket de 60 segundos, vinculado ao usuário e de uso único. Cada retry pede novo ticket. URLs `blob:` são locais e revogadas na desmontagem. Nenhum arquivo é duplicado no Storage.

A autorização da Agenda foi adicionada somente à leitura da mídia vinculada à ficha; não concede poderes de upload. Acesso de Atendimento exige também visibilidade da conversa. Testes negam empresa B, funcionário sem grant, ticket de outro usuário e reutilização. Dados antigos sem imagens mostram estado vazio.

Foi encontrada uma divergência concreta: a interface não oferecia upload depois do agendamento confirmado, mas `consumer_reserve_attachment` e o gateway ainda permitiam alguns pedidos diretos cujo estado permanecia `submitted`. A 049 verifica a existência de agendamento confirmado na reserva e na escrita do gateway. Assim, a regra solicitada é aplicada server-side; leitura das imagens existentes permanece disponível.

## WhatsApp e telefone

O contato é obtido por RPC após autorização da solicitação, consentimento existente e autonomia de WhatsApp. O número nunca é colocado em página pública, analytics ou PDF. Número legado ausente/inválido ou sem consentimento não bloqueia operação: a ação fica indisponível com orientação.

O atalho usa somente `https://wa.me/`, telefone validado, aba separada e `noopener noreferrer`. “Enviar orçamento pelo WhatsApp” consulta a versão canônica, prepara texto com empresa, referência, situação e valor; depois oferece abrir o WhatsApp para revisão. O operador confirma o envio e anexa manualmente o PDF baixado. Não há disparo automático, API paga, marketing, URL privada de PDF ou token de acompanhamento na mensagem.

Validação front/back aceita DDD brasileiro válido, fixo de dez dígitos ou celular de onze, formatos comuns e `55`; remove apenas formatação. Internacional exige `+` e código do país, com formato E.164 compatível. Formato válido não comprova existência de linha nem conta WhatsApp. Texto arbitrário, incompletos, DDD inexistente e repetições evidentes são recusados. Telefone vazio continua com as regras anteriores de cada fluxo; nenhum dado legado foi regravado em massa.

## Evidências e limites

049-D01–D06, T01–T03 e B01 cobrem autorização, versão/preço, desconto, PDF multipágina com acentos/textos longos, logo WebP, download responsivo, ficha com fotos e WhatsApp manual. O pacote separado de evidências contém somente dados fictícios da 049. Impressão foi conferida pela renderização PDF; não foi usada impressora física. Dispositivos móveis foram emulados no Chromium; Safari/iOS e hardware físico permanecem homologação do proprietário.
