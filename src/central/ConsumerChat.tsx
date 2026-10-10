import { useCallback, useEffect, useRef, useState } from "react";
import { crpc } from "../consumer/api";
import { centralError, date, states } from "./model";
export function ConsumerChat({ request }: { request: string }) {
  const [data, setData] = useState<any>(),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [newMessages, setNewMessages] = useState(false);
  const seen = useRef<number | null>(null);
  const generation = useRef(0),
    key = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const d = await crpc("central_consumer_thread", { p_request: request });
      if (g === generation.current) {
        if (seen.current !== null && d.messages.length > seen.current)
          setNewMessages(true);
        seen.current = d.messages.length;
        setData(d);
        setError("");
      }
    } catch (e) {
      if (g === generation.current) {
        setData(undefined);
        setError(centralError(e));
      }
    }
  }, [request]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => {
      generation.current++;
      clearInterval(id);
    };
  }, [load]);
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
      {newMessages && (
        <button
          type="button"
          className="c-new-message"
          onClick={() => setNewMessages(false)}
        >
          Nova mensagem recebida · marcar como lida
        </button>
      )}
      <div aria-live="polite">
        {data?.messages.map((m: any, i: number) => (
          <article className={"c-chat-message " + m.kind} key={i}>
            <small>
              {m.name} · {m.kind === "customer" ? "Cliente" : "Atendimento"} ·{" "}
              {date(m.at)}
            </small>
            <p>{m.body}</p>
          </article>
        ))}
      </div>
      {data?.available && data?.can_send ? (
        <>
          <label>
            Sua mensagem
            <textarea
              maxLength={4000}
              value={body}
              disabled={busy}
              onChange={(e) => {
                setBody(e.target.value);
                key.current = crypto.randomUUID();
              }}
              placeholder="Conte o que você precisa saber."
            />
          </label>
          <button
            type="button"
            className="c-button"
            disabled={busy || !body.trim()}
            onClick={() => {
              setBusy(true);
              setError("");
              void crpc("central_consumer_send", {
                p_request: request,
                p_body: body,
                p_key: key.current,
              })
                .then(async () => {
                  setBody("");
                  key.current = crypto.randomUUID();
                  await load();
                })
                .catch((e) => setError(centralError(e)))
                .finally(() => setBusy(false));
            }}
          >
            Enviar ao atendimento
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
