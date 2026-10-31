import { useEffect, useState, useRef, type FormEvent } from "react";
import { academyApi, academyError, academyRoot, studentDownload } from "./api";
import { platformBrand } from "../brand/platform";
import type { CourseDocument, Lesson, Material } from "./types";
import "./academy.css";
import { ThemeToggle, useAcademyTheme } from "./ThemeToggle";
const topics = [
  [
    "01",
    "Organizando a base",
    "Informações essenciais, serviços e organização inicial.",
  ],
  [
    "02",
    "Presença digital profissional",
    "Apresentação, portfólio e informações que ajudam o cliente a escolher.",
  ],
  [
    "03",
    "Atendimento e solicitações",
    "Contatos, pedidos e orçamentos com mais clareza.",
  ],
  [
    "04",
    "Agenda e rotina operacional",
    "Disponibilidade, planejamento e acompanhamento.",
  ],
  [
    "05",
    "Colocando tudo em prática",
    "Revisão dos processos e uma rotina mais organizada.",
  ],
];
export function Video({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [id]);
  return open ? (
    <iframe
      className="ac-video"
      title={title}
      src={"https://www.youtube-nocookie.com/embed/" + id}
      allow="encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  ) : (
    <div className="ac-video-placeholder">
      <button onClick={() => setOpen(true)}>▶ Carregar vídeo da aula</button>
      <small>
        Ao continuar, o player do YouTube será carregado. Links não listados
        podem ser compartilhados.
      </small>
    </div>
  );
}
export function Academy() {
  const { theme, toggle } = useAcademyTheme();
  const [config, setConfig] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [student, setStudent] = useState<any>(null),
    [active, setActive] = useState<{ course: string; lesson: Lesson } | null>(
      null,
    ),
    [pref, setPref] = useState<any>(null),
    [formReady, setFormReady] = useState(false);
  const locked = useRef(false);
  const [path, setPath] = useState(location.pathname),
    [linkToken] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
    );
  useEffect(() => {
    if (location.hash) history.replaceState(null, "", location.pathname);
    const update = () => {
      setPath(location.pathname);
      setMessage("");
      setError("");
    };
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  const navigate = (next: string) => {
    history.pushState(null, "", next);
    setPath(next);
    setMessage("");
    setError("");
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    academyApi("config")
      .then(setConfig)
      .catch((e) => setError(academyError(e)));
    void academyApi("metric", {
      event: "visit",
      source: new URLSearchParams(location.search).get("utm_source") || "",
    }).catch(() => {});
  }, []);
  async function action(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(academyError(e));
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  async function loadStudent() {
    const r = await academyApi("student");
    setStudent(r);
    void academyApi("metric", { event: "course_access" }).catch(() => {});
  }
  useEffect(() => {
    if (path === "/aulas" && config?.mode === "course")
      void action(loadStudent);
    if (path === "/preferencias")
      void action(async () =>
        setPref(
          await academyApi(
            "preferences",
            linkToken ? { token: linkToken } : {},
          ),
        ),
      );
  }, [path, config?.mode]);
  useEffect(() => {
    setFormReady(false);
    const timer = setTimeout(() => setFormReady(true), 2100);
    return () => clearTimeout(timer);
  }, [config?.challenge]);
  const notice = config?.notice;
  async function enroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      const utm = Object.fromEntries(
        ["utm_source", "utm_medium", "utm_campaign", "utm_content"].map((k) => [
          k,
          new URLSearchParams(location.search).get(k) || "",
        ]),
      );
      const r = await academyApi("subscribe", {
        name: f.get("name"),
        email: f.get("email"),
        segment: f.get("segment"),
        difficulty: f.get("difficulty"),
        consent: f.get("consent") === "on",
        website: f.get("website"),
        utm,
        challenge: config.challenge,
        notice_id: notice?.id,
      });
      setMessage(r.message);
      setConfig(await academyApi("config"));
    });
  }
  return (
    <div className="academy">
      <a className="ac-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ac-header">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="ac-brand"
          aria-label="SYZIA Academy — início"
        >
          <img
            src={
              theme === "dark"
                ? platformBrand.logoDark
                : platformBrand.logoLight
            }
            alt="SYZIA — Onde tudo se alinha"
            width="216"
            height="98"
          />
          <span>ACADEMY</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="/#programa">O minicurso</a>
          <button className="ac-link" onClick={() => navigate("/aulas")}>
            Área do aluno <span aria-hidden="true">↗</span>
          </button>
          <ThemeToggle theme={theme} toggle={toggle} />
        </nav>
      </header>
      <main id="conteudo">
        {error && path !== "/" && (
          <div className="ac-feedback" role="alert">
            {error}
          </div>
        )}
        {message && path !== "/" && (
          <div className="ac-feedback success" role="status">
            {message}
          </div>
        )}
        {path === "/" && (
          <>
            <section className="ac-hero">
              <div>
                <p className="ac-eyebrow">SYZIA ACADEMY · MINICURSO GRATUITO</p>
                <h1>
                  Menos improviso.
                  <br />
                  <em>Mais direção.</em>
                </h1>
                <p className="ac-lede">
                  Aprenda a organizar seu negócio e coloque o conhecimento em
                  prática.
                </p>
                <p>
                  Da apresentação dos serviços ao acompanhamento da rotina: um
                  caminho prático para quem presta serviços.
                </p>
                <a
                  className="ac-primary"
                  href={config?.mode === "course" ? "/aulas" : "#inscricao"}
                  onClick={
                    config?.mode === "course"
                      ? (e) => {
                          e.preventDefault();
                          navigate("/aulas");
                        }
                      : undefined
                  }
                >
                  {config?.mode === "course"
                    ? "Conhecer as aulas"
                    : "Quero entrar na lista"}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
                <span className="ac-micro">
                  Gratuito · Sem cartão · Sem obrigação de contratar a SYZIA
                </span>
              </div>
              <div
                className="ac-roadmap"
                aria-label="Um caminho da organização à prática"
              >
                <div className="ac-roadmap-head">
                  <span>UM PASSO DE CADA VEZ</span>
                  <span>01 → 05</span>
                </div>
                <h2>
                  Organização que
                  <br />
                  sai do papel.
                </h2>
                <div className="ac-orbit">
                  <span className="ac-orbit-center">
                    Sua rotina,
                    <br />
                    <strong>mais clara.</strong>
                  </span>
                  <span className="ac-pill one">Apresentar</span>
                  <span className="ac-pill two">Atender</span>
                  <span className="ac-pill three">Planejar</span>
                </div>
                <div className="ac-roadmap-footer">
                  <i aria-hidden="true" />
                  Conhecimento para colocar em prática
                </div>
              </div>
            </section>
            <section className="ac-purpose">
              <p className="ac-eyebrow">PARA QUEM FAZ ACONTECER</p>
              <h2>
                Você domina o serviço.
                <br />A organização também pode acompanhar.
              </h2>
              <p>
                Para prestadores de serviços, autônomos e pequenos
                empreendedores que querem apresentar melhor o que fazem,
                organizar solicitações e ter mais clareza no dia a dia.
              </p>
              <div className="ac-benefits">
                <article>
                  <span>01 / CLAREZA</span>
                  <h3>Serviços bem apresentados</h3>
                  <p>
                    Organize informações que ajudam o cliente a entender sua
                    oferta.
                  </p>
                </article>
                <article>
                  <span>02 / CONTINUIDADE</span>
                  <h3>Atendimento com contexto</h3>
                  <p>
                    Conecte o primeiro contato ao próximo passo de cada
                    solicitação.
                  </p>
                </article>
                <article>
                  <span>03 / ROTINA</span>
                  <h3>Planejamento possível</h3>
                  <p>
                    Encontre uma forma de acompanhar a agenda e as tarefas da
                    semana.
                  </p>
                </article>
              </div>
            </section>
            <section id="programa" className="ac-program">
              <div>
                <p className="ac-eyebrow">DO IMPROVISO À ORGANIZAÇÃO</p>
                <h2>
                  Uma base prática.
                  <br />
                  Cinco etapas para avançar.
                </h2>
                <p>Como organizar seu negócio de prestação de serviços.</p>
                <p className="ac-small">
                  {config?.mode === "course"
                    ? "Explore os conteúdos disponíveis na área do aluno."
                    : "As aulas estão em preparação. Entre na lista para receber o aviso quando o minicurso estiver disponível."}
                </p>
              </div>
              <ol>
                {topics.map(([n, title, desc]) => (
                  <li key={n}>
                    <span>{n}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section id="inscricao" className="ac-signup">
              <div>
                <p className="ac-eyebrow">COMECE PELO PRÓXIMO PASSO</p>
                <h2>
                  {config?.mode === "course"
                    ? "Aprenda no seu ritmo."
                    : "A organização começa com uma decisão."}
                </h2>
                <p>
                  Receba as orientações de acesso e os avisos do minicurso. Nada
                  de assinatura, senha ou cartão nesta inscrição.
                </p>
                <p className="ac-small">
                  Seu interesse pelo curso não autoriza comunicações comerciais
                  da plataforma.
                </p>
              </div>
              <form onSubmit={enroll} className="ac-form">
                <h3>
                  {config?.mode === "course"
                    ? "Inscrição gratuita"
                    : "Entre na lista de espera"}
                </h3>
                <label>
                  Nome
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Segmento profissional
                  <select name="segment" required defaultValue="">
                    <option value="" disabled>
                      Selecione seu segmento
                    </option>
                    {[
                      "Beleza e bem-estar",
                      "Manutenção e reparos",
                      "Serviços automotivos",
                      "Design e comunicação",
                      "Consultoria e educação",
                      "Serviços para eventos",
                      "Outro segmento",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Qual é a principal dificuldade para organizar sua rotina?
                  <textarea
                    name="difficulty"
                    minLength={5}
                    maxLength={600}
                    required
                    rows={3}
                    placeholder="Conte brevemente. Evite documentos e dados sensíveis."
                  />
                </label>
                <div className="ac-honey" aria-hidden="true">
                  <label>
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <label className="ac-check">
                  <input type="checkbox" name="consent" required />
                  Quero receber a confirmação e os avisos relacionados ao
                  minicurso. Posso cancelar esses avisos a qualquer momento.
                </label>
                <p className="ac-small">
                  Leia os{" "}
                  <a
                    href="/termos"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/termos");
                    }}
                  >
                    Termos da Academy
                  </a>{" "}
                  e a{" "}
                  <a
                    href="/privacidade"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/privacidade");
                    }}
                  >
                    Política de Privacidade
                  </a>
                  .
                </p>
                <button
                  className="ac-primary"
                  disabled={
                    busy ||
                    !formReady ||
                    !config?.waitlist_enabled ||
                    !config?.mail_ready
                  }
                >
                  {busy ? "Enviando…" : "Receber confirmação por e-mail"}
                </button>
                {(!config?.waitlist_enabled || !config?.mail_ready) && (
                  <p role="status">
                    As inscrições ainda não estão abertas. Volte em breve.
                  </p>
                )}
                <small>
                  Depois do envio, confirme sua inscrição pelo link recebido.
                </small>
                {error && (
                  <p className="ac-feedback" role="alert">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="ac-feedback success" role="status">
                    {message}
                  </p>
                )}
              </form>
            </section>
            <section className="ac-faq">
              <div>
                <p className="ac-eyebrow">SEM COMPLICAÇÃO</p>
                <h2>Antes de começar.</h2>
              </div>
              <div>
                {[
                  [
                    "O minicurso é realmente gratuito?",
                    "Sim. Você não precisa contratar a SYZIA, informar cartão ou criar uma conta na plataforma de gestão.",
                  ],
                  [
                    "Preciso usar a SYZIA para acompanhar?",
                    "Não. O conteúdo é independente. A SYZIA poderá aparecer em demonstrações práticas, e você decide se quer conhecer a ferramenta.",
                  ],
                  [
                    "Quando as aulas estarão disponíveis?",
                    config?.mode === "course"
                      ? "Os conteúdos publicados podem ser acessados na área do aluno."
                      : "Ainda não há uma data de lançamento anunciada. Os inscritos confirmados poderão receber o aviso de abertura.",
                  ],
                  [
                    "Como entro nas aulas?",
                    "Quando o curso estiver disponível, solicite um link de acesso no e-mail confirmado. Seu progresso fica associado à sua identidade na Academy.",
                  ],
                  [
                    "Posso deixar de receber avisos?",
                    "Sim. Use o link de preferências presente nos e-mails. Cancelar os avisos não cria nenhuma obrigação de contratação.",
                  ],
                ].map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </section>
            <section className="ac-saas">
              <h2>
                Aprender é o começo.
                <br />
                Aplicar é o próximo passo.
              </h2>
              <p>
                Conheça a SYZIA: presença digital e organização para a prestação
                de serviços. A contratação é opcional e segue as condições
                apresentadas no site.
              </p>
              <a
                href="https://usesyzia.com.br"
                onClick={() =>
                  void academyApi("metric", { event: "syzia_interest" }).catch(
                    () => {},
                  )
                }
              >
                Conhecer a plataforma SYZIA ↗
              </a>
            </section>
          </>
        )}
        {path === "/confirmar" && (
          <section className="ac-narrow">
            <p className="ac-eyebrow">SEU PRÓXIMO PASSO</p>
            <h1>Confirme para continuar.</h1>
            <p>O link só é utilizado quando você confirma nesta tela.</p>
            {!message && (
              <button
                className="ac-primary"
                disabled={busy || !linkToken}
                onClick={() =>
                  void action(async () => {
                    const r = await academyApi("consume", { token: linkToken });
                    setMessage(
                      r.mode === "course"
                        ? "E-mail confirmado. Você já pode acessar as aulas."
                        : "Inscrição confirmada. Vamos avisar quando as aulas estiverem disponíveis.",
                    );
                  })
                }
              >
                {busy ? "Confirmando…" : "Confirmar meu e-mail"}
              </button>
            )}
            {message && config?.mode === "course" && (
              <button onClick={() => navigate("/aulas")}>
                Ir para as aulas
              </button>
            )}
          </section>
        )}
        {path === "/aulas" && (
          <section className="ac-learning">
            <p className="ac-eyebrow">ÁREA DO ALUNO</p>
            <h1>Conhecimento em prática.</h1>
            {config?.mode !== "course" ? (
              <div className="ac-empty">
                <h2>As aulas estão sendo preparadas.</h2>
                <p>
                  A lista de espera é o primeiro passo. Nenhuma data será
                  prometida antes da confirmação do lançamento.
                </p>
                <button onClick={() => navigate("/")}>
                  Voltar à lista de espera
                </button>
              </div>
            ) : !student ? (
              <form
                className="ac-form ac-narrow"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    const r = await academyApi("login", {
                      email: f.get("email"),
                      challenge: config.challenge,
                    });
                    setMessage(r.message);
                    setConfig(await academyApi("config"));
                  });
                }}
              >
                <h2>Acesse pelo seu e-mail</h2>
                <p>
                  Use o endereço que você confirmou na Academy. Sem senha ou
                  assinatura SaaS.
                </p>
                <label>
                  E-mail
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                  />
                </label>
                <button className="ac-primary" disabled={busy || !formReady}>
                  Receber link de acesso
                </button>
                <button type="button" onClick={() => navigate("/")}>
                  Ainda não me inscrevi
                </button>
              </form>
            ) : (
              <>
                <div className="ac-learning-tools">
                  <button onClick={() => navigate("/preferencias")}>
                    Preferências
                  </button>
                  <button
                    onClick={() =>
                      void action(async () => {
                        await academyApi("logout");
                        setStudent(null);
                        setActive(null);
                      })
                    }
                  >
                    Sair
                  </button>
                </div>
                <div className="ac-classroom">
                  <aside>
                    {student.courses.map(
                      (c: { id: string; document: CourseDocument }) => (
                        <section key={c.id}>
                          {c.document.cover && (
                            <img
                              className="ac-course-cover"
                              src={
                                academyRoot +
                                "/academy/cover/" +
                                c.document.cover
                              }
                              alt=""
                              loading="lazy"
                              width="320"
                              height="180"
                            />
                          )}
                          <h2>{c.document.title}</h2>
                          {c.document.modules
                            .filter((m) => m.lessons.length > 0)
                            .map((m) => (
                              <div key={m.id}>
                                <h3>{m.title}</h3>
                                {m.lessons.map((l) => (
                                  <button
                                    key={l.id}
                                    aria-current={
                                      active?.lesson.id === l.id
                                        ? "page"
                                        : undefined
                                    }
                                    onClick={() => {
                                      setActive({ course: c.id, lesson: l });
                                      setError("");
                                    }}
                                  >
                                    {student.progress.some(
                                      (p: any) =>
                                        p.lesson_id === l.id && p.completed,
                                    )
                                      ? "✓ "
                                      : ""}
                                    {l.title}
                                  </button>
                                ))}
                              </div>
                            ))}
                        </section>
                      ),
                    )}
                  </aside>
                  <article>
                    {active ? (
                      <>
                        <p className="ac-eyebrow">SUA AULA</p>
                        <h2>{active.lesson.title}</h2>
                        <Video
                          id={active.lesson.video_id}
                          title={active.lesson.title}
                        />
                        <p className="ac-prose">{active.lesson.description}</p>
                        <label className="ac-check">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={student.progress.some(
                              (p: any) =>
                                p.lesson_id === active.lesson.id && p.completed,
                            )}
                            onChange={(e) => {
                              const completed = e.target.checked;
                              void action(async () => {
                                await academyApi("progress", {
                                  course_id: active.course,
                                  lesson_id: active.lesson.id,
                                  completed,
                                });
                                await loadStudent();
                              });
                            }}
                          />
                          Marcar aula como concluída
                        </label>
                        {active.lesson.materials.length > 0 && (
                          <h3>Materiais complementares</h3>
                        )}
                        {active.lesson.materials.map((id) => {
                          const m = student.materials.find(
                            (x: Material) => x.id === id,
                          );
                          return (
                            m && (
                              <button
                                key={id}
                                onClick={() =>
                                  void action(() => studentDownload(id, m.name))
                                }
                              >
                                ↓ {m.name}
                              </button>
                            )
                          );
                        })}
                      </>
                    ) : (
                      <div className="ac-empty">
                        <h2>Escolha uma aula para começar.</h2>
                        <p>
                          Seu progresso fica salvo para você continuar depois.
                        </p>
                      </div>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>
        )}
        {path === "/preferencias" && (
          <section className="ac-narrow">
            <h1>Suas preferências.</h1>
            {pref && (
              <>
                <p>
                  {pref.notifications
                    ? "Você recebe avisos relacionados ao minicurso."
                    : "Os avisos do minicurso estão cancelados."}
                </p>
                <p>
                  Não usamos essa inscrição como autorização para marketing
                  comercial.
                </p>
                <button
                  disabled={busy || !pref.notifications}
                  onClick={() =>
                    void action(async () => {
                      setPref(
                        await academyApi("unsubscribe", {
                          token: linkToken,
                          confirmed: true,
                        }),
                      );
                      setMessage("Avisos cancelados.");
                    })
                  }
                >
                  Cancelar os avisos do curso
                </button>
                <details>
                  <summary>Excluir meus dados da Academy</summary>
                  <p>
                    Esta ação exclui sua inscrição e seu progresso. Não altera
                    contas da plataforma SYZIA.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await academyApi("delete_student", {
                          token: linkToken,
                          confirmed: true,
                        });
                        setPref(null);
                        setStudent(null);
                        setMessage("Dados da Academy excluídos.");
                      })
                    }
                  >
                    Confirmar exclusão da inscrição e do progresso
                  </button>
                </details>
              </>
            )}
          </section>
        )}
        {(path === "/termos" || path === "/privacidade") && (
          <section className="ac-narrow ac-legal">
            <h1>
              {path === "/termos"
                ? "Termos da SYZIA Academy"
                : "Privacidade na Academy"}
            </h1>
            {notice ? (
              <>
                <p className="ac-prose">
                  {path === "/termos" ? notice.terms : notice.privacy}
                </p>
                <p>
                  {config.contact_name} · {config.contact_email}
                </p>
              </>
            ) : (
              <p>
                Os documentos estão sendo preparados. As inscrições permanecem
                fechadas até sua disponibilização.
              </p>
            )}
          </section>
        )}
        {![
          "/",
          "/aulas",
          "/confirmar",
          "/preferencias",
          "/termos",
          "/privacidade",
        ].includes(path) && (
          <section className="ac-narrow">
            <h1>Página não encontrada</h1>
            <button onClick={() => navigate("/")}>Voltar ao início</button>
          </section>
        )}
      </main>
      <footer className="ac-footer">
        <div className="ac-brand">
          <img
            src={
              theme === "dark"
                ? platformBrand.logoDark
                : platformBrand.logoLight
            }
            alt="SYZIA — Onde tudo se alinha"
            width="216"
            height="98"
          />
          <span>ACADEMY</span>
        </div>
        <p>Aprender. Organizar. Colocar em prática.</p>
        <nav aria-label="Informações institucionais">
          <a
            href="/termos"
            onClick={(e) => {
              e.preventDefault();
              navigate("/termos");
            }}
          >
            Termos da Academy
          </a>
          <a
            href="/privacidade"
            onClick={(e) => {
              e.preventDefault();
              navigate("/privacidade");
            }}
          >
            Privacidade
          </a>
          <a href="https://usesyzia.com.br">Conheça a SYZIA</a>
        </nav>
        {config?.contact_email && (
          <a href={"mailto:" + config.contact_email}>{config.contact_email}</a>
        )}
      </footer>
    </div>
  );
}
