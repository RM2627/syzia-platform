# SYZIA 049 — UX

`/planos` usa um único formatador para o limite de membros: “1 membro da equipe”, “3 membros da equipe”, “8 membros da equipe”. Zero continua zero; null/ausência continuam ilimitados. Preços, trial, benefícios e disponibilidade comercial não foram alterados.

O campo de telefone preserva a obrigatoriedade existente e o valor digitado quando inválido; valida DDD/formato, formata número brasileiro ao sair do campo e explica a finalidade de contato sobre a solicitação. O mesmo normalizador alimenta o atalho manual de WhatsApp.

Rótulos explícitos de campos, feedback de gravação/download, mensagens de erro, modal com foco/Escape e layouts responsivos integram os novos controles. Os testes focados verificam singular/plural, normalização e interações; o gate mantém UX-001. UX-002 não foi reaberta.

PDF e fonte são carregados somente ao pedir o download. O chunk de geração de PDF é maior que o aviso padrão do Vite (~1,1 MB minificado, ~507 KB gzip), mas fica fora do carregamento inicial. O aviso não foi ocultado ou o limite aumentado. A fonte local (~760 KB) permite acentos e não depende de CDN.
