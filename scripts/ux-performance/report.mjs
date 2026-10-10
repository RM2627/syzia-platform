import fs from "node:fs";
const dir = "reports/ux-performance";
const read = (f) =>
  JSON.parse(fs.readFileSync(`${dir}/${f}/measurements.json`)).results;
const merged = (groups) => {
  const map = new Map();
  for (const group of groups)
    for (const r of read(group))
      map.set(r.id, { ...r, evidence: `${dir}/${group}/measurements.json` });
  return map;
};
const before = merged(["before", "before-supplement", "before-actions"]),
  after = merged(["after", "after-supplement", "after-actions"]);
function globalCount(r) {
  if (!r) return "—";
  let active = false,
    count = 0;
  for (const f of r.frames) {
    if (!f.statuses) continue;
    const now = f.shell === false && f.statuses.length > 0;
    if (now && !active) count++;
    active = now;
  }
  return count;
}
const number = (r) => (r ? r.requests.length : "—");
const rpcCount = (r) =>
  r ? r.requests.filter((q) => q.path.includes("/rest/v1/rpc/")).length : "—";
const timing = (r) =>
  r?.durationMs ? `${(r.durationMs / 1000).toFixed(2)} s` : "—";
let text =
  "# Matriz antes × depois\n\nBuild de produção sobre a fixture SQL/HTTP sintética da 044; Chromium 153. Latência acrescentada: 120 ms por API/mídia e 250 ms por chunk JS. Desktop 1440 px; mobile 390 px. `Tempo` é a janela de estabilização do instrumento (inclui 650 ms sem tráfego), não latência pura nem percentil de produção. As medições são execuções pontuais, sem intervalo estatístico.\n\n`G` = episódios de status de carregamento sem shell visível; inclui bootstrap/login quando há recarga de documento. Não conta quatro blocos locais da Home como quatro loaders globais. `R` = requests observadas à API/servidor de mídia; `RPC` = subconjunto de RPCs. Polling e atividade de sessão podem variar R sem alteração funcional.\n\n| Fluxo / sonda | Largura | G antes → depois | R antes → depois | RPC antes → depois | Tempo antes → depois | Resultado / evidência |\n|---|---:|---:|---:|---:|---|---|\n";
const matrix = [];
for (const [id, a] of after) {
  const b = before.get(id);
  const status = id.startsWith("ticket-2-")
    ? "UX-001: abertura muda rota/fila; troca efetiva medida em `ticket-switch-*`."
    : a.status === "RECORDED"
      ? "Registrado; sem overflow horizontal."
      : a.status;
  matrix.push({ id, before: b, after: a });
  text += `| ${id} | ${a.viewport.width} | ${globalCount(b)} → ${globalCount(a)} | ${number(b)} → ${number(a)} | ${rpcCount(b)} → ${rpcCount(a)} | ${timing(b)} → ${timing(a)} | ${status} [Depois](${a.evidence})${b ? ` · [Antes](${b.evidence})` : ""} |\n`;
}
text +=
  "\n## Regressões focadas adicionais\n\n| Cenário | Resultado | Evidência |\n|---|---|---|\n";
for (const r of read("after-guards"))
  text += `| ${r.id} | ${r.status === "RECORDED" ? "PASS (asserções executadas)" : "FAIL"} | [Dados](${dir}/after-guards/measurements.json) |\n`;
text +=
  "\n## Cobertura dos 30 fluxos da especificação\n\n“Navegador/gate” significa que o fluxo foi exercitado pela regressão vigente, sem cronometragem específica antes/depois nesta rodada. Não é apresentado como benchmark. As 30 specs do navegador incluem uma spec de navegação com subcasos desktop/mobile.\n\n| Nº | Fluxo solicitado | Evidência desta rodada | Limite da medição |\n|---:|---|---|---|\n";
const flows = [
  [
    "Login → empresa → Home",
    "login-*; gate: Login por identidade",
    "Sessão + destino; UX-002 pendente",
  ],
  [
    "Minhas empresas → Abrir empresa",
    "root-open-cold; open-company-*",
    "Produção fria; shell e RPCs instrumentados",
  ],
  [
    "Trocar empresa/contexto",
    "gate: Login uma/múltiplas empresas, isolamento/sessões; chave explícita de PermissionProvider",
    "Sem benchmark isolado A→B com conta real",
  ],
  ["Home → Agenda", "route-agenda-*", "Clique real quando link visível"],
  [
    "Home → Precisa da sua atenção",
    "route-pendencias-*; gate Home e falha isolada",
    "Painel de pendências e links existentes",
  ],
  [
    "Home → Atendimento",
    "route-atendimento-*",
    "UX-001 preservado para aprovação",
  ],
  [
    "Home → Cliente",
    "route-clientes-*; gate Home",
    "Lista/CTA e consulta de contexto do cliente",
  ],
  [
    "Agenda: data/visualização",
    "agenda-week-*; agenda-month-*; gate remarcação",
    "Disponibilidade sempre revalidada",
  ],
  [
    "Consultar disponibilidade",
    "gate 042: serviço contínuo e divisível",
    "Sem cronometragem antes/depois específica",
  ],
  [
    "Abrir/trocar tickets",
    "ticket-open-*, ticket-switch-*; UX-001",
    "Exige reselecionar Todos após rota global",
  ],
  [
    "Assumir atendimento",
    "claim-*; gate colaborador sem grants",
    "Fixture com presença Disponível",
  ],
  [
    "Enviar mensagem",
    "send-message-*",
    "Comando seguido de duas leituras independentes",
  ],
  [
    "Cliente/histórico",
    "client-context-*; gate navegação e ficha",
    "Sem novo histórico/fluxo criado",
  ],
  [
    "Comercial/oportunidade",
    "route-comercial-*; gate retorno abre oportunidade",
    "Sem carga de alto volume",
  ],
  [
    "Abrir/montar proposta",
    "quote-open-*; gate Calculadora",
    "Envio e aprovação no gate",
  ],
  [
    "Visualizar como cliente/enviar proposta",
    "gate 042 Calculadora e aprovação",
    "Não confundir com page-preview-* (página empresarial)",
  ],
  [
    "Acompanhamento do consumidor",
    "gate 040/042 consumidor/execução",
    "Sem benchmark remoto",
  ],
  [
    "Aprovar proposta",
    "gate 042 Calculadora; SQL 044 aprovação",
    "Sem repetição de auditoria funcional mestre",
  ],
  [
    "Consultar horários",
    "gate 042 contínuo/divisível; 040 FAQ→horários",
    "Horário obsoleto não cacheado",
  ],
  [
    "Pessoas e acessos",
    "route-acessos-*; gate Equipe/Identidades",
    "Regras intactas",
  ],
  [
    "Serviços",
    "route-servicos-*; category-save-refresh",
    "Categoria reutiliza snapshot autorizado",
  ],
  [
    "Página pública → serviço → solicitação",
    "public-*, public-services-*, public-request-*; gate consumidor",
    "Latência local artificial",
  ],
  ["Métricas", "route-metricas-*; gate navegação", "Filtros/SQL não alterados"],
  [
    "Financeiro",
    "route-financeiro-*; gate navegação",
    "Sem alteração de regra financeira",
  ],
  [
    "Plano/assinatura",
    "route-assinatura-*; gate planos/homologação",
    "Consulta de capacidades 2→1; mesmas decisões",
  ],
  [
    "Configurações",
    "route-configuracao-*; configuration-reuse",
    "Contexto reaproveitado na mesma montagem/empresa",
  ],
  [
    "Manual/FAQ/respostas/regras",
    "route-manual/faq/respostas/regras-*; gate Manual",
    "Polling e refresh após comandos mantidos",
  ],
  [
    "Voltar após edição",
    "category-save-refresh; configuration-reuse; gate rascunhos/mídia",
    "Sem cache persistente entre telas desmontadas",
  ],
  [
    "Mobile consumidor",
    "public-*-390; gate FAQ, proposta, execução, marca e enquadramento",
    "Browser em viewport mobile; sem aparelho físico/teclado nativo",
  ],
  [
    "Mobile empresarial",
    "rotas 390; guards 320/768; gate 390",
    "Viewport e scroll; sem hardware móvel real",
  ],
];
flows.forEach(
  (r, i) => (text += `| ${i + 1} | ${r[0]} | ${r[1]} | ${r[2]} |\n`),
);
text +=
  "\nEvidência do gate: [resultado](reports/ux-performance/gate-final/current-gate.json), [navegador](reports/ux-performance/gate-final/browser.json), [subcasos de navegação](reports/ux-performance/gate-final/ui/resultados.json). As sondas `ticket-2-*` preservam o achado de navegação; a troca funcional posterior aparece em `ticket-switch-*`, não foi tratada como PASS retroativo.\n";
fs.writeFileSync("MATRIZ-ANTES-DEPOIS.md", text);
fs.writeFileSync(
  `${dir}/comparison-matrix.json`,
  JSON.stringify(matrix, null, 2),
);
console.log("Measured before/after rows", matrix.length);
