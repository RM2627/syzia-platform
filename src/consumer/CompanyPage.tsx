import { usePermissions } from "../permissions/Permissions";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, supabase, type Organization } from "../api";
import { gateway, message, type Company } from "./api";
import { PublicCompany } from "./Consumer";
import { PresenceAdmin } from "./PresenceAdmin";
import { PagePublication } from "./PagePublication";
import "./consumer.css";
import "./company-page.css";
import "./presence-editor.css";
export function CompanyPage({ org }: { org: Organization }) {
  const { can } = usePermissions(),
    full = [
      "page.read",
      "services.read",
      "portfolio.read",
      "settings.read",
    ].every(can);
  const [draft, setDraft] = useState<any>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [showPrices, setShowPrices] = useState(true),
    [preview, setPreview] = useState<Company | null>(null),
    [reviewed, setReviewed] = useState(""),
    [media, setMedia] = useState<Record<string, string>>({});
  const path = "/empresa/" + encodeURIComponent(org.slug),
    url = new URL(path, window.location.origin).href;
  async function load(prices = showPrices) {
    if (!full) return;
    const d = await rpc<any>("consumer_page_draft", {
      p_org: org.id,
      p_show_prices: prices,
    });
    setDraft(d);
    return d;
  }
  useEffect(() => {
    let active = true;
    if (full)
      void rpc<any>("consumer_page_draft", {
        p_org: org.id,
        p_show_prices: true,
      })
        .then(async (d) => {
          if (!d.show_prices)
            d = await rpc<any>("consumer_page_draft", {
              p_org: org.id,
              p_show_prices: false,
            });
          if (active) {
            setShowPrices(d.show_prices);
            setDraft(d);
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    return () => {
      active = false;
    };
  }, [org.id, full]);
  useEffect(
    () => () => {
      Object.values(media).forEach(URL.revokeObjectURL);
    },
    [media],
  );
  async function showPreview() {
    setBusy(true);
    setError("");
    const entries: [string, string][] = [];
    try {
      const d = await load();
      const p = d.preview;
      const codes = new Set<string>(
        [
          p.branding?.logo,
          p.branding?.cover,
          ...p.services.map((s: any) => s.image_media),
          ...p.portfolio.flatMap((w: any) => w.images),
        ].filter(Boolean),
      );
      const auth = (await supabase!.auth.getSession()).data.session;
      if (!auth) throw Error("consumer_session_required");
      const images = [...codes];
      // Independent authorized images: bounded parallelism avoids a waterfall
      // without opening an unbounded number of requests for a large portfolio.
      for (let i = 0; i < images.length; i += 4) {
        const batch = await Promise.allSettled(
          images.slice(i, i + 4).map(async (code) => {
            const r = await fetch(gateway + "/company-media/" + code, {
              headers: { Authorization: "Bearer " + auth.access_token },
            });
            if (!r.ok) throw Error("attachment_access_denied");
            entries.push([code, URL.createObjectURL(await r.blob())]);
          }),
        );
        const failed = batch.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      }
      setMedia(Object.fromEntries(entries));
      setPreview(p);
      setReviewed(d.token);
      setTimeout(
        () =>
          document
            .getElementById("previa")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50,
      );
    } catch (e) {
      entries.forEach(([, url]) => URL.revokeObjectURL(url));
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draft || reviewed !== draft.token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await rpc("consumer_publish_draft", {
        p_org: org.id,
        p_token: reviewed,
        p_show_prices: showPrices,
        p_expected_revision: draft.page_revision,
      });
      await load();
      setReviewed("");
      setPreview(null);
      setNotice(
        "Alterações publicadas. Sua página já apresenta a versão revisada.",
      );
    } catch (e) {
      setError(
        (e as any)?.message === "page_draft_changed"
          ? "O rascunho mudou. Abra novamente a prévia antes de publicar."
          : message(e),
      );
      setReviewed("");
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await rpc("consumer_set_page_enabled", {
        p_org: org.id,
        p_enabled: !draft.enabled,
        p_expected_revision: draft.page_revision,
      });
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copiado! Cole no WhatsApp, Instagram ou onde preferir.");
    } catch {
      setNotice(
        "Não foi possível copiar automaticamente. Selecione e copie o link abaixo.",
      );
    }
  }
  return (
    <div className="consumer company-page presence-editor">
      <header className="page-hub-hero">
        <div>
          <span className="eyebrow">SUA PRESENÇA DIGITAL</span>
          <h1>Página da empresa</h1>
          <p>{org.name} · Da identidade ao próximo contato do cliente.</p>
        </div>
        <span className="badge">
          {!draft
            ? full
              ? "Carregando status…"
              : "Conteúdo da empresa"
            : draft.published
              ? draft.enabled
                ? "Página publicada"
                : "Página oculta"
              : "Ainda não publicada"}
        </span>
      </header>
      <nav className="page-editor-nav" aria-label="Etapas da página">
        {[
          ["identidade", "1. Identidade visual"],
          ["catalogo", "2. Catálogo"],
          ["portfolio", "3. Portfólio"],
          ["previa", "4. Prévia"],
          ["publicacao", "5. Publicação"],
        ].map(([id, label]) => (
          <a key={id} href={"#" + id}>
            {label}
          </a>
        ))}
      </nav>
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
      <section className="page-share" aria-label="Compartilhar página">
        <div className="page-share-actions">
          <a
            className="c-primary"
            href={path}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver página pública ↗
          </a>
          <button onClick={() => void copy()}>Copiar link</button>
          <Link to={"/painel/" + org.id + "/configuracao"}>
            Dados da empresa e horários
          </Link>
        </div>
        <label>
          Seu link público
          <input
            aria-label="URL pública"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <p>
          {draft?.enabled
            ? "Versão publicada: é o que seus visitantes veem agora."
            : "O link passa a mostrar seu conteúdo depois que a página é publicada e ativada."}
        </p>
        {draft?.changed && (
          <p className="notice">
            <strong>Rascunho</strong> · Há alterações salvas ainda não visíveis
            aos consumidores.
          </p>
        )}
      </section>
      <PresenceAdmin
        org={org.id}
        expanded
        publishedPortfolio={draft?.published_payload?.portfolio || []}
        onDirty={(value) => {
          setDirty(value);
          if (value) {
            setReviewed("");
            setPreview(null);
          }
        }}
        onSaved={() => {
          setReviewed("");
          setPreview(null);
          void load().catch((e) => setError(message(e)));
        }}
      />
      {full && draft ? (
        <>
          <section id="previa" className="editor-section">
            <span className="section-kicker">04 · PRÉVIA</span>
            <h2>Visualizar como cliente</h2>
            <p>
              Revise o rascunho completo antes de publicar: identidade,
              serviços, fotos, preços, portfólio, FAQ e dados públicos.
            </p>
            <button disabled={busy || dirty} onClick={() => void showPreview()}>
              {preview ? "Atualizar prévia" : "Visualizar como cliente"}
            </button>
            {dirty && <p>Salve as alterações acima para continuar.</p>}
            {preview && (
              <>
                <p className="preview-banner">
                  <strong>Rascunho privado</strong> · As alterações abaixo ainda
                  não estão publicadas. O envio de solicitações está disponível
                  somente na página pública.
                </p>
                <button onClick={() => setPreview(null)}>Fechar prévia</button>
                <div className="draft-preview" aria-label="Prévia do rascunho">
                  <PublicCompany preview={preview} previewMedia={media} />
                </div>
              </>
            )}
          </section>
          <PagePublication
            org={org.id}
            draft={draft}
            busy={busy}
            dirty={dirty}
            canPublish={can("page.manage")}
            showPrices={showPrices}
            setShowPrices={(value) => {
              setShowPrices(value);
              setPreview(null);
              setReviewed("");
              void load(value).catch((e) => setError(message(e)));
            }}
            onPreview={() => void showPreview()}
            onPublish={() => void publish()}
            onToggle={() => void toggle()}
            reviewed={!!reviewed && reviewed === draft.token}
          />
        </>
      ) : (
        <p className="notice">
          A prévia completa requer acesso de leitura a configurações, serviços,
          página e portfólio. Seus módulos autorizados continuam disponíveis
          acima.
        </p>
      )}
    </div>
  );
}
