import { DocumentButton } from "../documents/DocumentButton";
import { PresenceControl } from "../operations/BookingExtras";
import { PhoneField } from "./PhoneField";
import { normalizePhone } from "./phone";
import {
  ExecutionSchedule,
  Periods,
  duration,
  type Period,
} from "../scheduling/ExecutionSchedule";
import {
  JourneySchedule,
  ServiceHelp,
  FollowupPhotos,
  RequestProgress,
  type PickedPhoto,
} from "./Journey";
import { QuoteSummary } from "./QuoteSummary";
import {
  emptyItem,
  relationIssue,
  selectedPrices,
  priceBreakdown,
  type RequestItem,
} from "./request-items";
import { OrderPrices, RequestedItems } from "./RequestedItems";
import { brandStyle } from "./brand";
import { Portfolio, ServiceImage } from "./Gallery";
import { ConsumerChat } from "../central/ConsumerChat";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  consumerClient,
  crpc,
  ensureConsumer,
  upload,
  download,
  gateway,
  mediaUrl,
  message,
  money,
  date,
  time,
  type Company,
  type Service,
} from "./api";
import "./consumer.css";
import { Captcha, captchaConfigured } from "../Captcha";
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
function Mark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="m5 23 6-14 5 10 5-10 6 14M7 23h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Art() {
  return (
    <svg viewBox="0 0 600 420" aria-hidden="true">
      <circle
        cx="300"
        cy="200"
        r="150"
        fill="none"
        stroke="currentColor"
        opacity=".15"
        strokeWidth="50"
      />
      <path
        d="M170 300V190a130 130 0 0 1 260 0v110M225 300V195a75 75 0 0 1 150 0v105"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity=".6"
      />
      <path
        d="m300 120 18 60 62 20-62 20-18 60-18-60-62-20 62-20Z"
        fill="currentColor"
        opacity=".8"
      />
    </svg>
  );
}
function Frame({
  children,
  name = "Seu atendimento",
  branding,
  slug,
  media = mediaUrl,
  preview = false,
}: {
  children: React.ReactNode;
  name?: string;
  branding?: Company["branding"];
  slug?: string;
  media?: typeof mediaUrl;
  preview?: boolean;
}) {
  return (
    <div
      className="consumer c-custom-brand"
      style={brandStyle(branding?.primary_color, branding?.theme)}
    >
      {import.meta.env.VITE_LOCAL_DEMO === "true" && (
        <div className="c-demo">Exemplo de página criada com a SYZIA</div>
      )}
      <header className="c-header">
        <a
          className="c-brand"
          href={preview ? "#previa" : slug ? "/empresa/" + slug : "#"}
        >
          <span
            className={
              "c-mark" + (media(branding?.logo) ? " c-mark-image" : "")
            }
          >
            {media(branding?.logo) ? (
              <img
                className="c-logo"
                src={media(branding?.logo)}
                alt="Logo da empresa"
              />
            ) : (
              <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
            )}
          </span>
          <span>
            {name}
            <small>Serviços e atendimento, perto de você</small>
          </span>
        </a>
        <Link
          className="c-account"
          to={
            "/minhas-solicitacoes" +
            (slug ? "?empresa=" + encodeURIComponent(slug) : "")
          }
          aria-disabled={preview || undefined}
          onClick={(e) => {
            if (preview) e.preventDefault();
          }}
        >
          Meus pedidos <span aria-hidden="true">↗</span>
        </Link>
      </header>
      {children}
      <footer className="c-footer">
        <span>
          Uma experiência simples, do primeiro contato ao atendimento.
        </span>
        <span>Seus dados são usados para atender sua solicitação.</span>
      </footer>
    </div>
  );
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="c-error">
      {error}
    </div>
  ) : null;
}
function Price({
  service,
}: {
  service: { price_mode: string; price_cents: number | null };
}) {
  return (
    <span className="c-price">
      {service.price_mode === "from" && <small>A partir de </small>}
      {money(service.price_cents)}
    </span>
  );
}
export function PublicCompany({
  preview,
  previewMedia = {},
}: { preview?: Company; previewMedia?: Record<string, string> } = {}) {
  const resolveMedia = (code?: string | null) =>
    preview ? (code ? previewMedia[code] : undefined) : mediaUrl(code);
  const { slug = "" } = useParams();
  const [journeyParams, setJourneyParams] = useSearchParams();
  const resumeCode = journeyParams.get("continuar") || "";
  const [company, setCompany] = useState<Company | null>(),
    [error, setError] = useState(""),
    [category, setCategory] = useState("Todos"),
    [selected, setSelected] = useState<Service | null>(null),
    [cart, setCart] = useState<string[]>([]),
    [cartError, setCartError] = useState(""),
    [booking, setBooking] = useState(false),
    [help, setHelp] = useState(false);
  const loadGeneration = useRef(0);
  async function load() {
    if (preview) {
      const copy = { ...preview, services: [...preview.services] };
      const order = copy.branding?.service_order || [];
      copy.services.sort(
        (a, b) =>
          (order.indexOf(a.code) < 0 ? 999 : order.indexOf(a.code)) -
          (order.indexOf(b.code) < 0 ? 999 : order.indexOf(b.code)),
      );
      setCompany(copy);
      return;
    }
    const run = ++loadGeneration.current;
    setCompany(undefined);
    setError("");
    try {
      const page: Company | null = await crpc("consumer_public_page", {
        p_slug: slug,
      });
      if (run !== loadGeneration.current) return;
      if (page) {
        const order = page.branding?.service_order || [];
        page.services.sort(
          (a, b) =>
            (order.indexOf(a.code) < 0 ? 999 : order.indexOf(a.code)) -
            (order.indexOf(b.code) < 0 ? 999 : order.indexOf(b.code)),
        );
      }
      setCompany(page);
      setError("");
    } catch (e) {
      if (run === loadGeneration.current) setError(message(e));
    }
  }
  useEffect(() => {
    setSelected(null);
    setCart([]);
    setCartError("");
    setCategory("Todos");
    setBooking(false);
    setHelp(false);
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [slug, preview]);
  return (
    <Frame
      name={company?.name}
      branding={company?.branding}
      slug={company?.slug}
      media={resolveMedia}
      preview={!!preview}
    >
      {error && (
        <main className="c-container">
          <ErrorBox error={error} />
          <button onClick={load}>Tentar novamente</button>
        </main>
      )}
      {company === undefined && !error ? (
        <main className="c-container">
          <div className="c-loading" role="status">
            <span />
            <span />
            <span />
            <p>Preparando seu atendimento…</p>
          </div>
        </main>
      ) : company === null ? (
        <main className="c-container c-empty">
          <h1>Esta página está indisponível</h1>
          <p>
            A empresa não está recebendo solicitações por aqui neste momento.
          </p>
          <button onClick={load}>Tentar novamente</button>
        </main>
      ) : (
        company && (
          <>
            <main>
              <nav
                className="c-section-nav c-container"
                aria-label="Explore a empresa"
              >
                <a href={"#" + (preview ? "previa-" : "") + "servicos"}>
                  Serviços
                </a>
                {Boolean(company.portfolio?.length) && (
                  <a href={"#" + (preview ? "previa-" : "") + "portfolio"}>
                    Nosso trabalho
                  </a>
                )}
                <a href={"#" + (preview ? "previa-" : "") + "informacoes"}>
                  Informações e dúvidas
                </a>
              </nav>
              <section className="c-hero c-container">
                <div className="c-hero-copy">
                  <span className="c-eyebrow">
                    <i /> {company.regions || "Conheça nossos serviços"}
                  </span>
                  <h1>
                    {company.name}
                    <em> Serviços que fazem a diferença.</em>
                  </h1>
                  <p>{company.description}</p>
                  <a
                    className="c-button c-primary"
                    href={"#" + (preview ? "previa-" : "") + "servicos"}
                  >
                    Conhecer os serviços <span>↗</span>
                  </a>
                  <div className="c-hero-trust">
                    <span>✓ Valores transparentes</span>
                    <span>✓ Atendimento com atenção</span>
                  </div>
                </div>
                <div className="c-hero-art">
                  {resolveMedia(company.branding?.cover) && (
                    <img
                      className="c-cover"
                      src={resolveMedia(company.branding?.cover)}
                      alt={company.name + " — apresentação"}
                    />
                  )}
                  {!resolveMedia(company.branding?.cover) && (
                    <div className="c-orbit" />
                  )}
                  <span className="c-art-label">
                    SERVIÇOS PARA O SEU DIA A DIA.
                  </span>
                  {!resolveMedia(company.branding?.cover) && <Art />}
                  <div className="c-art-caption">
                    <span className="c-star">✦</span>
                    <span>
                      Mais facilidade.
                      <br />
                      <strong>Menos complicação.</strong>
                    </span>
                  </div>
                </div>
              </section>
              <div className="c-facts c-container">
                <div>
                  <span className="c-fact-icon">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <circle
                        cx="12"
                        cy="9"
                        r="2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  </span>
                  <span>
                    <small>Onde atendemos</small>
                    <strong>{company.regions || "Consulte a empresa"}</strong>
                  </span>
                </div>
                <div>
                  <span className="c-fact-icon">◷</span>
                  <span>
                    <small>Horário de atendimento</small>
                    <a href={"#" + (preview ? "previa-" : "") + "informacoes"}>
                      Confira os horários da semana ↗
                    </a>
                  </span>
                </div>
                <div>
                  <span className="c-fact-icon">▱</span>
                  <span>
                    <small>Como pagar</small>
                    <strong>{company.payments || "Consulte a empresa"}</strong>
                  </span>
                </div>
              </div>
              <section
                id={(preview ? "previa-" : "") + "servicos"}
                className="c-container c-section"
              >
                <div className="c-section-head">
                  <div>
                    <span className="c-eyebrow">FEITO PARA SUA ROTINA</span>
                    <h2>Encontre o serviço que precisa.</h2>
                  </div>
                  <p>
                    Conheça as opções e dê o próximo passo.
                    <br />
                    Nós cuidamos dos detalhes com você.
                  </p>
                </div>
                <div className="c-chips" aria-label="Categorias">
                  {[
                    "Todos",
                    ...new Set(
                      company.services
                        .map((s) => s.category)
                        .filter(Boolean)
                        .sort((a, b) => {
                          const order = company.branding?.category_order || [];
                          return (
                            (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) -
                            (order.indexOf(b) < 0 ? 999 : order.indexOf(b))
                          );
                        }),
                    ),
                  ].map((c) => (
                    <button
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                      key={c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="c-order-bar" aria-label="Seu pedido">
                  <strong aria-live="polite">
                    Seu pedido · {cart.length}{" "}
                    {cart.length === 1 ? "serviço" : "serviços"}
                  </strong>
                  {cart.length > 0 && (
                    <span>
                      {company.services
                        .filter((s) => cart.includes(s.code))
                        .map((s) => s.name)
                        .join(" · ")}
                    </span>
                  )}
                  <button
                    className="c-primary"
                    disabled={!cart.length}
                    onClick={() => {
                      setBooking(false);
                      setSelected(
                        company.services.find((s) => s.code === cart[0]) ||
                          null,
                      );
                    }}
                  >
                    Continuar pedido
                  </button>
                </div>
                {cartError && (
                  <p role="alert" className="c-error">
                    {cartError}
                  </p>
                )}
                <div className="c-services">
                  {company.services
                    .filter(
                      (s) => category === "Todos" || s.category === category,
                    )
                    .map((s, i) => (
                      <article className="c-service" key={s.code}>
                        <ServiceImage
                          url={
                            resolveMedia(s.image_media) ||
                            s.image_url ||
                            resolveMedia(
                              company.portfolio?.find(
                                (w) => w.service === s.code,
                              )?.images[0],
                            )
                          }
                          name={s.name}
                          category={s.category}
                          index={i}
                        />
                        <div className="c-service-body">
                          <div className="c-duration">
                            {s.duration_minutes
                              ? `◷ ${duration(s.duration_minutes)}`
                              : "Tempo definido na avaliação"}
                            {s.direct_booking &&
                              company.booking_policy.active && (
                                <span>Agende online</span>
                              )}
                          </div>
                          <h3>{s.name}</h3>
                          <p>{s.description}</p>
                          {s.addons?.length > 0 && (
                            <small className="c-addons-count">
                              {s.addons.length}{" "}
                              {s.addons.length === 1
                                ? "adicional disponível"
                                : "adicionais disponíveis"}{" "}
                              para personalizar
                            </small>
                          )}
                          <Price service={s} />
                          {s.price_mode === "from" && (
                            <small className="c-estimate">
                              Estimativa inicial. O valor final depende da
                              avaliação.
                            </small>
                          )}
                          {s.availability && <small>{s.availability}</small>}
                          <div className="c-card-actions">
                            {s.quotes_allowed && (
                              <button
                                className="c-button c-primary"
                                title={
                                  preview
                                    ? "Solicitações ficam disponíveis na página publicada."
                                    : undefined
                                }
                                onClick={() => {
                                  if (cart.includes(s.code)) {
                                    setCart(cart.filter((c) => c !== s.code));
                                    setCartError("");
                                    return;
                                  }
                                  const issue = relationIssue(
                                    company,
                                    cart,
                                    s.code,
                                  );
                                  if (issue) {
                                    setCartError(issue);
                                    return;
                                  }
                                  if (cart.length >= 10) {
                                    setCartError(
                                      "Selecione até 10 serviços por pedido.",
                                    );
                                    return;
                                  }
                                  setCart([...cart, s.code]);
                                  setCartError("");
                                  setBooking(false);
                                }}
                                aria-pressed={cart.includes(s.code)}
                              >
                                {cart.includes(s.code)
                                  ? "Remover do pedido"
                                  : "Adicionar ao pedido"}{" "}
                                <span>↗</span>
                              </button>
                            )}
                            {s.direct_booking &&
                              company.booking_policy.active && (
                                <button
                                  className="c-text-button"
                                  onClick={() => {
                                    setCart([s.code]);
                                    setSelected(s);
                                    setBooking(true);
                                  }}
                                >
                                  Escolher um horário →
                                </button>
                              )}
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
                {!company.services.length && (
                  <p>Novos serviços estarão disponíveis em breve.</p>
                )}
              </section>
              {Boolean(company.portfolio?.length) && (
                <section
                  id={(preview ? "previa-" : "") + "portfolio"}
                  className="c-container c-section c-portfolio"
                >
                  <span className="c-eyebrow">NOSSO TRABALHO, DE PERTO</span>
                  <h2>Conheça nosso trabalho.</h2>
                  <div className="c-portfolio-grid">
                    {company.portfolio!.map((w) => (
                      <Portfolio key={w.code} work={w} media={resolveMedia} />
                    ))}
                  </div>
                </section>
              )}
              <section className="c-how c-container">
                <span className="c-eyebrow">DO SEU JEITO, SEM COMPLICAÇÃO</span>
                <h2>Do primeiro contato ao atendimento.</h2>
                <div>
                  {[
                    [
                      "01",
                      "Escolha seu serviço",
                      "Veja as opções, valores e adicionais.",
                    ],
                    [
                      "02",
                      "Conte o que precisa",
                      "Envie os detalhes e, se quiser, fotos.",
                    ],
                    [
                      "03",
                      "Combine o atendimento",
                      "Acompanhe a proposta e escolha seu horário.",
                    ],
                  ].map(([n, t, d]) => (
                    <article key={n}>
                      <span>{n}</span>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section
                className="c-container c-details c-section"
                id={(preview ? "previa-" : "") + "informacoes"}
              >
                <div>
                  <span className="c-eyebrow">PODE PERGUNTAR</span>
                  <h2>Antes de começar.</h2>
                  <div className="c-faq">
                    {company.faqs.map((f, i) => (
                      <details key={i}>
                        <summary>
                          {f.question}
                          <span className="c-faq-symbol" aria-hidden="true" />
                        </summary>
                        <p>{f.answer}</p>
                      </details>
                    ))}
                  </div>
                </div>
                <aside className="c-business">
                  <h3>Planeje seu atendimento</h3>
                  <p>{company.address}</p>
                  <dl>
                    {company.hours.map((h) => (
                      <div key={h.day}>
                        <dt>{days[h.day]}</dt>
                        <dd>
                          {h.open} — {h.close}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <small>
                    Horários de Recife. Disponibilidade confirmada ao agendar.
                  </small>
                  <p>
                    Cancelamentos e remarcações online até{" "}
                    {company.booking_policy.cancel_minutes / 60} horas antes do
                    atendimento.
                  </p>
                </aside>
                <div className="c-help-block">
                  {" "}
                  <button className="c-button" onClick={() => setHelp(!help)}>
                    Preciso de ajuda <span>↗</span>
                  </button>
                  {help && (
                    <div className="c-help">
                      <p>
                        Fale com a empresa pelos canais públicos abaixo. Para
                        conversar com o atendimento humano, abra uma solicitação
                        em “Meus pedidos”.
                      </p>
                      {company.phone && (
                        <a
                          href={"tel:" + company.phone.replace(/[^+0-9]/g, "")}
                        >
                          {company.phone}
                        </a>
                      )}
                      {company.email && (
                        <a href={"mailto:" + company.email}>{company.email}</a>
                      )}
                      {!company.phone && !company.email && (
                        <p>
                          Você pode descrever sua dúvida nas observações de uma
                          solicitação de orçamento.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </main>
            {(selected || resumeCode) && (
              <RequestWizard
                company={company}
                resumeCode={resumeCode}
                initialSelection={cart}
                onSelectionChange={setCart}
                preview={!!preview}
                booking={booking}
                onClose={() => {
                  setSelected(null);
                  setJourneyParams({});
                }}
                onRefresh={async () => {
                  await load();
                  setSelected(null);
                }}
              />
            )}
          </>
        )
      )}
    </Frame>
  );
}
function RequestWizard({
  company,
  resumeCode,
  initialSelection,
  onSelectionChange,
  preview,
  booking,
  onClose,
  onRefresh,
}: {
  company: Company;
  resumeCode: string;
  initialSelection: string[];
  onSelectionChange: (codes: string[]) => void;
  preview: boolean;
  booking: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const navigate = useNavigate(),
    dialog = useRef<HTMLDialogElement>(null),
    [step, setStep] = useState(0),
    [selection, setSelection] = useState<RequestItem[]>(
      initialSelection.map(emptyItem),
    ),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [notes, setNotes] = useState(""),
    [source, setSource] = useState("unknown"),
    [returning, setReturning] = useState(false),
    [notice, setNotice] = useState(false),
    [contact, setContact] = useState(false),
    [files, setFiles] = useState<PickedPhoto[]>([]),
    [desired, setDesired] = useState(""),
    [desiredPeriods, setDesiredPeriods] = useState<Period[]>([]),
    [helpOnly, setHelpOnly] = useState(false),
    [existingPhotos, setExistingPhotos] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [captchaRound, setCaptchaRound] = useState(0);
  const key = useRef(crypto.randomUUID()),
    submitKey = useRef(crypto.randomUUID()),
    uploaded = useRef(new Set<string>());
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let active = true;
    consumerClient?.auth.getSession().then(async ({ data }) => {
      if (!data.session || preview) return;
      try {
        const profile = await crpc("consumer_returning_profile", {
          p_slug: company.slug,
        });
        if (active && profile) {
          setName((n) => n || profile.name);
          setPhone((n) => n || profile.whatsapp);
          setEmail((n) => n || profile.email || "");
          setReturning(true);
        }
      } catch {}
    });
    return () => {
      active = false;
    };
  }, [company.slug]);
  useEffect(() => {
    if (!resumeCode) return;
    setBusy(true);
    void crpc("consumer_draft_context", { p_code: resumeCode })
      .then((d) => {
        setCode(d.code);
        setHelpOnly(d.help_only);
        setSelection(
          (d.items || []).map((i: any) => ({
            service: i.service,
            addons: i.addons || [],
            answers: i.answers || {},
            notes: i.notes || "",
          })),
        );
        setName(d.name);
        setPhone(d.whatsapp);
        setEmail(d.email || "");
        setNotes(d.notes || "");
        setNotice(true);
        setDesired(d.desired_start || "");
        setDesiredPeriods(d.desired_periods || []);
        setExistingPhotos(d.attachments || []);
        setStep(
          d.help_only
            ? Math.max(
                0,
                [
                  "services",
                  "details",
                  "customer",
                  "schedule",
                  "review",
                ].indexOf(d.stage),
              )
            : 3,
        );
      })
      .catch((e) => setError(message(e)))
      .finally(() => setBusy(false));
  }, [resumeCode]);
  const items = selectedPrices(company.services, selection);
  const alerts = (company.relations || []).filter(
    (r) =>
      r.kind === "review" &&
      selection.some((i) => i.service === r.source) &&
      selection.some((i) => i.service === r.target),
  );
  const total = alerts.length ? null : priceBreakdown(items).expected;
  const direct =
    selection.length > 0 &&
    !alerts.length &&
    items.every((i) => i.price_mode === "fixed" && i.price_cents !== null) &&
    selection.every((i) => {
      const s = company.services.find((s) => s.code === i.service);
      return (
        s &&
        (s.contract_mode === "immediate" ||
          (!s.contract_mode && s.direct_booking)) &&
        s.duration_minutes
      );
    });
  const updateItem = (code: string, patch: Partial<RequestItem>) => {
    setDesired("");
    setSelection((prev) =>
      prev.map((i) => (i.service === code ? { ...i, ...patch } : i)),
    );
  };
  function toggleService(code: string) {
    setError("");
    if (selection.some((i) => i.service === code)) {
      const next = selection.filter((i) => i.service !== code);
      setSelection(next);
      onSelectionChange(next.map((i) => i.service));
      return;
    }
    const issue = relationIssue(
      company,
      selection.map((i) => i.service),
      code,
    );
    if (issue) {
      setError(issue);
      return;
    }
    if (selection.length >= 10) {
      setError("Selecione até 10 serviços por pedido.");
      return;
    }
    const next = [...selection, emptyItem(code)];
    setSelection(next);
    onSelectionChange(next.map((i) => i.service));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!selection.length) {
      setError("Adicione pelo menos um serviço.");
      return;
    }
    if (step === 3 && !desired) {
      setError("Escolha um dia e horário para continuar.");
      return;
    }
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    if (preview) return;
    setBusy(true);
    try {
      await ensureConsumer(captcha);
      setCaptcha("");
      setCaptchaRound((n) => n + 1);
      let request = code;
      if (!request) {
        const r = await crpc("consumer_create_multi_request", {
          p_slug: company.slug,
          p_revision: company.revision,
          p_items: selection,
          p_customer: {
            name,
            whatsapp: normalizePhone(phone) ?? phone,
            email: email || null,
            accepted_notice: notice,
            notice_version: company.notice_version,
          },
          p_notes: notes,
          p_contact: contact,
          p_expected_cents: total,
          p_key: key.current,
        });
        request = r.code;
        setCode(request);
      }
      if (helpOnly) {
        await crpc("consumer_prepare_help_request", {
          p_code: request,
          p_items: selection,
          p_notes: notes,
          p_contact: contact,
          p_expected_cents: total,
          p_key: key.current,
          p_customer: {
            name,
            whatsapp: normalizePhone(phone) ?? phone,
            email: email || null,
            accepted_notice: notice,
            notice_version: company.notice_version,
          },
        });
        setHelpOnly(false);
      }
      await crpc("consumer_set_source", {
        p_code: request,
        p_source: source,
        p_detail: "",
      });
      for (let i = 0; i < files.length; i++) {
        if (uploaded.current.has(files[i].key)) continue;
        await upload(request, files[i].file, files[i].key, files[i].service);
        uploaded.current.add(files[i].key);
      }
      await crpc("consumer_complete_execution", {
        p_periods: desiredPeriods,
        p_start: desired,
        p_code: request,
        p_attachment_count: files.length + existingPhotos.length,
        p_key: submitKey.current,
      });
      navigate("/acompanhar/" + request);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function chooseFiles(list: FileList | null, service: string) {
    const selected = Array.from(list || []);
    if (
      selected.length +
        files.filter((f) => f.service !== service).length +
        existingPhotos.length >
        5 ||
      selected.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > 5 * 1024 * 1024,
      )
    ) {
      setError("Selecione até 5 imagens JPEG, PNG ou WebP, de até 5 MB cada.");
      return;
    }
    setError("");
    setFiles([
      ...files.filter((f) => f.service !== service),
      ...selected.map((file) => ({ file, service, key: crypto.randomUUID() })),
    ]);
  }
  return (
    <dialog
      className="c-dialog"
      aria-label="Seu pedido"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="c-dialog-top">
        <span>Seu pedido</span>
        <button
          aria-label="Fechar solicitação"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="c-progress">
        {["Serviços", "Detalhes", "Seus dados", "Horário", "Revisão"].map(
          (s, i) => (
            <span className={i <= step ? "active" : ""} key={s}>
              {i + 1} {s}
            </span>
          ),
        )}
      </div>
      <form onSubmit={submit}>
        <h2>
          {
            [
              "Vamos cuidar dos detalhes?",
              "Conte um pouco mais.",
              "Como podemos chamar você?",
              "Qual horário fica melhor?",
              "Tudo certo para confirmar?",
            ][step]
          }
        </h2>
        <p className="c-form-subtitle">
          Seu pedido · {selection.length}{" "}
          {selection.length === 1 ? "serviço" : "serviços"}
        </p>
        <fieldset disabled={busy || (Boolean(code) && !helpOnly && step !== 3)}>
          {step === 0 && (
            <>
              <p>
                Selecione os serviços. Os adicionais e detalhes ficam na próxima
                etapa.
              </p>
              {company.services
                .filter((s) => s.quotes_allowed || s.direct_booking)
                .map((s) => (
                  <label className="c-check c-option" key={s.code}>
                    <input
                      type="checkbox"
                      checked={selection.some((i) => i.service === s.code)}
                      onChange={() => toggleService(s.code)}
                    />
                    <span>
                      {s.name}
                      <small>{s.description}</small>
                    </span>
                    <Price service={s} />
                  </label>
                ))}
              <OrderPrices items={items} review={alerts.length > 0} />
            </>
          )}
          {step === 1 && (
            <>
              {selection.map((item) => {
                const service = company.services.find(
                  (s) => s.code === item.service,
                )!;
                return (
                  <section
                    className="c-order-item"
                    key={item.service}
                    aria-label={service.name}
                  >
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                    {service.availability && <p>{service.availability}</p>}
                    <h4>Adicionais de {service.name}</h4>
                    {service.addons.map((a) => (
                      <label className="c-check c-option" key={a.code}>
                        <input
                          type="checkbox"
                          checked={item.addons.includes(a.code)}
                          onChange={(e) =>
                            updateItem(item.service, {
                              addons: e.target.checked
                                ? [...item.addons, a.code]
                                : item.addons.filter((c) => c !== a.code),
                            })
                          }
                        />
                        <span>{a.name}</span>
                        <Price service={a} />
                      </label>
                    ))}
                    {!service.addons.length && (
                      <p>Este serviço não possui adicionais.</p>
                    )}
                    {service.questions
                      .filter(
                        (q) =>
                          q.kind !== "photo" &&
                          (!q.condition_field ||
                            item.answers[q.condition_field] ===
                              q.condition_value),
                      )
                      .map((q) => (
                        <label key={q.code}>
                          {q.label}
                          {q.required ? " *" : " (opcional)"}
                          {q.instruction && <small>{q.instruction}</small>}
                          {q.kind === "choice" || q.kind === "boolean" ? (
                            <select
                              required={q.required}
                              value={String(item.answers[q.code] ?? "")}
                              onChange={(e) =>
                                updateItem(item.service, {
                                  answers: {
                                    ...Object.fromEntries(
                                      Object.entries(item.answers).filter(
                                        ([k]) =>
                                          !service.questions.some(
                                            (f) =>
                                              f.code === k &&
                                              f.condition_field === q.code,
                                          ),
                                      ),
                                    ),
                                    [q.code]:
                                      e.target.value === ""
                                        ? undefined
                                        : q.kind === "boolean"
                                          ? e.target.value === "true"
                                          : e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">Selecione</option>
                              {q.kind === "boolean" ? (
                                <>
                                  <option value="true">Sim</option>
                                  <option value="false">Não</option>
                                </>
                              ) : (
                                q.options.map((o) => (
                                  <option key={o}>{o}</option>
                                ))
                              )}
                            </select>
                          ) : q.multiline ? (
                            <textarea
                              required={q.required}
                              maxLength={2000}
                              value={String(item.answers[q.code] ?? "")}
                              onChange={(e) =>
                                updateItem(item.service, {
                                  answers: {
                                    ...item.answers,
                                    [q.code]: e.target.value,
                                  },
                                })
                              }
                            />
                          ) : (
                            <input
                              type={q.kind === "number" ? "number" : "text"}
                              required={q.required}
                              maxLength={2000}
                              value={String(item.answers[q.code] ?? "")}
                              onChange={(e) =>
                                updateItem(item.service, {
                                  answers: {
                                    ...Object.fromEntries(
                                      Object.entries(item.answers).filter(
                                        ([k]) =>
                                          !service.questions.some(
                                            (f) =>
                                              f.code === k &&
                                              f.condition_field === q.code,
                                          ),
                                      ),
                                    ),
                                    [q.code]:
                                      q.kind === "number" &&
                                      e.target.value !== ""
                                        ? Number(e.target.value)
                                        : e.target.value,
                                  },
                                })
                              }
                            />
                          )}
                        </label>
                      ))}
                    <label>
                      Detalhes de {service.name} (opcional)
                      <textarea
                        value={item.notes}
                        maxLength={2000}
                        onChange={(e) =>
                          updateItem(item.service, { notes: e.target.value })
                        }
                      />
                    </label>
                    {(service.photo_policy !== "none" ||
                      service.questions.some((q) => q.kind === "photo")) && (
                      <label className="c-upload">
                        Fotos de {service.name} ·{" "}
                        {
                          {
                            none: "opcionais",
                            optional: "opcionais",
                            recommended: "recomendadas",
                            required: "obrigatórias para avaliação",
                          }[service.photo_policy || "optional"]
                        }
                        {service.photo_instructions && (
                          <small>{service.photo_instructions}</small>
                        )}
                        {service.questions
                          .filter(
                            (q) =>
                              q.kind === "photo" &&
                              (!q.condition_field ||
                                item.answers[q.condition_field] ===
                                  q.condition_value),
                          )
                          .map((q) => (
                            <small key={q.code}>
                              {q.label}
                              {q.required ? " (obrigatória)" : ""}{" "}
                              {q.instruction}
                            </small>
                          ))}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          disabled={!gateway}
                          onChange={(e) =>
                            chooseFiles(e.target.files, item.service)
                          }
                        />
                        <small>
                          Até 5 imagens no pedido, com até 5 MB cada.
                        </small>
                        {!gateway && (
                          <small>
                            Envio temporariamente indisponível neste ambiente.
                          </small>
                        )}
                        {files
                          .filter((f) => f.service === item.service)
                          .map((f) => (
                            <span key={f.key}>{f.file.name}</span>
                          ))}
                      </label>
                    )}
                    <OrderPrices
                      items={selectedPrices(company.services, [item])}
                    />
                  </section>
                );
              })}
              <label>
                Observações (opcional)
                <textarea
                  value={notes}
                  maxLength={4000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Algo que devemos saber para atender você melhor?"
                />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <p>
                Você pode navegar livremente. Estes dados serão usados somente
                para atender sua solicitação.
              </p>
              {returning && (
                <p className="c-form-note">
                  Preenchemos os dados disponíveis na sua sessão para esta
                  empresa. Confira antes de enviar.
                </p>
              )}
              <label>
                Seu nome
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <PhoneField label="WhatsApp com DDD" value={phone} onChange={setPhone} />
              <label>
                E-mail (opcional)
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Como conheceu a empresa? (opcional)
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {Object.entries({
                    unknown: "Prefiro não informar",
                    instagram: "Instagram",
                    google: "Google",
                    referral: "Indicação",
                    whatsapp: "WhatsApp",
                    direct: "Acesso direto",
                    other: "Outro",
                  }).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="c-check">
                <input
                  type="checkbox"
                  required
                  checked={notice}
                  onChange={(e) => setNotice(e.target.checked)}
                />
                <span>
                  Li o aviso: meu nome, contato e detalhes serão usados por{" "}
                  {company.name} para processar esta solicitação e seu
                  acompanhamento. Aviso {company.notice_version}.
                </span>
              </label>
              <label className="c-check">
                <input
                  type="checkbox"
                  checked={contact}
                  onChange={(e) => setContact(e.target.checked)}
                />
                <span>
                  Autorizo contato por WhatsApp ou e-mail sobre este pedido.
                  Posso revogar depois. Não inclui marketing.
                </span>
              </label>
              <p className="c-form-note">
                Seu telefone não funciona como senha. Guarde o link seguro de
                acompanhamento que poderá gerar após o envio.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                {direct
                  ? "Ao confirmar, o horário será reservado para você."
                  : "Este é um horário pretendido. Ele só será reservado após a aprovação da proposta e uma nova conferência de disponibilidade."}
              </p>
              <JourneySchedule
                company={company}
                items={selection}
                value={desired}
                periods={desiredPeriods}
                onChange={(v, p) => {
                  setDesired(v);
                  setDesiredPeriods(p);
                }}
                captcha={captcha}
                disabled={preview}
              />
            </>
          )}
          {step === 4 && (
            <div className="c-review">
              {selection.map((item) => {
                const service = company.services.find(
                  (s) => s.code === item.service,
                )!;
                return (
                  <section className="c-order-item" key={item.service}>
                    <h3>{service.name}</h3>
                    <p>{service.availability}</p>
                    <p>
                      Adicionais:{" "}
                      {service.addons
                        .filter((a) => item.addons.includes(a.code))
                        .map((a) => a.name)
                        .join(", ") || "Nenhum"}
                    </p>
                    {service.questions
                      .filter(
                        (q) =>
                          q.kind !== "photo" &&
                          (!q.condition_field ||
                            item.answers[q.condition_field] ===
                              q.condition_value),
                      )
                      .map((q) => (
                        <p key={q.code}>
                          <strong>{q.label}:</strong>{" "}
                          {typeof item.answers[q.code] === "boolean"
                            ? item.answers[q.code]
                              ? "Sim"
                              : "Não"
                            : String(item.answers[q.code] ?? "Não informado")}
                        </p>
                      ))}
                    {item.notes && <p>Detalhes: {item.notes}</p>}
                    <OrderPrices
                      items={selectedPrices(company.services, [item])}
                    />
                  </section>
                );
              })}
              <OrderPrices items={items} review={alerts.length > 0} />
              <dl>
                <div>
                  <dt>Nome</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>{phone}</dd>
                </div>
                <div>
                  <dt>Observações</dt>
                  <dd>{notes || "Nenhuma"}</dd>
                </div>
                <div>
                  <dt>Fotos</dt>
                  <dd>{files.length} selecionada(s)</dd>
                </div>
              </dl>
              <p>
                <strong>
                  Horário escolhido:{" "}
                  {desired ? date(desired) : "Escolha um horário"}
                </strong>
              </p>
              {desiredPeriods.length > 1 && (
                <Periods periods={desiredPeriods} />
              )}
              <p>
                {direct
                  ? "O valor vem dos serviços e adicionais selecionados. Ao confirmar, a disponibilidade será conferida e o horário reservado."
                  : "Horário escolhido — aguardando confirmação. A equipe da empresa avaliará o pedido e enviará a proposta. Nenhum horário está reservado."}
              </p>
            </div>
          )}
        </fieldset>
        {alerts.map((r, n) => (
          <p className="c-order-alert" key={n}>
            Revisão necessária:{" "}
            {company.services.find((s) => s.code === r.source)?.name} +{" "}
            {company.services.find((s) => s.code === r.target)?.name}. A empresa
            avaliará a combinação antes da proposta final.
          </p>
        ))}
        {preview && (
          <p className="c-form-note">
            Prévia para revisão. Nenhuma solicitação será enviada.
          </p>
        )}
        {step >= 2 && !preview && (
          <Captcha key={captchaRound} onToken={setCaptcha} />
        )}
        <ErrorBox error={error} />
        {error && (
          <button
            type="button"
            className="c-text-button"
            onClick={onRefresh}
            disabled={busy}
          >
            Reabrir catálogo atualizado
          </button>
        )}
        {code && error && (
          <Link to={"/acompanhar/" + code}>Acompanhar rascunho salvo</Link>
        )}
        <div className="c-form-actions">
          <button
            type="button"
            disabled={
              step === 0 || busy || (Boolean(code) && !helpOnly && step <= 3)
            }
            onClick={() => setStep(step - 1)}
          >
            Voltar
          </button>
          <button
            className="c-primary"
            disabled={busy || !selection.length || (preview && step === 4)}
            aria-busy={busy}
            type="submit"
          >
            {busy
              ? "Enviando com segurança…"
              : step === 4
                ? direct
                  ? "Confirmar e reservar"
                  : "Enviar para avaliação"
                : "Continuar →"}
          </button>
        </div>
      </form>
      <ServiceHelp
        company={company}
        items={selection}
        step={step}
        code={code}
        onStarted={(c) => {
          setCode(c);
          setHelpOnly(true);
          setNotice(true);
        }}
        name={name}
        phone={phone}
        onName={setName}
        onPhone={setPhone}
        captcha={captcha}
        preview={preview}
        onContinue={() => setError("")}
      />
    </dialog>
  );
}
export function MyRequests() {
  const [params] = useSearchParams(),
    slug = params.get("empresa") || "";
  const [company, setCompany] = useState<Company | null>(null);
  useEffect(() => {
    let active = true;
    setCompany(null);
    if (slug)
      void crpc<Company>("consumer_public_page", { p_slug: slug })
        .then((c) => {
          if (active) setCompany(c);
        })
        .catch((e) => setError(message(e)));
    return () => {
      active = false;
    };
  }, [slug]);
  const [items, setItems] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    consumerClient?.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setItems([]);
        return;
      }
      try {
        setItems(await crpc("consumer_my_requests"));
      } catch (e) {
        setError(message(e));
      }
    });
  }, []);
  return (
    <Frame name={company?.name} branding={company?.branding} slug={slug}>
      <main className="c-container c-tracking">
        <span className="c-eyebrow">SEU ACOMPANHAMENTO</span>
        <h1>Meus pedidos</h1>
        <ErrorBox error={error} />
        {items?.filter((q) => !slug || q.slug === slug).length === 0 && (
          <p>
            Nenhum pedido está disponível nesta sessão. Se você usou outro
            dispositivo, abra o link seguro que guardou.
          </p>
        )}
        {items
          ?.filter((q) => !slug || q.slug === slug)
          .map((q) => (
            <Link
              className="c-request-row"
              key={q.code}
              to={"/acompanhar/" + q.code}
            >
              <span>
                <strong>{q.company_name}</strong>
                <small>{date(q.created_at)}</small>
              </span>
              <span>{statusLabel(q.state)} →</span>
            </Link>
          ))}
      </main>
    </Frame>
  );
}
const statusLabel = (s: string) =>
  ({
    draft: "Rascunho",
    submitted: "Enviado para avaliação",
    quoted: "Proposta para revisar",
    approved: "Proposta aprovada",
    declined: "Proposta recusada",
    under_review: "Em análise",
    cancelled: "Cancelado",
  })[s] || s;
export function Tracking() {
  const { code = "" } = useParams(),
    [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [selected, setSelected] = useState(""),
    [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]),
    [photo, setPhoto] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [needsCaptcha, setNeedsCaptcha] = useState(false),
    [accessRetry, setAccessRetry] = useState(0);
  const secret = useRef(
    new URLSearchParams(location.hash.slice(1)).get("secret"),
  );
  const operationKeys = useRef(new Map<string, string>());
  function opKey(payload: string) {
    if (!operationKeys.current.has(payload))
      operationKeys.current.set(payload, crypto.randomUUID());
    return operationKeys.current.get(payload)!;
  }
  async function load() {
    setData(await crpc("consumer_request_context", { p_code: code }));
  }
  const accessBoot = useRef<{code:string;attempt:number;promise:Promise<boolean>}>(undefined);
  useEffect(() => {
    let active = true;
    // React may replay this effect before anonymous authentication settles.
    // Share the same attempt so a one-use link cannot bind to a discarded session.
    if (!accessBoot.current || accessBoot.current.code !== code || accessBoot.current.attempt !== accessRetry) {
      if (secret.current) history.replaceState(null, "", location.pathname + location.search);
      accessBoot.current = {code,attempt:accessRetry,promise:(async () => {
        if (secret.current) {
          if (captchaConfigured && !(await consumerClient!.auth.getSession()).data.session) {
            setNeedsCaptcha(true); return false;
          }
          await ensureConsumer();
          await crpc("consumer_redeem_tracking_link", {p_code:code,p_secret:secret.current});
          secret.current = null;
        }
        return true;
      })()};
    }
    void accessBoot.current.promise.then(async ready => {if(active && ready)await load();})
      .catch(e => {if(active)setError(message(e));});
    return () => {active = false;};
  }, [code, accessRetry]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const final = data?.versions.find(
      (v: any) => v.code === data.current_version && v.kind === "final",
    ),
    appointment = data?.appointments.find((a: any) => a.state === "confirmed");
  return (
    <Frame
      name={data?.company?.name}
      branding={data?.branding}
      slug={data?.company?.slug}
    >
      <main className="c-container c-tracking">
        <Link
          to={data ? "/empresa/" + data.company.slug : "/minhas-solicitacoes"}
        >
          ← Voltar
        </Link>
        <span className="c-eyebrow">SEU ACOMPANHAMENTO</span>
        <h1>
          {data
            ? "Olá, " + data.name.split(" ")[0] + "."
            : "Acompanhe seu pedido."}
        </h1>
        {needsCaptcha && (
          <section>
            <p>
              Confirme a verificação para abrir seu pedido neste dispositivo.
            </p>
            <Captcha onToken={setCaptcha} />
            <button
              disabled={!captcha || busy}
              onClick={() =>
                action(async () => {
                  await ensureConsumer(captcha);
                  await crpc("consumer_redeem_tracking_link", {
                    p_code: code,
                    p_secret: secret.current,
                  });
                  secret.current = null;
                  setNeedsCaptcha(false);
                })
              }
            >
              Abrir meu pedido
            </button>
          </section>
        )}
        <ErrorBox error={error} />
        {error && (
          <div>
            <p>Use o navegador em que você abriu este acompanhamento. Se o link expirou, foi revogado ou você precisa trocar de dispositivo, solicite um novo acesso à empresa.</p>
            <button onClick={() => {setError("");setAccessRetry(n => n + 1);}} disabled={busy}>Tentar novamente</button>
          </div>
        )}
        {data && (
          <>
            <RequestProgress data={data} />
            <div className="c-status">
              <span>
                ●{" "}
                {data.help_only
                  ? "Dúvida em atendimento"
                  : data.journey === "direct" && appointment
                    ? "Horário confirmado"
                    : statusLabel(data.state)}
              </span>
              <p>
                {data.journey === "direct" && appointment
                  ? "Sua contratação foi confirmada. Veja o horário e as opções abaixo."
                  : data.state === "draft"
                    ? "Sua seleção está salva. Continue de onde parou."
                    : "Sua solicitação está registrada. Acompanhe as próximas etapas nesta página."}
              </p>
            </div>
            <div className="c-tracking-grid">
              <section>
                <h2>Seu pedido</h2>
                <p className="c-quote-company">{data.company.name}</p>
                <details className="c-order-details">
                  <summary>Ver serviços e detalhes do pedido</summary>
                  <RequestedItems data={data} />
                </details>
                {data.versions.map((v: any) => (
                  <article
                    className={
                      "c-version " +
                      (v.code === data.current_version ? "current" : "")
                    }
                    key={v.code}
                  >
                    <div>
                      <strong>
                        {v.kind === "final"
                          ? `Proposta ${v.version}`
                          : "Solicitação inicial"}
                      </strong>
                      <small>
                        {v.code === data.current_version
                          ? "Versão atual"
                          : "Histórico"}
                      </small>
                    </div>
                    <DocumentButton request={code} reference={v.code}/>{v.kind === "final" ? (
                      <QuoteSummary quote={v} />
                    ) : (
                      <>
                        {v.items.map((i: any, n: number) => (
                          <p key={n}>
                            {i.quantity} × {i.name}
                            <span>
                              <Price
                                service={{
                                  price_mode: i.price_mode,
                                  price_cents: i.unit_cents,
                                }}
                              />
                            </span>
                          </p>
                        ))}
                        {v.customer_explanation && (
                          <p className="c-order-alert">
                            Explicação da proposta: {v.customer_explanation}
                          </p>
                        )}
                        {v.kind === "estimate" ? (
                          <OrderPrices
                            items={v.items}
                            review={data.review_alerts?.length > 0}
                          />
                        ) : (
                          <div className="c-price-summary">
                            <span>
                              {v.price_mode === "from"
                                ? "Estimativa inicial"
                                : v.kind === "final"
                                  ? "Valor final"
                                  : "Valor solicitado"}
                            </span>
                            <Price
                              service={{
                                price_mode: v.price_mode,
                                price_cents: v.total_cents,
                              }}
                            />
                          </div>
                        )}
                        {v.kind === "estimate" && v.price_mode !== "fixed" && (
                          <small>Este valor não é uma proposta final.</small>
                        )}
                        {v.expires_at && (
                          <small>Válida até {date(v.expires_at)}</small>
                        )}
                      </>
                    )}
                    {data.can_manage &&
                      final?.code === v.code &&
                      data.state === "quoted" && (
                        <button
                          disabled={
                            busy || new Date(v.expires_at) <= new Date()
                          }
                          className="c-primary"
                          onClick={() =>
                            action(async () => {
                              await crpc("consumer_approve_quote", {
                                p_code: code,
                                p_version: v.code,
                                p_key: opKey("approve:" + v.code),
                              });
                            })
                          }
                        >
                          Aprovar esta proposta
                        </button>
                      )}
                    {data.can_manage &&
                      final?.code === v.code &&
                      data.state === "quoted" && (
                        <button
                          className="c-text-button"
                          disabled={
                            busy || new Date(v.expires_at) <= new Date()
                          }
                          onClick={() =>
                            action(async () => {
                              await crpc("consumer_decline_quote", {
                                p_code: code,
                                p_version: v.code,
                                p_key: opKey("decline:" + v.code),
                              });
                            })
                          }
                        >
                          Recusar esta proposta
                        </button>
                      )}
                    {new Date(v.expires_at) <= new Date() &&
                      v.kind === "final" &&
                      data.state === "quoted" && (
                        <p>
                          Proposta expirada. Aguarde uma nova versão da empresa.
                        </p>
                      )}
                  </article>
                ))}
                {data.answers?.length > 0 && (
                  <dl>
                    {data.answers.map((a: any, i: number) => (
                      <div key={i}>
                        <dt>{a.label}</dt>
                        <dd>{String(a.answer ?? "Não informado")}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {data.notes && (
                  <p className="c-note">Sua observação: {data.notes}</p>
                )}
                {data.attachments.length > 0 && (
                  <>
                    <h3>Suas imagens</h3>
                    <div className="c-chips">
                      {data.attachments.map((f: any, i: number) => (
                        <button
                          key={f.code}
                          disabled={busy || f.state !== "ready"}
                          onClick={() =>
                            action(async () => {
                              setPhoto(await download(f.code));
                            })
                          }
                        >
                          Imagem {i + 1}{" "}
                          {f.state === "pending" ? "(pendente)" : ""}
                        </button>
                      ))}
                    </div>
                    {photo && (
                      <img
                        className="c-private-image"
                        src={photo}
                        alt="Imagem da sua solicitação"
                      />
                    )}
                  </>
                )}
                {data.state === "draft" && data.can_manage && (
                  <Link
                    className="c-primary"
                    to={
                      "/empresa/" +
                      data.company.slug +
                      "?continuar=" +
                      data.code
                    }
                  >
                    Continuar solicitação
                  </Link>
                )}
                <FollowupPhotos data={data} onChange={load} />
                <h3>Histórico</h3>
                <ol className="c-timeline">
                  {data.events.map((e: any, i: number) => (
                    <li key={i}>
                      <span>
                        {{
                          created: "Solicitação criada",
                          submitted: "Solicitação enviada",
                          quote_sent: "Nova proposta recebida",
                          service_started: "Serviço em execução",
                          service_completed: "Serviço concluído",
                          under_review: "Solicitação em análise",
                          quote_declined: "Proposta recusada",
                          approved: "Proposta aprovada",
                          booked: "Horário confirmado",
                          cancelled: "Horário cancelado",
                          rescheduled: "Horário remarcado",
                          contact_revoked: "Contato revogado",
                          link_revoked: "Link revogado",
                          tracking_link_reissued: "Novo acesso de acompanhamento gerado",
                        }[e.event as string] || "Solicitação atualizada"}
                      </span>
                      <small>{date(e.at)}</small>
                    </li>
                  ))}
                </ol>
              </section>
              <aside>
                <section className="c-booking">
                  <h2>Seu atendimento</h2>
                  {data.desired_start && !appointment && (
                    <p className="c-desired-time">
                      <strong>{date(data.desired_start)}</strong>
                      <br />
                      {data.accepted_version
                        ? "Proposta aprovada. Escolha um novo horário disponível."
                        : "Horário escolhido — aguardando confirmação"}
                    </p>
                  )}
                  {appointment ? (
                    <>
                      <p className="c-booked">
                        ✓ Confirmado
                        <br />
                        <strong>{date(appointment.starts_at)}</strong>
                      </p>
                      {data.appointments.filter(
                        (a: any) => a.state === "confirmed",
                      ).length > 1 && (
                        <Periods
                          periods={data.appointments
                            .filter((a: any) => a.state === "confirmed")
                            .sort(
                              (a: any, b: any) => a.part_number - b.part_number,
                            )
                            .map((a: any) => ({
                              start: a.starts_at,
                              end: a.work_end || a.ends_at,
                              minutes: a.service_minutes,
                              reserved_until: a.ends_at,
                            }))}
                        />
                      )}
                      {data.appointments.filter((a:any)=>a.state === "confirmed").map((a:any)=><PresenceControl key={a.code} request={code} appointment={a} manage={data.can_manage} reload={load}/>)}
                      {data.can_manage && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await crpc("consumer_cancel_booking", {
                                p_code: code,
                                p_appointment: appointment.code,
                                p_key: opKey("cancel:" + appointment.code),
                              });
                            })
                          }
                        >
                          Cancelar atendimento completo
                        </button>
                      )}
                    </>
                  ) : (
                    <p>
                      {data.accepted_version
                        ? "Proposta aprovada. Escolha seu horário."
                        : data.booking?.ready
                          ? "Escolha seu horário para confirmar o atendimento."
                          : "Consulte o andamento da avaliação abaixo."}
                    </p>
                  )}
                  {!appointment && !data.booking?.ready && (
                    <p role="status">
                      {data.booking?.reason === "proposal_required"
                        ? "O agendamento estará disponível após a aprovação da proposta final."
                        : "O pedido precisa estar enviado e apto ao agendamento."}
                    </p>
                  )}
                  {data.can_manage && data.booking?.ready && (
                    <>
                      <ExecutionSchedule
                        key={code + ":" + (appointment?.code || "")}
                        value={selected}
                        periods={selectedPeriods}
                        onChange={(v, p) => {
                          setSelected(v);
                          setSelectedPeriods(p);
                        }}
                        disabled={busy}
                        initialDay={data.desired_start}
                        minutes={final?.duration_minutes}
                        label={
                          appointment
                            ? "Replanejar atendimento completo"
                            : "Escolha um dia"
                        }
                        load={(day, next) =>
                          crpc("consumer_execution_options", {
                            p_code: code,
                            p_day: day,
                            p_next: next,
                          })
                        }
                      />
                      {selected && (
                        <button
                          className="c-primary"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await crpc("consumer_book_execution", {
                                p_periods: selectedPeriods,
                                p_code: code,
                                p_start: selected,
                                p_previous: appointment?.code || null,
                                p_key: opKey(
                                  "book:" +
                                    selected +
                                    ":" +
                                    (appointment?.code || ""),
                                ),
                              });
                              setSelected("");
                            })
                          }
                        >
                          {appointment
                            ? "Confirmar replanejamento completo"
                            : "Confirmar horário"}{" "}
                          — {time(selected)}
                        </button>
                      )}
                      <small>
                        Horários de Recife. A reserva é confirmada somente ao
                        concluir.
                      </small>
                    </>
                  )}
                </section>
                <ConsumerChat key={code} request={code} />
                {data.is_owner && (
                  <section className="c-secure">
                    <h3>Guarde seu acesso</h3>
                    <p>
                      Crie um link para abrir este pedido em outro dispositivo.
                      Ele permite consultar e gerenciar apenas este pedido, vale
                      por 7 dias e só pode ser ativado em um dispositivo.
                      Mantenha-o privado.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          const l = await crpc(
                            "consumer_create_tracking_link",
                            { p_code: code, p_manage: true },
                          );
                          setLink(
                            location.origin +
                              "/acompanhar/" +
                              code +
                              "#secret=" +
                              l.secret,
                          );
                        })
                      }
                    >
                      Gerar link seguro
                    </button>
                    {link && (
                      <label>
                        Copie e guarde este link
                        <input
                          readOnly
                          value={link}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    )}
                    <button
                      className="c-text-button"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await crpc("consumer_revoke_tracking", {
                            p_code: code,
                          });
                          setLink("");
                        })
                      }
                    >
                      Revogar links anteriores
                    </button>
                    <label className="c-check">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={data.contact_authorized}
                        onChange={(e) =>
                          action(async () => {
                            await crpc("consumer_set_contact", {
                              p_code: code,
                              p_allowed: e.target.checked,
                            });
                          })
                        }
                      />
                      <span>
                        Autorizar contato sobre este pedido. Sem marketing.
                      </span>
                    </label>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </Frame>
  );
}
