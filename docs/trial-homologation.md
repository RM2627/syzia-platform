# Homologação externa — trial e prevenção de abuso

**PENDENTE DE HOMOLOGAÇÃO EXTERNA. Não executar agora.** Complementa docs/phase-8-homologation.md, sem deploy ou gateway real.

1. Projeto dedicado e fictício. Preservar migrations 001–020 e aplicar 021 uma vez. Conferir registro privado/FORCE RLS e grants; impedir exposição do schema private pelo PostgREST. Não copiar a fixture Auth para Supabase.
2. Criar contas fictícias distintas A/B/atendente/consumidor/root, confirmar Auth real, usar tokens reais. Admin de A não pode consultar/modificar trial B; consumidor/atendente não podem administrar; papel root revogado deve falhar com token ainda válido.
3. Planos de 15 e 9 dias para demonstrar configuração. Sem identidade comprovada → análise sem concessão. Registrar prova fictícia somente por superadmin. `billing_trial_verify` é atestação administrativa, não OTP ou consulta automática a órgão/provedor.
4. Novo e-mail da mesma conta, nova conta com a mesma identidade, nova empresa com mesmo responsável e telefone verificado coincidente devem impedir concessão automática. Testar normalização. Dados de rede/dispositivo compartilhados não podem ser usados isoladamente como bloqueio.
5. Cancelar/suspender e recriar empresa de teste; o benefício anterior continua reconhecido. DELETE/TRUNCATE do registro por papéis cliente devem falhar; não apagar registro histórico para "limpar" um resultado. Excluir dados operacionais em laboratório não deve causar cascata sobre os registros privados de elegibilidade.
6. Aprovar/recusar exceção e estender com motivo, confirmação e revisão atual. Verificar audit trail, impossibilidade de alteração direta, repeat/replay e ausência de identificador bruto/hash nas respostas. Extensão de plano pago/suspenso não deve reabrir trial.
7. Expiração: controlar datas exclusivamente na fixture de banco descartável, nunca em organização real. Sem vigência, novas operações são negadas; histórico/gestão/contratação continuam disponíveis. Renovação simulada ativa sem remover concessão anterior.
8. Validar o provider Auth/telefone/identidade escolhido antes de qualquer verificação automática futura. Fluxo atual é manual: documentar quem conferiu, qual procedimento/evidência e referência opaca. Não tratar dados declarados no cadastro ou metadata do usuário como verificados.

## Concorrência independente preparada

Local, em máquina Linux com PostgreSQL nativo executável por usuário não-root: `npm ci`, `npm run test:trial:native`. O runner cria cluster descartável por socket, sem aceitar DATABASE_URL remoto e sem tocar Supabase. Cenários: duas organizações/contas com a mesma identidade disputam concessão; duas extensões com mesma chave; duas extensões com revisão obsoleta. Testes conferem backend PIDs diferentes. Neste ambiente o bootstrap foi tentado e bloqueado; **nenhum dos três cenários independentes foi executado**.

No futuro Supabase dedicado, repetir os mesmos cenários com duas conexões distintas e claims reais validadas. Ambas iniciam transação antes da disputa; uma chamada mantém a trava até commit enquanto a segunda aguarda. No máximo uma concessão automática; a segunda deve ir à análise ou receber conflito transacional recuperável, nunca novo benefício. Repetir em READ COMMITTED e REPEATABLE READ, incluindo rollback do vencedor. Testar mesmo plano/organização/chave, mesma identidade com outra empresa e exceção manual simultânea. Usar apenas organizações fictícias reservadas para esse teste.

O índice único de identidades consumidas complementa a trava global: não confiar apenas na consulta anterior à inserção. Ao usar RPC por HTTP, a transação é controlada no servidor; concorrência deve disparar duas requisições reais, com chaves e tokens explicitamente registrados sem expor os segredos no relatório.

## Operação, privacidade e evidências

Preparar retenção/finalidade e processo de revisão compatíveis com os dados/provedores efetivamente escolhidos. Hash com segredo é pseudonimização; não substitui a avaliação jurídica da coleta real. Segredo e histórico fazem parte do backup protegido e do teste de restauração dedicado; não regenerar o segredo a cada deploy. Sem segredo anterior, fingerprints históricos não são comparáveis.

Não salvar CPF/CNPJ/telefone real em fixtures, relatórios, logs ou referências de prova. Registrar resultados por IDs de teste, data/ambiente, esperado/obtido, autorização, revisão e estado, separando testes locais de execução externa. Preços comerciais, coleta de documentos reais, OTP/serviços pagos e produção continuam decisões exclusivas de Marcelo.
