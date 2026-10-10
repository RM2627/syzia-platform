# SYZIA 037 — reapresentação das credenciais

Correção focada sobre o consolidado 036 mais recente, SHA-256 `9a928f4b402032698b531d46a743772d7ee1fb1841c9878cd32af6d10067e0b2`. Entrega local concluída; parar para homologação do proprietário.

## Causa reproduzida na 036

Na ficha da pessoa, **Segurança → Gerar novo código de primeiro acesso**, a API devolvia corretamente `temporary_code`, `activation_link` e `reissued`. O estado `issued` recebia essa resposta e o componente `Instructions` era renderizado acima da lista. Porém, não recebia foco nem scroll, enquanto o executor genérico da ação exibia **“Alteração salva.”**

Na reprodução com a 036 intacta, o painel estava no DOM, mas totalmente fora da área visível: topo em −2200 px e final em −1624 px. O foco estava no `BODY`. Portanto, a falha era de apresentação/feedback; o backend não havia perdido o par emitido. Evidências: `reports/syzia-037/diagnostico-036.json`, `browser-baseline036.json` e `antes-036.png`.

## Correção

Reutilizado o mesmo componente `Instructions`, sem segunda implementação:

- Recebe foco programático e scroll ao aparecer ou receber outra emissão. A região é focável sem entrar na sequência normal de Tab.
- Na reemissão, mostra **“Novo acesso gerado”**, nome e username retornados pela emissão, novo código e novo link.
- Informa: **“O código e o link anteriores não são mais válidos. Compartilhe estas novas instruções com a pessoa.”**
- Mantém Copiar instruções de acesso, Copiar código e Copiar link, com feedback individual. Corrigida a concordância do feedback para **“Instruções copiadas.”**.
- A mensagem copiada informa que o acesso foi atualizado e usa exclusivamente o código/link daquela emissão.
- Ações de emissão/retomada na ficha deixam de exibir a confirmação genérica. Outras alterações preservam seu feedback anterior.
- Ao iniciar outra operação, o painel anterior é limpo. Se a reemissão falhar, não aparece painel novo nem sucesso. Fechar, sair da página ou recarregar não permite recuperar o segredo pela interface; é necessário reemitir.

O backend, as RPCs e o protocolo 036 permanecem byte a byte iguais. O link continua identificando a preparação e o código comprovando a ativação. Nenhum Código empresarial foi reintroduzido. Não há consulta permanente de credenciais nem novo armazenamento em texto puro.

## Testes executados

| Validação local | Resultado |
|---|---:|
| SQL/PGlite: emissão inicial, reemissão com preservação, invalidar par/prova antigos, falta de autorização, expiração e ativação de uso único | 6 aprovados |
| Navegador: percurso completo desktop e celular, mais falha de reemissão | 3 aprovados |
| Typecheck e build | Aprovados |
| Inspeção do bundle com marcador exclusivo do servidor | Aprovada |

**9 casos finais aprovados; zero falhas, ignorados ou flaky.** A reprodução anterior da 036 foi registrada separadamente e não entra nesse total.

Os percursos de navegador verificaram emissão inicial e reemissão, foco real no painel, posição na área visível, três cópias com conteúdo exato e feedback, estado pendente, isolamento de outra pessoa, recarga sem recuperação em localStorage/sessionStorage, nova reemissão após recarga e ativação do novo par em outra sessão. O par anterior e o usado foram recusados. O caso de falha simulou resposta de erro antes de alcançar o backend e confirmou ausência de novo painel/sucesso, manutenção do cadastro e validade do par anterior.

No banco local, foram usadas as RPCs reais da 036 com Auth simulado. A comparação inclui uma pessoa vinculada explicitamente a empresa com trial previamente concedido, outra pessoa independente, identidades Auth, perfis, vínculos, papéis, organizações, concessões de trial e assinaturas. A reemissão não alterou esses dados nem criou identidades adicionais. A recusa por falta de autorização foi exercitada nas RPCs existentes, sem alteração das contas.

Durante a validação, o teste detectou o feedback antigo “Instruções copiados.”; a mensagem foi corrigida e a suíte passou. Também foi ajustado o nome de schema usado pelo teste de preservação da assinatura, sem mudança de banco. Evidências finais em `reports/syzia-037/`; capturas desktop/celular inspecionadas.

## Arquivos e preservação

Arquivos funcionais alterados:

1. `src/access/PeopleAccess.tsx`: feedback específico nas operações de credenciais e limpeza de aviso anterior.
2. `src/access/EnterpriseAccess.tsx`: foco/scroll e conteúdo do painel compartilhado `Instructions`.
3. `src/access/access-instructions.ts`: texto de compartilhamento após reemissão.

Também acompanham testes focados, configuração Playwright, comandos no `package.json`, ajuste do nome de saída/exclusões no empacotador e documentação. Relação completa em `reports/syzia-037/release-inventory.json`.

Todos os arquivos da base 036 foram preservados. **Nenhuma migration nova:** as 34 migrations existentes (001–033 e 036) permanecem intactas. Backend, Auth, RPCs, RLS, grants, seletor, regras de username, landing, demo, capa, mídia, financeiro, billing, planos, aquisição, onboarding, estilos e lockfile foram preservados.

## Limites e encerramento

Validação exclusivamente local: PGlite, adaptador Auth fictício e Chromium/Playwright. Supabase/Auth/PostgREST reais não foram acessados; não houve SMTP real, reset, auditoria mestre, deploy ou produção. O proprietário deve homologar a reapresentação no ambiente em que encontrou a regressão, seguindo o guia da 037. Não iniciar nova fase automaticamente.
