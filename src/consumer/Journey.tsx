import { PhoneField } from "./PhoneField";
import { normalizePhone } from "./phone";
import {
  ExecutionSchedule,
  type Period,
} from "../scheduling/ExecutionSchedule";
import { useRef, useState } from "react";
import {
  crpc,
  ensureConsumer,
  gateway,
  message,
  time,
  date,
  upload,
  type Company,
} from "./api";
import type { RequestItem } from "./request-items";
import { ConsumerChat } from "../central/ConsumerChat";
export type PickedPhoto = { file: File; service: string; key: string };
export function JourneySchedule({
  company,
  items,
  value,
  onChange,
  captcha,
  disabled = false,
  periods = [],
}: {
  company: Company;
  items: RequestItem[];
  value: string;
  onChange: (v: string, p: Period[]) => void;
  captcha: string;
  disabled?: boolean;
  periods?: Period[];
}) {
  return (
    <ExecutionSchedule
      key={JSON.stringify(items)}
      value={value}
      onChange={onChange}
      periods={periods}
      disabled={disabled}
      label="Dia desejado"
      load={async (day, next) => {
        await ensureConsumer(captcha);
        return crpc("consumer_journey_options", {
          p_slug: company.slug,
          p_revision: company.revision,
          p_items: items,
          p_day: day,
          p_next: next,
        });
      }}
    />
  );
}
export function ServiceHelp({
  company,
  items,
  step,
  code,
  onStarted,
  name,
  phone,
  onName,
  onPhone,
  captcha,
  preview,
  onContinue,
}: {
  company: Company;
  items: RequestItem[];
  step: number;
  code: string;
  onStarted: (code: string) => void;
  name: string;
  phone: string;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  captcha: string;
  preview: boolean;
  onContinue: () => void;
}) {
  const helpAttempt = useRef({ payload: "", key: crypto.randomUUID() });
  const [show, setShow] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="c-service-help">
      <summary>Dúvidas sobre este serviço?</summary>
      {items.map((i) => {
        const s = company.services.find((s) => s.code === i.service);
        return s ? (
          <article key={i.service}>
            <h3>{s.name}</h3>
            <p>{s.description}</p>
            <p>{s.availability}</p>
          </article>
        ) : null;
      })}
      {company.faqs?.map((f: any, n: number) => (
        <details key={n}>
          <summary>{f.question}</summary>
          <p>{f.answer}</p>
        </details>
      ))}
      {company.quick_replies?.map((r, n) => (
        <details key={"r" + n}>
          <summary>{r.title}</summary>
          <p>{r.body}</p>
        </details>
      ))}
      {Object.entries({
        ...company.public_information,
        regioes: company.regions,
        pagamentos: company.payments,
      }).map(([k, v]) =>
        typeof v === "string" && v ? <p key={k}>{v}</p> : null,
      )}
      {!show && (
        <button type="button" onClick={() => setShow(true)}>
          Falar com atendimento
        </button>
      )}
      {show &&
        (code ? (
          <>
            <ConsumerChat request={code} />
            <button
              type="button"
              onClick={() => {
                setShow(false);
                onContinue();
              }}
            >
              Continuar minha solicitação
            </button>
          </>
        ) : (
          <section>
            <p>Informe como podemos chamar você. Sua seleção será mantida.</p>
            <label>
              Nome para atendimento
              <input
                value={name}
                onChange={(e) => onName(e.target.value)}
                maxLength={120}
              />
            </label>
            <PhoneField label="WhatsApp para atendimento" value={phone} onChange={onPhone} />
            <label className="c-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Autorizo o uso destes dados para responder a este atendimento.
            </label>
            {error && <p role="alert">{error}</p>}
            <button
              type="button"
              disabled={
                busy ||
                preview ||
                !consent ||
                name.trim().length < 2 ||
                !normalizePhone(phone)
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await ensureConsumer(captcha);
                  const payload = JSON.stringify({ items, name, phone, step });
                  if (helpAttempt.current.payload !== payload)
                    helpAttempt.current = { payload, key: crypto.randomUUID() };
                  const r = await crpc("consumer_start_help", {
                    p_slug: company.slug,
                    p_revision: company.revision,
                    p_items: items,
                    p_customer: {
                      name,
                      whatsapp: normalizePhone(phone) ?? phone,
                      email: null,
                      accepted_notice: true,
                      notice_version: company.notice_version,
                    },
                    p_stage: [
                      "services",
                      "details",
                      "customer",
                      "schedule",
                      "review",
                    ][step],
                    p_key: helpAttempt.current.key,
                  });
                  onStarted(r.code);
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Abrir atendimento contextual
            </button>
          </section>
        ))}
    </details>
  );
}
export function FollowupPhotos({
  data,
  onChange,
}: {
  data: any;
  onChange: () => Promise<void>;
}) {
  const options = data.requested_items || [],
    [service, setService] = useState(options[0]?.service || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  if (
    (data.journey === "direct" && !data.photo_request) ||
    !data.can_manage ||
    !["submitted", "under_review", "quoted", "declined"].includes(data.state)
  )
    return null;
  return (
    <section className="c-followup-photos">
      <h3>
        {data.photo_request && !sent && !data.photos_received
          ? "Fotos necessárias"
          : "Fotos da avaliação"}
      </h3>
      {data.photo_request && <p>{data.photo_request}</p>}
      {(sent || data.photos_received) && (
        <p role="status">Fotos enviadas · aguardando análise da empresa.</p>
      )}
      {options.length > 1 && (
        <label>
          As fotos são de qual serviço?
          <select
            value={service}
            disabled={busy}
            onChange={(e) => setService(e.target.value)}
          >
            {options.map((s: any) => (
              <option key={s.service} value={s.service}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Enviar fotos pelo acompanhamento
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || !gateway}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            if (
              files.length + (data.attachments?.length || 0) > 5 ||
              files.some(
                (f) =>
                  f.size > 5 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(f.type),
              )
            ) {
              setError(
                "Use até 5 imagens JPEG, PNG ou WebP, com até 5 MB cada.",
              );
              return;
            }
            setBusy(true);
            setError("");
            try {
              for (const f of files)
                await upload(
                  data.code,
                  f,
                  crypto.randomUUID(),
                  service || undefined,
                );
              setSent(true);
              await onChange();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {!gateway && <p>Envio de fotos temporariamente indisponível.</p>}
      {busy && <p role="status">Enviando fotos…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function RequestProgress({ data }: { data: any }) {
  const appointment = data.appointments?.find(
      (a: any) => a.state === "confirmed",
    ),
    done = data.events?.some((e: any) => e.event === "service_completed");
  const direct = data.journey === "direct";
  const labels = direct
    ? ["Pedido", "Agendamento", "Serviço"]
    : ["Pedido", "Análise", "Proposta", "Aprovação", "Agendamento", "Serviço"];
  const current = done
    ? labels.length - 1
    : appointment
      ? labels.length - 2
      : data.accepted_version
        ? 3
        : data.state === "quoted"
          ? 2
          : data.state === "draft"
            ? 0
            : 1;
  return (
    <ol className="c-journey-progress" aria-label="Progresso do pedido">
      {labels.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={i <= current ? "reached" : ""}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}
