# Auditoria e decisão — acesso empresarial VIRELOQ

A base é o ZIP consolidado com a correção de convites. Migrations 001–025 permanecem imutáveis. A 025 cria convites/leases de envio, sem sistema de username ou credencial temporária. Auth, profiles, organization_members, platform_roles, attendant_organizations e os helpers de autorização são reutilizados. Senhas continuam exclusivamente no Supabase Auth.

O novo caminho usa a Platform API para resolver código empresarial + username. Identidades novas recebem identificador técnico aleatório de 256 bits no formato aceito pelo Auth, em domínio reservado `.invalid`, sem caixa postal nem dependência SMTP. Não é derivado de telefone, nome, empresa ou e-mail de contato. Confirmar esse identificador técnico NÃO verifica propriedade do e-mail de contato. O contato do administrador é obrigatório e permanece não verificado. Nenhum recurso pode confiar nele como prova de identidade.

O navegador recebe a sessão normal do Auth; o identificador técnico pode existir nos claims do provedor, mas nunca é exibido como identidade operacional e não é uma credencial. A autorização de contas migradas/provisionadas exige sessão registrada pela API, escopo empresarial e estado atual. Login direto no Auth sem esse registro não libera as operações do produto. Conta global existente conserva o acesso administrativo e não exige empresa fictícia.

Códigos temporários: 128 bits criptográficos, apenas SHA-256 persistido, 48 horas por padrão configurável e cinco tentativas. Validação troca o código por prova efêmera em memória, também persistida apenas em hash, com cinco minutos de validade. Transições no banco e serialização protegem concorrência. Auth e Postgres são serviços distintos: não há transação distribuída. Operação de senha fica bloqueada durante alteração; falhas incertas ficam fechadas para uso até reconciliação administrativa, nunca liberam vínculo ou repetem alteração silenciosamente.

Provisionamento: reserva idempotente no banco, criação Auth com ID pré-alocado, conclusão revalida autorização e associa o vínculo já definido. Falhas deixam reserva auditável, não conta operacional. Identidades existentes e seus memberships não são recriados: adoção exige escolha explícita de username e contato pelo gestor autorizado; nenhuma colisão é resolvida silenciosamente. Histórico de convites é mantido, mas envio/aceite legados são retirados do fluxo ativo.

Inatividade: 30 minutos, aviso 60 segundos antes; política global persistida, sem possibilidade de desativação pela empresa. Interação humana sinaliza atividade, background não. RLS verifica sessão expirada/revogada no servidor; logout remove estado em memória. Os documentos legais são minutas versionadas para testes e revisão do proprietário, sem pressupor validade jurídica final. Aceite institucional é da organização por administrador, não de cada funcionário.

Referências oficiais consultadas: https://supabase.com/docs/reference/javascript/auth-admin-createuser ; https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid ; https://supabase.com/docs/guides/auth/sessions . SDK instalado também auditado. Nenhum Supabase real foi acessado.


## Segurança entre Auth e banco

Não há transação distribuída entre `updateUserById` e Postgres. Cada ativação consome a prova em transação, fica `changing`, escreve um identificador de operação em **app_metadata** do Auth junto da senha e só fica ativa quando o banco confirma a mesma operação. Login valida JWT pelo Auth e compara esse marcador com a última operação aprovada antes de registrar a sessão. Uma gravação Auth antiga que chegue atrasada é rejeitada no próximo login. Estado incerto não libera acesso; recuperação administrativa inicia outra operação. `changing` recente bloqueia reset; operação interrompida pode ser resetada após a janela de segurança de até 15 minutos. Nenhum código/senha é recuperado do hash.

Reserva de criação usa ID Auth pré-alocado e request_key. Interrupção não cria vínculo operacional; **Concluir preparação** revalida o gestor, retoma a mesma identidade e é auditável. `access_finish_provision` confere novamente organização/papel/estado. Duplicatas não dão novo código silencioso: usar redefinição explícita.

### Identidades antigas com múltiplas empresas

Supabase Auth mantém uma única senha por Auth ID. Criar senhas separadas por membership sem novas identidades exigiria armazenar credenciais fora do Auth ou trocar a identidade vinculada aos históricos; ambas as alternativas foram descartadas. Compartilhar uma redefinição entre empresas sob poder de um administrador empresarial também seria inseguro.

Solução adotada: preservar o Auth ID legado e exigir **Super Admin** para preparar/recuperar identidades com mais de um membership. Os usernames continuam por organização; a senha do Auth é única dessa pessoa e o login limita a sessão à organização selecionada. Ativação aprovada sincroniza o marcador entre contas ativas do mesmo Auth ID e revoga sessões anteriores; não ativa contas pendentes nem amplia papel. Duas alterações de senha da mesma identidade não começam simultaneamente. Gestor empresarial não ganha capacidade de redefinir uma identidade compartilhada com outro tenant. Novos usuários provisionados em empresas diferentes recebem Auth IDs distintos; coincidência de contato/username nunca mescla pessoas.

## Sessão, mídia e dados existentes

026 marca todas as identidades não anônimas existentes para exigir registro de sessão pela Platform API. O Super Admin entra novamente com a credencial existente pela opção global. Contas empresariais antigas passam por adoção explícita. Sessões carregam `session_id` do Auth verificado, usuário, organização, conta e geração. RLS consulta estado/geração/inatividade atuais, sem depender de refresh do frontend. JWT direto sem esse registro não autoriza empresa.

Os helpers históricos são preservados atrás de wrappers de sessão/escopo; policies são redirecionadas aos wrappers. Nenhuma policy empresarial foi aberta a anon. A nova policy pública é somente SELECT dos documentos legais publicados como documentos, sem dados empresariais. Helpers-base e tabelas privadas não têm grants de cliente. O gateway de imagens repassa o `session_id` extraído **após** verificar o JWT; `access_media` é service-only e mantém esse contexto ao chamar as funções de mídia já existentes. Assim, expiração/revogação vale também para mídia privada. Projeção pública e consumidores anônimos não recebem gate empresarial.

Frontend: pointerdown/keydown confiáveis atualizam atividade no máximo uma chamada a cada cinco segundos; polling/foco/refresh não. Timestamp não secreto é coordenado entre abas por usuário+sessão; a autorização é sempre do servidor. Logout desmonta o estado autenticado, limpa sessão e solicita revogação SQL com o token capturado. Se não houver rede, a revogação imediata remota não é garantida; limite de inatividade e verificações server-side continuam aplicáveis. Usuário malicioso pode fabricar requisições de atividade válidas da própria sessão, como em qualquer idle timeout convencional; não há alegação de prova criptográfica de presença humana ou vigilância de teclado.

## Proteção contra abuso e limites

Contadores persistem somente chave SHA-256 e janela/contagem. Padrão da API: 120 requisições/IP por 10min, 10 tentativas por identidade de login/validação, 30 operações/gestor por 10min; bloqueio temporário. Código tem ainda tentativas persistentes próprias (5). IP obtido do socket; proxy futuro requer estratégia explícita para não concentrar todos os usuários num endereço ou confiar em header forjado. Limites do Auth/CAPTCHA externos são complementares e pendentes. Nenhuma senha, código em claro, link privilegiado ou payload do provedor entra em logs de auditoria.

## Legal e política de transição

Documentos são minutas versionadas; metadados incluem grupo de aceite material. Nova versão editorial pode manter grupo; mudança material altera grupo e exige novo aceite institucional. Aceite guarda versões exatas, grupos, organização, administrador e data do servidor. Versões não podem ser alteradas/apagadas; somente marca `current` muda. Novas empresas exigem aceite antes de operar. Empresas já existentes conservam período de transição sem aceite presumido; ativar essa exigência depende de decisão do proprietário após revisão dos textos. E-mail de contato continua não verificado. Não foram definidos fornecedor, prazos contratuais, base legal definitiva ou jurisdição em nome do proprietário.
