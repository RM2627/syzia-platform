import { useCallback, useEffect, useRef, useState, useId } from "react";
import { crpc } from "../consumer/api";
import { centralError, states } from "./model";
import { MessageThread, composerEnter } from "./MessageThread";
import { useVisiblePolling } from "../ui/useVisiblePolling";
export function ConsumerChat({ request }: { request: string }) {
  const inputId = useId();
  const [data, setData] = useState<any>(),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const generation = useRef(0),
    sending = useRef(false),
    pending = useRef<{ body: string; key: string } | null>(null);
  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const d = await crpc("central_consumer_thread", { p_request: request });
      if (g === generation.current) {
        setData(d);
        setError("");
      }
    } catch (e: any) {
      if (g === generation.current) {
        if (e?.code === "42501") setData(undefined);
        setError(centralError(e));
      }
    }
  }, [request]);
  useVisiblePolling(load, 15000);
  useEffect(
    () => () => {
      generation.current++;
    },
    [load],
  );
  async function send() {
    if (sending.current || (!body.trim() && !pending.current)) return;
    sending.current = true;
    setBusy(true);
    setError("");
    pending.current ||= { body, key: crypto.randomUUID() };
    try {
      await crpc("central_consumer_send", {
        p_request: request,
        p_body: pending.current.body,
        p_key: pending.current.key,
      });
      pending.current = null;
      setUncertain(false);
      setBody("");
      await load();
    } catch (e: any) {
      if (/^[0-9A-Z]{5}$/.test(e?.code || "")) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
      setError(centralError(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="c-booking c-chat">
      <h2>Converse com o atendimento</h2>
      <p>
        Converse com a empresa. As mensagens ficam vinculadas a esta
        solicitação.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.shared_message && <p role="status">{data.shared_message}</p>}
      {data?.state && <small>{states[data.state]}</small>}
      <MessageThread
        key={request}
        consumer
        messages={data?.messages || []}
        onRead={
          data?.code
            ? (id) =>
                crpc("central_mark_read", { p_code: data.code, p_message: id })
            : undefined
        }
      />
      {data?.available && data?.can_send ? (
        <>
          <label htmlFor={inputId}>Sua mensagem</label>
          <textarea
            id={inputId}
            maxLength={4000}
            value={body}
            disabled={busy || uncertain}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) =>
              composerEnter(
                e,
                () => void send(),
                !busy && !uncertain && Boolean(body.trim()),
              )
            }
            placeholder="Conte o que você precisa saber."
          />
          <small>
            Enter envia no computador; Shift+Enter quebra a linha. No celular,
            use o botão para enviar.
          </small>
          {uncertain && (
            <p role="status">
              A conexão não confirmou o envio. Tente confirmar o resultado; a
              mesma mensagem será recuperada sem duplicar.
            </p>
          )}
          <button
            type="button"
            className="c-button"
            disabled={busy || (!uncertain && !body.trim())}
            onClick={() => void send()}
          >
            {busy
              ? "Enviando…"
              : uncertain
                ? "Confirmar envio anterior"
                : "Enviar ao atendimento"}
          </button>
        </>
      ) : (
        <p>
          O atendimento humano não está disponível para novas mensagens neste
          acesso. Você ainda pode consultar as informações autorizadas.
        </p>
      )}
      <button
        type="button"
        className="c-link-button"
        onClick={() => void load()}
      >
        Atualizar conversa
      </button>
    </section>
  );
}
