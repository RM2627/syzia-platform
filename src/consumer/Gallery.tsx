import { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { mediaUrl, type Company } from "./api";
type Work = NonNullable<Company["portfolio"]>[number];
export function Portfolio({
  work,
  media = mediaUrl,
}: {
  work: Work;
  media?: typeof mediaUrl;
}) {
  const [index, setIndex] = useState<number | null>(null),
    start = useRef<number | null>(null);
  const move = (by: number) =>
    setIndex((i) =>
      i === null ? null : (i + by + work.images.length) % work.images.length,
    );
  useEffect(() => {
    if (index === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, work.images.length]);
  const label = (i: number) =>
    work.format === "before_after"
      ? i === 0
        ? "Antes"
        : "Depois"
      : "Imagem " + (i + 1);
  return (
    <article className="c-work">
      <div
        className={
          "c-portfolio-images " +
          (work.format === "before_after"
            ? "c-before-after"
            : work.images.length === 1
              ? "c-single-photo"
              : "c-gallery-grid")
        }
      >
        {work.images.map((code, i) => (
          <figure key={code}>
            <button
              type="button"
              className="c-photo-open"
              aria-label={"Ampliar " + work.title + " — " + label(i)}
              onClick={() => setIndex(i)}
            >
              <img
                src={media(code)}
                alt={work.title + " — " + label(i)}
                loading="lazy"
              />
              <span aria-hidden="true" className="c-photo-zoom">
                ↗
              </span>
            </button>
            {work.format === "before_after" && (
              <figcaption>{label(i)}</figcaption>
            )}
          </figure>
        ))}
      </div>
      <div className="c-work-copy">
        <h3>{work.title}</h3>
        <p>{work.description}</p>
        <button className="c-text-button" onClick={() => setIndex(0)}>
          Ver imagens <span aria-hidden="true">↗</span>
        </button>
      </div>
      {index !== null && (
        <Dialog
          title={work.title}
          close={() => setIndex(null)}
          className="c-lightbox"
        >
          <div
            onTouchStart={(e) => {
              start.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (start.current !== null) {
                const delta = e.changedTouches[0].clientX - start.current;
                if (Math.abs(delta) > 50) move(delta < 0 ? 1 : -1);
              }
              start.current = null;
            }}
          >
            <img
              src={media(work.images[index])}
              alt={work.title + " — " + label(index)}
            />
          </div>
          <div className="c-lightbox-controls">
            <button
              disabled={work.images.length < 2}
              aria-label="Imagem anterior"
              onClick={() => move(-1)}
            >
              ← Anterior
            </button>
            <span aria-live="polite">
              {label(index)} · {index + 1}/{work.images.length}
            </span>
            <button
              disabled={work.images.length < 2}
              aria-label="Próxima imagem"
              onClick={() => move(1)}
            >
              Próxima →
            </button>
          </div>
          <p>{work.description}</p>
        </Dialog>
      )}
    </article>
  );
}
export function ServiceImage({
  url,
  name,
  category,
  index,
}: {
  url?: string;
  name: string;
  category: string;
  index: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div
      className={
        "c-service-art " +
        (url && !failed ? "c-service-photo" : "c-service-fallback")
      }
    >
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="c-fallback-pattern" aria-hidden="true">
          <span>{name.trim().slice(0, 1)}</span>
          <i />
        </div>
      )}
      <span className="c-category-pill">{category || "Serviços"}</span>
      <span className="c-card-number">
        {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}
