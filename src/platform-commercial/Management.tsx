const Studio = lazy(() => import("../studio/Studio").then(m => ({default:m.Studio})));
import { InvitationPreparation } from "./InvitationPreparation";
import {PreparationEditor} from './PreparationEditor';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../api";
import { commercialApi, commercialError } from "./api";
import { CopyLink } from "./CopyLink";
import { eligibleContact, eligibleDemoLink } from "./policy";
import { pageTemplates } from "../consumer/TemplatePicker";
import "./commercial-management.css";
// Record explicit administrator attestation; no free-text evidence field.
function ContactAuthorization({ contact, purpose, busy, onSaved }: {
  contact: any; purpose: string; busy: boolean; onSaved: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  if (!contact?.email || contact.suppressed) return null;
  return (
    <form className="sy-form-card" onSubmit={e => {
      e.preventDefault();
      if (!confirmed) return;
      void onSaved(async () => {
        await rpc("commercial_contact_authorize", {
          p_id: contact.id, p_purpose: purpose, p_authorized: true,
          p_notice: "commercial-v1", p_evidence: "Declaracao do operador: confirmou autorizacao de contato",
          p_expires: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
        setConfirmed(false);
      });
    }}>
      <strong>Registrar autorização de contato</strong>
      <p>Registre apenas uma autorização realmente concedida para {purpose === "activation" ? "ativação" : "demonstração"}, ao endereço exibido acima.</p>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo que recebi autorização expressa deste destinatário para esta finalidade.</label>
      <button type="submit" disabled={busy || !confirmed}>Registrar autorização</button>
    </form>
  );
}
export function Management() {
  const { section = "demonstracoes" } = useParams();
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [editor,setEditor]=useState<any>(null),
    [leadSelection,setLeadSelection]=useState<Record<string,string>>({}),
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
    setEditor(null);
    setLink("");
  }, [section]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
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
  if(section === "studio") return <Suspense fallback={<p role="status">Abrindo Demo Studio…</p>}><Studio/></Suspense>;
  if(editor)return <PreparationEditor definition={editor} onClose={()=>{setEditor(null);void load();}}/>;
  const listed = section === "convites" ? data.demos.flatMap((d:any)=>(data.links||[]).filter((l:any)=>l.demo_id===d.id).map((l:any)=>({...d,demo_id:d.id,id:d.id+":"+l.lead_id,lead_id:l.lead_id}))) : data.demos;
  const demos = listed.filter((d: any) => {
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
  const recipientEmails = new Set<string>();
  const uniqueEligible = eligible.filter((d: any) => {
    const email = data.contacts.find((c: any) => c.id === d.lead_id).email.toLowerCase();
    if (recipientEmails.has(email)) return false;
    recipientEmails.add(email); return true;
  });
  const titles: Record<string, string> = {
    demonstracoes: "Demonstrações",
    templates: "Biblioteca de templates",
    convites: "Convites",
    ativacoes: "Ativações vinculadas",
  };
  async function makePreview(ids = selected) {
    await act(async () => {
      const recipients=ids.map(id=>{const d=eligible.find((x:any)=>x.id===id);if(!d)throw Error('commercial_contact_not_authorized');return {demo_id:d.demo_id,lead_id:d.lead_id};});
      const p = await commercialApi("preview", { recipients, purpose });
      setPreview(p);
    });
  }
  return (
    <div className={"commercial-management" + (section === "convites" ? " commercial-invitations" : "")}>
      <header>
        <p className="eyebrow">GESTÃO COMERCIAL</p>
        <h1>{titles[section] || "Gestão Comercial"}</h1>
        <p>
          {section === "convites" ? "Escolha os destinatários e compartilhe cada experiência com um link exclusivo." : "Preparação e relacionamento comercial, separados da operação das empresas assinantes."}
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
      {section !== "convites" && <div className="commercial-metrics">
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
      </div>}
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
                    plan_version_id: null,
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
                    p_lead: null,
                    p_name: f.get("name"),
                    p_slug: edit.slug || null,
                    p_plan: null,
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
                  Nome da empresa demonstrativa
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={160}
                    defaultValue={edit.name}
                  />
                </label>
                <p>O endereço exclusivo é gerado e reservado ao salvar. Interessados podem ser vinculados depois. O plano será escolhido na ativação.</p>
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
                  As alterações ficam em rascunho até a revisão e publicação. O endereço é preservado.
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
                        ready:"Revisada",suspended:"Suspensa",expired:"Expirada",archived:"Arquivada",
                        available: "Disponível",
                        revoked: "Acesso revogado",
                      } as any
                    )[d.state]
                  }{" "}
                  · até {new Date(d.expires_at).toLocaleDateString("pt-BR")}
                </p>
                <p>/{d.slug}</p>
                {d.state==='available'&&import.meta.env.VITE_COMMERCIAL_DEMO_ORIGIN&&<CopyLink url={(import.meta.env.VITE_COMMERCIAL_DEMO_ORIGIN||'').replace(/\/$/,'')+'/'+d.slug}/>}
                {data.can_manage&&<label>Interessado para vincular ou convidar<select value={leadSelection[d.id]||''} onChange={e=>{const id=e.target.value;setLeadSelection(x=>({...x,[d.id]:id}));if(id)void act(async()=>{await rpc('commercial_demo_link',{p_demo:d.id,p_lead:id});});}}><option value="">Selecione quando necessário</option>{data.contacts.map((c:any)=><option key={c.id} value={c.id}>{c.company || c.name}{c.company ? ` · ${c.name}` : ""}</option>)}</select></label>}
                <p>{(data.links||[]).filter((l:any)=>l.demo_id===d.id).length} interessado(s) vinculado(s)</p>
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
                            setEditor(r);
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
                        Editar dados da preparação
                      </button>
                      <button
                        disabled={busy || ["revoked","suspended"].includes(d.state)}
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
                      disabled={busy || !leadSelection[d.id]}
                      onClick={() =>
                        void act(async () => {
                          const r = await commercialApi("invite", {
                            id: d.id,
                            lead_id: leadSelection[d.id],
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
          <p className="invitation-guidance">Links de demonstração podem ser compartilhados pelo canal combinado, sem e-mail. Envio por e-mail exige endereço e autorização vigentes; ativação mantém a vinculação segura da identidade.</p>
          <div className="commercial-fields">
            <label>
              Finalidade
              <select
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setLink("");
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
                  setSelected([]);
                  setPreview(null);
                }}
              />
            </label>
          </div>
          <div className="button-row invitation-toolbar" aria-label="Seleção de destinatários">
            <button
              disabled={!data.can_send || busy || !uniqueEligible.length}
              onClick={() => {
                setSelected(uniqueEligible.map((d: any) => d.id));
                setPreview(null);
              }}
            >
              Selecionar todos os elegíveis desta lista ({uniqueEligible.length})
            </button>
            <button
              disabled={busy || !selected.length}
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
              Enviar selecionados ({selected.length})
            </button>
          </div>
          <div className="commercial-cards">
            {demos.map((d: any) => {
              const c = data.contacts.find((c: any) => c.id === d.lead_id);
              const linkReady = purpose === "demonstration" ? eligibleDemoLink(c, d) : eligible.some((x: any) => x.id === d.id);
              const ready = eligible.some((x: any) => x.id === d.id);
              const duplicate = selected.some(id => {
                const row = demos.find((x: any) => x.id === id);
                const other = data.contacts.find((x: any) => x.id === row?.lead_id);
                return id !== d.id && c?.email && other?.email?.toLowerCase() === c.email.toLowerCase();
              });
              const previous = data.invites.filter((i: any) => i.demo_id === d.demo_id && i.lead_id === d.lead_id && i.purpose === purpose);
              return (
                <article className="card" key={d.id} aria-label={`${d.name} · ${c.name}`}>
                  <label className="invitation-recipient">
                    <input type="checkbox" checked={selected.includes(d.id)} disabled={!data.can_send || busy || !ready || !!duplicate}
                      onChange={e => { setSelected(e.target.checked ? [...selected, d.id] : selected.filter(x => x !== d.id)); setPreview(null); }} />
                    <span><strong>{c.name}</strong><span className="invitation-company">{d.name}</span></span>
                  </label>
                  {c.email && <p className="invitation-address">{c.email}</p>}
                  <small className="invitation-meta">{previous.length} convite(s) anterior(es) · {d.published_version_id ? "Versão publicada" : "Sem versão publicada"}</small>
                  <p className={"invitation-status" + (ready ? " is-ready" : "")}>{ready ? "Elegível para " + (purpose === "activation" ? "ativação" : "demonstração") : linkReady ? "Link individual disponível · envio por e-mail pendente" : "Convite indisponível"}</p>
                  {!ready && <p className="invitation-reason">{c.suppressed ? "Este endereço está descadastrado para comunicações comerciais." :
                    !c.email ? (linkReady ? "O link pode ser compartilhado sem e-mail. Para enviar por e-mail, inclua o endereço e registre a autorização recebida." : "Adicione o e-mail. O cadastro do endereço não autoriza o envio.") :
                    d.state !== "available" || new Date(d.expires_at).getTime() <= Date.now() ? "A demonstração precisa estar publicada e dentro da validade." :
                    purpose === "activation" && !["wants_trial", "activation_sent", "registration_started"].includes(c.stage) ? "O interesse em testar ainda não está registrado. Atualize a etapa em Interessados apenas se essa manifestação tiver sido recebida." :
                    ["not_interested", "archived"].includes(c.stage) ? "A etapa atual impede convites. Revise o cadastro apenas se houver um novo contato real." :
                    (purpose === "demonstration" ? "O envio por e-mail exige autorização vigente. Registre apenas uma manifestação efetivamente recebida. O link individual tem elegibilidade própria." : "Sem autorização vigente para ativação. Registre a manifestação efetivamente recebida antes de gerar ou enviar esse convite.")}</p>}
                  {duplicate && <p>Este endereço já está selecionado em outro vínculo.</p>}
                  <div className="button-row">
                    <button disabled={!data.can_manage || busy || !linkReady} onClick={() => void act(async () => {
                      const r = await commercialApi("invite", { id: d.demo_id, lead_id: d.lead_id, purpose });
                      setLink(r.url); setNotice(`Link individual gerado para ${c.name}. Nenhum e-mail foi enviado.`);
                    })}>Gerar link individual</button>
                    <button disabled={!data.can_send || busy || !ready} onClick={() => void makePreview([d.id])}>Enviar por e-mail</button>
                  </div>
                  {data.can_manage && !ready && c.email && !c.suppressed && d.state === "available" && new Date(d.expires_at).getTime() > Date.now() && !["not_interested", "archived"].includes(c.stage) && (purpose !== "activation" || ["wants_trial", "activation_sent", "registration_started"].includes(c.stage)) && <ContactAuthorization key={c.id + ":" + purpose + ":authorization"} contact={c} purpose={purpose} busy={busy} onSaved={fn => act(async () => { await fn(); setPreview(null); setSelected([]); setLink(""); setNotice("Autorização registrada para a finalidade selecionada."); })} />}
                  {data.can_manage && <InvitationPreparation key={c.id + ":" + c.revision + ":" + purpose} contact={c} busy={busy} act={async fn => {
                    await act(async () => { await fn(); setPreview(null); setSelected([]); setLink(""); setNotice("E-mail adicionado. A autorização de contato continua sendo necessária."); });
                  }} />}
                </article>
              );
            })}
          </div>
          {!demos.length && <p>Nenhum interessado vinculado no filtro atual. Vincule-o na aba Demonstrações.</p>}
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
                          .map((x: any) => x.demo_id + ":" + x.lead_id);
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
                    setSelected([]);
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
          <details className="invitation-history">
          <summary>Histórico de envios ({data.deliveries.length})</summary>
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
                  <th>Interessado</th>
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
                          ?.name
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
                      {d.error_code && <small>{({email_not_configured:"Envio não configurado.",email_authentication_failed:"O provedor recusou a autenticação. Solicite a conferência da configuração.",email_recipient_or_sender_rejected:"O provedor recusou remetente ou destinatário. Confira o domínio e o endereço.",email_rate_limited:"Limite temporário do provedor. Aguarde antes de tentar novamente.",email_temporary_failure:"Falha de rede ou tempo esgotado. Confira o resultado antes de reenviar.",email_delivery_failed:"O provedor não confirmou o envio."} as Record<string,string>)[d.error_code] || "Confira a configuração e o resultado do provedor."}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.deliveries.length && <p>Nenhum envio registrado.</p>}
          </details>
          <details className="invitation-history">
          <summary>Convites emitidos ({data.invites.length})</summary>
          {data.invites.map((i: any) => (
            <div className="card" key={i.id}>
              <p>
                {data.contacts.find((c: any) => c.id === i.lead_id)?.name} ·{" "}
                {i.purpose === "activation" ? "Ativação" : "Demonstração"} ·{" "}
                {i.revoked_at
                  ? "Revogado"
                  : new Date(i.expires_at).getTime() <= Date.now() ? "Expirado" : "Válido até " + new Date(i.expires_at).toLocaleString("pt-BR")}
              </p>
              <button
                disabled={!data.can_manage || busy || !!i.revoked_at}
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
          {!data.invites.length && <p>Nenhum convite emitido.</p>}
          </details>
        </>
      )}
      {section === "ativacoes" && (
        <>
          <p>
            O convite de ativação autoriza seu destinatário confirmado a continuar sem aprovação administrativa. A liberação da empresa depende da confirmação financeira no checkout existente. Análises anteriores permanecem no histórico.
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
                      prepared: "Aguardando confirmação financeira",
                      materialized: "Configuração vinculada à empresa",
                    } as any
                  )[q.state]
                }
              </p>
              {q.statement && <blockquote>{q.statement}</blockquote>}
              {q.authorization_method === "verified_invitation" && <p>Destinatário confirmado pelo convite. Sem análise administrativa adicional.</p>}
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
              {data.is_root && !q.organization_id && q.authorization_method !== "verified_invitation" && (
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
