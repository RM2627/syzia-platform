import { useId, useState } from "react";
import { rpc } from "../api";
import { message } from "./api";
import { Dialog } from "../ui/Dialog";
import { CompanyImage, ImageUpload, uploadCompanyImage } from "./CompanyMedia";
import { ImageFraming } from "./ImageFraming";
import { SortableList } from "./SortableList";
type Work = {
  code?: string;
  title: string;
  description: string;
  service: string;
  format: string;
  position: number;
  active: boolean;
  images: string[];
};
export function PortfolioEditor({
  org,
  data,
  editable,
  refresh,
  changed,
  onOrderDirty,
}: {
  org: string;
  data: any;
  editable: boolean;
  refresh: () => Promise<void>;
  changed?: () => void;
  onOrderDirty?: (dirty: boolean) => void;
}) {
  const galleryInput = useId();
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [item, setItem] = useState<Work | null>(null),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [order, setOrder] = useState<any[] | null>(null);
  const [viewing, setViewing] = useState<{ code: string; alt: string } | null>(
    null,
  );
  const works = order || data.portfolio_all || [];
  const published = data.publishedPortfolio || [];
  function open(work?: Work) {
    setError("");
    setNotice("");
    setItem(
      work
        ? {
            ...work,
            format:
              work.format === "gallery" && work.images.length === 1
                ? "single"
                : work.format,
            images: [...work.images],
          }
        : {
            title: "",
            description: "",
            service: "",
            format: "single",
            position: Math.min(100, works.length),
            active: true,
            images: [],
          },
    );
  }
  async function saveWork(work: Work) {
    await rpc("consumer_portfolio_save", {
      p_org: org,
      p_code: work.code || null,
      p_data: {
        title: work.title,
        description: work.description,
        service: work.service || null,
        format: work.format === "single" ? "gallery" : work.format,
        position: work.position,
        active: work.active,
        images: work.images,
      },
    });
  }
  async function act(
    fn: () => Promise<void>,
    success = "Rascunho salvo. Publique as alterações para atualizar a página.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      changed?.();
      setOrder(null);
      onOrderDirty?.(false);
      setNotice(success);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function image(index: number, code: string | null) {
    setItem((current) => {
      if (!current) return current;
      const images = [...current.images];
      images[index] = code || "";
      return { ...current, images };
    });
  }
  const imageCount = item?.images.filter(Boolean).length || 0;
  const valid =
    item &&
    item.title.trim().length >= 2 &&
    imageCount > 0 &&
    (item.format !== "before_after" || (item.images[0] && item.images[1])) &&
    (item.format !== "single" || imageCount === 1);
  return (
    <section id="portfolio" className="editor-section">
      <span className="section-kicker">03 · PORTFÓLIO</span>
      <h2>Seus trabalhos</h2>
      <p>
        Mostre projetos, trabalhos e resultados realizados. Fotos de portfólio
        são diferentes das imagens que representam seus serviços.
      </p>
      {error && !item && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {editable && (
        <button className="primary" onClick={() => open()}>
          + Adicionar trabalho
        </button>
      )}
      {!works.length && (
        <p className="notice">
          Você ainda não adicionou trabalhos. O portfólio é opcional; sua página
          pode ser publicada sem ele.
        </p>
      )}
      <div className="portfolio-draft-grid">
        {works.map((work: Work) => {
          const shown = published.find((p: any) => p.code === work.code);
          const same =
            shown &&
            ["title", "description", "format", "service"].every(
              (k) => (shown[k] || "") === ((work as any)[k] || ""),
            ) &&
            JSON.stringify(shown.images) === JSON.stringify(work.images);
          return (
            <article key={work.code}>
              <div
                className={
                  "portfolio-draft-images portfolio-media-" +
                  (work.format === "before_after"
                    ? "comparison"
                    : work.images.length === 1
                      ? "single"
                      : "gallery")
                }
              >
                {work.images.map((code, i) => (
                  <figure key={code}>
                    <CompanyImage
                      org={org}
                      code={code}
                      alt={
                        work.title +
                        " — " +
                        (work.format === "before_after"
                          ? i === 0
                            ? "Antes"
                            : "Depois"
                          : "Foto " + (i + 1))
                      }
                    />
                    {work.format === "before_after" && (
                      <figcaption>{i === 0 ? "Antes" : "Depois"}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
              <h3>{work.title}</h3>
              <p>{work.description}</p>
              <small>
                Serviço relacionado:{" "}
                {data.services.find((s: any) => s.code === work.service)
                  ?.name || "Sem vínculo específico"}
              </small>
              <div>
                <span className="work-badge">
                  {!work.active
                    ? shown
                      ? "Será ocultado ao publicar"
                      : "Oculto no rascunho"
                    : same
                      ? "Publicado ✓"
                      : shown
                        ? "Alterações em rascunho"
                        : "Rascunho · ainda não publicado"}
                </span>
              </div>
              {editable && (
                <div className="editor-actions">
                  <button disabled={busy} onClick={() => open(work)}>
                    Editar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        saveWork({ ...work, active: !work.active }),
                      )
                    }
                  >
                    {work.active ? "Ocultar" : "Mostrar"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Excluir este trabalho do rascunho? A versão pública só muda após publicar novamente.",
                        )
                      )
                        void act(async () => {
                          await rpc("consumer_portfolio_delete", {
                            p_org: org,
                            p_code: work.code,
                          });
                        }, "Trabalho excluído do rascunho. A publicação atual foi preservada.");
                    }}
                  >
                    Excluir
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {works.length > 1 && (
        <details>
          <summary>Reordenar trabalhos</summary>
          <SortableList
            label="Ordem dos trabalhos"
            items={works.map((w: Work) => ({
              ...w,
              id: w.code!,
              name: w.title,
            }))}
            disabled={!editable || busy}
            onChange={(next) => {
              setOrder(next.map(({ id, name, ...w }) => w));
              onOrderDirty?.(true);
            }}
          />
          {order && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  for (const [i, w] of order.entries())
                    await saveWork({ ...w, position: i });
                })
              }
            >
              Salvar ordem dos trabalhos
            </button>
          )}
        </details>
      )}
      {item && (
        <Dialog
          title={item.code ? "Editar trabalho" : "Adicionar trabalho"}
          close={() => {
            if (!busy && !uploading) setItem(null);
          }}
          className="portfolio-editor-dialog"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                void act(async () => {
                  await saveWork({
                    ...item,
                    images: item.images.filter(Boolean),
                  });
                  setItem(null);
                });
            }}
          >
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <fieldset
              disabled={busy || !editable || galleryFiles.length > 0}
              className="form-reset portfolio-editor-fields"
            >
              <label>
                Título
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={item.title}
                  onChange={(e) => setItem({ ...item, title: e.target.value })}
                />
              </label>
              <label>
                Descrição curta
                <textarea
                  maxLength={600}
                  value={item.description}
                  onChange={(e) =>
                    setItem({ ...item, description: e.target.value })
                  }
                />
              </label>
              <label>
                Serviço relacionado
                <select
                  value={item.service || ""}
                  onChange={(e) =>
                    setItem({ ...item, service: e.target.value })
                  }
                >
                  <option value="">Sem vínculo específico</option>
                  {data.services.map((s: any) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Formato
                <select
                  value={item.format}
                  onChange={(e) => {
                    const format = e.target.value;
                    if (
                      item.images.length >
                        (format === "single"
                          ? 1
                          : format === "before_after"
                            ? 2
                            : 4) &&
                      !window.confirm(
                        "O novo formato usa menos fotos. Remover as fotos excedentes deste rascunho?",
                      )
                    )
                      return;
                    setItem({
                      ...item,
                      format,
                      images: item.images.slice(
                        0,
                        format === "single"
                          ? 1
                          : format === "before_after"
                            ? 2
                            : 4,
                      ),
                    });
                  }}
                >
                  <option value="single">Foto única</option>
                  <option value="before_after">Antes e depois</option>
                  <option value="gallery">Galeria</option>
                </select>
              </label>
              {item.format === "single" && (
                <ImageUpload
                  org={org}
                  title="Foto do trabalho"
                  value={item.images[0]}
                  onChange={(c) => image(0, c)}
                  onBusy={setUploading}
                />
              )}
              {item.format === "before_after" && (
                <div className="before-after-upload">
                  <ImageUpload
                    org={org}
                    title="Antes"
                    hint="Como estava antes do trabalho. Use ângulos e distâncias semelhantes à foto depois."
                    value={item.images[0]}
                    onChange={(c) => image(0, c)}
                    onBusy={setUploading}
                    disabled={uploading}
                  />
                  <ImageUpload
                    org={org}
                    title="Depois"
                    hint="O resultado do trabalho realizado. As duas fotos aparecem inteiras em áreas equivalentes."
                    value={item.images[1]}
                    onChange={(c) => image(1, c)}
                    onBusy={setUploading}
                    disabled={uploading}
                  />
                </div>
              )}
              {item.format === "gallery" && (
                <div>
                  <div className="media-actions">
                    <label className="upload-button" htmlFor={galleryInput}>
                      + Adicionar fotos
                    </label>
                    <input
                      id={galleryInput}
                      aria-label="Adicionar fotos"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploading || item.images.length >= 4}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = "";
                        if (!files.length) return;
                        if (files.length + item.images.length > 4) {
                          setError(
                            "Cada trabalho aceita até 4 fotos. Remova uma foto para adicionar outra.",
                          );
                          return;
                        }
                        if(files.some(file=>file.size>5242880||!["image/jpeg","image/png","image/webp"].includes(file.type))){setError("Use JPG, PNG ou WebP de até 5 MB por foto.");return;}
                        setError("");
                        setGalleryFiles(files);
                        setUploading(true);
                      }}
                    />
                  </div>
                  <small>
                    Até 4 fotos por trabalho · JPG, PNG ou WebP · 5 MB por foto. Confira o enquadramento de cada foto; cancelar pula somente a foto atual.
                  </small>
                  {uploading && <p role="status">Enviando fotos…</p>}
                  <div className="gallery-draft">
                    {item.images.map((code, i) => (
                      <div className="gallery-thumb" key={code}>
                        <ImageUpload org={org} title={"Foto " + (i + 1) + " do portfólio"} value={code}
                          onChange={value => value ? image(i, value) : setItem(current => current ? {...current, images: current.images.filter((_, n) => n !== i)} : current)}
                          onBusy={setUploading} disabled={uploading}/>
                        <div className="editor-actions">
                          <button
                            type="button"
                            disabled={i === 0 || uploading}
                            aria-label={"Antecipar foto " + (i + 1)}
                            onClick={() => {
                              const next = [...item.images];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              setItem({ ...item, images: next });
                            }}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={i === item.images.length - 1 || uploading}
                            aria-label={"Adiar foto " + (i + 1)}
                            onClick={() => {
                              const next = [...item.images];
                              [next[i + 1], next[i]] = [next[i], next[i + 1]];
                              setItem({ ...item, images: next });
                            }}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            disabled={uploading}
                            aria-label={"Remover foto " + (i + 1)}
                            onClick={() =>
                              setItem({
                                ...item,
                                images: item.images.filter((_, n) => n !== i),
                              })
                            }
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label>
                Ordem
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={item.position}
                  onChange={(e) =>
                    setItem({ ...item, position: Number(e.target.value) })
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(e) =>
                    setItem({ ...item, active: e.target.checked })
                  }
                />
                Ativo na próxima publicação
              </label>
              {!valid && (
                <p className="muted">
                  Informe o título e{" "}
                  {item.format === "before_after"
                    ? "envie as duas fotos, Antes e Depois."
                    : "adicione pelo menos uma foto."}
                </p>
              )}
              <div className="editor-actions">
                <button
                  className="primary"
                  disabled={busy || uploading || !valid}
                >
                  Salvar trabalho
                </button>
                <button
                  type="button"
                  disabled={busy || uploading}
                  onClick={() => setItem(null)}
                >
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>
        </Dialog>
      )}
      {galleryFiles.length>0 && <ImageFraming key={galleryFiles[0].name+galleryFiles.length}
        title="Foto da galeria" blob={galleryFiles[0]} ratio={0}
        save={async file=>{const code=await uploadCompanyImage(org,file);setItem(current=>current?{...current,images:[...current.images,code]}:current);}}
        close={()=>{setGalleryFiles(files=>files.slice(1));setUploading(galleryFiles.length>1);}}/>}
      {viewing && (
        <Dialog
          title={viewing.alt}
          close={() => setViewing(null)}
          className="photo-viewer-dialog"
        >
          <CompanyImage org={org} code={viewing.code} alt={viewing.alt} />
        </Dialog>
      )}
    </section>
  );
}
