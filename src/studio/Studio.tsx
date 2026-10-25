import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { commercialApi, commercialError } from "../platform-commercial/api";
import { PreviewFrame } from "./PreviewFrame";
import { pageTemplates } from "../consumer/TemplatePicker";
import { ImageFraming } from "../consumer/ImageFraming";
import { generateConfiguration, studioPreview, studioPending } from "./model";
import { captureElement, downloadFile, storedZip } from "./export";
import "../consumer/consumer.css";
import "../consumer/templates.css";
import "./studio.css";
const uid = () => crypto.randomUUID();
export function Studio({
  transport = commercialApi,
}: {
  transport?: typeof commercialApi;
}) {
  const [index, setIndex] = useState<any>(),
    [draft, setDraft] = useState<any>(),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [name, setName] = useState(""),
    [segment, setSegment] = useState("outros"),
    [tab, setTab] = useState("empresa"),
    [width, setWidth] = useState("390"),
    [images, setImages] = useState<Record<string, string>>({}),
    [crop, setCrop] = useState<any>(),
    [reviewed, setReviewed] = useState(false),
    [model, setModel] = useState<any>();
  const preview = useRef<HTMLDivElement>(null),
    running = useRef(false),
    current = useRef<any>(null);
  current.current = draft;
  const api = (action: string, data: any = {}) =>
    transport("studio", { action, data });
  const load = async () => setIndex(await api("list"));
  useEffect(() => {
    void load().catch((e) => setError(commercialError(e)));
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const act = async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        (e as Error).message.includes("revision_conflict")
          ? "Esta preparação mudou em outra sessão. Reabra o rascunho antes de salvar."
          : commercialError(e),
      );
    } finally {
      setBusy(false);
      running.current = false;
    }
  };
  const open = async (id: string) => {
    const d = await api("get", { id });
    setDraft(d);
    setTab("empresa");
    setModel(null);
    setDirty(false);
    setReviewed(false);
    setImages({});
    const pairs = await Promise.all(
      (d.configuration.tables.company_media || []).map(async (m: any) => {
        const i = await transport("studio-image", { id: d.id, asset_id: m.id });
        return [m.public_code, `data:${i.mime};base64,${i.bytes}`];
      }),
    );
    setImages(Object.fromEntries(pairs));
  };
  const setCfg = (mutate: (cfg: any) => void) => {
    setDraft((d: any) => {
      const copy = structuredClone(d);
      mutate(copy.configuration);
      return copy;
    });
    setDirty(true);
    setReviewed(false);
  };
  const edit = (table: string, i: number, k: string, v: any) =>
    setCfg((c) => {
      c.tables[table][i][k] = v;
    });
  const add = (table: string, row: any) =>
    setCfg((c) => {
      (c.tables[table] ||= []).push(row);
    });
  const remove = (table: string, i: number) =>
    setCfg((c) => {
      c.tables[table].splice(i, 1);
    });
  const save = async () => {
    if (model) {
      await api("segment-save", {
        id: model.id,
        name: draft.name,
        revision: model.revision,
        model: draft.configuration,
      });
      setModel({ ...model, revision: model.revision + 1 });
      setDirty(false);
      await load();
      setNotice("Modelo salvo. Rascunhos anteriores permanecem iguais.");
      return;
    }
    const d = await api("save", {
      id: draft.id,
      revision: draft.revision,
      name: draft.name,
      configuration: draft.configuration,
    });
    setDraft(d);
    setDirty(false);
    await load();
    setNotice("Rascunho salvo com segurança.");
  };
  const back = () => {
    if (
      dirty &&
      !window.confirm("Há alterações não salvas. Sair sem salvá-las?")
    )
      return;
    setDraft(null);
    setDirty(false);
    setModel(null);
  };
  const upload = async (file: File, assign: (c: any, id: string) => void) => {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5242880
    )
      throw Error("commercial_media_invalid");
    const bytes = await new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = no;
      r.readAsDataURL(file);
    });
    const m = await transport("studio-upload", {
      id: draft.id,
      mime: file.type,
      bytes,
    });
    setCfg((c) => {
      c.tables.company_media ||= [];
      c.tables.company_media.push(m);
      assign(c, m.id);
    });
    setImages((x) => ({
      ...x,
      [m.public_code]: `data:${file.type};base64,${bytes}`,
    }));
  };
  const imageField = (
    label: string,
    id: string | undefined,
    ratio: number,
    assign: (c: any, id: string | null) => void,
  ) => {
    const m = draft.configuration.tables.company_media?.find(
      (m: any) => m.id === id,
    );
    return (
      <div className="studio-image" key={label}>
        <strong>{label}</strong>
        {m && images[m.public_code] ? (
          <img src={images[m.public_code]} alt={label} />
        ) : (
          <span>Imagem temporária · adicione uma imagem autorizada</span>
        )}
        {!model && (
          <label>
            Adicionar ou substituir
            <input
              type="file"
              aria-label={label}
              disabled={busy || draft.state !== "draft"}
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (
                  file.size > 5242880 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                ) {
                  setError("Use JPG, PNG ou WebP de até 5 MB.");
                  return;
                }
                setCrop({ blob: file, label, ratio, assign });
              }}
            />
          </label>
        )}
        {id && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCfg((c) => assign(c, null))}
          >
            Remover {label.toLowerCase()}
          </button>
        )}
      </div>
    );
  };
  const exportImages = async (section: string) => {
    if (!preview.current) return;
    const map: [string, string][] = [
      ["inicio", ".c-hero"],
      ["servicos", "#previa-servicos"],
      ["portfolio", "#previa-portfolio"],
      ["informacoes", "#previa-informacoes"],
      ["pagina-completa", ".consumer"],
    ];
    const chosen = section === "zip" ? map : map.filter(([k]) => k === section),
      files = [];
    for (const [name, selector] of chosen) {
      const element = preview.current.querySelector(
        selector,
      ) as HTMLElement | null;
      if (element)
        files.push({
          name: `${name}-${width}px.png`,
          bytes: await captureElement(element),
        });
    }
    if (!files.length) throw Error("commercial_export_empty");
    if (section === "zip")
      downloadFile(storedZip(files), "previa-comercial.zip");
    else
      downloadFile(
        new Blob([files[0].bytes as BlobPart], { type: "image/png" }),
        files[0].name,
      );
    setNotice("Exportação da página renderizada concluída.");
  };
  if (!index)
    return (
      <section>
        <h1>Demo Studio</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Carregando preparações…"}
        </p>
      </section>
    );
  const cfg = draft?.configuration,
    t = cfg?.tables,
    s = t?.company_settings?.[0] || {},
    b = t?.company_branding?.[0] || {};
  const input = (
    label: string,
    value: any,
    onChange: (v: string) => void,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  return (
    <section className="studio">
      <header>
        <p className="eyebrow">GESTÃO COMERCIAL</p>
        <h1>Demo Studio</h1>
        <p>
          Prepare a apresentação, confira a página real e aprove quando estiver
          pronta.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!draft ? (
        <>
          <form
            className="card studio-fields"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const model = index.segments.find((x: any) => x.id === segment);
                const d = await api("create", {
                  id: uid(),
                  name,
                  segment_id: segment,
                  configuration: generateConfiguration(model.model),
                });
                await open(d.id);
                await load();
              });
            }}
          >
            <h2>Nova preparação</h2>
            {input("Nome da empresa", name, setName)}
            <label>
              Segmento
              <select
                aria-label="Segmento"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                {index.segments.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || name.trim().length < 2}>
              Gerar rascunho
            </button>
            <small>
              Sem publicação, assinatura, convite ou organização funcional.
            </small>
          </form>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const r = await transport("studio-cleanup", {});
                setNotice(
                  r.pending
                    ? "Algumas imagens excluídas aguardam limpeza. Tente novamente mais tarde."
                    : "Limpeza concluída; imagens compartilhadas e vinculadas a demonstrações foram preservadas.",
                );
              })
            }
          >
            Limpar imagens de rascunhos excluídos
          </button>
          <div className="studio-list">
            {index.drafts.map((d: any) => (
              <article className="card" key={d.id}>
                <h2>{d.name}</h2>
                <p>
                  {d.state === "draft"
                    ? "Em preparação"
                    : d.state === "converting"
                      ? "Conversão pendente de conclusão"
                      : "Demonstração criada"}{" "}
                  · revisão {d.revision}
                </p>
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={() => void act(() => open(d.id))}
                  >
                    Abrir
                  </button>
                  <button
                    disabled={busy || d.state === "converting"}
                    onClick={() =>
                      void act(async () => {
                        await api("duplicate", {
                          id: d.id,
                          revision: d.revision,
                          new_id: uid(),
                        });
                        await load();
                      })
                    }
                  >
                    Duplicar
                  </button>
                  <button
                    disabled={busy || d.state === "converting"}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir o rascunho ${d.name}? A demonstração já criada e suas imagens serão preservadas.`,
                        )
                      )
                        void act(async () => {
                          await api("delete", {
                            id: d.id,
                            revision: d.revision,
                          });
                          await transport("studio-cleanup", {});
                          await load();
                        });
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
          {index.can_edit_segments && (
            <details className="card">
              <summary>
                Biblioteca de segmentos · {index.segments.length} modelos
                editáveis
              </summary>
              <p>
                Edite a estrutura padrão. A mudança vale somente para novas
                preparações.
              </p>
              <div className="button-row">
                {index.segments.map((x: any) => (
                  <button
                    key={x.id}
                    onClick={() => {
                      setModel(x);
                      setDraft({
                        name: x.name,
                        configuration: structuredClone(x.model),
                        state: "draft",
                      });
                      setImages({});
                      setDirty(false);
                    }}
                  >
                    {x.name}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const base = index.segments.find(
                      (x: any) => x.id === "outros",
                    );
                    setModel({
                      id: "modelo-" + uid().slice(0, 8),
                      revision: 0,
                    });
                    setDraft({
                      name: "Novo segmento",
                      configuration: generateConfiguration(base.model),
                      state: "draft",
                    });
                    setImages({});
                  }}
                >
                  Adicionar modelo
                </button>
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="studio-toolbar">
            <button disabled={busy} onClick={back}>
              Voltar
            </button>
            <strong>
              {model ? "Modelo: " : ""}
              {draft.name}
            </strong>
            <span role="status">
              {dirty ? "Alterações não salvas" : "Preparação salva"}
            </span>
            <button
              disabled={busy || !dirty || draft.state !== "draft"}
              onClick={() => void act(save)}
            >
              Salvar
            </button>
          </div>
          {draft.state !== "draft" && (
            <div className="notice">
              <p>
                {draft.state === "converting"
                  ? "Retome a conversão para concluir a transferência das imagens. O vínculo já está reservado."
                  : "Demonstração criada. A configuração final e a publicação continuam na gestão de demonstrações."}
              </p>
              <Link to="/admin/comercial/demonstracoes">
                Abrir Demonstrações
              </Link>
              {draft.state === "converting" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      setDraft(
                        await transport("studio-approve", { id: draft.id }),
                      );
                      await load();
                    })
                  }
                >
                  Retomar conversão
                </button>
              )}
            </div>
          )}
          <div className="studio-workspace">
            <div className="studio-controls">
              <nav className="button-row" aria-label="Editar preparação">
                {[
                  ["empresa", "Empresa"],
                  ["servicos", "Serviços"],
                  ["portfolio", "Portfólio"],
                  ["informacoes", "Informações"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={tab === id}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <fieldset
                disabled={busy || draft.state !== "draft"}
                className="studio-fields"
              >
                {tab === "empresa" && (
                  <>
                    {input("Nome", draft.name, (v) => {
                      setDraft({ ...draft, name: v });
                      setDirty(true);
                      setReviewed(false);
                    })}
                    <label>
                      Apresentação
                      <textarea
                        aria-label="Apresentação"
                        value={s.description || ""}
                        onChange={(e) =>
                          edit(
                            "company_settings",
                            0,
                            "description",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    {input(
                      "Cor principal",
                      b.primary_color,
                      (v) => edit("company_branding", 0, "primary_color", v),
                      "color",
                    )}
                    <label>
                      Layout
                      <select
                        value={cfg.template}
                        onChange={(e) =>
                          setCfg((c) => (c.template = e.target.value))
                        }
                      >
                        {pageTemplates.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tema
                      <select
                        value={b.theme || "light"}
                        onChange={(e) =>
                          edit("company_branding", 0, "theme", e.target.value)
                        }
                      >
                        <option value="light">Claro</option>
                        <option value="dark">Escuro</option>
                      </select>
                    </label>
                    {imageField(
                      "Logo",
                      b.logo_id,
                      0,
                      (c, id) => (c.tables.company_branding[0].logo_id = id),
                    )}
                    {imageField(
                      "Capa",
                      b.cover_id,
                      4 / 3,
                      (c, id) => (c.tables.company_branding[0].cover_id = id),
                    )}
                  </>
                )}
                {tab === "servicos" && (
                  <>
                    <h2>Catálogo</h2>
                    {t.service_categories?.map((x: any, i: number) => (
                      <div key={x.id}>
                        {input("Categoria", x.name, (v) =>
                          setCfg((c) => {
                            const old = c.tables.service_categories[i].name;
                            c.tables.service_categories[i].name = v;
                            c.tables.services.forEach((r: any) => {
                              if (r.category_id === x.id) r.category = v;
                            });
                            c.tables.company_branding[0].category_order = (
                              c.tables.company_branding[0].category_order || []
                            ).map((n: string) => (n === old ? v : n));
                          }),
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        add("service_categories", {
                          id: uid(),
                          name: "Nova categoria",
                          position: t.service_categories?.length || 0,
                          active: true,
                        })
                      }
                    >
                      Adicionar categoria
                    </button>
                    {t.services?.map((x: any, i: number) => (
                      <details className="card" key={x.id}>
                        <summary>{x.name}</summary>
                        {input("Nome do serviço", x.name, (v) =>
                          edit("services", i, "name", v),
                        )}
                        <label>
                          Descrição
                          <textarea
                            value={x.description || ""}
                            onChange={(e) =>
                              edit("services", i, "description", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Categoria
                          <select
                            value={x.category_id || ""}
                            onChange={(e) =>
                              setCfg((c) => {
                                const cat = c.tables.service_categories.find(
                                  (a: any) => a.id === e.target.value,
                                );
                                Object.assign(c.tables.services[i], {
                                  category_id: cat?.id || null,
                                  category: cat?.name || "",
                                });
                              })
                            }
                          >
                            <option value="">Sem categoria</option>
                            {t.service_categories?.map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Valor
                          <select
                            value={x.price_mode}
                            onChange={(e) =>
                              setCfg((c) =>
                                Object.assign(c.tables.services[i], {
                                  price_mode: e.target.value,
                                  price_cents:
                                    e.target.value === "quote" ? null : 0,
                                  contract_mode: "evaluation",
                                  direct_booking: false,
                                }),
                              )
                            }
                          >
                            <option value="quote">Sob consulta</option>
                            <option value="fixed">Fixo</option>
                            <option value="from">A partir de</option>
                          </select>
                        </label>
                        {x.price_mode !== "quote" &&
                          input(
                            "Preço informado (R$)",
                            (x.price_cents ?? 0) / 100,
                            (v) =>
                              edit(
                                "services",
                                i,
                                "price_cents",
                                Math.round(Number(v) * 100),
                              ),
                            "number",
                          )}
                        {input(
                          "Duração informada (minutos)",
                          x.duration_minutes,
                          (v) =>
                            setCfg((c) => {
                              const row = c.tables.services[i];
                              row.duration_minutes = v ? Number(v) : null;
                              if (!row.duration_minutes) {
                                row.direct_booking = false;
                                row.contract_mode = "evaluation";
                              }
                            }),
                          "number",
                        )}
                        <label>
                          Contratação
                          <select
                            value={x.contract_mode || "evaluation"}
                            onChange={(e) =>
                              setCfg((c) =>
                                Object.assign(c.tables.services[i], {
                                  contract_mode: e.target.value,
                                  direct_booking:
                                    e.target.value === "immediate" &&
                                    x.price_mode === "fixed" &&
                                    !!x.duration_minutes,
                                  quotes_allowed: true,
                                }),
                              )
                            }
                          >
                            <option value="evaluation">Sob avaliação</option>
                            <option
                              value="immediate"
                              disabled={
                                x.price_mode !== "fixed" || !x.duration_minutes
                              }
                            >
                              Aceite direto (preço e duração definidos)
                            </option>
                          </select>
                        </label>
                        {imageField(
                          "Imagem de " + x.name,
                          x.image_media_id,
                          3 / 2,
                          (c, id) => (c.tables.services[i].image_media_id = id),
                        )}
                        <h3>Adicionais opcionais</h3>
                        {(t.service_addons || []).map(
                          (a: any, j: number) =>
                            a.service_id === x.id && (
                              <div className="card" key={a.id}>
                                {input("Nome do adicional", a.name, (v) =>
                                  edit("service_addons", j, "name", v),
                                )}
                                <label>
                                  Modalidade
                                  <select
                                    value={a.price_mode}
                                    onChange={(e) =>
                                      setCfg((c) =>
                                        Object.assign(
                                          c.tables.service_addons[j],
                                          {
                                            price_mode: e.target.value,
                                            price_cents:
                                              e.target.value === "quote"
                                                ? null
                                                : 0,
                                          },
                                        ),
                                      )
                                    }
                                  >
                                    <option value="quote">Sob consulta</option>
                                    <option value="fixed">Fixo</option>
                                    <option value="from">A partir de</option>
                                  </select>
                                </label>
                                {a.price_mode !== "quote" &&
                                  input(
                                    "Preço do adicional (R$)",
                                    (a.price_cents ?? 0) / 100,
                                    (v) =>
                                      edit(
                                        "service_addons",
                                        j,
                                        "price_cents",
                                        Math.round(Number(v) * 100),
                                      ),
                                    "number",
                                  )}
                                {input(
                                  "Duração adicional informada",
                                  a.duration_minutes,
                                  (v) =>
                                    edit(
                                      "service_addons",
                                      j,
                                      "duration_minutes",
                                      v ? Number(v) : 0,
                                    ),
                                  "number",
                                )}
                                <button
                                  type="button"
                                  onClick={() => remove("service_addons", j)}
                                >
                                  Remover adicional
                                </button>
                              </div>
                            ),
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            add("service_addons", {
                              id: uid(),
                              service_id: x.id,
                              name: "Novo adicional",
                              price_mode: "quote",
                              price_cents: null,
                              duration_minutes: 0,
                              active: true,
                            })
                          }
                        >
                          Adicionar opção
                        </button>
                        <h3>Perguntas do serviço</h3>
                        {(t.service_intake_fields || []).map(
                          (q: any, j: number) =>
                            q.service_id === x.id && (
                              <div className="card" key={q.id}>
                                {input("Pergunta ao cliente", q.label, (v) =>
                                  edit("service_intake_fields", j, "label", v),
                                )}
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={q.required}
                                    onChange={(e) =>
                                      edit(
                                        "service_intake_fields",
                                        j,
                                        "required",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                  Resposta obrigatória
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    remove("service_intake_fields", j)
                                  }
                                >
                                  Remover pergunta
                                </button>
                              </div>
                            ),
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            add("service_intake_fields", {
                              id: uid(),
                              service_id: x.id,
                              label: "Nova pergunta",
                              kind: "text",
                              required: false,
                              options: [],
                              position: (t.service_intake_fields || []).length,
                              active: true,
                            })
                          }
                        >
                          Adicionar pergunta ao serviço
                        </button>
                        <label>
                          <input
                            type="checkbox"
                            checked={x.active}
                            onChange={(e) =>
                              edit("services", i, "active", e.target.checked)
                            }
                          />
                          Exibir serviço
                        </label>
                      </details>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        add("services", {
                          id: uid(),
                          name: "Novo serviço",
                          description: "",
                          price_mode: "quote",
                          price_cents: null,
                          duration_minutes: null,
                          active: true,
                          quotes_allowed: true,
                          direct_booking: false,
                          contract_mode: "evaluation",
                          photo_policy: "none",
                          execution_mode: "continuous",
                          execution_max_periods: null,
                        })
                      }
                    >
                      Adicionar serviço
                    </button>
                  </>
                )}
                {tab === "portfolio" && (
                  <>
                    <h2>Portfólio</h2>
                    <p>
                      Adicione trabalhos e fotos autorizadas. Espaços vazios não
                      são apresentados como trabalhos realizados.
                    </p>
                    {!t.portfolio_items?.length && (
                      <p className="studio-placeholder">
                        Espaço reservado para o portfólio
                      </p>
                    )}
                    {t.portfolio_items?.map((x: any, i: number) => (
                      <article className="card" key={x.id}>
                        {input("Título do trabalho", x.title, (v) =>
                          edit("portfolio_items", i, "title", v),
                        )}
                        <label>
                          Descrição
                          <textarea
                            value={x.description}
                            onChange={(e) =>
                              edit(
                                "portfolio_items",
                                i,
                                "description",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                        {imageField(
                          "Foto do trabalho " + (i + 1),
                          x.media_ids?.[0],
                          0,
                          (c, id) =>
                            (c.tables.portfolio_items[i].media_ids = id
                              ? [id]
                              : []),
                        )}
                        <button
                          type="button"
                          onClick={() => remove("portfolio_items", i)}
                        >
                          Excluir trabalho
                        </button>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        add("portfolio_items", {
                          id: uid(),
                          title: "Novo trabalho",
                          description: "",
                          service_id: null,
                          position: t.portfolio_items?.length || 0,
                          active: true,
                          format: "gallery",
                          media_ids: [],
                        })
                      }
                    >
                      Adicionar trabalho
                    </button>
                  </>
                )}
                {tab === "informacoes" && (
                  <>
                    <h2>Informações conhecidas</h2>
                    {[
                      ["public_email", "E-mail"],
                      ["public_phone", "Telefone"],
                      ["public_address", "Endereço"],
                      ["service_regions", "Região"],
                      ["payment_methods", "Formas de pagamento"],
                    ].map(([k, label]) => (
                      <div key={k}>
                        {input(label, s[k], (v) =>
                          edit("company_settings", 0, k, v),
                        )}
                      </div>
                    ))}
                    <h3>Horários</h3>
                    <p>Deixe em branco até confirmar com o responsável.</p>
                    {[
                      "Domingo",
                      "Segunda",
                      "Terça",
                      "Quarta",
                      "Quinta",
                      "Sexta",
                      "Sábado",
                    ].map((day, i) => {
                      const h = s.business_hours?.find((x: any) => x.day === i);
                      const set = (k: string, v: string) =>
                        setCfg((c) => {
                          const list =
                            (c.tables.company_settings[0].business_hours ||=
                              []);
                          let row = list.find((x: any) => x.day === i);
                          if (!row) {
                            row = { day: i, open: "", close: "" };
                            list.push(row);
                          }
                          row[k] = v;
                        });
                      return (
                        <div className="studio-hours" key={i}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!h}
                              onChange={(e) =>
                                e.target.checked
                                  ? set("open", "")
                                  : edit(
                                      "company_settings",
                                      0,
                                      "business_hours",
                                      s.business_hours.filter(
                                        (x: any) => x.day !== i,
                                      ),
                                    )
                              }
                            />
                            {day}
                          </label>
                          {h && (
                            <>
                              {input(
                                "Abertura",
                                h.open,
                                (v) => set("open", v),
                                "time",
                              )}
                              {input(
                                "Fechamento",
                                h.close,
                                (v) => set("close", v),
                                "time",
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    <h3>Condições informadas</h3>
                    {[
                      ["pricing_policy", "Condições de preço"],
                      ["payment_policy", "Condições de pagamento"],
                      ["cancellation_policy", "Cancelamento"],
                      ["rescheduling_policy", "Remarcação"],
                      ["service_policy", "Condições do serviço"],
                      ["deadlines_policy", "Prazos"],
                      ["exception_policy", "Exceções"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <textarea
                          value={t.business_rules?.[0]?.[key] || ""}
                          onChange={(e) =>
                            setCfg((c) => {
                              c.tables.business_rules ||= [{}];
                              c.tables.business_rules[0][key] = e.target.value;
                            })
                          }
                        />
                      </label>
                    ))}
                    <h3>Perguntas frequentes</h3>
                    {t.faqs?.map((x: any, i: number) => (
                      <div className="card" key={x.id}>
                        {input("Pergunta", x.question, (v) =>
                          edit("faqs", i, "question", v),
                        )}
                        <label>
                          Resposta
                          <textarea
                            value={x.answer}
                            onChange={(e) =>
                              edit("faqs", i, "answer", e.target.value)
                            }
                          />
                        </label>
                        <button type="button" onClick={() => remove("faqs", i)}>
                          Excluir pergunta
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        add("faqs", {
                          id: uid(),
                          question: "Nova pergunta",
                          answer: "",
                          active: true,
                          position: t.faqs?.length || 0,
                        })
                      }
                    >
                      Adicionar pergunta
                    </button>
                  </>
                )}
              </fieldset>
            </div>
            <div className="studio-preview-panel">
              <div className="button-row">
                <strong>Prévia da página real</strong>
                <label>
                  Largura
                  <select
                    aria-label="Largura"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  >
                    <option value="390">Celular · 390 px</option>
                    <option value="360">Celular · 360 px</option>
                    <option value="1200">Desktop · 1200 px</option>
                  </select>
                </label>
              </div>
              <p className="studio-disclosure">
                Simulação comercial · imagens e informações pendentes serão
                revisadas antes de publicar.
              </p>
              <div className="studio-preview-scroll">
                <PreviewFrame
                  width={Number(width)}
                  company={studioPreview(draft.name, cfg)}
                  images={images}
                  root={(node) => {
                    preview.current = node;
                  }}
                />
              </div>
              <div className="button-row">
                {[
                  ["inicio", "Início"],
                  ["servicos", "Serviços"],
                  ["portfolio", "Portfólio"],
                  ["informacoes", "Informações"],
                  ["pagina-completa", "Página completa"],
                  ["zip", "Baixar ZIP"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    disabled={
                      busy ||
                      (key === "portfolio" && !t.portfolio_items?.length)
                    }
                    onClick={() => void act(() => exportImages(key))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <section className="card">
            <h2>Revisão</h2>
            <ul>
              {studioPending(cfg).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p>
              Revise dados, preços, imagens e horários. A publicação continua
              sujeita às validações oficiais da página.
            </p>
            {!model && draft.state === "draft" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  Revisei esta preparação e autorizo criar a demonstração
                  funcional.
                </label>
                <button
                  disabled={busy || dirty || !reviewed}
                  onClick={() =>
                    void act(async () => {
                      setDraft(
                        await transport("studio-approve", {
                          id: draft.id,
                          revision: draft.revision,
                          reviewed: true,
                        }),
                      );
                      await load();
                      setNotice(
                        "Demonstração criada. Continue a configuração e a publicação na gestão de Demonstrações.",
                      );
                    })
                  }
                >
                  Aprovar e criar demonstração
                </button>
              </>
            )}
          </section>
        </>
      )}
      {crop && (
        <ImageFraming
          blob={crop.blob}
          ratio={crop.ratio}
          title={crop.label}
          close={() => setCrop(null)}
          save={(file) => upload(file, crop.assign)}
        />
      )}
    </section>
  );
}
