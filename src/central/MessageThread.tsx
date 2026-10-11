import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { date } from "./model";
import "./message-thread.css";
export function composerEnter(
  e: KeyboardEvent<HTMLTextAreaElement>,
  send: () => void,
  enabled: boolean,
) {
  if (
    enabled &&
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.nativeEvent.isComposing &&
    e.keyCode !== 229 &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    e.preventDefault();
    send();
  }
}
export function MessageThread({
  messages,
  onRead,
  consumer = false,
}: {
  messages: any[];
  onRead?: (id: string) => Promise<unknown>;
  consumer?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null),
    near = useRef(true),
    count = useRef(0),
    ack = useRef("");
  const current = useRef({ messages, onRead });
  current.current = { messages, onRead };
  const reading = useRef(false);
  const [pending, setPending] = useState(0);
  async function read() {
    const { messages, onRead } = current.current,
      id = messages.at(-1)?.id;
    const rect = end.current?.getBoundingClientRect();
    if (
      !onRead ||
      !id ||
      ack.current === id ||
      reading.current ||
      !near.current ||
      document.hidden ||
      !rect ||
      rect.top < 0 ||
      rect.bottom > innerHeight ||
      rect.bottom > (box.current?.getBoundingClientRect().bottom ?? 0) + 2
    )
      return;
    reading.current = true;
    try {
      await onRead(id);
      ack.current = id;
    } catch {
      /* Keep unread on an unconfirmed acknowledgement. */
    } finally {
      reading.current = false;
      if (ack.current === id && current.current.messages.at(-1)?.id !== id)
        void read();
    }
  }
  function bottom() {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
    near.current = true;
    setPending(0);
    void read();
  }
  useLayoutEffect(() => {
    const added = Math.max(0, messages.length - count.current);
    if (near.current || messages.at(-1)?.mine) bottom();
    else if (added) setPending((n) => n + added);
    count.current = messages.length;
  }, [messages.at(-1)?.id, messages.length]);
  useEffect(() => {
    const observer = new IntersectionObserver(() => void read());
    if (end.current) observer.observe(end.current);
    const visible = () => void read();
    document.addEventListener("visibilitychange", visible);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return (
    <div className="message-thread-wrap">
      {pending > 0 && (
        <button type="button" className="new-message-notice" onClick={bottom}>
          {pending === 1 ? "Nova mensagem" : `${pending} novas mensagens`} · ir
          ao final
        </button>
      )}
      <div
        className="message-thread"
        ref={box}
        tabIndex={0}
        role="log"
        aria-label="Histórico da conversa"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const el = box.current!;
          near.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (near.current) {
            setPending(0);
            void read();
          }
        }}
      >
        {messages.map((m, i) => (
          <article
            key={m.id || `${m.at}-${i}`}
            className={`thread-message ${consumer ? `c-chat-message ${m.kind}` : ""} ${m.mine ? "mine" : "received"} ${messages[i - 1]?.name === m.name && messages[i - 1]?.kind === m.kind ? "grouped" : ""}`}
          >
            <header>
              <strong>{m.name}</strong>
              <span>
                {m.kind === "customer"
                  ? "Cliente"
                  : m.kind === "company"
                    ? "Empresa"
                    : "Atendimento"}
              </span>
            </header>
            <p>{m.body}</p>
            <time dateTime={m.at}>{date(m.at)}</time>
          </article>
        ))}
        {!messages.length && <p>Nenhuma mensagem enviada nesta conversa.</p>}
        <div ref={end} className="thread-end" />
      </div>
    </div>
  );
}
