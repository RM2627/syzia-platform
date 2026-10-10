# SYZIA 034 — diagnóstico e decisões

Base exclusiva: entrega consolidada 033. Antes de alterar, os 1.424 arquivos do manifesto 033 foram verificados por SHA-256. A solicitação integral está em `request.md`. Não houve conexão a serviços externos, reset de banco real ou deploy.

## Credenciais

A 033 já implementava reserva idempotente, Auth, hash de código temporário, expiração, ativação, reemissão e retomada. `Instructions` apresentava a entrega como e-mail, direcionava para `/entrar` e incluía campos empresariais até para pessoas sem vínculo. O provisionamento empresarial tentava SMTP automaticamente depois de concluir Auth.

A 034 retorna entrega manual por padrão, depois da finalização existente. Consulta o nome nas mesmas visões autorizadas. A credencial permanece somente no retorno da emissão e na memória da tela. O link abre `/ativar-acesso`, preenche usuário e contexto pelo fragmento e remove o fragmento após leitura. O segredo temporário nunca vai no link, query string, localStorage ou cadastro consultável. O contexto `SYZIA` é o contexto pessoal já existente, não uma organização artificial.

Perda ou expiração usa `access_reset` existente: novo hash/validade, invalidação do código/prova anterior e revogação das sessões conforme regras anteriores. Não cria pessoa, Auth, vínculo, empresa, trial ou papel. Pessoas reservadas precisam usar Retomar provisionamento. Após erro, a tela atualiza as reservas; não apresenta credencial antes da conclusão.

A rota histórica `/access/resend` e o adaptador SMTP são preservados para compatibilidade e testes, com as mesmas autorizações e limites. A interface atual de criação/retomada/geração de novo código não chama essa rota nem o SMTP. Não foi introduzida dependência de um canal de comunicação externo.

## Gateway e mídia

O diagnóstico informado pelo proprietário prevalece: `VITE_ATTACHMENT_GATEWAY_URL=http://127.0.0.1:8787` estava correto; o processo do gateway estava parado. Após `npm.cmd run attachments:dev`, logo e capa funcionaram. Isso não comprova defeito no Supabase Storage.

Foram inspecionados upload/reserva/finalização, sanitização server-side, bucket privado, referências imutáveis e snapshots de rascunho/publicação. O enquadramento pode persistir como **nova variante processada**, através do mesmo upload. Não é indispensável guardar parâmetros adicionais no banco.

Fluxo: ler imagem pela autorização existente → enquadrar localmente → exportar WebP até 1.600 px de largura, sem ampliar a resolução do recorte → reservar/enviar/sanitizar/finalizar pelo gateway existente → substituir apenas a referência no formulário → salvar rascunho → revisar/publicar. Cancelamento ou falha conserva a referência anterior; a publicação não muda até a confirmação existente. A sanitização e os limites do servidor continuam obrigatórios.

A mesma geometria do recorte dirige a prévia e a exportação. Controles: arraste com mouse/toque, zoom de 1× a 3×, posição horizontal/vertical por teclado ou slider, centralização, salvar e cancelar. A alteração é destrutiva **na nova variante**, não no arquivo anterior publicado. Para recuperar conteúdo fora de um recorte já salvo, é necessário reenviar o original; essa limitação aparece na interface. Não foi criado editor, bucket ou banco de mídia paralelo.

| Uso | Regra |
|---|---|
| Logo | `contain`, dimensões naturais limitadas ao espaço disponível; sem círculo, borda de avatar ou corte de lettering. Horizontal, quadrada e vertical. |
| Capa | Área 4:3 em todos os tamanhos; recomendação 1600×1200; imagens em outras proporções aceitas e ajustáveis. |
| Serviço | Área 3:2, recomendação 1200×800; recorte próprio; imagem e fallback usam a mesma área. |
| Portfólio — única | Composição integral, altura proporcional limitada, `contain`. |
| Portfólio — antes/depois | Duas áreas equivalentes 4:3, imagens inteiras; orientação para ângulo/distância comparáveis. |
| Portfólio — galeria | Miniaturas 4:3 consistentes e visualização ampliada integral existente, com navegação. |

Formatos de entrada preservados: JPEG, PNG, WebP; até 5 MB. O fluxo de publicação e o componente público também são usados na prévia. Nenhuma policy, grant ou configuração do bucket foi alterada.

## Landing

Preservados marca, hero, direção escura/violeta, navegação, tipografia, cards, planos publicados e CTAs. A explicação interativa resumida foi substituída por timeline de um dia ilustrativo; essa é uma demonstração de conteúdo, não uma automação.

Novos destaques: problemas cotidianos, benefícios concretos, operação solo/equipe/apoio condicionado, página pública, financeiro, controle e FAQ. A FAQ de avaliação usa a mesma consulta real de planos; não fixa quantidade de dias ou oferta inexistente. O estado vazio e a indisponibilidade seguem caminhos distintos. A tela da página empresarial foi capturada nesta versão em ambiente local fictício e comprimida em WebP, com carregamento tardio e dimensões reservadas. Não é um mockup inventado.

Nenhuma afirmação de receita automática, aprovação como pagamento, contabilidade, lucro projetado, SLA ilimitado, integração externa homologada ou garantia de resultado foi acrescentada.

## Banco e autorização

Sem migration 034. Migrations 001–033, Storage SQL, regras de Auth/RLS/grants e lockfile permanecem byte-identical. A 034 deve ser aplicada sobre um banco atualizado até 033, sem reaplicar ou editar essas migrations.

As restrições anteriores permanecem: gestão global de identidades autorizada; administrador empresarial limitado a suas organizações; suporte global a empresa com ADM respeita as autorizações já definidas na 029. Nenhum membership artificial foi criado para conceder acesso global.
