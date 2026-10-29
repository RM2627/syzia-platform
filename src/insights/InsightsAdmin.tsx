import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { rpc, supabase } from "../api";
import "./insights-admin.css";
type Block = {
  type: string;
  text: string;
  level?: number;
  bold?: boolean;
  italic?: boolean;
  url?: string;
  media?: string;
  alt?: string;
  caption?: string;
};
type Doc = {
  title: string;
  slug: string;
  summary: string;
  category: string;
  author: string;
  tags: string[];
  blocks: Block[];
  cover: string;
  seo_title: string;
  seo_description: string;
  featured: boolean;
  kind: string;
  toc: boolean;
};
type Post = {
  id: string;
  revision: number;
  state: string;
  draft: Doc;
  scheduled_at?: string;
  schedule_error?: string;
  schedule_attempts?: number;
  versions?: { revision: number; created_at: string }[];
};
const call = (action: string, data: Record<string, unknown> = {}) =>
  rpc<any>("insights_editor", { p_action: action, p_data: data });
export function InsightsNav() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    void call("access")
      .then((x) => {
        if (live) setAllowed(!!x.allowed);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return allowed ? (
    <NavLink to="/admin/insights">SYZIA Insights</NavLink>
  ) : null;
}
const fresh = (): Doc => ({
  title: "Novo artigo",
  slug: "novo-artigo-" + crypto.randomUUID().slice(0, 8),
  summary: "Escreva uma apresentação clara para este artigo.",
  category: "Gestão e rotina",
  author: "Equipe SYZIA",
  tags: [],
  blocks: [{ type: "paragraph", text: "Comece o conteúdo aqui." }],
  cover: "",
  seo_title: "",
  seo_description: "",
  featured: false,
  kind: "article",
  toc: true,
});
const labels: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  scheduled: "Agendado",
  archived: "Arquivado",
};
export function InsightsAdmin() {
  const [access, setAccess] = useState<boolean | null>(null),
    [posts, setPosts] = useState<Post[]>([]),
    [media, setMedia] = useState<{ id: string; alt: string }[]>([]),
    [taxonomy, setTaxonomy] = useState<{ kind: string; name: string }[]>([]),
    [post, setPost] = useState<Post | null>(null),
    [doc, setDoc] = useState<Doc | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [tab, setTab] = useState("articles"),
    [stats, setStats] = useState<any>(null),
    [preview, setPreview] = useState(false),
    [schedule, setSchedule] = useState(""),
    [statsCategory, setStatsCategory] = useState(""),
    [statsDays, setStatsDays] = useState(30);
  useEffect(() => {
    const previous =
      document.querySelector<HTMLMetaElement>("meta[name=robots]");
    const element = previous || document.createElement("meta");
    const content = element.content;
    element.name = "robots";
    element.content = "noindex, nofollow";
    if (!previous) document.head.appendChild(element);
    return () => {
      if (previous) element.content = content;
      else element.remove();
    };
  }, []);
  const current = useRef({ post, doc, dirty }),
    saving = useRef(false);
  current.current = { post, doc, dirty };
  async function load() {
    const [x, images] = await Promise.all([call("list"), call("media_list")]);
    setMedia(images);
    setPosts(x.posts);
    setTaxonomy(x.taxonomy);
  }
  useEffect(() => {
    void call("access")
      .then(async (a) => {
        setAccess(a.allowed);
        if (a.allowed) await load();
      })
      .catch(() => setAccess(false));
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (current.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  async function save() {
    const c = current.current;
    if (!c.post || !c.doc || saving.current) return null;
    saving.current = true;
    try {
      const result = await call("save", {
        id: c.post.id,
        revision: c.post.revision,
        document: c.doc,
      });
      setPost(result);
      if (current.current.doc === c.doc) setDirty(false);
      setMessage("Rascunho salvo. A publicação atual permanece independente.");
      return result as Post;
    } catch {
      setMessage(
        "Não foi possível salvar. Confira os campos e a conexão. Se outra pessoa editou este artigo, reabra a versão atual antes de continuar. Seu texto permanece nesta tela.",
      );
      return null;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (!dirty || !post) return;
    const timer = setTimeout(() => void save(), 3500);
    return () => clearTimeout(timer);
  }, [doc, dirty, post?.id]);
  const edit = (patch: Partial<Doc>) => {
    setDoc((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const editBlock = (i: number, patch: Partial<Block>) => {
    if (doc)
      edit({
        blocks: doc.blocks.map((b, n) => (n === i ? { ...b, ...patch } : b)),
      });
  };
  async function open(p: Post) {
    if (
      dirty &&
      !confirm("Há alterações não salvas. Deseja sair deste rascunho?")
    )
      return;
    setBusy(true);
    try {
      const x = await call("get", { id: p.id });
      setPost(x);
      setDoc(x.draft);
      setDirty(false);
      setPreview(false);
      setMessage("");
    } catch {
      setMessage("Não foi possível abrir o artigo.");
    } finally {
      setBusy(false);
    }
  }
  async function create(d = fresh()) {
    setBusy(true);
    try {
      const x = await call("create", { document: d });
      setPost(x);
      setDoc(x.draft);
      setDirty(false);
      await load();
    } catch {
      setMessage("Confira a categoria, o autor e os campos obrigatórios.");
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, data: Record<string, unknown> = {}) {
    if (!post) return;
    setBusy(true);
    try {
      const saved = dirty ? await save() : post;
      if (!saved) return;
      const x = await call(name, {
        id: saved.id,
        revision: saved.revision,
        ...data,
      });
      setPost(x);
      setDoc(x.draft);
      setDirty(false);
      setMessage("Atualização concluída.");
      await load();
    } catch {
      setMessage(
        "A ação não foi concluída. Verifique o conteúdo, o endereço exclusivo e a versão atual.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File, alt: string, index?: number) {
    if (
      !file ||
      file.size > 2_000_000 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      alt.trim().length < 2
    ) {
      setMessage(
        "Use JPEG, PNG ou WebP de até 2 MB e informe um texto alternativo.",
      );
      return;
    }
    setBusy(true);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw Error();
      const body = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const base = String(import.meta.env.VITE_PLATFORM_API_URL || "").replace(
        /\/$/,
        "",
      );
      const r = await fetch(base + "/blog/api/media", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body, alt }),
      });
      if (!r.ok) throw Error();
      const m = await r.json();
      setMedia(await call("media_list"));
      if (index === undefined) edit({ cover: m.id });
      else editBlock(index, { media: m.id, alt });
      setMessage("Imagem otimizada e salva.");
    } catch {
      setMessage(
        "Não foi possível enviar a imagem. Verifique a configuração do Insights e sua sessão.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (access === null) return <p>Verificando acesso editorial…</p>;
  if (!access)
    return (
      <section className="card">
        <h1>Acesso editorial restrito</h1>
        <p>Solicite uma permissão editorial ao administrador da plataforma.</p>
      </section>
    );
  return (
    <div className="insights-admin">
      <header className="ia-heading">
        <div>
          <span className="eyebrow">CONTEÚDO E CONHECIMENTO</span>
          <h1>SYZIA Insights</h1>
          <p>Conhecimento para quem faz o negócio acontecer.</p>
        </div>
        <a
          href={`${String(import.meta.env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/blog`}
          target="_blank"
          rel="noreferrer"
        >
          Ver publicação pública ↗
        </a>
      </header>
      <p role="status">{message}</p>
      {!post ? (
        <>
          <nav aria-label="Gestão editorial" className="ia-toolbar">
            {[
              ["articles", "Artigos"],
              ["taxonomy", "Categorias, tags e autores"],
              ["media", "Biblioteca de mídia"],
              ["stats", "Indicadores"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  if (value === "stats")
                    void call("stats")
                      .then(setStats)
                      .catch(() => setMessage("Indicadores indisponíveis."));
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "articles" && (
            <>
              <div className="ia-metrics">
                {Object.entries(labels).map(([key, label]) => (
                  <div className="card" key={key}>
                    <strong>
                      {posts.filter((p) => p.state === key).length}
                    </strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="ia-toolbar">
                <label>
                  Buscar artigo
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {Object.entries(labels).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy} onClick={() => void create()}>
                  Novo artigo
                </button>
              </div>
              <div className="ia-list">
                {posts
                  .filter(
                    (p) =>
                      (!filter || p.state === filter) &&
                      p.draft.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <article className="card" key={p.id}>
                      <div>
                        <span>
                          {labels[p.state]} · versão {p.revision}
                        </span>
                        <h2>{p.draft.title}</h2>
                        <p>
                          {p.draft.category} · {p.draft.author}
                        </p>
                      </div>
                      <div className="ia-toolbar">
                        <button onClick={() => void open(p)}>Editar</button>
                        <button
                          onClick={() =>
                            void create({
                              ...p.draft,
                              title: p.draft.title + " — cópia",
                              slug:
                                p.draft.slug +
                                "-" +
                                crypto.randomUUID().slice(0, 8),
                            })
                          }
                        >
                          Duplicar
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </>
          )}
          {tab === "taxonomy" && (
            <section className="card">
              <h2>Organização editorial</h2>
              <form
                className="ia-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void call("taxonomy", {
                    kind: f.get("kind"),
                    name: f.get("name"),
                  })
                    .then(load)
                    .catch(() =>
                      setMessage("Não foi possível salvar este item."),
                    );
                }}
              >
                <label>
                  Tipo
                  <select name="kind">
                    <option value="category">Categoria</option>
                    <option value="tag">Tag</option>
                    <option value="author">Autor</option>
                  </select>
                </label>
                <label>
                  Nome
                  <input name="name" required minLength={2} maxLength={80} />
                </label>
                <button>Adicionar</button>
              </form>
              {taxonomy.map((t) => (
                <p key={t.kind + t.name}>
                  {t.kind} · {t.name}{" "}
                  <button
                    onClick={() =>
                      void call("taxonomy", { ...t, operation: "delete" })
                        .then(load)
                        .catch(() =>
                          setMessage(
                            "Itens utilizados em artigos não podem ser excluídos.",
                          ),
                        )
                    }
                  >
                    Excluir
                  </button>
                </p>
              ))}
            </section>
          )}
          {tab === "media" && <MediaLibrary />}
          {tab === "stats" && (
            <section className="card">
              <h2>Leitura e interesse</h2>
              <div className="ia-toolbar">
                <label>
                  Período
                  <select
                    value={statsDays}
                    onChange={(e) => setStatsDays(Number(e.target.value))}
                  >
                    {[7, 30, 90].map((d) => (
                      <option key={d} value={d}>
                        Últimos {d} dias
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    value={statsCategory}
                    onChange={(e) => setStatsCategory(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {taxonomy
                      .filter((t) => t.kind === "category")
                      .map((t) => (
                        <option key={t.name}>{t.name}</option>
                      ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    void call("stats", {
                      from: new Date(
                        Date.now() - statsDays * 86400000,
                      ).toISOString(),
                      category: statsCategory,
                    }).then(setStats)
                  }
                >
                  Atualizar indicadores
                </button>
              </div>
              <p>
                Identificadores de navegadores com medição autorizada. Não
                representam pessoas. Compartilhamentos são intenções; não
                comprovam publicação em outra rede. O formulário registra
                interessados recebidos. A conversão observada considera somente
                os navegadores medidos que também enviaram uma solicitação; o
                denominador aparece ao lado da taxa.
              </p>
              {stats?.rows?.length ? (
                <div className="ia-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Artigo</th>
                        <th>Visualizações</th>
                        <th>Visitantes estimados</th>
                        <th>Curtidas atuais</th>
                        <th>Cliques em CTA</th>
                        <th>Intenções de compartilhar</th>
                        <th>Interessados recebidos</th>
                        <th>Conversão observada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.rows.map((r: any) => (
                        <tr key={r.post_id + r.category}>
                          <td>
                            {posts.find((p) => p.id === r.post_id)?.draft
                              .title || "Artigo"}
                          </td>
                          <td>{r.views}</td>
                          <td>{r.estimated_visitors}</td>
                          <td>{r.likes}</td>
                          <td>{r.cta_intents}</td>
                          <td>{r.share_intents}</td>
                          <td>{r.leads}</td>
                          <td>
                            {Number(r.estimated_visitors) > 0
                              ? `${((100 * Number(r.measured_lead_visitors)) / Number(r.estimated_visitors)).toFixed(1)}% (${r.measured_lead_visitors}/${r.estimated_visitors})`
                              : "Sem denominador"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Ainda não há medições no período.</p>
              )}
            </section>
          )}
        </>
      ) : (
        doc && (
          <>
            <div className="ia-toolbar">
              <button
                onClick={() => {
                  if (!dirty || confirm("Sair sem salvar as alterações?")) {
                    setPost(null);
                    setDoc(null);
                    setDirty(false);
                    void load();
                  }
                }}
              >
                ← Artigos
              </button>
              <span>
                {labels[post.state]} · versão {post.revision} ·{" "}
                {dirty ? "Alterações pendentes" : "Salvo"}
              </span>
              <button disabled={busy || !dirty} onClick={() => void save()}>
                Salvar rascunho
              </button>
              <button
                aria-pressed={preview}
                onClick={() => setPreview(!preview)}
              >
                {preview ? "Editar" : "Prévia privada"}
              </button>
            </div>
            {preview ? (
              <article className="card ia-preview">
                <span>PRÉVIA PRIVADA — não publicada</span>
                <h1>{doc.title}</h1>
                <p>{doc.summary}</p>
                {doc.cover && (
                  <PreviewImage id={doc.cover} alt={doc.title} />
                )}{" "}
                {doc.blocks.map((b, i) => (
                  <PreviewBlock key={i} b={b} />
                ))}
              </article>
            ) : (
              <div className="ia-editor">
                <section className="card">
                  <label>
                    Título
                    <input
                      required
                      maxLength={160}
                      value={doc.title}
                      onChange={(e) => edit({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    Endereço /blog/
                    <input
                      maxLength={120}
                      value={doc.slug}
                      onChange={(e) => edit({ slug: e.target.value })}
                    />
                  </label>
                  <label>
                    Resumo
                    <textarea
                      maxLength={400}
                      value={doc.summary}
                      onChange={(e) => edit({ summary: e.target.value })}
                    />
                  </label>
                  <div className="ia-toolbar">
                    {(["category", "author"] as const).map((k) => (
                      <label key={k}>
                        {k === "category" ? "Categoria" : "Autor"}
                        <select
                          value={doc[k]}
                          onChange={(e) => edit({ [k]: e.target.value })}
                        >
                          {taxonomy
                            .filter((t) => t.kind === k)
                            .map((t) => (
                              <option key={t.name}>{t.name}</option>
                            ))}
                        </select>
                      </label>
                    ))}
                    <label>
                      Formato
                      <select
                        value={doc.kind}
                        onChange={(e) => edit({ kind: e.target.value })}
                      >
                        <option value="article">Artigo</option>
                        <option value="guide">Guia por profissão</option>
                        <option value="material">Material prático</option>
                      </select>
                    </label>
                  </div>
                  <fieldset>
                    <legend>Tags</legend>
                    {taxonomy
                      .filter((t) => t.kind === "tag")
                      .map((t) => (
                        <label key={t.name}>
                          <input
                            type="checkbox"
                            checked={doc.tags.includes(t.name)}
                            onChange={(e) =>
                              edit({
                                tags: e.target.checked
                                  ? [...doc.tags, t.name]
                                  : doc.tags.filter((x) => x !== t.name),
                              })
                            }
                          />
                          {t.name}
                        </label>
                      ))}
                  </fieldset>
                  <label>
                    <input
                      type="checkbox"
                      checked={doc.featured}
                      onChange={(e) => edit({ featured: e.target.checked })}
                    />
                    Destaque editorial
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={doc.toc}
                      onChange={(e) => edit({ toc: e.target.checked })}
                    />
                    Exibir sumário
                  </label>
                  <label>
                    Capa da biblioteca
                    <select
                      value={doc.cover}
                      onChange={(e) => edit({ cover: e.target.value })}
                    >
                      <option value="">Sem capa selecionada</option>
                      {media.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.alt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Capa (JPEG, PNG, WebP; até 2 MB)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void upload(e.target.files[0], doc.title);
                      }}
                    />
                  </label>
                  {doc.cover && (
                    <p>
                      Capa salva.{" "}
                      <button onClick={() => edit({ cover: "" })}>
                        Remover deste rascunho
                      </button>
                    </p>
                  )}
                  <h2>Conteúdo</h2>
                  {doc.blocks.map((b, i) => (
                    <section className="ia-block" key={i}>
                      <div className="ia-toolbar">
                        <select
                          aria-label={`Tipo do bloco ${i + 1}`}
                          value={b.type}
                          onChange={(e) =>
                            editBlock(i, { type: e.target.value })
                          }
                        >
                          {[
                            ["paragraph", "Parágrafo"],
                            ["heading", "Título"],
                            ["list", "Lista"],
                            ["quote", "Citação"],
                            ["callout", "Informação"],
                            ["table", "Tabela"],
                            ["image", "Imagem"],
                            ["link", "Link"],
                            ["cta", "Chamada para ação"],
                          ].map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!i}
                          onClick={() => {
                            const blocks = [...doc.blocks];
                            [blocks[i - 1], blocks[i]] = [
                              blocks[i],
                              blocks[i - 1],
                            ];
                            edit({ blocks });
                          }}
                        >
                          Subir
                        </button>
                        <button
                          disabled={doc.blocks.length === 1}
                          onClick={() =>
                            edit({
                              blocks: doc.blocks.filter((_, n) => n !== i),
                            })
                          }
                        >
                          Remover
                        </button>
                        <button
                          aria-pressed={!!b.bold}
                          onClick={() => editBlock(i, { bold: !b.bold })}
                        >
                          <strong>Negrito</strong>
                        </button>
                        <button
                          aria-pressed={!!b.italic}
                          onClick={() => editBlock(i, { italic: !b.italic })}
                        >
                          <em>Itálico</em>
                        </button>
                      </div>
                      {b.type === "image" ? (
                        <>
                          <label>
                            Imagem da biblioteca
                            <select
                              value={b.media || ""}
                              onChange={(e) => {
                                const m = media.find(
                                  (m) => m.id === e.target.value,
                                );
                                editBlock(i, {
                                  media: e.target.value,
                                  alt: m?.alt || b.alt,
                                });
                              }}
                            >
                              <option value="">Escolha uma imagem</option>
                              {media.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.alt}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Texto alternativo
                            <input
                              value={b.alt || ""}
                              onChange={(e) =>
                                editBlock(i, { alt: e.target.value })
                              }
                            />
                          </label>
                          <input
                            aria-label="Arquivo de imagem"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                void upload(e.target.files[0], b.alt || "", i);
                            }}
                          />
                          <label>
                            Legenda
                            <input
                              value={b.caption || ""}
                              onChange={(e) =>
                                editBlock(i, { caption: e.target.value })
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <textarea
                            aria-label={`Conteúdo do bloco ${i + 1}`}
                            rows={b.type === "heading" ? 2 : 4}
                            value={b.text}
                            maxLength={12000}
                            style={{
                              fontWeight: b.bold ? "bold" : undefined,
                              fontStyle: b.italic ? "italic" : undefined,
                              fontSize:
                                b.type === "heading" ? "1.3rem" : undefined,
                            }}
                            onChange={(e) =>
                              editBlock(i, { text: e.target.value })
                            }
                          />
                          {b.type === "heading" && (
                            <label>
                              Nível
                              <select
                                value={b.level || 2}
                                onChange={(e) =>
                                  editBlock(i, {
                                    level: Number(e.target.value),
                                  })
                                }
                              >
                                <option value={2}>H2</option>
                                <option value={3}>H3</option>
                              </select>
                            </label>
                          )}
                          {b.type === "table" && (
                            <small>
                              Uma linha por registro; separe as colunas com |. A
                              primeira linha é o cabeçalho.
                            </small>
                          )}
                          {b.type === "list" && (
                            <small>Um item por linha.</small>
                          )}
                          {["link", "cta"].includes(b.type) && (
                            <label>
                              Destino
                              <input
                                value={b.url || ""}
                                onChange={(e) =>
                                  editBlock(i, { url: e.target.value })
                                }
                                placeholder="/contato"
                              />
                            </label>
                          )}
                        </>
                      )}
                    </section>
                  ))}
                  <button
                    onClick={() =>
                      edit({
                        blocks: [
                          ...doc.blocks,
                          { type: "paragraph", text: "" },
                        ],
                      })
                    }
                  >
                    Adicionar bloco
                  </button>
                </section>
                <aside>
                  <section className="card">
                    <h2>Busca e apresentação</h2>
                    <label>
                      Título SEO
                      <input
                        maxLength={160}
                        value={doc.seo_title}
                        onChange={(e) => edit({ seo_title: e.target.value })}
                      />
                    </label>
                    <label>
                      Descrição SEO
                      <textarea
                        maxLength={400}
                        value={doc.seo_description}
                        onChange={(e) =>
                          edit({ seo_description: e.target.value })
                        }
                      />
                    </label>
                    <p>
                      O endereço canônico, os metadados e o sitemap são gerados
                      a partir da versão publicada.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Publicação</h2>
                    <button
                      disabled={busy}
                      onClick={() => void action("publish")}
                    >
                      Publicar versão revisada
                    </button>
                    <label>
                      Agendar (horário local:{" "}
                      {Intl.DateTimeFormat().resolvedOptions().timeZone})
                      <input
                        type="datetime-local"
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!schedule || busy}
                      onClick={() =>
                        void action("schedule", {
                          at: new Date(schedule).toISOString(),
                        })
                      }
                    >
                      Agendar publicação
                    </button>
                    {post.schedule_error && (
                      <p role="alert">
                        A publicação agendada precisa de revisão. Tentativas:{" "}
                        {post.schedule_attempts}. Confira o conteúdo e o
                        endereço do artigo; o servidor tentará novamente com
                        intervalo crescente.
                      </p>
                    )}
                    {post.scheduled_at && (
                      <p>
                        Agendado para{" "}
                        {new Date(post.scheduled_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => void action("unpublish")}
                    >
                      Retirar do ar
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void action("archive")}
                    >
                      Arquivar
                    </button>
                  </section>
                  <section className="card">
                    <h2>Histórico</h2>
                    <button
                      onClick={() =>
                        void call("get", { id: post.id }).then(setPost)
                      }
                    >
                      Atualizar revisões
                    </button>
                    {post.versions?.map((v) => (
                      <p key={v.revision}>
                        Versão {v.revision}{" "}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action("restore", {
                              restore_revision: v.revision,
                            })
                          }
                        >
                          Restaurar como rascunho
                        </button>
                      </p>
                    ))}
                  </section>
                </aside>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
function PreviewBlock({ b }: { b: Block }) {
  const text = (
    <span
      style={{
        fontWeight: b.bold ? "bold" : undefined,
        fontStyle: b.italic ? "italic" : undefined,
      }}
    >
      {b.text}
    </span>
  );
  switch (b.type) {
    case "heading":
      return b.level === 3 ? <h3>{text}</h3> : <h2>{text}</h2>;
    case "list":
      return (
        <ul>
          {b.text.split("\n").map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    case "quote":
      return <blockquote>{text}</blockquote>;
    case "table":
      return (
        <div className="ia-table">
          <table>
            <tbody>
              {b.text.split("\n").map((row, i) => (
                <tr key={i}>
                  {row
                    .split("|")
                    .map((cell, n) =>
                      i ? <td key={n}>{cell}</td> : <th key={n}>{cell}</th>,
                    )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return (
        <figure>
          <PreviewImage id={b.media || ""} alt={b.alt || ""} />
          <figcaption>{b.caption}</figcaption>
        </figure>
      );
    case "cta":
    case "callout":
      return <aside className="ia-block">{text}</aside>;
    default:
      return <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>;
  }
}

function PreviewImage({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    if (id)
      void call("media_get", { id })
        .then((m) => {
          if (live && m?.body) setSrc("data:image/webp;base64," + m.body);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return src ? (
    <img
      style={{ width: "100%", height: "auto", borderRadius: 12 }}
      src={src}
      alt={alt}
    />
  ) : (
    <p>Imagem privada ainda não disponível na prévia.</p>
  );
}

function MediaLibrary() {
  const [items, setItems] = useState<
      { id: string; alt: string; width: number; height: number }[]
    >([]),
    [message, setMessage] = useState("");
  const load = () =>
    call("media_list")
      .then(setItems)
      .catch(() => setMessage("Não foi possível carregar a biblioteca."));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section>
      <h2>Biblioteca de mídia</h2>
      <p>
        As imagens enviadas pelo editor ficam disponíveis aqui. Arquivos
        utilizados em publicações, rascunhos ou revisões são preservados.
      </p>
      <p role="status">{message}</p>
      <div className="ia-media">
        {items.map((m) => (
          <article className="card" key={m.id}>
            <PreviewImage id={m.id} alt={m.alt} />
            <p>{m.alt}</p>
            <p>
              {m.width} × {m.height}
            </p>

            <button
              onClick={() => {
                if (confirm("Excluir esta imagem se não houver referências?"))
                  void call("media_delete", { id: m.id })
                    .then(load)
                    .catch(() =>
                      setMessage(
                        "Imagem preservada: ainda está em uso ou a exclusão não foi autorizada.",
                      ),
                    );
              }}
            >
              Excluir imagem sem uso
            </button>
          </article>
        ))}
      </div>
      {!items.length && <p>Nenhuma imagem cadastrada.</p>}
    </section>
  );
}
