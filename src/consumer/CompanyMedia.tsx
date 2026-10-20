import { commercialMediaFetch } from '../demo/editor-bridge';
import { ImageFraming } from "./ImageFraming";
import { useEffect, useId, useState } from "react";
import { rpc, supabase } from "../api";
import { gateway, message } from "./api";
import { usePermissions } from "../permissions/Permissions";
import { companyImageBytes } from "./company-image-request";

async function authorization() {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw Error("consumer_session_required");
  return "Bearer " + data.session.access_token;
}
export async function uploadCompanyImage(
  org: string,
  file: File,
): Promise<string> {
  if (!gateway) throw Error("upload_unavailable");
  if (
    file.size > 5242880 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw Error("invalid_image_type");
  const reserved = await rpc<{ code: string }>(
    "consumer_reserve_company_media",
    {
      p_org: org,
      p_mime: file.type,
      p_size: file.size,
      p_key: crypto.randomUUID(),
    },
  );
  const response = await commercialMediaFetch(gateway + "/company-media/" + reserved.code, {
    method: "POST",
    headers: {
      Authorization: await authorization(),
      "Content-Type": file.type,
    },
    body: file,
  }).catch(() => {
    throw Error("media_gateway_unreachable");
  });
  if (!response.ok)
    throw Error(
      (await response.json().catch(() => ({}))).error || "media_gateway_failed",
    );
  return reserved.code;
}
export function useCompanyImage(org: string, code?: string | null) {
  const { data: permissions } = usePermissions();
  const scope = JSON.stringify({ org, permissions });
  const imageKey = JSON.stringify([code, scope]);
  const [image, setImage] = useState({ key: "", url: "", error: false });
  useEffect(() => {
    let live = true,
      objectUrl = "";
    setImage({ key: imageKey, url: "", error: false });
    if (code && gateway)
      void (async () => {
        const bytes = await companyImageBytes(
          gateway + "/company-media/" + code,
          await authorization(),
          scope,
        );
        objectUrl = URL.createObjectURL(bytes);
        if (live) setImage({ key: imageKey, url: objectUrl, error: false });
        else URL.revokeObjectURL(objectUrl);
      })().catch(() => {
        if (live) setImage({ key: imageKey, url: "", error: true });
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [code, scope, imageKey]);
  // Never show the preceding asset for one render after a crop or scope change.
  return image.key === imageKey ? image : { url: "", error: false };
}
export function CompanyImage({
  org,
  code,
  alt,
  className = "",
  legacyUrl,
}: {
  org: string;
  code?: string | null;
  alt: string;
  className?: string;
  legacyUrl?: string;
}) {
  const { url, error } = useCompanyImage(org, code);
  return url || legacyUrl ? (
    <img
      src={url || legacyUrl}
      alt={alt}
      className={className}
      loading="lazy"
    />
  ) : (
    <span className="media-placeholder">
      {error
        ? "Não foi possível carregar esta imagem. Tente novamente."
        : code
          ? "Carregando imagem…"
          : "Sem imagem"}
    </span>
  );
}
export function ImageUpload({
  org,
  value,
  onChange,
  title,
  hint,
  disabled,
  legacyUrl,
  onBusy,
}: {
  org: string;
  value?: string | null;
  onChange: (code: string | null) => void;
  title: string;
  hint?: string;
  disabled?: boolean;
  legacyUrl?: string;
  onBusy?: (busy: boolean) => void;
}) {
  const kind = /logo/i.test(title)
    ? "logo"
    : /capa/i.test(title)
      ? "cover"
      : /serviço/i.test(title)
        ? "service"
        : "portfolio";
  const ratio = kind === "cover" ? 4 / 3 : 3 / 2;
  const [crop, setCrop] = useState<Blob | null>(null);
  const id = useId(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="media-upload">
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      <div className={"media-preview media-kind-" + kind}>
        <CompanyImage
          org={org}
          code={value}
          legacyUrl={legacyUrl}
          alt={"Prévia — " + title}
        />
      </div>
      {kind === "cover" && (
        <p className="muted">
          Proporção recomendada: 4:3. Dimensões recomendadas: 1600 × 1200 px.
          Outras proporções são aceitas; ajuste a área visível após enviar.
        </p>
      )}
      {kind === "service" && (
        <p className="muted">
          Card em 3:2. Recomendado: 1200 × 800 px. Ajuste o enquadramento para
          escolher o destaque.
        </p>
      )}
      {kind === "logo" && (
        <p className="muted">
          Horizontal, quadrada ou vertical: a logo aparece inteira, sem recortar
          o nome.
        </p>
      )}
      <div className="media-actions">
        <label className="upload-button" htmlFor={id}>
          {busy
            ? "Enviando…"
            : value || legacyUrl
              ? "Trocar imagem"
              : "Enviar " +
                (/logo/i.test(title)
                  ? "logo"
                  : /capa/i.test(title)
                    ? "capa"
                    : "imagem")}
        </label>
        <input
          id={id}
          type="file"
          aria-label={"Enviar " + title.toLowerCase()}
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy || !gateway}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            onBusy?.(true);
            setError("");
            try {
              onChange(await uploadCompanyImage(org, file));
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
              onBusy?.(false);
            }
          }}
        />
        {value && (kind === "cover" || kind === "service") && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const response = await commercialMediaFetch(
                  gateway + "/company-media/" + value,
                  { headers: { Authorization: await authorization() } },
                ).catch(() => {
                  throw Error("media_gateway_unreachable");
                });
                if (!response.ok) throw Error("media_gateway_failed");
                setCrop(await response.blob());
              } catch (err) {
                setError(message(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Ajustar enquadramento
          </button>
        )}
        {(value || legacyUrl) && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onChange(null)}
          >
            Remover imagem
          </button>
        )}
      </div>
      <small>
        JPG, PNG ou WebP · até 5 MB. Use imagens próprias ou autorizadas.
      </small>
      {crop && (
        <ImageFraming
          blob={crop}
          ratio={ratio}
          title={title}
          close={() => setCrop(null)}
          save={async (file) => {
            setBusy(true);
            onBusy?.(true);
            setError("");
            try {
              onChange(await uploadCompanyImage(org, file));
            } catch (err) {
              setError(message(err));
              throw err;
            } finally {
              setBusy(false);
              onBusy?.(false);
            }
          }}
        />
      )}
      {!gateway && (
        <p role="alert">
          Envio de imagens indisponível neste ambiente. Contate o suporte.
        </p>
      )}
      {busy && <p role="status">Enviando e preparando a imagem…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </div>
  );
}
