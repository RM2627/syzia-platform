import { useRef, useState } from "react";
import { crpc, gateway, message } from "../consumer/api";
import { rpc } from "../api";
export function DocumentButton({
  request,
  reference,
  kind = "quote",
  company = false,
}: {
  request: string;
  reference: string;
  kind?: "quote" | "appointment";
  company?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await (company ? rpc : crpc)<any>("consumer_document", {
        p_code: request,
        p_kind: kind,
        p_reference: reference,
      });
      const { renderDocument } = await import("./render");
      const f = await fetch("/fonts/DejaVuSans.ttf");
      if (!f.ok) throw Error("document_font_unavailable");
      let logo: Uint8Array | undefined;
      if (/^m_[a-f0-9]{24}$/.test(d.branding?.logo || "") && gateway)
        try {
          const r = await fetch(`${gateway}/media/${d.branding.logo}`);
          if (r.ok) {
            const b = await r.blob();
            if (b.size <= 5_000_000 && b.type.startsWith("image/")) {
              const bitmap = await createImageBitmap(b);
              try {
                const canvas = document.createElement("canvas"),
                  scale = Math.min(
                    1,
                    1200 / bitmap.width,
                    1200 / bitmap.height,
                  );
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                canvas
                  .getContext("2d")!
                  .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const png = await new Promise<Blob | null>((ok) =>
                  canvas.toBlob(ok, "image/png"),
                );
                if (png) logo = new Uint8Array(await png.arrayBuffer());
              } finally {
                bitmap.close();
              }
            }
          }
        } catch {
          /* Text brand fallback. */
        }
      const bytes = await renderDocument(
        d,
        new Uint8Array(await f.arrayBuffer()),
        logo,
      );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind === "quote" ? "orcamento" : "agendamento"}-${reference.replace(/[^a-zA-Z0-9_-]/g, "")}-v${d.content.version ?? d.content.revision}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(message(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <span className="document-action">
      <button type="button" disabled={busy} onClick={() => void download()}>
        {busy
          ? "Preparando PDF…"
          : kind === "quote"
            ? "Baixar orçamento em PDF"
            : "Baixar comprovante"}
      </button>
      {error && <span role="alert">{error} Tente novamente.</span>}
    </span>
  );
}
