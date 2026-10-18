# Homologação pendente — comercial 054

Esta entrega autoriza revisão local; não comprova operação publicada. D01-A, D02 e D09 estão implementadas, não aguardam nova decisão de produto. A integração final e qualquer uso externo continuam condicionados à homologação.

## Navegador — não executado nesta rodada

A ferramenta de navegador exigida pelo ambiente de execução não estava disponível. Conforme a skill Sites, não foi iniciado preview nem usado um mecanismo alternativo. Testes de contrato TypeScript, SQL e build não equivalem a estas provas visuais.

Executar em ambiente local isolado, banco demonstrativo próprio, identidades e destinatários fictícios, transportes externos desativados. Registrar cada caso nas larguras 1440, 390 e 360 px, quando aplicável:

| Caso | Resultado necessário |
|---|---|
| Super Admin e operador comercial | Grupo Gestão Comercial no workspace oficial; carteira correta; navegação mantém sidebar R2. |
| Administrador de empresa assinante | Grupo ausente e acesso direto às rotas/RPCs recusado. |
| Interessados | Criar/editar Instagram, contato, finalidade e prazo; ver histórico; descadastrar; sem falso avanço por envio. |
| Editor demonstrativo | Abrir preparação com link temporário; editar com os componentes reais; publicar snapshot; sessão antiga invalidada. |
| Templates | Ver os quatro layouts; rascunho não altera página publicada antes da confirmação original. |
| Visitante | Abrir slug; nenhum login de produção; escolher serviço; registrar aceite direto; encontrar o mesmo registro no painel. |
| Orçamento | Em serviço configurado para avaliação, produzir e aprovar proposta pelo fluxo real, sem tornar isso obrigatório ao aceite direto. |
| Agenda e atendimento | Executar estados permitidos pelos grants e disponibilidade reais; nenhuma reserva no banco operacional. |
| Equipe demonstrativa | Criar pessoas fictícias e testar limite de plano; nenhuma criação no Auth real. |
| Isolamento | Duas abas/visitantes e duas empresas: registros e imagens separados; reload mantém somente a própria sessão; sessão vencida/revogada recusa alterações. |
| Imagens | Logo, capa e portfólio: upload, recorte, download, versão e importação apenas após aprovação. |
| Convites | Individual, seleção filtrada, selecionar todos elegíveis, remover destinatário, prévia, confirmação e resultados individuais; nenhum e-mail real. |
| Ativação | Link → autenticação → reivindicação → revisão Super Admin → aprovação da configuração → cadastro restrito → checkout existente. |
| Revisão alterada | Mudança de snapshot/expiração/revogação exige novo vínculo válido; nenhuma liberação silenciosa. |
| Financeiro | Trial e acesso somente com provedor simulado confirmado; timeout não duplica contrato; status real alimenta indicador. |
| Teclado | Tab/Shift+Tab, foco visível, formulários com labels, avisos compreensíveis, diálogo devolve foco; sem armadilhas. |
| Mobile | Sem overflow horizontal, botões legíveis, sidebar abre/fecha, tabelas acessíveis, logo sem retângulo preto. |
| Resiliência | API indisponível, erro SQL, mídia ausente, expiração e reconexão não deixam spinner infinito nem inventam sucesso. |

Executar o gate padrão completo após essas verificações. As 11 etapas de navegador existentes permanecem no comando normal; a rodada não as remove nem substitui.

## PostgreSQL e operação

O servidor nativo não pôde iniciar neste container por restrição de mapeamento de usuário não-root. PGlite executou o SQL real, mas não comprova contenção simultânea entre várias conexões do PostgreSQL hospedado.

Validar locks/revisões, dois operadores, duas ativações, dois envios concorrentes, reinício da API durante fila e timeout SMTP. Confirmar recuperação conservadora como resultado incerto, sem reenvio automático. Ensaiar limite de instâncias, sessões expiradas, armazenamento e rotação do banco de demonstração. Nenhum benchmark de RAM, throughput ou hospedagem foi aprovado.

## Antes de qualquer uso externo, em rodada autorizada

- Infraestrutura exclusiva, usuário de banco com escopo restrito e backups/retenção próprios da demo.
- Homologação do incremento e autorização específica para migration 054.
- Canal comercial, aviso de finalidade, consentimento e retenção confirmados pelo proprietário.
- SMTP autorizado e teste consentido posterior; esta entrega não comprova recebimento externo.
- Origens exatas, HTTPS, certificado e fallback SPA no futuro `demo.usesyzia.com.br`.
- Revisão do procedimento de rotação da chave de convites e manutenção do banco descartável.
- MP-01 e outras pendências financeiras externas anteriores preservadas. Nenhuma compra ou assinatura externa foi feita.
