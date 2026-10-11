import { useRef, useState } from "react";
const previews = [
  {
    id: "home",
    title: "Home",
    heading: "Saiba por onde começar o dia.",
    text: "Agenda, pendências e conversas que precisam da sua atenção, reunidas no painel.",
  },
  {
    id: "atendimento",
    title: "Atendimento",
    heading: "Converse com o contexto à mão.",
    text: "A solicitação, o histórico e os próximos passos acompanham a conversa com o cliente.",
  },
  {
    id: "orcamentos",
    title: "Orçamentos",
    heading: "Transforme a solicitação em proposta.",
    text: "Organize serviços, valores e condições. O cliente acompanha a proposta na própria página.",
  },
  {
    id: "agenda",
    title: "Agenda",
    heading: "Organize os horários e a execução.",
    text: "Veja os agendamentos e abra a ficha do serviço para acompanhar cada atendimento.",
  },
];
export function ProductPreviews() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = previews[selected];
  return (
    <section
      className="sy-section sy-product"
      id="produto"
      aria-label="Prévias do produto"
    >
      <p className="sy-kicker">POR DENTRO DA SYZIA</p>
      <h2>Seu trabalho, conectado.</h2>
      <p className="sy-lead">
        Veja telas reais da plataforma, preenchidas com dados fictícios para
        demonstração.
      </p>
      <div
        role="tablist"
        aria-label="Telas da plataforma"
        className="sy-preview-tabs"
      >
        {previews.map((p, n) => (
          <button
            key={p.id}
            id={`preview-tab-${p.id}`}
            role="tab"
            type="button"
            aria-selected={n === selected}
            aria-controls={`preview-panel-${p.id}`}
            tabIndex={n === selected ? 0 : -1}
            ref={(el) => {
              tabs.current[n] = el;
            }}
            onClick={() => setSelected(n)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (n + 1) % previews.length
                  : e.key === "ArrowLeft"
                    ? (n + previews.length - 1) % previews.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? previews.length - 1
                        : null;
              if (next != null) {
                e.preventDefault();
                setSelected(next);
                tabs.current[next]?.focus();
              }
            }}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`preview-panel-${current.id}`}
        aria-labelledby={`preview-tab-${current.id}`}
        tabIndex={0}
        className="sy-preview-panel"
      >
        <div className="sy-preview-copy">
          <h3>{current.heading}</h3>
          <p>{current.text}</p>
        </div>
        <figure>
          <img
            key={current.id}
            src={`/marketing/produto-${current.id}.webp`}
            width="1280"
            height="850"
            loading="lazy"
            decoding="async"
            alt={`Tela de ${current.title} da SYZIA, com empresa e clientes fictícios.`}
          />
          <figcaption>
            Demonstração com dados fictícios. Recursos e acessos dependem do
            plano e das permissões.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
