# SYZIA --- RODADA PÓS-HOMOLOGAÇÃO 032

## Prompt mestre --- UX, aquisição, self-service, financeiro, billing e autenticação

> **Leia todo este documento antes de alterar qualquer arquivo.**

Base exclusiva: **SYZIA 032**.

## 0. Regras inegociáveis

-   Inspecionar a 032 antes de implementar.
-   Reutilizar estruturas existentes e diagnosticar causas reais.
-   Não criar sistemas paralelos.
-   Preservar dados e migrations **001--032 byte a byte**.
-   Se necessário, criar somente **migration 033 incremental**.
-   Sem reset, deploy ou produção.
-   Não inventar regras comerciais.
-   Não repetir auditoria mestre; usar testes focados +
    build/typecheck + regressão essencial.

# A --- CORREÇÕES DE UX

## 1. Sidebar / Sair

Corrigir a faixa branca vista em Meu perfil/Equipe SYZIA. `Sair` deve
ficar integrado ao rodapé da sidebar em todas as rotas.

## 2. Logo no login

Integrar **símbolo S + SYZIA + "Onde tudo se alinha."** ao fundo, sem
retângulo perceptível. Não redesenhar símbolo, lettering, espaçamento,
proporções ou gradiente aprovados.

## 3. Username automático

Reutilizar a mesma regra histórica do ADM para sugerir username a partir
do nome (ex.: João da Silva → `joao.silva`). Campo editável,
normalização de acentos, nomes compostos e colisões. Não criar algoritmo
paralelo.

## 4. Cor da empresa

A cor da marca é destaque/interação, não cor universal do conteúdo.
Aplicar em CTA, links, ícones, badges, categoria ativa, indicadores,
focus e detalhes. Não aplicar automaticamente a descrições,
região/endereço, horários, pagamentos, serviços, FAQ, portfólio e
parágrafos. Usar tokens neutros. Testar vermelho/amarelo/azul/magenta ×
claro/escuro.

# B --- SITE INSTITUCIONAL E AQUISIÇÃO

## 5. Site público SYZIA

Criar página institucional própria, separada das páginas empresariais.

Hero: **SYZIA --- Onde tudo se alinha.**

Apresentar problema, benefícios, funcionamento, recursos,
multissegmento, planos e demonstração.

CTAs: **Criar minha empresa / Começar**, **Entrar**, **Falar com a
SYZIA**.

Não prometer crescimento garantido. Pode usar: **"Sua empresa pode
crescer. Sua operação precisa acompanhar."**

## 6. Recursos e multissegmento

Apresentar Atendimento, Clientes, Orçamentos, Agenda, Pendências,
Follow-up, Financeiro, Métricas, Página pública, Portfólio, Equipe e
Atendimento compartilhado quando aplicável. Mostrar vários segmentos;
não parecer software automotivo.

## 7. Planos públicos

Usar infraestrutura real de planos/versões. Não hardcodar preços.
Mostrar somente planos comercialmente publicados.

## 8. Falar com a SYZIA

Formulário com nome, empresa, telefone/WhatsApp, e-mail e interesse.
Cria **lead da SYZIA**, não Auth, empresa, trial ou assinatura.

## 9. Aquisição

Administração → Aquisição: **Leads \| Novos cadastros \| Trials \|
Conversões**. Indicadores baseados em eventos reais. Preparar permissões
globais limitadas para futura equipe comercial.

# C --- SELF-SERVICE

## 10. Princípio

Não criar outro onboarding. O self-service automatiza identidade +
cadastro mínimo da empresa + vínculo do primeiro ADM + situação
comercial. Depois abre **o onboarding empresarial existente**.

## 11. Fluxo

Site → Criar minha empresa → identidade → dados mínimos →
CPF/CNPJ/verificação aplicável → escolher plano → forma de pagamento →
consentimento trial/cobrança → ativar trial quando elegível →
criar/vincular empresa → primeiro ADM → onboarding existente.

Não pedir serviços/horários/portfólio antes do onboarding.

## 12. Retomada

Abandono não duplica pessoa, empresa ou trial. Permitir retomada
idempotente.

## 13. Conta existente

Identidade/e-mail existente não cria outra pessoa silenciosamente.
Direcionar à autenticação/retomada e preservar múltiplos vínculos.

# D --- TRIAL, PLANOS E BILLING

## 14. Trial self-service

Sem forma de pagamento válida, o trial self-service não é ativado.
Empresa escolhe explicitamente o plano.

Antes de ativar, exibir: **"Grátis até DD/MM. Depois, R\$ XX/mês no
Plano X, salvo cancelamento conforme as condições apresentadas."**
Registrar consentimento auditável.

## 15. Provider

Se não houver provider real definido/configurado, **não inventar
cobrança real**. Preparar arquitetura/estados/contratos integrados ao
billing existente e registrar **INTEGRAÇÃO DE PAGAMENTO REAL PENDENTE**.

Nunca armazenar cartão completo/CVV; futuro provider usa
tokenização/componentes seguros.

## 16. Conversão/falha

Provider homologado: fim do trial + cobrança aprovada → assinatura
ativa.

Falha: trial ativo → cobrança pendente/falhou → regularização →
suspensão. Retries/tolerância indefinidos = **DECISÃO DE PRODUTO
PENDENTE**.

Suspensão preserva dados; ADM acessa billing/regularização; novas
operações ficam bloqueadas conforme política. Página pública impede
novas solicitações/agendamentos com mensagem neutra, sem revelar
inadimplência.

Regularização → assinatura ativa → empresa reativada.

## 17. Trial manual

Preservar integralmente o poder do Super Admin de conceder/estender
trial e dispensar pagamento, com ator, motivo, período e Auditoria. Não
apagar histórico antifraude.

## 18. Cancelamento

Permitir cancelamento antes da primeira cobrança. Política pós-conversão
indefinida deve ficar pendente, não ser inventada.

## 19. Configuração comercial

Planos devem poder definir ativo, disponível comercialmente, visível no
site, self-service, elegibilidade/duração do trial e periodicidade. Não
inferir pelo nome.

# E --- FINANCEIRO: DESPESAS RECORRENTES

## 20. Recorrências

Evoluir o Financeiro atual: despesa Única ou Recorrente, com descrição,
categoria, valor, frequência, dia/data, início, fim opcional e
observação.

## 21. Prevista ≠ paga

Recorrência gera ocorrência prevista/pendente. Somente confirmação
autorizada vira despesa paga. Resultado realizado usa fatos financeiros,
não previsão.

## 22. Idempotência/histórico

Retry não duplica competência. Alteração futura não reescreve histórico
pago. Cancelamento impede futuras ocorrências sem apagar histórico.

## 23. Métricas

Distinguir Recebido, Despesas pagas, Resultado realizado, Despesas
previstas e A receber.

## 24. Permissões

Estender grants para registrar/ver/administrar despesas,
criar/editar/cancelar recorrência, ver previstas, marcar como paga, ver
caixa/consolidados/resultado.

**Registrar operação financeira não concede acesso às finanças
consolidadas.**

# F --- LOGIN, CONTEXTO E PRIMEIRO ACESSO

## 25. Botão Operação SYZIA

Remover o botão público separado **Acesso da operação SYZIA** se a
arquitetura final permitir. Não anunciar Super Admin/Administração como
portas públicas distintas.

## 26. Código empresarial

Não remover por estética. Ele ajuda a desambiguar usernames iguais entre
empresas. Primeiro mapear identidade global, username empresarial,
organização, vínculo, login, primeiro acesso e Auth.

## 27. Avaliar login por identidade

Avaliar usuário/e-mail + senha → identidade → contextos disponíveis. Se
seguro: 1 empresa entra; várias escolhem; Equipe SYZIA vai ao ambiente
global; Super Admin à Administração.

Não tornar username empresarial globalmente único só para simplificar.
Se Código empresarial continuar necessário, preservar e melhorar UX.

## 28. Criação administrativa

Ao criar usuário dentro de empresa, administrador não define senha
definitiva. Gerar **código temporário de primeiro acesso**.

Código: seguro, uso único, expira, vinculado ao usuário/contexto
empresarial, invalidado após uso e com reemissão segura.

Fluxo: criar usuário → Auth provisionada → código temporário → Primeiro
acesso → validar contexto → titular cria senha definitiva → invalidar
código.

Reemissão não duplica pessoa, Auth, vínculo, empresa ou trial.

**Administrativo:** código temporário. **Self-service:** titular cria a
senha no cadastro.

# G --- BUG REAL: AUTH_IDENTITY

## 29. Evidência

Na homologação real:

``` text
Platform API ready on loopback; no public deployment
{"event":"enterprise_access_failed","request_id":"49eb147f-3216-43eb-b20a-5434651d31bc","code":"provisioning_incomplete","stage":"auth_identity"}
```

Investigar Supabase Auth, credenciais server-side, projeto,
criação/recuperação da identidade, conflito de e-mail, identidade
existente, username/contexto, primeiro acesso, código temporário,
rollback, retomada idempotente e provider.

Usar `request_id` quando possível.

Se `provisioning_incomplete/auth_identity`, permitir **Retomar
provisionamento** com a mesma identidade reservada, sem duplicar
pessoa/vínculo. Código temporário só é válido após conclusão necessária.

Logs seguros: request_id, estágio, categoria, status e motivo permitido.
Nunca senha, código temporário completo, token, service_role, CPF/CNPJ
ou segredos.

# H --- MÍDIA E AUTORIZAÇÃO

## 30. Upload real

Investigar: **"Não foi possível conectar ao envio de imagens. Verifique
o endereço e a disponibilidade do serviço de mídia."**

Conferir `VITE_ATTACHMENT_GATEWAY_URL`, `CONSUMER_ORIGIN`,
`SUPABASE_URL`, chaves server-side do mesmo projeto, gateway, bucket
privado `company-media`, policies, MIME, limite e sequência
reserva→autorização→upload→finalização→leitura.

Não tornar bucket público nem remover policies.

Testar logo, capa, imagem de serviço e portfólio: enviar, ler,
recarregar, trocar e remover. Sem acesso real autorizado, não alegar
homologação real.

## 31. Autorização Super Admin

Preservar investigação de **"Você não tem autorização para esta ação."**
Se ocorrer, registrar RPC/ação, request_id, organização, status,
categoria, sessão e estados relevantes. Não criar membership artificial,
liberar acesso universal ou enfraquecer RLS.

# I --- ROTAS, SEO E PRIVACIDADE

## 32. Estrutura conceitual

`/` site institucional; `/entrar` autenticação; `/cadastrar`
self-service; `/planos`; `/contato`; `/app` ou equivalente;
`/empresa/:slug`.

Não quebrar rotas existentes; mapear e usar redirects. Não criar
`/super-admin` ou `/operacao-syzia` como porta pública destacada.

## 33. SEO

Title, description, Open Graph, favicon, headings semânticos e canonical
configurável quando domínio real existir. Não inventar domínio
definitivo.

## 34. Leads e privacidade

Leads são dados globais da SYZIA e só usuários globais autorizados
acessam. Lead não cria conta/empresa automaticamente.

# J --- TESTES ESSENCIAIS

Não repetir auditoria mestre. Executar typecheck, build, SQL/backend
focado, autorização, isolamento, jornadas representativas e upgrade se
houver.

Testar: 1. Site → plano → self-service → identidade → empresa →
verificação → plano → etapa de pagamento → consentimento → ADM →
onboarding existente (provider fake claramente identificado se
necessário). 2. Abandono/retomada sem duplicação. 3. Falar com a SYZIA
cria somente lead. 4. Trial administrativo sem pagamento, auditado. 5.
Despesa recorrente R\$700/mês: prevista → paga; retry não duplica. 6.
Permissões financeiras com funcionário operacional, gestor e ADM. 7.
Criação administrativa: username sugerido → Auth → código temporário →
primeiro acesso → senha → código invalidado. 8. Falha `auth_identity`:
estado incompleto, retry seguro, sem duplicação. 9. Login com 1 empresa,
várias empresas, Equipe SYZIA, Super Admin e usernames repetidos entre
organizações. 10. Sidebar/Sair e logo integrada. 11. Matriz de cores:
vermelho/amarelo/azul/magenta × claro/escuro. 12. Mídia no ambiente
disponível, distinguindo adapter/local de Supabase real.

# K --- MIGRATION / UPGRADE

Migrations 001--032 permanecem intactas. Se necessário, criar somente
**033 incremental**, documentando a necessidade.

Se houver 033, testar 032→033 sobre banco populado preservando pessoas,
Auth fixtures, organizações, vínculos, equipe, serviços, categorias,
agenda, página, mídia, portfólio, clientes, solicitações, conversas,
orçamentos, financeiro, métricas, trial, planos, assinaturas, permissões
e auditoria. Sem reset.

# L --- FORA DO ESCOPO

Não implementar domínio real UseSyzia, deploy, cobrança real sem
provider escolhido, armazenamento próprio de cartão, Open Finance,
emissão fiscal, DRE completa, folha, estoque, app nativo, vídeo oficial,
redes sociais ou nova auditoria mestre.

Decisões indefinidas devem ficar como **DECISÃO DE PRODUTO PENDENTE**:
provider, retries, tolerância, cancelamento pós-conversão,
reembolso/proporcionalidade, preços/regras finais, domínio e dados
jurídicos.

# M --- ENTREGA

Entregar: - ZIP consolidado completo; - código; - migration 033 se
necessária; - documentação e guia de upgrade; - relatório técnico; -
testes focados/evidências; - inventário de arquivos alterados.

O relatório deve cobrir UX, site, self-service, leads, recorrências,
permissões, trial/billing preparado, arquitetura final do login,
primeiro acesso, diagnóstico `provisioning_incomplete/auth_identity`,
estado da mídia, migration, testes, limitações e pendências.

## Critérios de aceite

-   Sidebar corrigida.
-   Logo integrada.
-   Username automático.
-   Textos comuns não herdam cor da marca.
-   Site institucional e planos reais.
-   Lead não cria conta.
-   Self-service reutiliza onboarding existente.
-   Trial self-service exige plano + pagamento + consentimento.
-   Nenhuma cobrança real fictícia.
-   Trial manual preservado.
-   Recorrências idempotentes; previsto ≠ pago.
-   Permissões financeiras granulares.
-   Login/contexto sem colisões indevidas.
-   Criação administrativa gera código temporário seguro.
-   `provisioning_incomplete/auth_identity` diagnosticado e retomável.
-   Mídia mantém segurança.
-   001--032 intactas.
-   Upgrade sem reset se houver 033.
-   Build/typecheck e testes essenciais aprovados.

## Regra final

Primeiro **INSPECIONAR E DIAGNOSTICAR**, depois implementar.

Não enfraquecer segurança para fazer teste passar.

Quando faltar decisão do proprietário: **DECISÃO DE PRODUTO PENDENTE**.

Ao concluir: **ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
