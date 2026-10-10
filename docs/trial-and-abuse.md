# Período gratuito e prevenção de abuso — complemento autorizado da Fase 8

Implementação local, exclusivamente fictícia na demo. Não inicia nova fase, homologação externa ou produção.

## Concessão e experiência

A duração vem de `billing_plan_versions.trial_days`, editável na administração do plano. A demo usa 15 dias; o banco continua aceitando a configuração de 0–90 dias existente. Zero desabilita trial da oferta. Nenhum cartão, conta bancária ou meio de pagamento real é solicitado.

O benefício pertence à organização, com concessão persistente, versão de plano, início, término, status, modo automático/administrativo/migrado e extensões auditadas. A assinatura usa a mesma vigência. A interface mostra plano, dias restantes (arredondamento para cima), horário exato de encerramento em Recife e efeito do término. O estado expirado é calculado pelo banco a cada leitura/operação, sem depender de cron.

Sem assinatura ativa após o término, continuam os bloqueios transacionais de novas operações definidos na Fase 8. Dados e histórico não são apagados; o gestor mantém acesso autorizado à administração para contratar/reativar. Renovação/alteração paga permanece somente simulada nesta entrega. Desfazer cancelamento durante a vigência não reinicia os dias.

## Elegibilidade

Padrão: ao menos uma identidade de **empresa ou responsável verificada**. A conta autenticada atual e os administradores da organização são comparados ao histórico, assim como os identificadores verificados configurados. Trocar e-mail, telefone declarado, usuário ou UUID de organização não constitui verificação.

Correspondência forte com conta, empresa ou responsável já beneficiado encaminha à análise. Telefone verificado coincidente também encaminha por padrão, permitindo exceções legítimas como número compartilhado/reatribuído. Redes/dispositivos não são coletados nem usados como bloqueadores. Duas empresas independentes podem usar a mesma rede/dispositivo.

Sem evidência suficiente, cria-se uma solicitação pendente sem iniciar assinatura nem gerar cobrança. Existe no máximo uma solicitação pendente por organização; chave repetida devolve o mesmo resultado. O cliente vê apenas situação genérica e seus próprios registros, sem nomes, hashes ou dados da empresa coincidente.

Superadmin pode configurar concessão automática ou revisão obrigatória, tipos de verificação exigidos, uso de telefone na correspondência e teto de dias por ação administrativa. Não pode desligar a checagem obrigatória de conta/empresa/responsável pelo formulário de política. Critérios mais permissivos são decisões administrativas auditadas, não configuração do cliente.

## Verificação: limite explícito

A implementação oferece **atestação administrativa de evidência previamente conferida**, não consulta automática a cadastro empresarial, biometria, SMS/OTP ou comprovação documental externa. O operador autorizado deve verificar legitimidade e posse por procedimento apropriado antes de marcar o identificador como verificado. Sintaxe válida não equivale a identidade comprovada. Não há botão para a própria empresa autodeclarar `verified=true`.

Identificadores de empresa/responsável têm namespace PAÍS:TIPO:IDENTIFICADOR. A demo usa somente `ZZ:DEMO:...` e `ZZ:TEST:...`, sem documentos reais. Telefones de teste são fictícios. O servidor normaliza separadores/caixa, gera fingerprint SHA-256 com segredo privado de alta entropia e não guarda o texto original. Isso é pseudonimização para comparação, não anonimização ou comprovação de conformidade jurídica.

O segredo não é exposto por RPC, não é chave pública e não deve ser perdido/alterado informalmente: sua continuidade é necessária para reconhecer concessões antigas. Backup do registro e segredo deve ser protegido junto ao banco. Verificação legal de finalidade, base aplicável, transparência, retenção e atendimento a direitos deve ser definida pelo responsável antes de coletar identidades reais. Esta entrega não coleta tais dados.

## Análise e exceções

Em `/admin/assinaturas`, selecionar empresa e abrir Período gratuito. Administrador pode registrar a verificação com referência opaca da evidência (sem documento bruto), analisar solicitação, recusar ou conceder exceção com motivo e confirmação explícita. A extensão exige prazo, motivo, confirmação e revisão atual da assinatura.

Concessão excepcional pode superar correspondência anterior legítima; fica marcada como administrativa e preserva todos os registros anteriores. Extensão soma dias ao prazo atual, ou ao momento atual se o prazo já terminou. Não converte assinatura paga/suspensa em trial. Plano suspenso e empresa suspensa não são reativados silenciosamente por esse fluxo. Decisões e extensões usam chaves idempotentes; repetir o mesmo comando não soma tempo.

Gestores/colaboradores/atendentes/consumidores não podem executar esses comandos. Revogação de superadmin tem efeito na próxima chamada. Metadados fornecidos no cadastro não concedem autoridade.

## Histórico e exclusão

O registro privado não possui FK de organização/conta que o apague por cascata. Cancelamento, suspensão ou futura remoção do cadastro operacional não apagam automaticamente o benefício consumido. DELETE/TRUNCATE são bloqueados por triggers; claims e auditoria são append-only. O produto atual não oferece exclusão física de empresa que contorne esse registro.

Migrations importam concessões anteriores marcadas por trial_used/estado trial e vinculam contas administradoras conhecidas. Trials migrados ainda ativos preservam suas datas exatas. Quando o trial já foi convertido e as datas originais não são comprováveis, o registro é explicitamente marcado `legacy_dates_uncertain`; não se apresentam essas datas como reconstrução histórica exata. Identificadores verificados depois da concessão também são associados ao histórico daquela organização.

Uma identidade inteiramente nova, sem qualquer evidência comum, não pode ser reconhecida magicamente pelo sistema. A defesa nesse caso é não conceder automaticamente sem prova verificada e encaminhar a análise. Eficácia no mundo real depende da qualidade da verificação administrativa e da futura homologação.

## Segurança e testes

O registro é privado, com RLS/FORCE RLS, sem grants diretos para anon/authenticated/service_role. Somente RPCs autorizadas retornam projeções próprias ou administrativas. O fluxo antigo de assinatura fica privado e sem EXECUTE para clientes; não há rota paralela que ignore a elegibilidade.

Testes em tests/trial.test.mjs cobrem recadastro, email/conta, nova empresa, responsável/telefone, cancelamento, tombstone, políticas, manipulação, isolamento, verificação, exceção, extensão idempotente, expiração e contratação posterior. tests/trial-upgrade.test.mjs cobre migração de concessão legada. tests/demo-browser/trial.spec.ts exercita os formulários reais da demo por HTTP local.

`npm run test:trial:native` prepara cluster nativo descartável e conexões independentes; neste contêiner o bootstrap é bloqueado por impossibilidade de mapear UID não-root. Resultado **NÃO EXECUTADO**, não PASS. Casos serializados no PGlite não comprovam concorrência independente. Roteiro externo em docs/trial-homologation.md.

## Barreira transacional adicional

`trial_consumed_keys` tem chave primária de tipo + fingerprint. Concessão automática insere essas chaves sem ignorar conflito; uma identidade já consumida não pode ser concedida outra vez apenas por uma leitura antiga. O comando trata conflito de unicidade e encaminha para revisão com rollback da tentativa de benefício. Exceções administrativas preservam a primeira chave e acrescentam concessão/histórico auditado, sem apagar evidências anteriores.

O fluxo de análise não cria gratuidade paralela: organização com solicitação de trial e sem assinatura vigente não herda a compatibilidade operacional de empresas antigas sem adesão. A trava/guardas de billing bloqueiam novas operações sujeitas ao plano; o painel administrativo segue disponível. Organizações antigas que nunca solicitaram trial preservam a compatibilidade histórica da Fase 8. A criação de organização continua restrita ao superadmin, como na Fundação; não existe cadastro público que crie empresas ilimitadas.
