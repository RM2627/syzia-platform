# Auditoria anterior às alterações — revisão VIRELOQ

Escopo autorizado: anexo de revisão final B2B/trial/assinatura/formulários e identidade VIRELOQ. Não é uma nova fase. Não conectar serviços reais, modificar Supabase homologado, fazer deploy nem produzir vídeo.

## Achados concretos

- `/entrar` contém toggle de autocadastro e chama `auth.signUp` com e-mail/senha. Deve ser removido; proteção no Auth externo também precisa ser configurada sem bloquear consumidores anônimos.
- Criação de organização exige UUID de usuário previamente existente. Pessoas e acessos usa identificador em vez de nome/e-mail e não tem convite. Reutilizar papéis, vínculos, locks e limites existentes; acrescentar convite controlado e primeiro acesso.
- `AuthProvider.onAuthStateChange` limpa `access` em todos os eventos. Reautenticação da mesma sessão no foco desmonta `Protected/Shell` e seus formulários. `Shell` também usa chave baseada no JSON integral de papéis/vínculos.
- `CompanyModule` consulta a cada 15s e formulários usam `settings.revision` como chave. Uma revisão externa remonta edição sem pedir confirmação. Há ainda formulários que usam a revisão mais recente com valores locais antigos: potencial sobrescrita silenciosa. A correção deve preservar rascunho, manter revisão-base e explicitar conflitos.
- A atualização de onboarding por foco não precisa ser removida. A checklist deve continuar refletindo dados persistidos.
- A rota de assinatura empresarial já existe, mas não está na navegação permanente da empresa; só em links secundários. Reutilizar Billing/Trial e acrescentar acesso direto.
- Trial possui elegibilidade, histórico durável, exceções e extensão. Não reconstruir. Confirmar evento de início, segregação e proteção contra novos usuários/organizações.
- Billing existente tem provider mock, autenticação HMAC de webhook, transações/idempotência e limites. Não existe integração de gateway real. Como nenhum provedor foi aprovado, preparar contrato/adapter isolado, checkout seguro e testes com adapter fictício; habilitação concreta depende da escolha e homologação do provedor, sem declarar integração real concluída.
- Marca institucional ainda usa “Central”, monograma C e título genérico. Separar identidade do SaaS da marca pública da organização.

## Preservação

Migrations 001–024 registradas em `historical-migrations-sha256.json`; não editar. Portfólio, publicação, catálogo, consumidores, atendimento e isolamento existentes devem ser reutilizados. O vídeo anterior foi interrompido; seus materiais intermediários não são produto homologado nem devem ser finalizados nesta revisão.
