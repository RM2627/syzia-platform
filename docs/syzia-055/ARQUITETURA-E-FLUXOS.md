# SYZIA 055 — arquitetura e fluxos

Referência: main `61fa6d2f745128f7763850e64060fd818c7bf74f` (054). A 055 acrescenta contratos comerciais; não substitui o checkout, o sistema de permissões ou o configurador operacional.

## Fronteiras

| Superfície | Autoridade | Dados | Efeitos permitidos |
|---|---|---|---|
| Gestão SYZIA | JWT original, sessão válida, grants comerciais e proprietário do registro/Super Admin | Supabase operacional, tabelas comerciais privadas | Preparação, vínculos, revisão, publicação e convites autorizados |
| Configurador embutido | Sessão demonstrativa de edição + JWT original validado no servidor a cada ação | Banco demonstrativo exclusivo | Configuração fictícia usando componentes/RPCs reais |
| Visitante | Token demonstrativo opaco, geração e prazo válidos | Uma organização demonstrativa por sessão | Operações locais permitidas, sem financeiro ou administração real |
| Ativação | Autenticação real, análise de vínculo pelo Super Admin, aceite da configuração, identidade e termos existentes | Nova organização técnica pendente | Checkout existente, ainda sem trial/capabilities por mera criação |
| Materialização | Serviço server-side; contrato local confirmado pelo motor financeiro existente | Organização pendente correspondente e versão imutável | Importação transacional somente da configuração permitida |

O iframe utiliza `postMessage` com origem exata, janela emissora, canal e identificador de requisição. O JWT administrativo permanece no documento pai. O servidor não aceita um ID de operador enviado pelo cliente como identidade. Os antigos RPCs de edição que reconstruíam claims sem `session_id` deixam de ser executáveis. `private.access_session_valid` permanece intacta.

## Preparação e publicação

1. O administrador informa nome e validade. O servidor gera/reserva slug único sob lock, normaliza caracteres, trata colisões e rejeita nomes reservados. Interessado e plano são opcionais/ausentes na criação.
2. O configurador real é aberto dentro da Gestão Comercial. Componentes `Company`, `CompanyPage`, `PublicCompany`, atendimento e agenda são reutilizados com transporte demonstrativo.
3. Salvar exporta somente os campos permitidos e grava o rascunho. Retomar reutiliza a instância de edição. O snapshot operacional do rascunho permite reconstruí-la se necessário; alterações ainda não salvas não constituem uma versão aprovada.
4. Revisar executa a validação de publicação existente e valida o grafo de referências. A interface apresenta o conteúdo e exige confirmação antes da publicação.
5. Publicar cria versão imutável, fixa hash e congela os bytes das mídias. Editar o próximo rascunho não altera a configuração pública atual. Nova publicação incrementa a geração, invalidando sessões e convites da geração anterior.

Estados: `draft` → `ready` → `available`; suspensão impede resolução pública. A validade é verificada server-side em todas as entradas. `expired`, `archived` e `revoked` são compatíveis com o modelo, mas esta entrega não acrescenta um comando de arquivamento nem um job para alterar o rótulo para `expired`; o bloqueio por data independe do rótulo.

## Interessados e convites

Interessados são independentes. A relação demonstração/interessado é N:N, com autorização sobre ambos. Cada convite tem destinatário, finalidade, versão, token criptograficamente aleatório armazenado por hash, expiração e revogação. Os tokens cifrados para reenvio continuam server-side. Link demonstrativo e convite de ativação são diferentes.

O envio preserva a infraestrutura de e-mail da 054, autorização por finalidade, descadastramento, prévia dos destinatários, confirmação explícita do lote, limite, deduplicação e resultados individuais. Timeout de envio fica incerto; não há reenvio automático de ativações. Abertura, acesso, envio e entrega não viram aceite ou pagamento.

## Ativação e finanças

O interessado autentica-se, solicita análise de vínculo e aguarda decisão auditável do Super Admin. Depois revisa a versão preparada e usa o self-service existente para dados, plano, termos e checkout. O vínculo aprovado é condição necessária; posse do link ou controle do e-mail não bastam.

`commercial_claim_complete` cria uma única organização técnica pendente e registra a versão/claim/plano para materialização. Não copia dados demonstrativos nesta etapa. Preços, elegibilidade de trial, 7 dias, tolerância, cancelamento, upgrades/downgrades, payer_email, snapshots e HMAC continuam sob os componentes financeiros existentes e preservados.

A importação exige contrato corrente com provider_id, estado `trialing`/`active` e entitlement de software válido. Esses estados são confirmados pelo motor financeiro existente; o navegador não é autoridade. A interface pode solicitar nova verificação, e o runtime comercial busca materializações pendentes a cada 60 segundos, sem executar cobranças, criar assinaturas ou substituir a reconciliação financeira.

## Conteúdo materializado

Permissões de importação: apresentação, identidade visual, categorias, serviços, adicionais, regras, horários, perguntas/formulários, FAQ, respostas rápidas, portfólio, template e checklists previstos no contrato `syzia-config-054`. O formato permanece compatível. A validação rejeita campos, tabelas e referências externas ao snapshot.

IDs são gerados novamente e referências remapeadas. Mídias são verificadas por SHA-256/MIME e copiadas para `<organização>/commercial/<claim>/<sha>.<ext>`; conflito com bytes diferentes é recusado. Configuração, estado final e evento de auditoria são gravados em uma transação. Falha reverte a importação; novas tentativas não duplicam organização, assinatura ou configuração.

Não são copiados clientes, solicitações, reservas, funcionários, grants, usuários, sessões, tokens, credenciais, contratos ou histórico financeiro. A página real não é publicada automaticamente. O responsável revisa e publica pelos controles existentes.

A organização técnica guarda sua configuração inicial. Antes da importação, o mesmo lock usado pelos comandos empresariais protege a comparação: se o responsável já alterou a configuração, a materialização é recusada com `commercial_destination_changed`. Nada é sobrescrito. Essa situação exige revisão específica; não há botão que force a perda de alterações ou substitua silenciosamente o snapshot aprovado.

## Capacidade, origem e retenção

`demo.usesyzia.com.br` é apenas destino planejado. Para testes, origens loopback distintas são explícitas. `.env.demo.example` limpa integrações de Auth/financeiro operacionais. `VITE_COMMERCIAL_APP_ORIGIN` deve ser a origem exata da gestão que incorpora o editor; CORS/CSP e `frame-ancestors` precisam ser homologados na hospedagem futura.

O perfil demonstrativo não é plano comercial: sem preço, trial ou assinatura, com limites técnicos próprios e indicação de que recursos variam por plano. O banco exige marcador exclusivo e schema 55; um banco operacional não atende a esse marcador.

Padrões: 60 minutos por sessão, 200 visitantes simultâneos, 1.000 instâncias acumuladas, pool de 4 conexões e 128 MiB de mídias congeladas. Sessões e blobs de visitantes expirados são limpos; organizações expiradas ficam suspensas. O histórico relacional e mídias congeladas de versões não são apagados automaticamente. Atingir capacidade bloqueia novas instâncias. Uma política de retenção/rotação do banco demonstrativo deve ser aprovada e homologada antes de exposição pública prolongada; este pacote não contém um expurgo destrutivo indiscriminado.

Memória e carga de uma instância de hospedagem não foram medidas nesta execução. Dimensionar Node, pool, banco e armazenamento com ensaio de carga isolado; não inferir capacidade de produção dos testes PGlite.
