import { quoteContactMessage, trackingContactMessage } from "./contactMessages";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, supabase as client, errorMessage } from "../api";
import { crpc, gateway } from "../consumer/api";
import { whatsappHref, formatPhone } from "../consumer/phone";
import { DocumentButton } from "../documents/DocumentButton";
import { Dialog } from "../ui/Dialog";
import { useVisiblePolling } from "../ui/useVisiblePolling";
import "./booking-extras.css";
const at = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: "America/Recife" });
export function AttendanceBadge({ attendance }: { attendance?: any }) {
  return attendance?.confirmed ? (
    <p className="attendance-confirmed">
      Presença confirmada pelo cliente · {at(attendance.confirmed_at)}
    </p>
  ) : null;
}
export function PresenceControl({
  request,
  appointment,
  manage,
  reload,
}: {
  request: string;
  appointment: any;
  manage: boolean;
  reload: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  const a = appointment;
  return (
    <div className="presence-control">
      <p>Agendamento · {at(a.starts_at)}</p>
      <AttendanceBadge attendance={a.attendance} />
      {manage &&
        !a.attendance?.confirmed &&
        a.state === "confirmed" &&
        a.execution_state === "scheduled" &&
        Date.parse(a.starts_at) > Date.now() && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (running.current) return;
                running.current = true;
                setBusy(true);
                setError("");
                try {
                  await crpc("consumer_confirm_attendance", {
                    p_code: request,
                    p_appointment: a.code,
                    p_schedule_revision: a.attendance_revision,
                  });
                  await reload();
                } catch (e) {
                  if ((e as any).code === "40001") {
                    await reload();
                    setError(
                      "O agendamento mudou. Confira a nova data antes de confirmar.",
                    );
                  } else setError(errorMessage(e));
                } finally {
                  running.current = false;
                  setBusy(false);
                }
              }}
            >
              Confirmar presença
            </button>
            <small>
              Registra sua intenção de comparecer. Não aprova orçamento nem
              confirma pagamento.
            </small>
          </>
        )}
      <DocumentButton request={request} reference={a.code} kind="appointment" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function RequestContact({
  org,
  request,
  version,
}: {
  org: string;
  request: string;
  version?: any;
}) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<string>();
  const [tracking, setTracking] = useState<{ url: string; expires: string }>();
  const [confirmLink, setConfirmLink] = useState(false),
    [copied, setCopied] = useState(false);
  const running = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    const g = ++generation.current;
    setData(undefined);
    setShare(undefined);
    setTracking(undefined);
    setCopied(false);
    setError("");
    void rpc("operations_request_contact", { p_org: org, p_code: request })
      .then((v) => {
        if (g === generation.current) setData(v);
      })
      .catch(() => {});
    return () => {
      generation.current++;
    };
  }, [org, request, version?.code]);
  const href = whatsappHref(data?.phone || "");
  async function prepare() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const g = generation.current;
    try {
      const d: any = await rpc("consumer_document", {
        p_code: request,
        p_kind: "quote",
        p_reference: version.code,
      });
      if (g === generation.current) setShare(quoteContactMessage(d));
    } catch (e) {
      if (g === generation.current) setError(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(
        "Selecione e copie o link no campo abaixo. Seu navegador não permitiu a cópia automática.",
      );
    }
  }
  async function issue() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const g = generation.current;
    try {
      const r: any = await rpc("operations_tracking_link", {
        p_org: org,
        p_code: request,
        p_action: "issue",
      });
      if (g !== generation.current) return;
      const url = `${location.origin}/acompanhar/${encodeURIComponent(r.code)}#secret=${encodeURIComponent(r.secret)}`;
      setTracking({ url, expires: r.expires_at });
      setConfirmLink(false);
      await copy(url);
    } catch (e) {
      if (g === generation.current) setError(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function revoke() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await rpc("operations_tracking_link", {
        p_org: org,
        p_code: request,
        p_action: "revoke",
      });
      setTracking(undefined);
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="request-contact" aria-label="Contato com o cliente">
      <h2>Contato com o cliente</h2>
      {href ? (
        <>
          <p>
            {data.name && <strong>{data.name} · </strong>}
            {formatPhone(data.phone)}
          </p>
          <a
            className="whatsapp-button"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Conversar pelo WhatsApp
          </a>
          {version && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void prepare()}
            >
              Enviar orçamento pelo WhatsApp
            </button>
          )}
        </>
      ) : (
        <p>
          <small>
            WhatsApp indisponível: contato ausente, inválido ou sem autorização
            para este acesso.
          </small>
        </p>
      )}
      {share && href && (
        <div>
          <p className="share-message">{share}</p>
          <p>
            Revise o texto e confirme o envio no WhatsApp. Se desejar enviar o
            PDF, baixe-o e anexe-o manualmente.
          </p>
          <a
            href={whatsappHref(data.phone, share)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            Revisar mensagem no WhatsApp
          </a>
          <DocumentButton company request={request} reference={version.code} />
        </div>
      )}
      {data?.can_share_tracking && (
        <div>
          <h3>Acompanhamento da solicitação</h3>
          <p>
            A mesma página do cliente, com conversa, orçamento e agendamento.
            Envie somente ao cliente correto.
          </p>
          <div className="tracking-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                tracking ? void copy(tracking.url) : setConfirmLink(true)
              }
            >
              Copiar link de acompanhamento
            </button>
            {tracking && href && (
              <a
                className="whatsapp-button"
                href={whatsappHref(
                  data.phone,
                  trackingContactMessage(data.company, tracking.url),
                )!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Enviar pelo WhatsApp
              </a>
            )}
            {tracking && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke()}
              >
                Revogar link de acompanhamento
              </button>
            )}
          </div>
          {tracking && (
            <>
              <label>
                Link pessoal de acompanhamento
                <input
                  readOnly
                  value={tracking.url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p>
                Válido até {at(tracking.expires)}. Vinculado ao primeiro
                navegador que o utilizar. Não abra o link do cliente para
                testá-lo. Para outro navegador, será necessário gerar um novo
                link.
              </p>
              {copied && (
                <p role="status">
                  Link copiado. Nenhuma mensagem foi enviada automaticamente.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {busy && <p role="status">Preparando acesso…</p>}
      {error && <p role="alert">{error}</p>}
      {confirmLink && (
        <Dialog
          title="Gerar acesso para o cliente"
          close={() => {
            if (!busy) setConfirmLink(false);
          }}
        >
          <p>
            Esta ação mantém a solicitação original e substitui os links de
            acesso emitidos anteriormente para ela. A sessão original do cliente
            permanece válida.
          </p>
          <p>
            O novo link é pessoal, expira em 7 dias e fica vinculado ao primeiro
            navegador que o utilizar. Confirme o destinatário antes de
            compartilhar.
          </p>
          <button type="button" disabled={busy} onClick={() => void issue()}>
            Gerar e copiar link
          </button>
        </Dialog>
      )}
    </section>
  );
}
export function UnreadSummary({ org }: { org: string }) {
  const [unread, setUnread] = useState<{ org: string; items: any[] }>({
    org,
    items: [],
  });
  const currentOrg = useRef(org);
  currentOrg.current = org;
  const items = unread.org === org ? unread.items : [];
  const load = useCallback(async () => {
    try {
      const r: any = await rpc("central_unread", { p_org: org });
      if (currentOrg.current === org) setUnread({ org, items: r.items });
    } catch {
      if (currentOrg.current === org) setUnread({ org, items: [] });
    }
  }, [org]);
  useVisiblePolling(load, 30000);
  return items.length ? (
    <section className="card unread-summary">
      <h2>Mensagens não lidas</h2>
      {items.map((i) => (
        <Link key={i.code} to={`/painel/${org}/atendimento?ticket=${i.code}`}>
          <strong>{i.customer?.trim() || "Conversa com cliente"}</strong>{" "}
          {i.service && <span className="unread-service">{i.service}</span>}
          <span className="unread-count">
            {i.unread_count} {i.unread_count === 1 ? "mensagem" : "mensagens"}
          </span>
        </Link>
      ))}
    </section>
  ) : null;
}
function Photo({
  org,
  appointment,
  file,
}: {
  org: string;
  appointment: string;
  file: any;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let gone = false,
      local = "";
    setError("");
    setUrl("");
    void (async () => {
      try {
        const t: any = await rpc("operations_attachment_ticket", {
          p_org: org,
          p_appointment: appointment,
          p_file: file.code,
        });
        const s = await client?.auth.getSession();
        if (!s?.data.session) throw Error("session_required");
        const r = await fetch(`${gateway}/attachments/${file.code}`, {
          headers: {
            Authorization: `Bearer ${s.data.session.access_token}`,
            "X-Download-Ticket": t.ticket,
          },
        });
        if (!r.ok) throw Error("attachment_access_denied");
        local = URL.createObjectURL(await r.blob());
        if (!gone) setUrl(local);
        else URL.revokeObjectURL(local);
      } catch (e) {
        if (!gone) setError(errorMessage(e));
      }
    })();
    return () => {
      gone = true;
      if (local) URL.revokeObjectURL(local);
    };
  }, [org, appointment, file.code, retry]);
  return (
    <figure>
      {url ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ampliar imagem enviada pelo cliente"
        >
          <img
            src={url}
            alt="Imagem da solicitação original"
            width="160"
            height="120"
          />
        </button>
      ) : error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <p role="status">Carregando imagem…</p>
      )}
      <figcaption>
        Solicitação original{file.created_at ? ` · ${at(file.created_at)}` : ""}
      </figcaption>
      {open && (
        <Dialog
          title="Imagem enviada pelo cliente"
          close={() => setOpen(false)}
        >
          <img
            className="booking-photo-full"
            src={url}
            alt="Imagem da solicitação original ampliada"
          />
        </Dialog>
      )}
    </figure>
  );
}
export function BookingExtras({
  org,
  id,
  detail,
}: {
  org: string;
  id: string;
  detail: any;
}) {
  return (
    <>
      <AttendanceBadge attendance={detail.attendance} />
      <section className="card">
        <h2>Imagens enviadas pelo cliente</h2>
        {detail.attachments?.length ? (
          <div className="booking-photos">
            {detail.attachments.map((f: any) => (
              <Photo key={f.code} org={org} appointment={id} file={f} />
            ))}
          </div>
        ) : (
          <p>Nenhuma imagem na solicitação original.</p>
        )}
      </section>
      <Checklist key={id} org={org} id={id} appointment={detail.appointment} />
    </>
  );
}
function Checklist({
  org,
  id,
  appointment,
}: {
  org: string;
  id: string;
  appointment: any;
}) {
  const [data, setData] = useState<any>(),
    [title, setTitle] = useState(""),
    [edit, setEdit] = useState<any>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<any>(undefined),
    running = useRef(false);
  const load = useCallback(async () => {
    setData(
      await rpc("operations_checklist", { p_org: org, p_appointment: id }),
    );
  }, [org, id]);
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, [load]);
  const enabled =
    data?.can_edit &&
    appointment.state === "confirmed" &&
    appointment.execution_state !== "completed";
  async function act(action: string, item?: any, newTitle?: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const args = pending.current || {
      p_org: org,
      p_appointment: id,
      p_id: item?.id || null,
      p_revision: item?.revision || 0,
      p_action: action,
      p_title: newTitle ?? null,
      p_done: action === "toggle" ? !item.done : null,
      p_key: crypto.randomUUID(),
    };
    pending.current = args;
    try {
      await rpc("operations_checklist_save", args);
      pending.current = undefined;
      setTitle("");
      setEdit(undefined);
      await load();
    } catch (e) {
      if ((e as any).code) {
        pending.current = undefined;
        await load().catch(() => {});
      }
      setError(
        (e as any).code === "40001"
          ? "O item mudou em outra sessão. Confira a versão atual antes de editar novamente."
          : errorMessage(e),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card execution-checklist">
      <h2>Checklist de execução</h2>
      <p>
        Etapas personalizadas deste serviço. Marcar todas não conclui o
        atendimento nem registra pagamento.
      </p>
      {data ? (
        <>
          <p>
            {data.items.filter((i: any) => i.done).length} de{" "}
            {data.items.length} etapas
          </p>
          {!data.items.length && <p>Nenhuma etapa adicionada.</p>}
          {Array.from(
            new Set<string>(
              data.items.map((i: any) => i.service_id || "extras"),
            ),
          ).map((group) => (
            <div key={group}>
              <h3>
                {group === "extras"
                  ? "Etapas adicionais deste atendimento"
                  : data.items.find((i: any) => i.service_id === group)
                      ?.service_name}
              </h3>
              <ul>
                {data.items
                  .filter((i: any) => (i.service_id || "extras") === group)
                  .map((i: any) => (
                    <li key={i.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={i.done}
                          disabled={!enabled || busy || !!pending.current}
                          onChange={() => void act("toggle", i)}
                        />
                        <span>
                          {i.title}
                          <small>
                            {i.updated_name} · {at(i.updated_at)}
                          </small>
                        </span>
                      </label>
                      {enabled && (
                        <span>
                          <button
                            disabled={busy || !!pending.current}
                            onClick={() => setEdit(i)}
                          >
                            Editar
                          </button>
                          <button
                            disabled={busy || !!pending.current}
                            onClick={() => void act("remove", i)}
                          >
                            Remover
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {enabled && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act("add", undefined, title);
              }}
            >
              <label>
                Nova etapa
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  disabled={busy || !!pending.current}
                />
              </label>
              <button disabled={busy || !!pending.current || !title.trim()}>
                Adicionar etapa
              </button>
            </form>
          )}
        </>
      ) : (
        <p role="status">Carregando checklist…</p>
      )}
      {busy && <p role="status">Salvando etapa…</p>}
      {error && <p role="alert">{error}</p>}
      {pending.current && !busy && (
        <button onClick={() => void act(pending.current.p_action)}>
          Confirmar alteração anterior
        </button>
      )}
      {edit && (
        <Dialog title="Editar etapa" close={() => setEdit(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("edit", edit, edit.title);
            }}
          >
            <label>
              Descrição
              <input
                value={edit.title}
                maxLength={200}
                required
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <button disabled={busy || !edit.title.trim()}>Salvar etapa</button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
