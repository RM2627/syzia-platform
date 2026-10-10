# Rodada 033 — diagnóstico e decisões de implementação

Base: árvore do consolidado SYZIA 032, conferida integralmente pelo MANIFEST da entrega. O ZIP temporário remanescente estava incompleto; a árvore de origem passou na comparação de todos os arquivos. Migrations 001–032 são preservadas e seus hashes estão neste diretório.

## Infraestrutura reutilizada

- Identidade: Auth + enterprise_accounts, reserva idempotente, código temporário, ativação, sessões e múltiplos vínculos da 032. Username sugerido usa a função histórica do ADM.
- Login por identidade resolve uma única identidade antes de autenticar. Usernames empresariais ambíguos continuam exigindo código. A escolha posterior de empresa muda o contexto de uma sessão verificada e revalida vínculo, estado e geração; não concede acesso universal.
- Self-service: Auth recebe a senha do titular; cadastro retomável mantém somente dados mínimos e documentos mascarados/fingerprints. Finalização cria a organização, o primeiro ADM e o trial na mesma transação, reutilizando onboarding e registros comerciais existentes. Nenhum trial self-service sem plano publicado, pagamento validado e consentimento auditável.
- Planos/versões e trial antifraude existentes. Publicação no site e oferta self-service são controles explícitos, inicialmente desligados para planos anteriores. Provider real não foi escolhido; adaptador local exige habilitação explícita e se identifica como simulação. Não há coleta de cartão.
- Aquisição é global, separada do Comercial das empresas. Formulário gera somente lead. Permissões limitadas de aquisição não concedem operação empresarial.
- Recorrências geram previsões, e só confirmação autorizada cria uma despesa no ledger existente. Competência única, idempotência e revisão preservam fatos pagos. Grants de operação não permitem consolidados.

## Diagnósticos iniciais

- Sidebar: altura fixa de 100vh com navegação e rodapé sem área rolável permite transbordamento para o fundo externo. Corrigido no contêiner/rolagem.
- Login: asset aprovado contém fundo raster, sobreposto a um gradiente diferente. Integração feita na composição CSS, mantendo o arquivo aprovado.
- Username: a regra existe em EnterpriseAccess; o formulário Pessoas da 032 não a utiliza.
- Cor: o seletor genérico de links e fundos dos eyebrows afeta conteúdo informativo; neutralizar conteúdo e restringir acentos a interações/detalhes.
- Auth: catch em auth_identity elimina status/código/motivo originais. O log recebido prova a etapa, não a causa externa. Acrescentar classificação segura e preservar reserva/retomada; não vincular automaticamente uma conta alheia por e-mail.
- Mídia: erro informado ocorre na conexão navegador→gateway, antes de confirmar Storage. Verificar endpoint/origem/disponibilidade com diagnóstico sem credenciais e manter bucket privado.

## Pendências

INTEGRAÇÃO DE PAGAMENTO REAL PENDENTE. DECISÃO DE PRODUTO PENDENTE: provider, retries, tolerância, cancelamento pós-conversão, reembolso/proporcionalidade, preços finais, domínio e dados jurídicos. Não houve acesso a Supabase/SMTP/Storage reais, deploy ou reset.

## Ajustes confirmados na validação

A escolha de empresa consulta as permissões server-side e abre o primeiro módulo permitido; colaboradores sem `home.read` não recebem a permissão implicitamente. Aceites legais/verificação continuam entrando pelos gates existentes. Username pessoal em colisão após Auth mantém a mesma identidade e oferece correção do campo. A regra de sugestão é a histórica; não há unicidade global de usernames empresariais.

Planos publicados sem oferta de trial admitem rascunho salvo e informam contratação pendente da integração de pagamento. Inelegibilidade de trial permanece em revisão. Não são criadas empresa, assinatura ou gratuidade para contornar essas condições.

Recorrência encerrada não é reativada silenciosamente. Ajustes de data final afetam ocorrências futuras não pagas, preservando a competência única. Cancelamento autorizado da despesa paga permanece registrado no ledger e aparece no histórico da ocorrência; não volta a somar ao realizado nem cria novo pagamento.
