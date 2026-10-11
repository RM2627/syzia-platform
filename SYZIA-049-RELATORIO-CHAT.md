# SYZIA 049 — Chat

O chat existente continua usando as mesmas conversas, RPCs de envio, autorização, rate limits e chaves de idempotência. Não há segundo sistema de mensagens nem envio automático.

## Alterações

- Componente de histórico compartilhado entre consumidor e empresa: agrupamento, remetente, horário, quebras de linha e palavras longas.
- Rola ao final na abertura, quando já próximo do final ou após mensagem própria. Quem lê conteúdo antigo mantém a posição e recebe botão “Nova mensagem · ir ao final”.
- Enter envia em computador com ponteiro fino; Shift+Enter quebra linha. Composição IME e evento 229 não enviam. Em dispositivo touch, Enter não é capturado para envio; há botão explícito.
- Envio tem trava imediata. O consumidor retém corpo e chave em falha de rede incerta, oferece “Confirmar envio anterior” e recupera a operação sem duplicação. A empresa preserva seu fluxo de rascunho e retry já existente.
- Polling já existente passou a encadear a próxima consulta após o término da anterior e pausar em abas ocultas. Conversa do consumidor: 15 s; contexto empresarial: 12 s; fila: 15 s. Nenhum WebSocket ou push novo.
- Erro transitório preserva histórico exibido; perda de autorização retira o contexto. Autorização continua obrigatória em cada consulta/envio.
- Leitura só é marcada quando o final da conversa está efetivamente visível, na aba visível; rolar mensagens antigas não limpa as novas. Marcador por usuário; Home e fila não marcam leitura.

## Imagens

Mantidos ticket privado, consulta autorizada, objeto local temporário e revogação de URL ao encerrar. Na ficha há miniaturas/ampliação das fotos originais; no Atendimento, a abertura autorizada das imagens continua disponível. Não foram adicionados novos uploads depois de um agendamento confirmado. A migration fecha a divergência da reserva server-side descrita no relatório de documentos.

## Testes e limites

Testes 049-U01/U02 validam leitura independente, reconexão e cursor monotônico entre abas, sem leitura cruzada. 049-B03/B04 verificam IME, teclado touch, pausa em aba oculta e ausência de sobreposição. 049-B02 exercita histórico longo, teclado, autoscroll, nova resposta, retry e indicadores. Suítes existentes da Central continuam no gate. Não afirmamos recibo de leitura pelo cliente, presença física, push ou entrega instantânea: atualização depende do intervalo e da conexão. Abas visíveis diferentes podem consultar separadamente; abas ocultas suspendem seu polling. Mensagens anteriores à 049 começam não lidas para cada usuário, pois não existia histórico confiável de leitura para migrar.
