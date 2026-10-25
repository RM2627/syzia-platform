import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PublicCompany } from "../consumer/Consumer";
import type { Company } from "../consumer/api";
// A real viewport: CSS media queries must use the preview width, not the admin's screen.
export function PreviewFrame({
  company,
  images,
  width,
  root,
}: {
  company: Company;
  images: Record<string, string>;
  width: number;
  root: (node: HTMLDivElement | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null),
    [target, setTarget] = useState<HTMLDivElement | null>(null),
    [height, setHeight] = useState(1200);
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setScale(Math.min(1, host.clientWidth / width)),
      );
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [width]);
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setHeight(Math.min(16000, Math.max(600, target.scrollHeight))),
      );
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);
  useEffect(() => {
    root(target);
    return () => root(null);
  }, [target, root]);
  return (
    <>
      <div
        ref={box}
        style={{
          width: "100%",
          maxWidth: width,
          margin: "auto",
          height: height * scale,
          overflow: "hidden",
        }}
      >
        <iframe
          ref={frame}
          title="Prévia responsiva da página pública"
          sandbox="allow-same-origin"
          style={{
            width,
            height,
            border: 0,
            display: "block",
            background: "white",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          srcDoc={
            '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="studio-preview-root"></div></body></html>'
          }
          onLoad={() => {
            const doc = frame.current?.contentDocument;
            if (!doc) return;
            for (const style of document.querySelectorAll(
              'style,link[rel="stylesheet"]',
            ))
              doc.head.append(style.cloneNode(true));
            setTarget(
              doc.getElementById("studio-preview-root") as HTMLDivElement,
            );
          }}
        />
      </div>
      {target &&
        createPortal(
          <PublicCompany preview={company} previewMedia={images} />,
          target,
        )}
    </>
  );
}
