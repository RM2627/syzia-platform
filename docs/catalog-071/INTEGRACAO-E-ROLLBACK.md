# SYZIA 071 — Integração e reversão

## Revisão local

Base exata: `4c8749f2ff66aad285e6bfe6c08fe722ca1a7e02`. O pacote contém patch, cópias dos arquivos, inventário de hashes, evidências e estes documentos. A pasta `arquivos/` é alternativa para inspeção; não aplicar cópia e patch cumulativamente. Nenhuma credencial ou arquivo `.env` deve ser substituído.

Com o ZIP extraído em uma pasta separada, dentro de um clone limpo da base:

```powershell
git status --short
git rev-parse HEAD
# Conferir o SHA acima e ausência de alterações; preservar commits posteriores se existirem.
git switch -c syzia-catalog-activation-071
$patch071 = "C:\caminho\SYZIA-CATALOGO-ATIVACAO-071-INCREMENTAL\SYZIA-071.patch"
git apply --check $patch071
git apply $patch071
git diff --check
```

Se a base divergir ou o patch falhar, interromper sua aplicação; não usar `--reject`, não sobrescrever arquivos e não alterar hashes para contornar a divergência. Rodar os comandos de `TESTES.md` conforme a homologação local necessária.

## Publicação futura, somente com autorização

1. Fazer backup recuperável do banco e exportação das definições/grants das funções afetadas, em local privado. Registrar também os indicadores atuais de `billing_plans` das três ofertas mapeadas. Não colocar dados operacionais, tokens ou dumps no Git.
2. Conferir presença e versão dos objetos 069 e 070 e ausência da coluna `billing_plans.catalog_revision`. A 071 pressupõe essa cadeia; não reaplicar migrations anteriores. Conferir se há customizações SQL externas à base; os guardas de predecessor não substituem essa revisão.
3. Preservar no Render `BILLING_CHECKOUT_MODE=disabled` e `STRIPE_OPERATIONS_ENABLED=false`. Não alterar a habilitação Stripe, chaves, IDs de preços/produtos nem os registros de runtime do banco.
4. Após aprovação específica, executar **uma única vez**, integralmente, `supabase/migrations/202611030071_commercial_catalog_activation.sql`. Ela possui `BEGIN/COMMIT`, locks e rollback em falha. Não executar trechos nem fazer repetição automática após resultado incerto; consultar primeiro os objetos e o histórico de migrations.
5. Publicar backend e frontend deste mesmo incremental em janela coordenada. O SQL altera o contrato público do catálogo; não manter indefinidamente frontend anterior com SQL novo. No frontend, preservar a configuração existente de `VITE_BILLING_API_URL`; o endpoint `/billing/catalog` deve chegar à API unificada. As origens continuam sujeitas ao CORS existente, sem liberar origens genéricas.
6. No painel de planos do Super Admin, conferir “Catálogo comercial · SYZIA Completa”. As três modalidades são apresentadas inicialmente pela migration; `available` permanece como estava. Ocultar/exibir uma oferta e conferir página pública, cadastro e painel de assinatura. Abas públicas recarregam ao receber foco; atualizar telas já abertas quando necessário.
7. Conferir a mensagem de contratação indisponível e a ausência de ação financeira habilitada. Não contratar para testar este incremental. Valores integrais esperados: R$ 59,90, R$ 299,40 e R$ 478,80.
8. Para ativação sem destinatário: vincular interessado sem e-mail a demonstração publicada, registrar o interesse real em testar, selecionar **ativação**, gerar link individual e confirmar a vinculação à primeira identidade confirmada. Não reutilizar um link de demonstração para ativação. Não converter silenciosamente links históricos: revogar e emitir um novo convite quando apropriado. Convites com e-mail seguem restritos ao destinatário.
9. Homologar confirmação e retomada entre dispositivos com a infraestrutura real apenas quando autorizado. Isso é separado da validação financeira. Nenhuma concessão de trial/acesso deve ocorrer enquanto o financeiro estiver bloqueado.

## Reversão

**Antes de executar a migration/publicar:** em uma cópia sem alterações posteriores, a reversão do código foi validada:

```powershell
git apply --reverse --check $patch071
git apply --reverse $patch071
git status --short
```

**Falha durante a migration:** a transação deve reverter integralmente; confirmar término/rollback e ausência de objetos 071 antes de repetir qualquer operação. Não apagar objetos manualmente para forçar uma reaplicação.

**Após executar a migration:** não reverter apenas o frontend nem remover colunas/tabelas. Não há um `down.sql` genérico seguro: podem existir novos vínculos confirmados e contextos de recuperação cuja exclusão permitiria perda de histórico ou reatribuição indevida. Manter o checkout bloqueado e suspender a emissão de novos links enquanto se prepara reversão coordenada ou correção progressiva.

Para reversão completa, o responsável deverá comparar o estado atual com o backup pré-aplicação, restaurar as definições e grants anteriores das funções afetadas e os indicadores comerciais anteriores em uma transação revisada. Preservar dados de convites/contextos 071; convites novos que não possam mais ser processados devem ser revogados por mecanismo administrativo, nunca reatribuídos. Os arquivos de código podem então retornar à base anterior em conjunto. Não restaurar indiscriminadamente um backup integral sobre dados mais recentes. Essa operação de banco exige revisão e autorização própria e não foi executada nem apresentada como automatizada.

Funções alteradas: `acquisition_plans`, `billing_plan_save`, `billing069_context`, `billing069_prepare`, `selfservice_save`, `selfservice_complete`, `commercial_invite_for_contact`, `access_activation_remember`, `commercial_activation_pending`, `commercial_service` e a privada `commercial_activation_identity`. A migration conserva várias definições anteriores com sufixo `_pre071` e revoga seu acesso direto; elas não devem ser expostas como atalho.

Não houve alteração de contratos Mercado Pago, preços Stripe, dados de cartão, trial histórico, webhook/HMAC, credenciais ou migrations históricas. Esses componentes não requerem reversão por este pacote.
