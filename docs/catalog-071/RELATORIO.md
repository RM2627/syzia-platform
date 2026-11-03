# SYZIA 071 — Catálogo comercial e ativação

Base oficial: `4c8749f2ff66aad285e6bfe6c08fe722ca1a7e02`, incluindo a correção 070 e as alterações oficiais subsequentes. Branch local: `syzia-catalog-activation-071`. Nenhum commit, push, deploy, envio de e-mail, operação financeira ou SQL remoto foi realizado.

## Diagnóstico comprovado no código e no banco descartável

1. A página pública e o cadastro consultavam `acquisition_plans`, cuja implementação 047 filtrava as ofertas pelo mapeamento do Mercado Pago. O painel Stripe consultava outro catálogo. O teste reproduziu a exclusão das ofertas Stripe mesmo com seus indicadores comerciais ativados. Portanto, alterar apenas sua visibilidade não corrigia a seleção da fonte.
2. O editor geral podia criar uma nova versão do plano, enquanto o mapeamento Stripe continuava corretamente vinculado à versão financeira anterior. A correção separa a revisão de apresentação da versão financeira imutável.
3. O frontend carregava o catálogo uma vez por montagem. Agora também o atualiza ao recuperar foco/visibilidade, sem cache persistente nem retorno silencioso ao catálogo antigo. Não foi inspecionado o cache do Cloudflare em produção; não se atribui a causa a ele.
4. A versão 060 permitia convite de **demonstração** sem e-mail, mas o caminho de **ativação** e a validação de identidade 058 já exigiam correspondência de destinatário. A 070 passou a detectar a divergência durante o cadastro/recuperação. Não foi comprovado que a ativação completa sem destinatário funcionava anteriormente. A 071 cria essa modalidade de emissão explicitamente, preservando as restrições dos convites anteriores.

## Correção entregue

- Fonte comercial única baseada nas ofertas 069 e em suas versões financeiras já mapeadas. `acquisition_plans`, cadastro e contexto de assinatura compartilham a mesma projeção.
- Produto público **SYZIA Completa**: mensal R$ 59,90; semestral R$ 299,40 integrais; anual R$ 478,80 integrais. Economias em relação a meses avulsos: R$ 60,00 / 16,69% e R$ 240,00 / 33,39%, respectivamente. Preços, limites e funcionalidades são lidos das estruturas existentes.
- Super Admin ativo gerencia descrição, estado ativo, visibilidade e disponibilidade comercial em “Catálogo comercial · SYZIA Completa”, na área de planos existente. Alterações usam revisão otimista e auditoria. Preços, IDs, períodos e versões financeiras não são editáveis por esse controle.
- A migration torna as três ofertas mapeadas visíveis e habilitadas para preparação do cadastro. **Não altera `available`, o modo financeiro, a confirmação financeira, os mapeamentos ou as variáveis do Render.** A interface informa indisponibilidade e o backend mantém bloqueio efetivo quando `BILLING_CHECKOUT_MODE=disabled` ou as operações Stripe estão desabilitadas.
- Novo endpoint público de leitura `/billing/catalog`, com os controles existentes de CORS, limites e `no-store`; não consulta o provedor nem cria recursos. O painel de assinatura usa a mesma projeção e mantém contratos históricos no provedor original.
- Cadastro pode salvar a preparação na versão correta, sem criar assinatura, trial ou acesso. A conclusão financeira continua bloqueada conforme o runtime. O caminho Stripe não entra no antigo caminho de trial simulado.
- Novo convite de ativação sem e-mail exige operador autorizado, demonstração publicada, interessado vinculado, interesse registrado e confirmação explícita de emissão. A primeira identidade autenticada, ativa e com e-mail confirmado fica vinculada atomicamente. Uma tentativa ainda não confirmada não reserva a identidade.
- Convites vinculados a e-mail continuam exigindo exatamente seu destinatário; mudança posterior no e-mail do interessado também é verificada. Links de demonstração não se tornam links de ativação. Convites históricos não são alargados automaticamente.
- A retomada 070 entre dispositivos permanece. Os contextos novos armazenam hashes, sem token ou endereço bruto. O envio de e-mail conserva sua elegibilidade e autorização próprias.

## Segurança e limites

Um link de ativação emitido sem destinatário prévio é individual, mas sua autorização inicial é transferível até o primeiro vínculo confirmado. Quem obtiver indevidamente esse link e confirmar uma identidade poderia ocupar essa ativação. Por isso há emissão explícita, confirmação do operador, prazo, revogação e vinculação irreversível pelo fluxo comum. Para destinatário conhecido, prefira cadastrar o e-mail antes da emissão. Não há apropriação de organização existente nem acesso empresarial definitivo por mera posse do link; os controles financeiros e de materialização continuam necessários.

A migration 071 é necessária para centralizar a projeção, separar revisão comercial, manter controle server-side e persistir a recuperação de convites sem destinatário. É transacional, usa locks e valida predecessores; não foi executada em produção. Não é um script para reaplicação indiscriminada: a execução duplicada falha e reverte a transação. Não altera migrations históricas nem grants de funções privadas para clientes.

## Validação e conclusão

**49 testes direcionados aprovados, zero falhas na execução final; TypeScript e build Vite aprovados.** Detalhamento e comandos em `TESTES.md`; evidências no pacote. Nenhum teste histórico foi modificado. O inventário registra hashes antes/depois e a verificação de aplicação/reversão do patch em checkout limpo.

Pronto para revisão e homologação controlada do incremental. Não é declaração de correção em produção. Permanecem pendentes a execução autorizada da migration, publicação coordenada, verificação dos indicadores reais no Supabase, URLs/origens do frontend publicado, confirmação de e-mail real entre dispositivos e validação operacional após publicação. Não houve integração financeira real nesta rodada. Não se executou gate geral.
