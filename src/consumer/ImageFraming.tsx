import { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { framingRect } from "./image-framing";

export function ImageFraming({
  blob,
  ratio,
  title,
  save,
  close,
}: {
  blob: Blob;
  ratio: number;
  title: string;
  save: (file: File) => Promise<void>;
  close: () => void;
}) {
  const [source] = useState(() => URL.createObjectURL(blob));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1),
    [x, setX] = useState(0.5),
    [y, setY] = useState(0.5);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  );
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  const rect = framingRect(size.width, size.height, ratio, zoom, x, y);
  const ready = size.width > 0 && size.height > 0;
  async function commit() {
    if (!img.current || !ready) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.min(1600, Math.round(rect.width)));
      canvas.height = Math.max(1, Math.round(canvas.width / ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error();
      ctx.drawImage(
        img.current,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const output = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error())),
          "image/webp",
          0.92,
        ),
      );
      await save(
        new File([output], "imagem-enquadrada.webp", { type: output.type }),
      );
      close();
    } catch {
      setError(
        "Não foi possível salvar o enquadramento. Sua imagem anterior foi preservada. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={"Ajustar enquadramento — " + title}
      close={() => !busy && close()}
      className="media-framing-dialog"
    >
      <p>
        Arraste a imagem ou use os controles. A área abaixo mostra o recorte que
        será salvo.
      </p>
      <div
        className="media-crop-stage"
        style={{ aspectRatio: ratio, width: `min(100%, ${ratio * 34}vh)` }}
        aria-label="Prévia do enquadramento"
        onPointerDown={(e) => {
          if (!ready || busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { px: e.clientX, py: e.clientY, x, y };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ready) return;
          const bounds = e.currentTarget.getBoundingClientRect();
          const d = drag.current;
          if (size.width > rect.width)
            setX(
              Math.max(
                0,
                Math.min(
                  1,
                  d.x -
                    ((e.clientX - d.px) * rect.width) /
                      bounds.width /
                      (size.width - rect.width),
                ),
              ),
            );
          if (size.height > rect.height)
            setY(
              Math.max(
                0,
                Math.min(
                  1,
                  d.y -
                    ((e.clientY - d.py) * rect.height) /
                      bounds.height /
                      (size.height - rect.height),
                ),
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          ref={img}
          src={source}
          alt={"Enquadramento de " + title}
          draggable={false}
          onLoad={(e) =>
            setSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          onError={() =>
            setError(
              "Não foi possível abrir esta imagem. Envie o arquivo original novamente.",
            )
          }
          style={
            ready
              ? {
                  width: (size.width / rect.width) * 100 + "%",
                  height: (size.height / rect.height) * 100 + "%",
                  left: (-rect.x / rect.width) * 100 + "%",
                  top: (-rect.y / rect.height) * 100 + "%",
                }
              : { visibility: "hidden" }
          }
        />
      </div>
      <fieldset disabled={busy || !ready} className="media-crop-controls">
        <label>
          Zoom <output>{zoom.toFixed(2)}×</output>
          <input
            aria-label="Zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label>
          Posição horizontal
          <input
            aria-label="Posição horizontal"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
        <label>
          Posição vertical
          <input
            aria-label="Posição vertical"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setX(0.5);
            setY(0.5);
          }}
        >
          Centralizar enquadramento
        </button>
      </fieldset>
      <p className="muted">
        Para recuperar áreas já recortadas, envie a imagem original novamente.
        Depois de salvar, confirme as alterações no formulário da empresa.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="media-actions">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void commit()}
        >
          {busy ? "Salvando…" : "Salvar enquadramento"}
        </button>
        <button type="button" disabled={busy} onClick={close}>
          Cancelar
        </button>
      </div>
    </Dialog>
  );
}
