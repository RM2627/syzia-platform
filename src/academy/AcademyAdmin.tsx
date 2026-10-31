import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AcademyCall, Course, Material } from "./types";
import { academyAdmin, academyFile } from "./admin-api";
import { academyError } from "./api";
import { MailTest, MailDiagnostic } from "./MailTest";
import { CourseEditor } from "./CourseEditor";
import { academyTerms, academyPrivacy } from "./legal-drafts";
import "./admin.css";
const sections = [
  "Visão geral",
  "Lista de espera",
  "Cursos",
  "Aulas e vídeos",
  "Materiais",
  "Comunicações",
  "Resultados",
  "Configurações",
];
export function AcademyAdmin({ call = academyAdmin }: { call?: AcademyCall }) {
  const [query, setQuery] = useSearchParams();
  const section = Number(query.get("sec") || 0);
  const [allowed, setAllowed] = useState<boolean | null>(null),
    [overview, setOverview] = useState<any>(null),
    [courses, setCourses] = useState<any[]>([]),
    [materials, setMaterials] = useState<Material[]>([]),
    [students, setStudents] = useState<any[]>([]),
    [course, setCourse] = useState<Course | null>(null),
    [filters, setFilters] = useState({
      status: "",
      segment: "",
      source: "",
      from: "",
      to: "",
      offset: 0,
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [settings, setSettings] = useState<any>(null),
    [confirmSettings, setConfirmSettings] = useState(false);
  const lock = useRef(false);
  async function load() {
    const [o, c, m] = await Promise.all([
      call("overview"),
      call("courses"),
      call("materials"),
    ]);
    setOverview(o);
    setCourses(c);
    setMaterials(m);
    return o;
  }
  useEffect(() => {
    let alive = true;
    call("access")
      .then(async (a) => {
        if (!alive) return;
        setAllowed(a.allowed);
        if (a.allowed) await load();
      })
      .catch((e) => {
        setAllowed(false);
        setError(academyError(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(academyError(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  useEffect(() => {
    if (allowed && section === 1)
      void act(async () => setStudents(await call("students", filters)));
    if (section === 7 && overview)
      setSettings({
        ...overview.settings,
        terms: overview.notice?.terms || "",
        privacy: overview.notice?.privacy || "",
      });
  }, [section, allowed]);
  const open = (id: string) =>
    void act(async () => setCourse(await call("course_get", { id })));
  const exportCSV = async () => {
    const all: any[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const rows = await call("export", { ...filters, offset });
      all.push(...rows);
      if (rows.length < 100) break;
      if (offset === 9900) throw Error("academy_export_limit");
    }
    const cols = [
      "name",
      "email",
      "segment",
      "difficulty",
      "status",
      "created_at",
      "confirmed_at",
      "utm",
    ];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^(?:[\s]*[=+@\-]|[\t\r])/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv =
      "\ufeff" +
      [
        cols,
        ...all.map((r) =>
          cols.map((k) => (k === "utm" ? JSON.stringify(r.utm) : r[k])),
        ),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "academy-inscricoes.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `${all.length} registros exportados. Mantenha o arquivo protegido e use somente para a finalidade autorizada.`,
    );
  };
  if (allowed === null) return <p role="status">Carregando a Academy…</p>;
  if (!allowed)
    return (
      <section>
        <h1>Acesso restrito à Academy</h1>
        <p>A gestão está disponível somente ao Super Admin com sessão ativa.</p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section className="aa-admin">
      <header className="aa-header">
        <div>
          <p className="aa-eyebrow">EDUCAÇÃO · CONTEÚDO · RELACIONAMENTO</p>
          <h1>SYZIA Academy</h1>
          <p>
            Prepare o conteúdo. Acompanhe as inscrições. Lance no momento certo.
          </p>
        </div>
        <span className="aa-badge">
          {overview?.settings.mode === "course"
            ? "Curso disponível"
            : "Lista de espera · aulas fechadas"}
        </span>
      </header>
      <nav className="aa-tabs" aria-label="Seções da Academy">
        {sections.map((s, i) => (
          <button
            key={s}
            aria-current={section === i ? "page" : undefined}
            disabled={busy}
            onClick={() => {
              setQuery({ sec: String(i) });
              setError("");
              setNotice("");
              setPreview(null);
            }}
          >
            {s}
          </button>
        ))}
      </nav>
      {error && (
        <p className="aa-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="aa-success" role="status">
          {notice}
        </p>
      )}
      {busy && <p role="status">Processando…</p>}
      {overview && (section === 0 || section === 6) && (
        <>
          <div className="aa-metrics">
            {[
              ["Aguardando confirmação", overview.totals?.pending || 0],
              [
                "Confirmadas",
                Number(overview.totals?.confirmed || 0) +
                  Number(overview.totals?.invited || 0),
              ],
              ["Avisadas do lançamento", overview.totals?.invited || 0],
              ["Avisos cancelados", overview.totals?.cancelled || 0],
            ].map(([label, n]) => (
              <article key={label}>
                <p>{label}</p>
                <strong>{n}</strong>
              </article>
            ))}
          </div>
          <div className="aa-grid">
            <article className="aa-card">
              <h2>
                {section === 0 ? "O próximo passo" : "Visitas e interesse"}
              </h2>
              {section === 0 ? (
                <>
                  <p>
                    Os cursos são gratuitos e independentes do SaaS. A
                    publicação de conteúdo e a abertura das aulas são ações
                    distintas.
                  </p>
                  <button onClick={() => setQuery({ sec: "2" })}>
                    Organizar os cursos
                  </button>
                  <button onClick={() => setQuery({ sec: "7" })}>
                    Revisar abertura e privacidade
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Eventos agregados por dia e origem. Não representam pessoas
                    únicas, vendas ou assinaturas.
                  </p>
                  {["visit", "course_access", "syzia_interest"].map((k) => (
                    <p key={k}>
                      {
                        (
                          {
                            visit: "Visitas",
                            course_access: "Acessos às aulas",
                            syzia_interest: "Cliques para conhecer a SYZIA",
                          } as any
                        )[k]
                      }
                      :{" "}
                      <strong>
                        {(overview.metrics || [])
                          .filter((m: any) => m.event === k)
                          .reduce(
                            (a: number, m: any) => a + Number(m.count),
                            0,
                          )}
                      </strong>
                    </p>
                  ))}
                </>
              )}
            </article>
            <article className="aa-card">
              <h2>Inscrições por dia</h2>
              {overview.dates.map((d: any) => (
                <p key={d.day}>
                  {String(d.day).slice(0, 10)} · {d.registrations} inscrições ·{" "}
                  {d.confirmations} confirmadas
                </p>
              ))}
              {overview.dates.length === 0 && (
                <p>Aguardando as primeiras inscrições.</p>
              )}
            </article>
            <article className="aa-card">
              <h2>Segmentos</h2>
              {overview.segments.map((x: any) => (
                <p key={x.segment}>
                  {x.segment}: {x.count}
                </p>
              ))}
            </article>
            <article className="aa-card">
              <h2>Origens</h2>
              {overview.sources.map((x: any) => (
                <p key={x.source}>
                  {x.source}: {x.count}
                </p>
              ))}
            </article>
          </div>
          {section === 0 && (
            <details className="aa-card">
              <summary>Histórico administrativo</summary>
              {overview.events.map((e: any, i: number) => (
                <p key={i}>
                  {e.event} · {new Date(e.created_at).toLocaleString("pt-BR")}
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {section === 1 && (
        <>
          <h2>Lista de espera</h2>
          <form
            className="aa-filters"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                setFilters({ ...filters, offset: 0 });
                setStudents(await call("students", { ...filters, offset: 0 }));
              });
            }}
          >
            <label>
              Estado
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="pending">Aguardando confirmação</option>
                <option value="confirmed">Confirmada</option>
                <option value="cancelled">Cancelada</option>
                <option value="invited">Convidada ao lançamento</option>
              </select>
            </label>
            <label>
              Segmento
              <input
                value={filters.segment}
                onChange={(e) =>
                  setFilters({ ...filters, segment: e.target.value })
                }
              />
            </label>
            <label>
              Origem
              <input
                value={filters.source}
                onChange={(e) =>
                  setFilters({ ...filters, source: e.target.value })
                }
              />
            </label>
            <label>
              De
              <input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  setFilters({ ...filters, from: e.target.value })
                }
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </label>
            <button disabled={busy}>Filtrar</button>
          </form>
          <div className="aa-actions">
            <button
              disabled={busy || !students.length}
              onClick={() => void act(exportCSV)}
            >
              Exportar CSV filtrado
            </button>
            <p className="aa-note">
              Somente dados do curso. Nenhuma autorização comercial presumida.
            </p>
          </div>
          <div className="aa-students">
            {students.map((s) => (
              <article className="aa-card" key={s.id}>
                <div className="aa-title">
                  <h3>{s.name}</h3>
                  <span className="aa-badge">
                    {
                      (
                        {
                          pending: "Aguardando confirmação",
                          confirmed: "Confirmada",
                          cancelled: "Cancelada",
                          invited: "Convidada ao lançamento",
                        } as any
                      )[s.status]
                    }
                  </span>
                </div>
                <p>
                  {s.email} · {s.segment}
                </p>
                <p>{s.difficulty}</p>
                <small>
                  {new Date(s.created_at).toLocaleString("pt-BR")} ·{" "}
                  {s.utm?.utm_source || "Direto"}{" "}
                  {s.utm?.utm_campaign && " / " + s.utm.utm_campaign}
                </small>
              </article>
            ))}
          </div>
          {!students.length && <p>Nenhuma inscrição neste filtro.</p>}
          <div className="aa-actions">
            <button
              disabled={busy || filters.offset === 0}
              onClick={() =>
                void act(async () => {
                  const offset = Math.max(0, filters.offset - 100);
                  setFilters({ ...filters, offset });
                  setStudents(await call("students", { ...filters, offset }));
                })
              }
            >
              Anterior
            </button>
            <span>Página {filters.offset / 100 + 1}</span>
            <button
              disabled={busy || students.length < 100}
              onClick={() =>
                void act(async () => {
                  const offset = filters.offset + 100;
                  setFilters({ ...filters, offset });
                  setStudents(await call("students", { ...filters, offset }));
                })
              }
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {(section === 2 || section === 3) && (
        <>
          <div className="aa-title">
            <h2>{section === 2 ? "Cursos" : "Aulas e vídeos"}</h2>
            <button
              disabled={busy}
              onClick={() =>
                setCourse({
                  id: "",
                  revision: 0,
                  position: courses.length,
                  state: "draft",
                  draft: {
                    title: "",
                    description: "",
                    audience: "",
                    cover: "",
                    modules: [],
                  },
                })
              }
            >
              Criar curso
            </button>
          </div>
          <div className="aa-course-list">
            {courses.map((c) => (
              <button
                key={c.id}
                className={course?.id === c.id ? "active" : ""}
                disabled={busy}
                onClick={() => open(c.id)}
              >
                <strong>{c.title}</strong>
                <span>
                  {
                    (
                      {
                        draft: "Rascunho",
                        preparing: "Em preparação",
                        published: "Publicado",
                        archived: "Arquivado",
                      } as any
                    )[c.state]
                  }{" "}
                  · revisão {c.revision}
                </span>
              </button>
            ))}
          </div>
          {course ? (
            <CourseEditor
              key={course.id + ":" + course.revision}
              initial={course}
              materials={materials}
              call={call}
              onSave={async () => {
                await load();
              }}
            />
          ) : (
            <div className="aa-card">
              <h3>Escolha um curso para continuar.</h3>
              <p>
                Os cinco módulos iniciais já estão preparados como uma estrutura
                editável. Nenhum vídeo ou duração foi inventado.
              </p>
            </div>
          )}
        </>
      )}
      {section === 4 && (
        <>
          <h2>Materiais complementares</h2>
          <p>
            PDF sem ações ativas, TXT ou CSV em UTF-8 · até 5 MB. Use somente
            materiais autorizados. Não são aceitos executáveis, documentos com
            macros ou arquivos de vídeo.
          </p>
          <label className="aa-upload">
            Anexar material
            <input
              type="file"
              accept=".pdf,.txt,.csv"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void act(async () => {
                    await call("upload", await academyFile(f, "material"));
                    await load();
                    setNotice(
                      "Material armazenado. Vincule-o a uma aula para disponibilizar aos alunos.",
                    );
                  });
                e.target.value = "";
              }}
            />
          </label>
          <div className="aa-grid">
            {materials.map((m) => (
              <article className="aa-card" key={m.id}>
                <h3>{m.name}</h3>
                <p>
                  {m.kind === "image" ? "Imagem de capa" : "Material de aula"} ·{" "}
                  {Math.ceil(m.bytes / 1024)} KB
                </p>
                <small>
                  Armazenamento privado. Apenas referências publicadas são
                  disponibilizadas aos alunos.
                </small>
              </article>
            ))}
          </div>
        </>
      )}
      {section === 5 && (
        <>
          <h2>Comunicações</h2>
          <MailTest
            call={call}
            refresh={load}
            tests={overview?.mail_tests || []}
          />
          <p>
            O lançamento usa apenas inscrições confirmadas com avisos
            autorizados. Cada lote tem até 25 destinatários, sem expor e-mails
            entre eles.
          </p>
          <div className="aa-actions">
            <button
              className="aa-primary"
              disabled={busy || overview?.settings.mode !== "course"}
              onClick={() =>
                void act(async () => setPreview(await call("launch_preview")))
              }
            >
              Preparar aviso de lançamento
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await call("mail_process", { confirmed: true });
                  await load();
                  setNotice(
                    "Processamento solicitado. Atualize os resultados para acompanhar as tentativas.",
                  );
                })
              }
            >
              Processar confirmações pendentes
            </button>
          </div>
          {overview?.settings.mode !== "course" && (
            <p className="aa-note">
              Abra o curso nas Configurações para preparar a comunicação de
              lançamento.
            </p>
          )}
          {preview && (
            <div className="aa-confirm">
              <h3>Prévia: {preview.count} destinatários elegíveis</h3>
              <p>
                <strong>{preview.subject}</strong>
              </p>
              <p className="aa-prose">{preview.body}</p>
              <ul>
                {preview.recipients.map((p: any) => (
                  <li key={p.id}>
                    {p.name} · {p.email}
                  </li>
                ))}
              </ul>
              <p>
                O e-mail inclui identificação da Academy, acesso às aulas e link
                individual de descadastro. Esta confirmação autoriza somente
                este lote.
              </p>
              <button
                className="aa-primary"
                disabled={busy || preview.count === 0}
                onClick={() =>
                  void act(async () => {
                    await call("launch_confirm", {
                      id: preview.id,
                      confirmed: true,
                    });
                    await load();
                    setNotice(
                      "Lote autorizado e encaminhado à fila. Atualize os resultados para acompanhar cada tentativa.",
                    );
                    setPreview(null);
                  })
                }
              >
                Confirmar envio para {preview.count} inscritos
              </button>
              <button onClick={() => setPreview(null)}>Cancelar prévia</button>
            </div>
          )}
          <div className="aa-title">
            <h3>Histórico de tentativas</h3>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await load();
                })
              }
            >
              Atualizar resultados
            </button>
          </div>
          <p className="aa-note">
            “Aceito pelo provedor” não é confirmação de leitura. Tentativas
            incertas não são reenviadas automaticamente.
          </p>
          {overview?.deliveries.map((d: any) => (
            <article className="aa-delivery" key={d.id}>
              <div>
                <strong>
                  {
                    (
                      {
                        confirm: "Confirmação de inscrição",
                        login: "Acesso do aluno",
                        launch: "Aviso de lançamento",
                      } as any
                    )[d.kind]
                  }
                </strong>
                <p>
                  {
                    (
                      {
                        pending: "Na fila",
                        sending: "Em processamento",
                        accepted: "Aceito pelo provedor",
                        failed: "Falha no envio",
                        uncertain: "Resultado incerto — conferir no provedor",
                        skipped: "Ignorado por expiração ou elegibilidade",
                      } as any
                    )[d.status]
                  }{" "}
                  · {new Date(d.created_at).toLocaleString("pt-BR")}
                </p>
                {d.error_code && <small>{d.error_code}</small>}
                <small>Identificador: {d.id}</small>
                <MailDiagnostic value={d.diagnostic} />
              </div>
              {d.status === "pending" && d.campaign_id && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await call("delivery_resume", {
                        id: d.campaign_id,
                        confirmed: true,
                      });
                      await load();
                    })
                  }
                >
                  Confirmar processamento do lote pendente
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {section === 7 && settings && (
        <>
          <h2>Configurações e abertura</h2>
          <p>
            Documentos e identificação precisam ser revisados antes da abertura.
            Não insira CPF completo, residência ou dados desnecessários.
          </p>
          <div className="aa-fields">
            <label>
              Modo da Academy
              <select
                value={settings.mode}
                onChange={(e) =>
                  setSettings({ ...settings, mode: e.target.value })
                }
              >
                <option value="waitlist">
                  Lista de espera — aulas fechadas
                </option>
                <option value="course">Curso disponível</option>
              </select>
            </label>
            <label className="aa-check">
              <input
                type="checkbox"
                checked={settings.waitlist_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    waitlist_enabled: e.target.checked,
                  })
                }
              />
              Receber inscrições
            </label>
            <label>
              Identificação pública do responsável
              <input
                maxLength={160}
                value={settings.contact_name}
                onChange={(e) =>
                  setSettings({ ...settings, contact_name: e.target.value })
                }
              />
            </label>
            <label>
              Canal de contato e privacidade
              <input
                type="email"
                maxLength={254}
                value={settings.contact_email}
                onChange={(e) =>
                  setSettings({ ...settings, contact_email: e.target.value })
                }
              />
            </label>
            <label className="aa-wide">
              Termos aplicáveis
              <textarea
                rows={10}
                maxLength={20000}
                value={settings.terms}
                onChange={(e) =>
                  setSettings({ ...settings, terms: e.target.value })
                }
              />
            </label>
            <label className="aa-wide">
              Política de Privacidade
              <textarea
                rows={12}
                maxLength={20000}
                value={settings.privacy}
                onChange={(e) =>
                  setSettings({ ...settings, privacy: e.target.value })
                }
              />
            </label>
            <button
              onClick={() => {
                setSettings({
                  ...settings,
                  terms: academyTerms,
                  privacy: academyPrivacy,
                });
                setNotice(
                  "Minutas carregadas para revisão. Ainda não foram salvas ou publicadas. Confirme os fornecedores, retenção, identificação e condições jurídicas.",
                );
              }}
            >
              Carregar minutas para revisão
            </button>
            <label className="aa-wide">
              Assunto do aviso de lançamento
              <input
                maxLength={150}
                value={settings.launch_subject}
                onChange={(e) =>
                  setSettings({ ...settings, launch_subject: e.target.value })
                }
              />
            </label>
            <label className="aa-wide">
              Mensagem de lançamento
              <textarea
                rows={4}
                maxLength={4000}
                value={settings.launch_body}
                onChange={(e) =>
                  setSettings({ ...settings, launch_body: e.target.value })
                }
              />
            </label>
          </div>
          <label className="aa-check aa-review">
            <input
              type="checkbox"
              checked={confirmSettings}
              onChange={(e) => setConfirmSettings(e.target.checked)}
            />
            Revisei os documentos, a identificação e o modo selecionado.
            Confirmo esta alteração. Isso não envia e-mails em lote.
          </label>
          <button
            className="aa-primary"
            disabled={busy || !confirmSettings}
            onClick={() =>
              void act(async () => {
                await call("settings", {
                  revision: overview.settings.revision,
                  settings,
                  confirmed: true,
                });
                const o = await load();
                setSettings({
                  ...o.settings,
                  terms: o.notice?.terms || "",
                  privacy: o.notice?.privacy || "",
                });
                setConfirmSettings(false);
                setNotice("Configurações atualizadas e registradas.");
              })
            }
          >
            Salvar configuração revisada
          </button>
          <details className="aa-card">
            <summary>Retenção e exclusão</summary>
            <p>
              Inscrições pendentes e canceladas: 30 dias sem atividade.
              Confirmadas: 365 dias sem atividade. Sessões: 7 dias. Histórico
              técnico: 180 dias. Execute esta rotina regularmente.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const r = await call("cleanup");
                  await load();
                  setNotice(
                    `Retenção aplicada: ${r.removed} inscrições expiradas removidas.`,
                  );
                })
              }
            >
              Aplicar política de retenção agora
            </button>
          </details>
        </>
      )}
    </section>
  );
}
