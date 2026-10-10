import { usePermissions, sectionAction } from "../permissions/Permissions";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import "./operations.css";
type Item = {
  id: string;
  label: string;
  href: string;
  complete: boolean;
  required: boolean;
  note: string;
};
type Guide = {
  status: "not_started" | "in_progress" | "completed" | "skipped";
  step: number;
  revision: number;
};
type Setup = {
  items: Item[];
  ready: boolean;
  shared_support: boolean;
  guide: Guide;
};
const tour = [
  [
    "Início: o que fazer hoje",
    "Veja sua agenda do dia, o próximo cliente e as decisões que precisam de você.",
    "",
  ],
  [
    "Agenda",
    "Consulte o dia ou a semana. Abra um horário para ver o que foi contratado, iniciar e concluir o serviço.",
    "agenda",
  ],
  [
    "Pendências",
    "Sua equipe mostra o contexto e o que precisa decidir. Responda aqui para o atendimento continuar.",
    "pendencias",
  ],
  [
    "Atendimento",
    "Acompanhe as conversas. A equipe segue as orientações e os limites definidos pela empresa.",
    "atendimento",
  ],
  [
    "Métricas",
    "Analise os resultados. Valores orçados e aprovados são diferentes de receita recebida.",
    "metricas",
  ],
];
const help: Record<string, [string, string]> = {
  manual: [
    "Manual da empresa — Opcional",
    "Organize informações e orientações para sua equipe consultar quando necessário. A operação da equipe própria não depende do Manual.",
  ],
  autonomia: [
    "Você mantém o controle",
    "Defina o que a equipe pode resolver e quais decisões exigem sua autorização. Quando faltar informação ou autonomia, a equipe consulta você.",
  ],
  comercial: [
    "Nenhum interessado esquecido",
    "Organize o próximo contato, confira a autorização do cliente e registre o resultado. Nenhuma mensagem é enviada automaticamente.",
  ],
  atendimento: [
    "Uma conversa, um responsável",
    "Equipe própria e compartilhada trabalham conforme seus vínculos. Assumir um atendimento define quem continua a conversa.",
  ],
  prontidao: [
    "Prepare o suporte compartilhado",
    "Você define como sua empresa atende. Nossa equipe segue suas orientações. Revise informações, Manual, equipe e limites antes de ativar o apoio compartilhado. Sua equipe própria pode operar sem Manual.",
  ],
  metricas: [
    "Entenda os indicadores",
    "O período e a origem dos dados aparecem junto dos indicadores. Conclusão de serviço, conversão e pagamento são fatos diferentes.",
  ],
};
export function CompanyExperience({
  org,
  user,
  children,
}: {
  org: string;
  user: string;
  children: ReactNode;
}) {
  const { can, data: permissions } = usePermissions();
  const base = "/painel/" + org,
    location = useLocation(),
    navigate = useNavigate(),
    section = location.pathname.slice(base.length + 1),
    [data, setData] = useState<Setup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const generation = useRef(0),
    guideHeading = useRef<HTMLHeadingElement>(null);
  const reload = useCallback(async () => {
    const g = ++generation.current;
    if (!can("settings.manage")) {
      setData(null);
      setError("");
      return;
    }
    try {
      const x = await rpc<Setup>("onboarding_context", { p_org: org });
      if (g === generation.current) {
        setData(x);
        setError("");
      }
    } catch (e) {
      if (g === generation.current) {
        setData(null);
        setError(errorMessage(e));
      }
    }
  }, [org, user, permissions]);
  useEffect(() => {
    setData(null);
  }, [reload]);
  useEffect(() => {
    // One read per navigation. The previous mount + navigation effects both
    // requested the same context, even in a production build.
    void reload();
    return () => {
      generation.current++;
    };
  }, [location.pathname, location.hash, reload]);
  useEffect(() => {
    const f = () => void reload();
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, [reload]);
  useEffect(() => {
    if (data?.guide.status === "in_progress") guideHeading.current?.focus();
  }, [data?.guide.step, data?.guide.status]);
  async function act(action: string) {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const x = await rpc<Setup>("onboarding_act", {
        p_org: org,
        p_action: action,
        p_revision: data.guide.revision,
        p_key: crypto.randomUUID(),
      });
      generation.current++;
      setData(x);
      if (x.guide.status === "in_progress")
        navigate(
          base + (tour[x.guide.step][2] ? "/" + tour[x.guide.step][2] : ""),
        );
    } catch (e) {
      await reload();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!location.hash) return;
    const jump = () => {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        const details = target.closest("details");
        if (details) details.open = true;
        target.scrollIntoView({ block: "start" });
        return true;
      }
      return false;
    };
    if (jump()) return;
    const observer = new MutationObserver(() => {
      if (jump()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname, location.hash]);
  const required = data?.items.filter((i) => i.required) || [],
    done = required.filter((i) => i.complete).length,
    show = section === "" || section === "ajuda";
  return (
    <div className="op-experience">
      <nav className="op-nav" aria-label="Navegação da empresa">
        {[
          ["", "Início"],
          ["pagina", "Página da empresa"],
          ["agenda", "Agenda"],
          ["clientes", "Clientes"],
          ["orcamentos", "Orçamentos"],
          ["comercial", "Comercial"],
          ["pendencias", "Pendências"],
          ["atendimento", "Atendimento"],
          ["metricas", "Métricas"],
          ["financeiro", "Financeiro"],
          ["configuracao", "Configurações"],
          ["assinatura", "Plano e assinatura"],
          ["acessos", "Pessoas e acessos"],
          ["suporte", "Suporte SYZIA"],
          ["ajuda", "Ajuda"],
        ]
          .filter(([p]) =>
            p === "financeiro"
              ? can("analytics.financial") ||
                Object.keys(permissions?.actions || {}).some(
                  (a) => a.startsWith("finance.") && can(a),
                )
              : p === "pagina"
                ? can("page.read") || can("portfolio.read")
                : can(sectionAction[p] || "settings.read"),
          )
          .map(([p, label]) => (
            <NavLink
              key={p}
              end
              to={base + (p ? "/" + p : "")}
              data-tour={p || "home"}
            >
              {label}
            </NavLink>
          ))}
      </nav>
      {error && (
        <p role="alert" className="notice error">
          {error}{" "}
          <button onClick={() => void reload()}>Tentar novamente</button>
        </p>
      )}
      {show && data && (!data.ready || section === "ajuda" || open) && (
        <section className="op-setup" aria-labelledby="setup-title">
          <div className="op-section-title">
            <div>
              <span className="eyebrow">COMECE COM O ESSENCIAL</span>
              <h2 id="setup-title">
                {data.ready
                  ? "Sua empresa está preparada"
                  : "Vamos preparar sua empresa"}
              </h2>
              <p>
                Você pode sair e voltar. Esta lista acompanha as informações
                salvas da empresa.
              </p>
            </div>
            <strong>
              {done} de {required.length} essenciais
            </strong>
          </div>
          <progress
            value={done}
            max={required.length || 1}
            aria-label="Configuração essencial concluída"
          />
          {data.shared_support && (
            <p className="op-hint">
              Apoio compartilhado, conforme disponibilidade: você define como sua empresa
              atende. Nossa equipe segue suas orientações.
            </p>
          )}
          <div className="op-checklist">
            {data.items.map((i) => (
              <Link
                key={i.id}
                to={
                  ["branding", "portfolio", "page", "publication"].includes(
                    i.id,
                  )
                    ? base +
                      "/pagina" +
                      (i.id === "branding"
                        ? "#identidade"
                        : i.id === "portfolio"
                          ? "#portfolio"
                          : "#publicacao")
                    : i.href
                }
                className={i.complete ? "is-done" : ""}
              >
                <span aria-hidden="true">{i.complete ? "✓" : "○"}</span>
                <div>
                  <strong>{i.label}</strong>
                  <small>
                    {i.complete
                      ? "Concluído"
                      : i.required
                        ? "A configurar"
                        : "Recomendado / opcional"}
                  </small>
                  <p>{i.note}</p>
                </div>
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {show && data?.ready && section !== "ajuda" && !open && (
        <button className="op-setup-link" onClick={() => setOpen(true)}>
          Revisar checklist de configuração
        </button>
      )}
      {show && data?.ready && data.guide.status === "not_started" && (
        <section className="op-tour-invite">
          <div>
            <strong>Conheça sua rotina em cinco passos</strong>
            <p>Um tour curto e opcional para encontrar o que importa.</p>
          </div>
          <button disabled={busy} onClick={() => void act("start")}>
            Iniciar tutorial
          </button>
          <button disabled={busy} onClick={() => void act("skip")}>
            Pular
          </button>
        </section>
      )}
      {help[section] && (
        <details className="op-context-help">
          <summary>{help[section][0]} · Ajuda rápida</summary>
          <p>{help[section][1]}</p>
        </details>
      )}
      {section === "ajuda" ? (
        <section className="card">
          <h1>Ajuda para sua rotina</h1>
          <p>
            Volte ao tour quando quiser. Refazer não altera a configuração da
            empresa.
          </p>
          <button
            className="primary"
            disabled={!data || busy}
            onClick={() => void act("restart")}
          >
            Refazer tutorial
          </button>
          <div className="op-help-grid">
            {Object.entries(help).map(([key, [title, text]]) => (
              <article key={key}>
                <h2>{title}</h2>
                <p>{text}</p>
                <Link to={base + "/" + key}>
                  Abrir {key === "prontidao" ? "prontidão" : key}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : (
        children
      )}
      {data?.guide.status === "in_progress" && (
        <section className="op-tour" role="region" aria-label="Tutorial guiado">
          <span className="eyebrow">PASSO {data.guide.step + 1} DE 5</span>
          <h2 ref={guideHeading} tabIndex={-1}>
            {tour[data.guide.step][0]}
          </h2>
          <p>{tour[data.guide.step][1]}</p>
          <div className="op-tour-actions">
            <button disabled={busy} onClick={() => void act("skip")}>
              Pular
            </button>
            <button
              disabled={busy || data.guide.step === 0}
              onClick={() => void act("previous")}
            >
              Anterior
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(data.guide.step === 4 ? "complete" : "next")
              }
            >
              {data.guide.step === 4 ? "Concluir" : "Próximo"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
