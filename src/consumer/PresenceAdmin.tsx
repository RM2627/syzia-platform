import { usePermissions } from "../permissions/Permissions";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../api";
import { message } from "./api";
import { ImageUpload } from "./CompanyMedia";
import { PortfolioEditor } from "./PortfolioEditor";
import { SortableList } from "./SortableList";
import {
  brandStyle,
  DEFAULT_BRAND,
  suggestedColors,
  validColor,
} from "./brand";
import "./presence-editor.css";
export function PresenceAdmin({
  org,
  publishedPortfolio = [],
  onSaved,
  onDirty,
}: {
  org: string;
  expanded?: boolean;
  publishedPortfolio?: any[];
  onSaved?: () => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const { can } = usePermissions();
  const [data, setData] = useState<any>(),
    [branding, setBranding] = useState<any>(),
    [categories, setCategories] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const dirty = useRef(false),
    categoriesDirty = useRef(false),
    portfolioOrderDirty = useRef(false);
  async function load(reset = true) {
    const [d, cs] = await Promise.all([
      rpc<any>("consumer_presence_context", { p_org: org }),
      can("services.read")
        ? rpc<any[]>("company_categories", { p_org: org })
        : Promise.resolve([]),
    ]);
    setData(d);
    if (reset) {
      setBranding(d.branding);
      setCategories(cs);
      dirty.current = false;
      categoriesDirty.current = false;
      onDirty?.(portfolioOrderDirty.current);
    }
  }
  useEffect(() => {
    void load().catch((e) => setError(message(e)));
  }, [org]);
  function change(next: any) {
    setBranding(next);
    dirty.current = true;
    onDirty?.(true);
    setNotice("");
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!validColor(branding.primary_color))
        throw Error("Informe uma cor válida, como #6C3FE8.");
      if (categoriesDirty.current) {
        for (const [i, c] of categories.entries())
          if (c.position !== i) {
            await rpc("company_category_save", {
              p_org: org,
              p_id: c.id,
              p_revision: c.revision,
              p_data: { position: i },
              p_key: crypto.randomUUID(),
            });
          }
      }
      await rpc("consumer_branding_save", {
        p_org: org,
        p_revision: data.revision,
        p_data: {
          ...branding,
          logo: branding.logo || null,
          cover: branding.cover || null,
          category_order: categories.length
            ? categories.map((c) => c.name)
            : branding.category_order,
        },
      });
      await load();
      onSaved?.();
      setNotice(
        "Rascunho salvo. Revise a prévia e publique quando estiver pronto.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data || !branding)
    return (
      <section className="editor-section">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Carregando identidade e trabalhos…</p>
        )}
      </section>
    );
  const order = branding.service_order || [];
  const services = [...data.services].sort(
    (a: any, b: any) =>
      (order.indexOf(a.code) < 0 ? 999 : order.indexOf(a.code)) -
      (order.indexOf(b.code) < 0 ? 999 : order.indexOf(b.code)),
  );
  return (
    <div className="presence-editor">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {can("page.read") && (
        <section className="editor-section" id="identidade">
          <span className="section-kicker">01 · IDENTIDADE VISUAL</span>
          <h2>A sua empresa, do seu jeito</h2>
          <p>
            Logo identifica sua empresa; capa apresenta sua página. As mudanças
            ficam em rascunho até você publicar.
          </p>
          <fieldset
            className="form-reset"
            disabled={busy || !can("page.manage")}
          >
            <div className="identity-grid">
              <ImageUpload
                org={org}
                title="Logo da empresa"
                hint="Sua identidade. Sem logo, usamos o padrão da plataforma."
                value={branding.logo}
                onChange={(code) =>
                  change((current: any) => ({ ...current, logo: code }))
                }
                onBusy={setUploading}
                disabled={uploading || !can("page.manage")}
              />
              <ImageUpload
                org={org}
                title="Capa da página"
                hint="Imagem horizontal de apresentação da sua página pública."
                value={branding.cover}
                onChange={(code) =>
                  change((current: any) => ({ ...current, cover: code }))
                }
                onBusy={setUploading}
                disabled={uploading || !can("page.manage")}
              />
            </div>
            <div className="color-editor">
              <h3>Cor principal da sua marca</h3>
              <p>Escolha uma sugestão ou encontre a cor da sua empresa.</p>
              <div className="color-swatches">
                {suggestedColors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className="color-swatch"
                    style={{ backgroundColor: c }}
                    aria-label={"Escolher cor " + c}
                    aria-pressed={
                      branding.primary_color.toLowerCase() === c.toLowerCase()
                    }
                    onClick={() => change({ ...branding, primary_color: c })}
                  />
                ))}
              </div>
              <div className="color-inputs">
                <label>
                  Escolher outra cor
                  <input
                    type="color"
                    value={
                      validColor(branding.primary_color)
                        ? branding.primary_color
                        : DEFAULT_BRAND
                    }
                    onChange={(e) =>
                      change({ ...branding, primary_color: e.target.value })
                    }
                  />
                </label>
                <label>
                  HEX (opcional)
                  <input
                    value={branding.primary_color}
                    maxLength={7}
                    spellCheck={false}
                    aria-invalid={!validColor(branding.primary_color)}
                    onChange={(e) =>
                      change({ ...branding, primary_color: e.target.value })
                    }
                  />
                </label>
              </div>
              {!validColor(branding.primary_color) && (
                <p role="alert">
                  Use o seletor visual ou informe # e seis caracteres, como
                  #6C3FE8.
                </p>
              )}
              <label>
                Aparência da página pública
                <select
                  value={branding.theme || "light"}
                  onChange={(e) =>
                    change({ ...branding, theme: e.target.value })
                  }
                >
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                </select>
              </label>
              <p>
                Esta escolha é independente do tema do painel administrativo.
              </p>
              <div
                className="brand-sample"
                style={brandStyle(branding.primary_color, branding.theme)}
                aria-label="Prévia da identidade"
              >
                <div>
                  <small>PRÉVIA DA IDENTIDADE</small>
                  <h3>Seu serviço</h3>
                  <p>Uma experiência com a identidade da sua empresa.</p>
                  <span className="sample-category">
                    ✓ Categoria selecionada
                  </span>
                  <p>
                    <a href="#catalogo">Conhecer serviços</a>
                  </p>
                </div>
                <button type="button">Solicitar orçamento</button>
              </div>
              <small>
                O texto do botão muda entre claro e escuro para manter o
                contraste. Os textos da página permanecem legíveis.
              </small>
            </div>
            <div className="editor-actions">
              <button
                className="primary"
                disabled={
                  busy || uploading || !validColor(branding.primary_color)
                }
                onClick={() => void save()}
              >
                Salvar identidade visual
              </button>
              <button
                type="button"
                disabled={busy || uploading}
                onClick={() => {
                  change({
                    ...branding,
                    primary_color: DEFAULT_BRAND,
                    logo: null,
                    cover: null,
                  });
                }}
              >
                Restaurar padrão SYZIA
              </button>
            </div>
          </fieldset>
        </section>
      )}
      {can("services.read") && (
        <section id="catalogo" className="editor-section">
          <span className="section-kicker">02 · CATÁLOGO</span>
          <h2>Organize o que você oferece</h2>
          <p>
            As categorias organizam seus serviços. A imagem de cada serviço é
            enviada no próprio cadastro.
          </p>
          <Link className="c-button" to={"/painel/" + org + "/servicos"}>
            Cadastrar ou editar serviços
          </Link>
          <h3>Organize suas categorias</h3>
          <SortableList
            label="Ordem das categorias"
            items={categories}
            disabled={busy || !can("services.manage") || !can("page.manage")}
            onChange={(next) => {
              setCategories(next);
              categoriesDirty.current = true;
              dirty.current = true;
              onDirty?.(true);
            }}
            render={(c) => (
              <>
                {c.name}
                {!c.active && <small> · Inativa</small>}
              </>
            )}
          />
          {!categories.length && (
            <p>Crie uma categoria no cadastro de serviço.</p>
          )}
          <h3>Organize seus serviços</h3>
          <SortableList
            label="Ordem dos serviços"
            items={services.map((s: any) => ({ ...s, id: s.code }))}
            disabled={busy || !can("page.manage")}
            onChange={(next) =>
              change({ ...branding, service_order: next.map((s) => s.code) })
            }
          />
          {can("page.manage") && (
            <button
              className="primary"
              disabled={
                busy || uploading || !validColor(branding.primary_color)
              }
              onClick={() => void save()}
            >
              Salvar ordem do catálogo
            </button>
          )}
        </section>
      )}
      {can("portfolio.read") && (
        <PortfolioEditor
          org={org}
          data={{ ...data, publishedPortfolio }}
          editable={can("portfolio.manage")}
          refresh={() => load(false)}
          changed={onSaved}
          onOrderDirty={(value) => {
            portfolioOrderDirty.current = value;
            onDirty?.(value || dirty.current);
          }}
        />
      )}
    </div>
  );
}
