import { useState } from "react";
import type { AcademyCall, Course, Module, Material, Lesson } from "./types";
import { academyFile } from "./admin-api";
import { academyError } from "./api";
import { Video } from "./Academy";
const makeLesson = (): Lesson => ({
  id: crypto.randomUUID(),
  title: "Nova aula",
  description: "",
  video_id: "",
  published: false,
  materials: [],
});
export function CourseEditor({
  initial,
  materials,
  onSave,
  call,
}: {
  initial: Course;
  materials: Material[];
  onSave: () => Promise<void>;
  call: AcademyCall;
}) {
  const [course, setCourse] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false),
    [confirm, setConfirm] = useState(""),
    [assets, setAssets] = useState(materials);
  const edit = (draft: Course["draft"]) => {
    setCourse({ ...course, draft });
    setDirty(true);
    setNotice("");
  };
  const module = (id: string, change: (m: Module) => Module) =>
    edit({
      ...course.draft,
      modules: course.draft.modules.map((m) => (m.id === id ? change(m) : m)),
    });
  const lesson = (mid: string, id: string, change: Partial<Lesson>) =>
    module(mid, (m) => ({
      ...m,
      lessons: m.lessons.map((l) => (l.id === id ? { ...l, ...change } : l)),
    }));
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await call(action, {
        id: course.id || undefined,
        revision: course.revision,
        ...data,
      });
      if (r?.draft) {
        setCourse(r);
        setDirty(false);
      }
      setConfirm("");
      setNotice("Operação concluída.");
      await onSave();
    } catch (e) {
      setError(academyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function cover(f: File) {
    setBusy(true);
    setError("");
    try {
      const r = await call("upload", await academyFile(f, "image"));
      edit({ ...course.draft, cover: r.id });
      setAssets(await call("materials"));
    } catch (e) {
      setError(academyError(e));
    } finally {
      setBusy(false);
    }
  }
  const reorder = (items: any[], i: number, delta: number) => {
    const a = [...items],
      j = i + delta;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };
  return (
    <section className="aa-editor">
      <div className="aa-title">
        <h2>{course.id ? "Editar curso" : "Novo curso"}</h2>
        <span className="aa-badge">
          {course.state === "published"
            ? "Publicado · edições ficam em rascunho"
            : course.state === "preparing"
              ? "Em preparação"
              : "Rascunho"}
        </span>
      </div>
      {error && (
        <p role="alert" className="aa-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={busy}>
        <div className="aa-fields">
          <label>
            Título do curso
            <input
              value={course.draft.title}
              maxLength={160}
              onChange={(e) => edit({ ...course.draft, title: e.target.value })}
            />
          </label>
          <label>
            Estado de preparação
            <select
              value={course.state === "published" ? "preparing" : course.state}
              disabled={course.state === "published"}
              onChange={(e) => {
                setCourse({ ...course, state: e.target.value });
                setDirty(true);
              }}
            >
              <option value="draft">Rascunho</option>
              <option value="preparing">Em preparação</option>
            </select>
          </label>
          <label>
            Ordem na lista
            <input
              type="number"
              value={course.position}
              min={0}
              max={999}
              onChange={(e) => {
                setCourse({ ...course, position: Number(e.target.value) });
                setDirty(true);
              }}
            />
          </label>
          <label className="aa-wide">
            Descrição
            <textarea
              rows={3}
              value={course.draft.description}
              maxLength={6000}
              onChange={(e) =>
                edit({ ...course.draft, description: e.target.value })
              }
            />
          </label>
          <label className="aa-wide">
            Público-alvo
            <textarea
              rows={2}
              value={course.draft.audience}
              maxLength={1000}
              onChange={(e) =>
                edit({ ...course.draft, audience: e.target.value })
              }
            />
          </label>
          <label>
            Capa existente
            <select
              value={course.draft.cover}
              onChange={(e) => edit({ ...course.draft, cover: e.target.value })}
            >
              <option value="">Selecione uma imagem</option>
              {assets
                .filter((m) => m.kind === "image")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Enviar capa (JPG, PNG ou WebP · até 5 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void cover(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="aa-title">
          <h3>Módulos e aulas</h3>
          <button
            onClick={() =>
              edit({
                ...course.draft,
                modules: [
                  ...course.draft.modules,
                  {
                    id: crypto.randomUUID(),
                    title: "Novo módulo",
                    lessons: [],
                  },
                ],
              })
            }
            disabled={course.draft.modules.length >= 20}
          >
            Adicionar módulo
          </button>
        </div>
        {course.draft.modules.map((m, i) => (
          <article className="aa-module" key={m.id}>
            <div className="aa-module-top">
              <label>
                Nome do módulo {i + 1}
                <input
                  value={m.title}
                  maxLength={160}
                  onChange={(e) =>
                    module(m.id, (x) => ({ ...x, title: e.target.value }))
                  }
                />
              </label>
              <div className="aa-actions">
                <button
                  aria-label={"Subir módulo " + (i + 1)}
                  disabled={i === 0}
                  onClick={() =>
                    edit({
                      ...course.draft,
                      modules: reorder(course.draft.modules, i, -1),
                    })
                  }
                >
                  ↑
                </button>
                <button
                  aria-label={"Descer módulo " + (i + 1)}
                  disabled={i === course.draft.modules.length - 1}
                  onClick={() =>
                    edit({
                      ...course.draft,
                      modules: reorder(course.draft.modules, i, 1),
                    })
                  }
                >
                  ↓
                </button>
                <button
                  disabled={m.lessons.length > 0}
                  onClick={() =>
                    edit({
                      ...course.draft,
                      modules: course.draft.modules.filter(
                        (x) => x.id !== m.id,
                      ),
                    })
                  }
                >
                  Remover vazio
                </button>
              </div>
            </div>
            {m.lessons.map((l, j) => (
              <details className="aa-lesson" key={l.id}>
                <summary>
                  {j + 1}. {l.title}{" "}
                  <span>
                    {l.published ? "Pronta para publicação" : "Rascunho"}
                  </span>
                </summary>
                <div className="aa-fields">
                  <label className="aa-wide">
                    Título da aula
                    <input
                      value={l.title}
                      maxLength={160}
                      onChange={(e) =>
                        lesson(m.id, l.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <label className="aa-wide">
                    Descrição e orientações
                    <textarea
                      value={l.description}
                      rows={4}
                      maxLength={10000}
                      onChange={(e) =>
                        lesson(m.id, l.id, { description: e.target.value })
                      }
                    />
                  </label>
                  <YouTubeField
                    id={l.video_id}
                    change={(id) => lesson(m.id, l.id, { video_id: id })}
                  />
                  <div className="aa-disabled">
                    <strong>Upload direto de vídeo</strong>
                    <p>
                      Indisponível. Depende da escolha e aprovação de um
                      provedor e orçamento.
                    </p>
                    <button disabled>Enviar vídeo</button>
                  </div>
                  <label className="aa-wide">
                    Materiais da aula
                    <select
                      multiple
                      value={l.materials}
                      onChange={(e) =>
                        lesson(m.id, l.id, {
                          materials: [...e.target.selectedOptions].map(
                            (o) => o.value,
                          ),
                        })
                      }
                    >
                      {assets
                        .filter((a) => a.kind === "material")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <small>
                      Selecione até 10. Os arquivos são geridos em Materiais.
                    </small>
                  </label>
                  <label className="aa-check">
                    <input
                      type="checkbox"
                      checked={l.published}
                      onChange={(e) =>
                        lesson(m.id, l.id, { published: e.target.checked })
                      }
                    />
                    Conteúdo revisado e pronto para publicar
                  </label>
                </div>
                <div className="aa-actions">
                  <button
                    disabled={j === 0}
                    onClick={() =>
                      module(m.id, (x) => ({
                        ...x,
                        lessons: reorder(x.lessons, j, -1),
                      }))
                    }
                  >
                    Subir aula
                  </button>
                  <button
                    disabled={j === m.lessons.length - 1}
                    onClick={() =>
                      module(m.id, (x) => ({
                        ...x,
                        lessons: reorder(x.lessons, j, 1),
                      }))
                    }
                  >
                    Descer aula
                  </button>
                  <button
                    disabled={course.state === "published"}
                    onClick={() =>
                      module(m.id, (x) => ({
                        ...x,
                        lessons: x.lessons.filter((z) => z.id !== l.id),
                      }))
                    }
                  >
                    Remover rascunho
                  </button>
                  {course.id && (
                    <button
                      disabled={dirty}
                      onClick={() =>
                        setConfirm("lesson:" + l.id + ":" + !l.published)
                      }
                    >
                      {l.published ? "Despublicar aula" : "Publicar aula"}
                    </button>
                  )}
                </div>
              </details>
            ))}
            <button
              disabled={m.lessons.length >= 50}
              onClick={() =>
                module(m.id, (x) => ({
                  ...x,
                  lessons: [...x.lessons, makeLesson()],
                }))
              }
            >
              Adicionar aula
            </button>
          </article>
        ))}
        <div className="aa-actions aa-sticky">
          <button
            className="aa-primary"
            onClick={() =>
              void act("course_save", {
                document: course.draft,
                position: course.position,
                state:
                  course.state === "published" ? "preparing" : course.state,
              })
            }
          >
            Salvar rascunho
          </button>
          <button onClick={() => setPreview(!preview)}>
            {preview ? "Fechar prévia" : "Visualizar como aluno"}
          </button>
          {course.id && (
            <>
              <button disabled={dirty} onClick={() => setConfirm("publish")}>
                Publicar versão revisada
              </button>
              <button disabled={dirty} onClick={() => setConfirm("duplicate")}>
                Duplicar curso
              </button>
              <button
                disabled={dirty || course.state === "archived"}
                onClick={() => setConfirm("archive")}
              >
                Arquivar
              </button>
            </>
          )}
        </div>
        <p className="aa-note">
          Salvar mantém a versão pública atual. Para alterar o que o aluno vê,
          revise e publique. Salve antes de qualquer operação de publicação.
        </p>
        {confirm && (
          <div
            className="aa-confirm"
            role="group"
            aria-label="Confirmação editorial"
          >
            <h3>
              Confirmar{" "}
              {confirm === "publish"
                ? "publicação desta versão"
                : confirm === "archive"
                  ? "arquivamento"
                  : confirm === "duplicate"
                    ? "cópia como rascunho"
                    : "alteração da visibilidade da aula"}
              ?
            </h3>
            <p>
              {confirm === "publish"
                ? "Todo o conteúdo desta versão ficará acessível quando o modo Curso disponível estiver ativo."
                : "Esta ação será registrada. A prévia não realiza a operação."}
            </p>
            <button
              className="aa-primary"
              onClick={() => {
                if (confirm.startsWith("lesson:")) {
                  const [, id, visible] = confirm.split(":");
                  void act("lesson_visibility", {
                    lesson_id: id,
                    published: visible === "true",
                    confirmed: true,
                  });
                } else void act("course_" + confirm, { confirmed: true });
              }}
            >
              Confirmar
            </button>
            <button onClick={() => setConfirm("")}>Cancelar</button>
          </div>
        )}
      </fieldset>
      {preview && (
        <div className="aa-student-preview">
          <p className="aa-badge">
            Prévia administrativa · pode conter rascunhos · acesso restrito
          </p>
          <h2>{course.draft.title}</h2>
          <p>{course.draft.description}</p>
          {course.draft.modules.map((m) => (
            <section key={m.id}>
              <h3>{m.title}</h3>
              {m.lessons.map((l) => (
                <article key={l.id}>
                  <h4>{l.title}</h4>
                  {l.video_id && <Video id={l.video_id} title={l.title} />}
                  <p className="aa-prose">{l.description}</p>
                  <small>
                    {l.published ? "Pronta para publicar" : "Ainda em rascunho"}
                  </small>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
function YouTubeField({
  id,
  change,
}: {
  id: string;
  change: (id: string) => void;
}) {
  const [value, setValue] = useState(
      id ? "https://www.youtube.com/watch?v=" + id : "",
    ),
    [error, setError] = useState("");
  return (
    <label>
      Link do vídeo no YouTube
      <input
        type="url"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (!v) {
            change("");
            setError("");
            return;
          }
          try {
            const u = new URL(v);
            const next =
              u.hostname === "youtu.be"
                ? u.pathname.slice(1)
                : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
                      u.hostname,
                    )
                  ? u.searchParams.get("v") ||
                    u.pathname.match(/^\/(embed|shorts)\/([^/]+)$/)?.[2]
                  : "";
            if (
              u.protocol !== "https:" ||
              u.username ||
              u.password ||
              u.port ||
              !next ||
              !/^[-\w]{11}$/.test(next)
            )
              throw Error();
            change(next);
            setError("");
          } catch {
            change("");
            setError("Informe um link HTTPS válido do YouTube.");
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
      <small>
        Não listado não significa privado. O vídeo só carrega após ação do
        aluno.
      </small>
    </label>
  );
}
