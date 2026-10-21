# SYZIA 056-HF01 — Convites compactos

21/10/2026 · Base oficial confirmada pelo GitHub conectado: `RM2627/syzia-platform`, `main`, commit `8f061f0002e4a7d7db54927628382686a1cb90f3`. Checkout novo e branch local `syzia-056-hf01-invitations`. Nenhum push, merge, commit, deploy ou acesso a serviços de produção.

## Resultado e limite importante

A interface foi simplificada e validada. **O envio funciona localmente para destinatários que já possuem autorização vigente registrada para a finalidade escolhida. Não foi implementado um novo fluxo simplificado de registro de autorizações.** Sem esse registro, geração de link e envio continuam bloqueados, com orientação visível. Portanto esta entrega não declara que novos interessados estejam prontos para receber convites somente por terem sido cadastrados.

O contrato atual de `commercial_contact_authorize` exige aviso informado, evidência, autorização explícita e validade. Não existe no contexto recebido pela tela uma política aprovada da qual esses valores possam ser obtidos legitimamente. O hotfix não cria versões de aviso, não atribui prazos fictícios, não converte seleção em consentimento e não interpreta inclusão de e-mail como autorização. A adaptação desse registro contextual continua pendente de definição específica. Não há procedimento novo de SQL manual para contornar essa exigência.

A mesma exigência hoje vale no backend para links individuais e e-mails, por meio de `commercial_invite_for_contact` e `commercial_mail_eligible`. O hotfix preserva essa regra; não criou um caminho alternativo de emissão sem autorização.

## Alterações pontuais

| Antes | Depois |
|---|---|
| Preparação extensa em cada cartão | Somente um campo e um botão quando o e-mail está ausente |
| E-mail repetido no formulário mesmo já cadastrado | Endereço existente exibido e reutilizado automaticamente |
| Campos de aviso, evidência e validade; declaração de interesse no cartão | Removidos da tela; nenhuma dessas informações é fabricada ou gravada automaticamente |
| Métricas gerais e vários textos repetidos acima dos convites | Foco em finalidade, filtro, seleção, links e envios; métricas continuam nas outras seções |
| Cartões e ações com alinhamento irregular | Hierarquia de destinatário/empresa/endereço, situação clara e ações alinhadas |
| Histórico longo ocupando toda a página | Histórico e convites emitidos em seções recolhíveis com contagens, sem modal |
| Ação “Revisar destinatários” pouco explícita | “Enviar selecionados”, seguida da confirmação de destinatários já existente |

A seleção individual, múltipla e geral continua considerando somente elegíveis e evita duplicar o mesmo e-mail no lote. A confirmação antes do envio é preservada. Cada link continua individual, com demonstração e versão publicada vinculadas pelo servidor. Revogação, validade, supressão, idempotência, reenvio incerto e permissões permanecem nos contratos originais.

O interesse real em testar continua podendo ser registrado pela etapa comercial existente em **Interessados**. O hotfix não o marca ao escolher “Ativação”. Sem manifestação registrada, a tela explica o bloqueio. O botão de revogação também reflete a permissão `can_manage`; a autorização server-side permanece intacta.

## Arquivos

Três arquivos de aplicação:

- `src/platform-commercial/InvitationPreparation.tsx`: reduzido ao preenchimento pontual de e-mail ausente; apenas chama `commercial_contact_save` com `{ email }`.
- `src/platform-commercial/Management.tsx`: apresentação compacta, mensagens de bloqueio, ações e histórico. Fluxos de outras seções preservados.
- `src/platform-commercial/commercial-management.css`: estilos restritos a `.commercial-invitations`, incluindo responsividade e foco.

Três arquivos de teste existentes atualizados:

- `tests/demo-browser/commercial056.spec.ts`: substitui passos dos formulários removidos por cenários de contato bloqueado e autorização previamente registrada **somente na fixture local**. Mantém a jornada de ativação anterior e acrescenta recusa direta pelo backend, links distintos, revogação e teclado.
- `tests/support/commercial056-integrity.mjs` e `tests/commercial-056/integrity.test.mjs`: encadeiam as transições do hotfix sem editar os manifests históricos.

Adicionados: manifesto e verificador de integridade HF01, dois testes específicos de integridade, este relatório e guia de integração. Inventário completo com SHA-256 no pacote. Nenhuma migration ou dependência nova.

## Validação executada

| Validação | Resultado |
|---|---|
| Instalação pelo lockfile (`npm ci --no-audit --no-fund`) | PASS; lockfile intacto |
| Build/typecheck | PASS |
| Controle comercial existente + contratos de UI | 28/28 PASS |
| Integridade 056 na base limpa antes do hotfix | 3/3 PASS |
| Integridade 056 + HF01 após alterações | 5/5 PASS |
| Navegador integrado | 1/1 PASS |
| Aplicação/reversão do patch em checkout limpo e build | PASS; log no pacote |

A jornada de navegador verificou: pré-cadastro mínimo preservado, vinculação automática, e-mail ausente, inclusão pontual, formulário de autorização ausente, nenhum consentimento criado, emissão e prévia recusadas pelo backend sem autorização; depois, autorização fictícia prévia inserida **exclusivamente pelo código do teste**, seleção individual/múltipla/geral, remoção da prévia, cancelamento, lote confirmado com remetente simulado, histórico, dois links distintos, revogação, finalidade de ativação independente, login/retomada e solicitação de análise. Não houve e-mail externo.

Inspeção visual e ausência de overflow em 1440, 390 e 360 px; foco por teclado verificado. O navegador utiliza os componentes reais com Auth/SQL/e-mail locais simulados; não comprova entrega por SMTP real nem homologação publicada. As regressões usam PGlite descartável com a cadeia existente, sem conexão ou aplicação de migrations em Supabase/Neon.

Os testes de integridade preservam as transições antigas e continuam rejeitando alteração de conteúdo ou predecessor desconhecido. LF/CRLF é aceito somente para texto autorizado. Todos os arquivos de servidor, migrations, autenticação, financeiro, ativação e ambiente demonstrativo foram comparados ao commit oficial. Nenhum foi modificado.

## Pendências preservadas

1. **Registro contextual de novas autorizações:** ainda não disponível no fluxo compacto. Exige fonte legítima para os dados obrigatórios e definição do procedimento; até lá, não emitir links nem enviar para quem não possui registro vigente. A configuração do remetente SMTP, sozinha, não remove esse bloqueio.
2. Infraestrutura de e-mail real, entrega, domínios e produção: não configurados nem testados nesta rodada.
3. Pendências anteriores da 056 — vinculação ao primeiro solicitante na ativação e divergência histórica de integridade 055 — não foram reabertas nem corrigidas neste hotfix. O gate completo não foi repetido e não recebe declaração de PASS.

A entrega é um hotfix de interface com comportamento condicionado às autorizações existentes. Mercado Pago, assinaturas, trial, materialização, RLS, permissões server-side e hotfixes anteriores permanecem preservados. Nenhuma publicação foi realizada.
