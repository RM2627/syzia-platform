import type { ReactNode } from "react";
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <article className={"ds-metric" + (accent ? " ds-metric-accent" : "")}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
export function Skeleton() {
  return (
    <div
      className="ds-skeleton"
      role="status"
      aria-label="Carregando indicadores"
    >
      <span />
      <span />
      <span />
      <p>Preparando seus indicadores…</p>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
