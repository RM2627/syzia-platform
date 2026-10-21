import { useEffect, useRef, useState } from "react";
import { rpc } from "../api";
import { commercialStages, manualStages } from "./policy";
import "./commercial-management.css";
type Contact = {
  id: string;
  revision: number;
  name: string;
  company: string | null;
  segment: string;
  instagram: string;
  email: string | null;
  phone: string | null;
  first_contact: string | null;
  stage: string;
  display_stage?: string;
  notes: string;
  suppressed: boolean;
  authorizations: any[];
  owner_id: string;
};
type Context = {
  can_manage: boolean;
  can_send: boolean;
  is_root: boolean;
  contacts: Contact[];
  unassigned: { id: string; name: string; company: string }[];
};
const empty = {
  name: "",
  company: "",
  segment: "",
  instagram: "",
  email: "",
  phone: "",
  first_contact: "",
  stage: "prospect",
  notes: "",
};
const errors: Record<string, string> = {
  access_denied: "Seu acesso não permite consultar ou alterar esta carteira.",
  commercial_revision_conflict:
    "Este cadastro mudou em outra sessão. Reabra-o antes de salvar.",
  commercial_invalid: "Revise os campos informados.",
  commercial_event_required:
    "Esta etapa depende de um evento confirmado pela plataforma.",
  idempotency_conflict:
    "Esta tentativa já foi usada com outros dados. Reabra o cadastro.",
};
export function Interested() {
  const [data, setData] = useState<Context>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState(""),
    [stage, setStage] = useState(""),
    [editing, setEditing] = useState<Partial<Contact> | null>(null),
    [history, setHistory] = useState<any[] | null>(null),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const fail = (e: unknown) =>
    setError(
      errors[(e as Error)?.message] ||
        "Não foi possível concluir. Seus dados foram preservados; confira a conexão e tente novamente.",
    );
  async function load() {
    setData(await rpc<Context>("commercial_management"));
  }
  useEffect(() => {
    let alive = true;
    rpc<Context>("commercial_management")
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) fail(e);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const contacts =
    data?.contacts.filter(
      (c) =>
        (!stage || (c.display_stage || c.stage) === stage) &&
        `${c.name} ${c.company} ${c.segment} ${c.instagram}`
          .toLocaleLowerCase("pt-BR")
          .includes(filter.toLocaleLowerCase("pt-BR")),
    ) || [];
  function edit(c: Partial<Contact>) {
    key.current = crypto.randomUUID();
    setEditing(c);
    setHistory(null);
    setError("");
  }
  return (
    <div className="commercial-management">
      <p className="eyebrow">GESTÃO COMERCIAL</p>
      <h1>Interessados</h1>
      <p>Prepare o próximo contato e acompanhe cada apresentação.</p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Carregando sua carteira…</p>}
      {data && (
        <>
          <div className="commercial-stage-counts">
            {Object.entries(commercialStages).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={stage === id}
                onClick={() => setStage(stage === id ? "" : id)}
              >
                <strong>
                  {
                    data.contacts.filter(
                      (c) => (c.display_stage || c.stage) === id,
                    ).length
                  }
                </strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="button-row">
            <label>
              Buscar interessado
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Nome, empresa, segmento ou Instagram"
              />
            </label>
            {data.can_manage && (
              <button onClick={() => edit(empty)}>Cadastrar interessado</button>
            )}
          </div>
          <p>
            {contacts.length} interessado(s) no filtro. Contagens comerciais não
            representam faturamento.
          </p>
          <div className="commercial-contact-list">
            {contacts.map((c) => (
              <article className="card" key={c.id}>
                <h2>{c.company || c.name}</h2>
                <p>
                  {c.name} · {c.segment || "Segmento não informado"}
                </p>
                <p>
                  {c.instagram} · {c.email}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
                <p>
                  {commercialStages[c.display_stage || c.stage]}
                  {c.suppressed ? " · Contato bloqueado para envios" : ""}
                </p>
                <div className="button-row">
                  {data.can_manage && (
                    <button onClick={() => edit(c)}>Editar e acompanhar</button>
                  )}
                  <button
                    onClick={() =>
                      void act(async () => {
                        setHistory(
                          await rpc<any[]>("commercial_contact_history", {
                            p_id: c.id,
                          }),
                        );
                      })
                    }
                  >
                    Ver histórico
                  </button>
                </div>
              </article>
            ))}
          </div>
          {data.is_root && data.unassigned.length > 0 && (
            <details>
              <summary>
                Interesses recebidos pelo site ({data.unassigned.length})
              </summary>
              <p>
                Associe o registro à carteira sem duplicar o cadastro original.
              </p>
              {data.unassigned.map((l) => (
                <p key={l.id}>
                  {l.company} · {l.name}{" "}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        rpc("commercial_contact_adopt", { p_id: l.id }),
                      )
                    }
                  >
                    Adicionar à minha carteira
                  </button>
                </p>
              ))}
            </details>
          )}
          {history && (
            <section className="card" aria-label="Histórico comercial">
              <h2>Histórico</h2>
              {history.length ? (
                history.map((e) => (
                  <p key={e.id}>
                    <time>
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </time>{" "}
                    · {eventLabel(e.event)}
                    {e.detail ? ` — ${e.detail}` : ""}
                  </p>
                ))
              ) : (
                <p>Nenhum evento registrado.</p>
              )}
            </section>
          )}
        </>
      )}
      {editing && (
        <section
          key={key.current}
          className="card"
          aria-labelledby="contact-form-title"
        >
          <h2 id="contact-form-title">
            {editing.id ? "Atualizar interessado" : "Novo interessado"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = Object.fromEntries(f.entries());
              if (body.stage === "") delete body.stage;
              void act(async () => {
                await rpc("commercial_contact_save", {
                  p_id: editing.id || null,
                  p_revision: editing.revision || 0,
                  p_key: key.current,
                  p_data: body,
                });
                setEditing(null);
                setNotice("Cadastro salvo.");
              });
            }}
          >
            <div className="commercial-fields">
              <label>Nome do interessado ou da empresa<input name="name" required minLength={2} maxLength={120} defaultValue={editing.name || ""} /></label>
              <label>E-mail (opcional)<input name="email" type="email" maxLength={254} defaultValue={editing.email || ""} /></label>
            </div>
            <p>Você pode completar os dados e preparar os convites depois. Salvar não registra interesse nem autoriza envios.</p>
            <details><summary>Informações complementares (opcional)</summary>
            <div className="commercial-fields">
              {(
                [

                  ["company", "Empresa", "text", 160],
                  ["segment", "Segmento", "text", 120],
                  ["instagram", "Instagram", "text", 31],

                  ["phone", "WhatsApp (opcional)", "tel", 40],
                  ["first_contact", "Primeiro contato", "date", 20],
                ] as const
              ).map(([id, label, type, max]) => (
                <label key={id}>
                  {label}
                  <input
                    name={id}
                    type={type}
                    defaultValue={String(editing[id] || "")}

                    maxLength={max}
                    pattern={
                      id === "instagram" ? "@[A-Za-z0-9._]{1,30}" : undefined
                    }
                  />
                </label>
              ))}
              <label>
                Etapa comercial
                <select
                  name="stage"
                  defaultValue={
                    manualStages.includes(editing.stage || "")
                      ? editing.stage
                      : editing.id
                        ? ""
                        : "prospect"
                  }
                >
                  {editing.id &&
                    !manualStages.includes(editing.stage || "") && (
                      <option value="">
                        Manter etapa atual registrada pelo sistema
                      </option>
                    )}
                  {manualStages.map((k) => (
                    <option key={k} value={k}>
                      {commercialStages[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Observações comerciais
              <textarea
                name="notes"
                defaultValue={editing.notes}
                maxLength={4000}
              />
            </label>
            <p>
              Não registre documentos, senhas ou dados financeiros nas
              observações.
            </p>
            </details>
            <div className="button-row">
              <button disabled={busy}>Salvar cadastro</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Fechar
              </button>
            </div>
          </form>
          {editing.id && (
            <>
              <details><summary>Registrar contato ou resposta (opcional)</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(async () => {
                    await rpc("commercial_contact_note", {
                      p_id: editing.id,
                      p_event: f.get("event"),
                      p_detail: f.get("detail"),
                    });
                    setNotice("Contato registrado.");
                  });
                }}
              >
                <h3>Registrar contato ou resposta</h3>
                <label>
                  Tipo
                  <select name="event">
                    <option value="contact">Contato realizado</option>
                    <option value="response">Resposta recebida</option>
                  </select>
                </label>
                <label>
                  Registro
                  <textarea name="detail" required maxLength={1000} />
                </label>
                <button disabled={busy}>Adicionar ao histórico</button>
              </form>
              </details>
              <p>A autorização para convites é registrada na aba Convites, antes de gerar links ou preparar envios.</p>
              <details>
                <summary>Descadastramento de comunicações</summary>
                <p>
                  Bloqueia envios comerciais a este endereço, inclusive se
                  reaparecer em outro cadastro. Não altera a conta ou
                  comunicações essenciais do serviço.
                </p>
                <button
                  disabled={busy || !editing.email}
                  onClick={() =>
                    void act(async () => {
                      await rpc("commercial_contact_suppress", {
                        p_id: editing.id,
                      });
                      setNotice(
                        "Endereço bloqueado para comunicações comerciais.",
                      );
                    })
                  }
                >
                  Confirmar descadastramento comercial
                </button>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
function eventLabel(event: string) {
  return (
    (
      {
        demo_prepared: "Demonstração preparada",
        demo_revised: "Configuração revisada",
        demo_accessed: "Demonstração acessada",
        link_issued: "Convite emitido",
        link_revoked: "Convite revogado",
        mail_queued: "Envio autorizado",
        mail_accepted: "Aceito pelo serviço de e-mail",
        mail_failed: "Falha no envio",
        mail_uncertain: "Resultado de envio incerto",
        mail_cancelled: "Envio cancelado por elegibilidade",
        created: "Cadastro criado",
        updated: "Cadastro atualizado",
        assigned: "Responsável alterado",
        contact: "Contato realizado",
        response: "Resposta registrada",
        authorization: "Autorização atualizada",
        suppressed: "Descadastramento registrado",
      } as Record<string, string>
    )[event] || "Evento comercial"
  );
}
