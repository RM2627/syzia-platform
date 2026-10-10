# SYZIA 040 — matrizes de validação

## Planos/capabilities

Os quatro perfis abaixo foram criados como fixtures locais por meio do configurador/RPC real de planos. Não são dados de produção nem uma atualização automática das ofertas existentes. Os testes obtêm os IDs/versões persistidos; a implementação nunca decide capacidades pelo nome do plano.

| Perfil testado | Básicos¹ | Financeiro | Métricas | Follow-up | Membros | `human_support` |
|---|---|---|---|---|---|---|
| Essencial | Sim | Não | Não | Não | 1 | Não |
| Profissional | Sim | Sim | Sim | Sim | 3 | Não |
| Equipe | Sim | Sim | Sim | Sim | 8 | Não |
| Assistido | Sim | Sim | Sim | Sim | Configurável; fixture 5 | Sim |

¹ Página pública, portfólio, clientes, solicitações, atendimento próprio, propostas, agenda, pendências, equipe e configurações, sempre sujeitos à permissão do usuário e às regras operacionais existentes.

| Camada | Evidência local |
|---|---|
| UI e rota | Teste browser 02: sessão do ADM real com aplicação/troca pelo Super Admin; painel sinalizado, Financeiro/Métricas/Comercial bloqueados ou disponíveis e Central básica independente de Follow-up. |
| RPC | SQL 09: `billing_capabilities`, `permissions_context`, financeiro e métricas para as quatro versões. |
| RLS | SQL 09 e 31: registros financeiros ocultos no perfil sem recurso; retomada após upgrade sem apagar linhas. Regressão 039 cobre escrita direta e A/B. |
| Limites | SQL 10 bloqueia nova inclusão ao atingir teto; regressão 039 verifica terceiro/quarto membro, ilimitados, cotas humanas, mudanças efetivas e versões antigas. |
| Vigência e restauração | SQL 07/15/27/28 e regressão 039: assinatura/isenção preservadas, suspensão, expiração e ausência de assinatura mantêm as regras existentes. |

Trial é derivado de `trial_days`: foram testados 7 e 11 dias para provar que não há número/nome/preço hardcoded. O destaque comercial é um metadado da oferta e não cria versão contratual.

## Papéis, grants e escopos

| Pessoa/condição | Pode consultar | Pode operar | Limite/negação testada |
|---|---|---|---|
| Super Admin global | Cadastro global, planos e Equipe SYZIA | Aplicar/trocar/encerrar homologação; gerir identidade/credencial global | Homologação não concede membership nem contorna a autorização de suporte para operação privada da empresa. |
| ADM da empresa A | Áreas de A permitidas pelo plano | Configuração, equipe local, atendimento e operação conforme capacidades | Sem acesso B; sem edição de plano global ou credencial de equipe SYZIA. |
| Colaborador sem grant | Somente áreas explicitamente autorizadas | Não ganha atendimento pelo papel | `clients.read` ausente nega rota/RPC; `central.manage` ausente nega claim com causa específica. |
| Colaborador autorizado | Central conforme `central.read` | Claim/resposta com grants de gestão/resposta e elegibilidade | Revogar grants afeta a próxima RPC; transferência exige destinatário elegível. |
| Atendente próprio | Conforme grants locais | Atendimento próprio se autorizado | Não depende de `human_support`; não ganha métricas/administração automaticamente. Só leitura não torna a pessoa elegível para assumir. |
| Equipe SYZIA global | Cadastro/áreas globais concedidas | Atendimento apenas quando atribuído e autorizado | Não vira membro empresarial. Apenas Super Admin gere identidade, reset e suspensão global. |
| Atendente SYZIA atribuído | Empresa atribuída conforme grants e plano | Dentro da autonomia publicada e teto do papel | Requer `human_support`. A/B independentes. Remover capacidade bloqueia ações e suspende atribuições. |
| Financeiro com escopo restrito | Somente registros no escopo permitido | Só ações concedidas | Grant fora do teto é recusado; valores são redigidos sem permissão. |
| Consumidor | Própria solicitação ou link autorizado | Conforme acesso de gestão; versão correta da proposta | Sem dados internos, notas internas ou cross-tenant. Revogar link/sessão impede novas ações. |
| Suspenso/desativado/revogado | Revalidação server-side | Bloqueado conforme estado/grant | Não basta permanecer com uma tela aberta; cada RPC/RLS revalida. |

## Cobertura do pedido 040

| Cenários do documento | Suítes/evidências |
|---|---|
| 1–3 Trial elegível, usado, análise | SQL 02–06, 29–30; browser 07; histórico/consentimento e nenhuma fatura. |
| 4–5 Plano de homologação e ausência de cobrança | SQL 07–08, 27–28; browser 02. |
| 6–8 Planos, mudança em sessão e papel/grant/escopo | SQL 09–10, 13, 15, 18, 24, 31; regressão 039; browser 02/09. |
| 9 Destaque | SQL 11; browser 01; exclusividade, selo, foco e reduced motion. |
| 10 Cliente imediato | SQL 25: cliente antes da proposta/claim, recorrência sem duplicação; browser 09 explica falta de permissão. |
| 11–13 Fila, colaborador, próprio | SQL 12–14, 19–20; browser 09. Conflito de revisão testado sequencialmente; concorrência real pendente. |
| 14–18 Pedido único/múltiplo e modos de preço | Regressão 038: preço fixo/a partir de/consulta, adicionais, respostas, original imutável, relações e redação de valores. |
| 19 Proposta/decisão | Regressão 038: envio, idempotência, revisão, aprovação/recusa, versão obsoleta e visões conectadas. |
| 20–24 Agenda | SQL 17; regressão 038 (duração multi/final); browser 04/05 (aprovação, sem horários, erro de transporte simulado, confirmar/remarcar/cancelar). |
| 25–28 Equipe SYZIA, identidade global, human_support | SQL 15, 21–24, 26, 32; browser 03. |
| 29 Marca publicada claro/escuro | SQL 16; browser 04/06; inspeção visual e contraste dos cards de acompanhamento. |
| 30 Manual português | Browser 08; busca por chave original e label traduzido. |
| 31–32 A/B e revogação em sessão | SQL 13/16/23/24/26/31; regressões 038/039; browser 02/09. |
| 33 Build/typecheck | `reports/syzia-040/build.log` e `bundle.log`. |
| 34 Upgrade populado | SQL 01: 117 tabelas anteriores comparadas; integridade das 36 migrations e 23 arquivos da marca. |

As imagens anexadas à solicitação continuam sob o mecanismo de autorização existente. Não foi inventado um vínculo por serviço que o modelo não possui. Combinações já incluídas/incompatíveis são recusadas na seleção conforme a 038; combinações que exigem revisão permanecem visíveis e preservadas.
