import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../api";
import { commercialApi, commercialError } from "./api";
import { CopyLink } from "./CopyLink";
import { eligibleContact } from "./policy";
import { pageTemplates } from "../consumer/TemplatePicker";
import "./commercial-management.css";
export function Management() {
  const { section = "demonstracoes" } = useParams();
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [filter, setFilter] = useState(""),
    [purpose, setPurpose] = useState("demonstration"),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<any>(null),
    [link, setLink] = useState("");
  const key = useRef(crypto.randomUUID());
  const load = () => rpc<any>("commercial_management").then(setData);
  useEffect(() => {
    void load().catch((e) => setError(commercialError(e)));
  }, []);
  useEffect(() => {
    setError("");
    setNotice("");
    setPreview(null);
    setSelected([]);
  }, [section]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(commercialError(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section>
        <h1>Gestão Comercial</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Carregando sua carteira…"}
        </p>
      </section>
    );
  const demos = data.demos.filter((d: any) => {
    const c = data.contacts.find((c: any) => c.id === d.lead_id);
    return [d.name, c?.name, c?.email]
      .join(" ")
      .toLowerCase()
      .includes(filter.toLowerCase());
  });
  const eligible = demos.filter(
    (d: any) =>
      d.state === "available" &&
      new Date(d.expires_at).getTime() > Date.now() &&
      eligibleContact(
        data.contacts.find((c: any) => c.id === d.lead_id),
        purpose,
      ),
  );
  const titles: Record<string, string> = {
    demonstracoes: "Demonstrações",
    templates: "Biblioteca de templates",
    convites: "Convites",
    ativacoes: "Ativações vinculadas",
  };
  async function makePreview(ids = selected) {
    await act(async () => {
      const p = await commercialApi("preview", { demo_ids: ids, purpose });
      setPreview(p);
    });
  }
  return (
    <div className="commercial-management">
      <header>
        <p className="eyebrow">GESTÃO COMERCIAL</p>
        <h1>{titles[section] || "Gestão Comercial"}</h1>
        <p>
          Preparação e relacionamento comercial, separados da operação das
          empresas assinantes.
        </p>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="commercial-metrics">
        <article>
          <strong>{data.contacts.length}</strong>
          <span>Interessados na carteira</span>
        </article>
        <article>
          <strong>
            {data.deliveries.filter((d: any) => d.state === "accepted").length}
          </strong>
          <span>Convites aceitos pelo serviço de e-mail</span>
        </article>
        <article>
          <strong>{data.claims.length}</strong>
          <span>Ativações solicitadas</span>
        </article>
        <article>
          <strong>
            {data.conversions.filter((c: any) => c.paying).length}
          </strong>
          <span>Assinantes com período pago confirmado</span>
        </article>
      </div>
      {section === "demonstracoes" && (
        <>
          <div className="button-row">
            <label>
              Buscar demonstração
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            {data.can_manage && (
              <button
                onClick={() => {
                  key.current = crypto.randomUUID();
                  setEdit({
                    name: "",
                    slug: "",
                    lead_id: "",
                    plan_version_id: data.plans[0]?.id,
                    expires_at: new Date(
                      Date.now() + 14 * 86400000,
                    ).toISOString(),
                  });
                }}
              >
                Preparar demonstração
              </button>
            )}
          </div>
          {edit && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await rpc("commercial_demo_save", {
                    p_id: edit.id || null,
                    p_revision: edit.revision || 0,
                    p_key: key.current,
                    p_lead: f.get("lead"),
                    p_name: f.get("name"),
                    p_slug: f.get("slug"),
                    p_plan: f.get("plan"),
                    p_expires: new Date(String(f.get("expires"))).toISOString(),
                  });
                  setEdit(null);
                  setNotice(
                    "Preparação salva. Abra o configurador para cadastrar os serviços e a apresentação.",
                  );
                });
              }}
            >
              <h2>{edit.id ? "Revisar preparação" : "Nova demonstração"}</h2>
              <div className="commercial-fields">
                <label>
                  Interessado
                  <select
                    name="lead"
                    required
                    defaultValue={edit.lead_id}
                    disabled={!!edit.id}
                  >
                    {!edit.lead_id && <option value="">Selecione</option>}
                    {data.contacts.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.company} · {c.name}
                      </option>
                    ))}
                  </select>
                  {edit.id && (
                    <input type="hidden" name="lead" value={edit.lead_id} />
                  )}
                </label>
                <label>
                  Nome da empresa demonstrativa
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={160}
                    defaultValue={edit.name}
                  />
                </label>
                <label>
                  Endereço exclusivo
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9][a-z0-9-]{1,78}[a-z0-9]"
                    defaultValue={edit.slug}
                  />
                </label>
                <label>
                  Plano demonstrado
                  <select
                    name="plan"
                    required
                    defaultValue={edit.plan_version_id}
                  >
                    {data.plans.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Disponível até
                  <input
                    name="expires"
                    type="datetime-local"
                    required
                    defaultValue={new Date(
                      new Date(edit.expires_at).getTime() -
                        new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)}
                  />
                </label>
              </div>
              {edit.id && (
                <p>
                  Revisar dados ou regenerar o endereço invalida os acessos
                  anteriores e exige disponibilizar novamente a configuração.
                </p>
              )}
              <button disabled={busy}>Salvar preparação</button>
              <button type="button" onClick={() => setEdit(null)}>
                Cancelar
              </button>
            </form>
          )}
          <div className="commercial-cards">
            {demos.map((d: any) => (
              <article className="card" key={d.id}>
                <h2>{d.name}</h2>
                <p>
                  {
                    (
                      {
                        draft: "Em preparação",
                        available: "Disponível",
                        revoked: "Acesso revogado",
                      } as any
                    )[d.state]
                  }{" "}
                  · até {new Date(d.expires_at).toLocaleDateString("pt-BR")}
                </p>
                <p>/{d.slug}</p>
                <div className="button-row">
                  {data.can_manage && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const r = await commercialApi("editor", {
                              id: d.id,
                            });
                            setLink(r.url);
                            setNotice(
                              "Acesso temporário de preparação gerado. Abra somente para configurar esta demonstração.",
                            );
                          })
                        }
                      >
                        Abrir configurador real
                      </button>
                      <button
                        onClick={() => {
                          key.current = crypto.randomUUID();
                          setEdit(d);
                        }}
                      >
                        Revisar / regenerar endereço
                      </button>
                      <button
                        disabled={busy || d.state === "revoked"}
                        onClick={() =>
                          void act(async () => {
                            await rpc("commercial_demo_revoke", {
                              p_id: d.id,
                              p_revision: d.revision,
                            });
                            setNotice("Acessos revogados.");
                          })
                        }
                      >
                        Revogar acesso
                      </button>
                    </>
                  )}
                  {data.can_manage && d.state === "available" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const r = await commercialApi("invite", {
                            id: d.id,
                            purpose: "demonstration",
                          });
                          setLink(r.url);
                          setNotice(
                            "Link individual preparado. Não houve envio de e-mail.",
                          );
                        })
                      }
                    >
                      Gerar link para compartilhar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {section === "templates" && (
        <>
          <p>
            Os quatro layouts utilizam a mesma página pública, catálogo e
            regras. A seleção fica no rascunho e exige revisão antes de
            publicar.
          </p>
          <div className="commercial-cards">
            {pageTemplates.map(([id, name, description]) => (
              <article
                className={"card template-example template-" + id}
                key={id}
              >
                <div className="template-example-cover" />
                <h2>{name}</h2>
                <p>{description}</p>
                <div className="template-example-services">
                  <span>Serviço</span>
                  <span>Serviço</span>
                  <span>Serviço</span>
                </div>
                <Link to="/admin/comercial/demonstracoes">
                  Escolher uma demonstração para configurar
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
      {section === "convites" && (
        <>
          <p>
            Selecione os interessados autorizados. Cada convite utiliza seu
            próprio link e nenhum destinatário vê o endereço dos demais.
          </p>
          <div className="commercial-fields">
            <label>
              Finalidade
              <select
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setSelected([]);
                  setPreview(null);
                }}
              >
                <option value="demonstration">Demonstração</option>
                <option value="activation">Ativação vinculada</option>
              </select>
            </label>
            <label>
              Filtrar lista
              <input
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </div>
          <div className="button-row">
            <button
              disabled={!data.can_send || busy}
              onClick={() => {
                const emails = new Set();
                setSelected(
                  eligible
                    .filter((d: any) => {
                      const email = data.contacts
                        .find((c: any) => c.id === d.lead_id)
                        .email.toLowerCase();
                      if (emails.has(email)) return false;
                      emails.add(email);
                      return true;
                    })
                    .map((d: any) => d.id),
                );
                setPreview(null);
              }}
            >
              Selecionar todos os elegíveis desta lista ({eligible.length})
            </button>
            <button
              onClick={() => {
                setSelected([]);
                setPreview(null);
              }}
            >
              Limpar seleção
            </button>
            <button
              disabled={!data.can_send || busy || !selected.length}
              onClick={() => void makePreview()}
            >
              Revisar {selected.length} destinatários
            </button>
          </div>
          <div className="commercial-cards">
            {eligible.map((d: any) => {
              const c = data.contacts.find((c: any) => c.id === d.lead_id);
              return (
                <article className="card" key={d.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(e) => {
                        setSelected(
                          e.target.checked
                            ? [...selected, d.id]
                            : selected.filter((x) => x !== d.id),
                        );
                        setPreview(null);
                      }}
                    />
                    {d.name} · {c.name}
                  </label>
                  <p>{c.email}</p>
                  <button
                    disabled={!data.can_send || busy}
                    onClick={() => void makePreview([d.id])}
                  >
                    Revisar envio individual
                  </button>
                </article>
              );
            })}
          </div>
          {!eligible.length && (
            <p>Nenhum contato elegível para esta finalidade no filtro atual.</p>
          )}
          {preview && (
            <section className="card" aria-labelledby="send-review">
              <h2 id="send-review">Confirme {preview.count} destinatário(s)</h2>
              <p>
                Esta confirmação autoriza um envio individualizado. Envio não
                significa interesse, aceite ou contratação.
              </p>
              <ul>
                {preview.recipients.map((r: any) => (
                  <li key={r.lead_id}>
                    {r.name} · {r.company} · {r.email}
                    <button
                      disabled={busy}
                      onClick={() => {
                        const ids = preview.recipients
                          .filter((x: any) => x.lead_id !== r.lead_id)
                          .map((x: any) => x.demo_id);
                        if (ids.length) void makePreview(ids);
                        else setPreview(null);
                      }}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await commercialApi("send", {
                      id: preview.id,
                      hash: preview.hash,
                      items: preview.items,
                      confirmed: true,
                    });
                    setPreview(null);
                    setNotice(
                      `${r.deliveries.length} envio(s) autorizado(s). O processamento ocorre individualmente; atualize o histórico para conferir os resultados.`,
                    );
                  })
                }
              >
                Confirmar e enviar convites
              </button>
              <button disabled={busy} onClick={() => setPreview(null)}>
                Cancelar envio
              </button>
            </section>
          )}
          <h2>Histórico individual de envios</h2>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await commercialApi("recover", {});
              })
            }
          >
            Atualizar resultados
          </button>
          <div className="commercial-table">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Data</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d: any) => (
                  <tr key={d.id}>
                    <td>
                      {
                        data.contacts.find((c: any) => c.id === d.lead_id)
                          ?.company
                      }
                    </td>
                    <td>{new Date(d.created_at).toLocaleString("pt-BR")}</td>
                    <td>
                      {
                        (
                          {
                            queued: "Aguardando envio",
                            sending: "Processando",
                            accepted: "Aceito pelo serviço de e-mail",
                            failed: "Falha de envio",
                            uncertain:
                              "Resultado incerto — conferir antes de reenviar",
                            cancelled: "Cancelado por elegibilidade",
                          } as any
                        )[d.state]
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Convites emitidos</h2>
          {data.invites.map((i: any) => (
            <div className="card" key={i.id}>
              <p>
                {data.contacts.find((c: any) => c.id === i.lead_id)?.company} ·{" "}
                {i.purpose === "activation" ? "Ativação" : "Demonstração"} ·{" "}
                {i.revoked_at
                  ? "Revogado"
                  : new Date(i.expires_at).toLocaleString("pt-BR")}
              </p>
              <button
                disabled={busy || !!i.revoked_at}
                onClick={() =>
                  void act(async () => {
                    await rpc("commercial_invite_revoke", { p_id: i.id });
                  })
                }
              >
                Revogar convite
              </button>
            </div>
          ))}
        </>
      )}
      {section === "ativacoes" && (
        <>
          <p>
            O vínculo é aprovado exclusivamente pelo Super Admin. Receber o
            convite ou controlar o e-mail não comprova propriedade. A
            confirmação financeira continua no checkout existente.
          </p>
          {data.claims.map((q: any) => (
            <article className="card" key={q.id}>
              <h2>{q.company}</h2>
              <p>
                {q.responsible} ·{" "}
                {
                  (
                    {
                      requested: "Aguardando análise",
                      approved: "Vínculo aprovado",
                      rejected: "Vínculo não aprovado",
                      materialized: "Configuração vinculada à empresa",
                    } as any
                  )[q.state]
                }
              </p>
              <blockquote>{q.statement}</blockquote>
              {q.reviews?.length > 0 && (
                <details>
                  <summary>Histórico das análises ({q.reviews.length})</summary>
                  <ul>
                    {q.reviews.map((h: any) => (
                      <li key={h.id}>
                        {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                        {h.approved ? "Aprovado" : "Não aprovado"}: {h.note}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {data.is_root && q.state !== "materialized" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      await rpc("commercial_claim_review", {
                        p_id: q.id,
                        p_approve: f.get("decision") === "approve",
                        p_note: f.get("note"),
                      });
                      setNotice("Análise registrada no histórico.");
                    });
                  }}
                >
                  <label>
                    Conclusão
                    <select name="decision">
                      <option value="reject">Não aprovar</option>
                      <option value="approve">
                        Aprovar vínculo verificado
                      </option>
                    </select>
                  </label>
                  <label>
                    Fundamento da análise
                    <textarea
                      name="note"
                      required
                      minLength={20}
                      maxLength={1000}
                    />
                  </label>
                  <p>
                    Descreva a verificação proporcional realizada, sem incluir
                    documentos completos ou dados sensíveis.
                  </p>
                  <button disabled={busy}>
                    Registrar decisão do Super Admin
                  </button>
                </form>
              )}
            </article>
          ))}
          {!data.claims.length && (
            <p>Nenhuma solicitação de ativação nesta carteira.</p>
          )}
        </>
      )}
      {link && (
        <section className="card">
          <h2>Link preparado</h2>
          <CopyLink
            url={link}
            label={
              link.includes("editor=")
                ? "Copiar acesso de preparação"
                : "Copiar link individual"
            }
          />
          <a href={link} target="_blank" rel="noopener noreferrer">
            Abrir em outra aba
          </a>
          <button onClick={() => setLink("")}>Fechar</button>
        </section>
      )}
    </div>
  );
}
