import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, supabase as client, errorMessage } from "../api";
import { crpc, gateway } from "../consumer/api";
import { whatsappHref } from "../consumer/phone";
import { DocumentButton } from "../documents/DocumentButton";
import { Dialog } from "../ui/Dialog";
import { useVisiblePolling } from "../ui/useVisiblePolling";
import "./booking-extras.css";
const at = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: "America/Recife" });
const money = (v: number | null) =>
  v == null
    ? "sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100);
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
  useEffect(() => {
    let gone = false;
    setData(undefined);
    setShare(undefined);
    void rpc("operations_request_contact", { p_org: org, p_code: request })
      .then((v) => {
        if (!gone) setData(v);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [org, request, version?.code]);
  const href = whatsappHref(data?.phone || "");
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const d: any = await rpc("consumer_document", {
        p_code: request,
        p_kind: "quote",
        p_reference: version.code,
      });
      setShare(
        whatsappHref(
          data.phone,
          `${d.company.name} — solicitação ${d.request}. ${d.status}, versão ${d.content.version}. Valor ${d.content.price_mode === "from" ? "a partir de " : ""}${money(d.content.total_cents)}. Segue o orçamento em PDF para sua consulta.`,
        ) || undefined,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="request-contact">
      {href ? (
        <>
          <a href={href} target="_blank" rel="noopener noreferrer">
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
        <small>
          WhatsApp indisponível: contato ausente, inválido ou sem autorização
          para este acesso.
        </small>
      )}
      {share && (
        <div>
          <p>
            Revise o texto no WhatsApp e confirme o envio. Baixe o PDF e anexe-o
            manualmente.
          </p>
          <a href={share} target="_blank" rel="noopener noreferrer">
            Revisar mensagem no WhatsApp
          </a>
          <DocumentButton company request={request} reference={version.code} />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function UnreadSummary({ org }: { org: string }) {
  const [items, setItems] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      const r: any = await rpc("central_unread", { p_org: org });
      setItems(r.items);
    } catch {
      setItems([]);
    }
  }, [org]);
  useVisiblePolling(load, 30000);
  return items.length ? (
    <section className="card unread-summary">
      <h2>Mensagens não lidas</h2>
      {items.map((i) => (
        <Link key={i.code} to={`/painel/${org}/atendimento?ticket=${i.code}`}>
          {i.code}{" "}
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
          <ul>
            {data.items.map((i: any) => (
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
