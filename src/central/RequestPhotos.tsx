import { useState } from "react";
import { rpc, errorMessage } from "../api";
export function RequestPhotos({
  org,
  request,
  onSent,
}: {
  org: string;
  request: any;
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="h-photo-request">
      <h3>Pedir fotos ao cliente</h3>
      <label>
        O que precisa ser fotografado?
        <textarea
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy || text.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await rpc("operations_request_photos", {
              p_org: org,
              p_code: request.code,
              p_instruction: text,
              p_revision: request.revision,
              p_key: crypto.randomUUID(),
            });
            setText("");
            await onSent();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Solicitar fotos pelo acompanhamento
      </button>
      <p>
        O cliente recebe a orientação na conversa e envia os arquivos no acesso
        seguro.
      </p>
    </section>
  );
}
