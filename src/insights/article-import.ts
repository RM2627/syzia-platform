// Only the existing authenticated editorial RPC is supplied by the workspace.
export const IMPORT_BYTES = 1_000_000;
export const IMPORT_LIMIT = 50;
export type EditorialCall = (action: string, data?: Record<string, unknown>) => Promise<any>;
export type ImportRow = {
  index: number; title: string; slug: string; category: string;
  document: Record<string, unknown>; errors: string[]; duplicate: boolean;
};
export type ImportResult = { index: number; status: "created" | "ignored" | "rejected" | "uncertain"; message: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const length = (s: string) => [...s].length;
const allowed = new Set(["title", "slug", "summary", "category", "author", "tags", "blocks", "cover", "seo_title", "seo_description", "featured", "kind", "toc"]);
export const importError = (code: string) => ({
  insights_document_invalid: "Confira os campos obrigatórios e o tamanho do artigo.",
  insights_import_shape_invalid: "Estrutura ou tipo de campo inválido.",
  insights_taxonomy_required: "Cadastre a categoria e o autor na gestão editorial antes de importar.",
  insights_tags_invalid: "Confira as tags: elas precisam existir na gestão editorial.",
  insights_kind_invalid: "Tipo de conteúdo inválido.",
  insights_media_missing: "A imagem indicada não existe na biblioteca ou não tem texto alternativo.",
  insights_block_invalid: "Há um bloco de conteúdo inválido.",
  insights_link_invalid: "Há um link inválido no conteúdo.",
  insights_import_invalid: "O documento não atende às regras editoriais.",
  access_denied: "Sua sessão não tem autorização editorial. Entre novamente ou solicite acesso.",
} as Record<string, string>)[code] || "Não foi possível validar este artigo. Confira os campos.";

export function parseArticles(text: string): ImportRow[] {
  if (new TextEncoder().encode(text).length > IMPORT_BYTES) throw Error("Use um JSON de até 1 MB.");
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw Error("JSON inválido. Confira a sintaxe do arquivo."); }
  if (!Array.isArray(input) || !input.length || input.length > IMPORT_LIMIT)
    throw Error(`Use uma lista JSON com 1 a ${IMPORT_LIMIT} artigos.`);
  return input.map((value, index) => {
    const d = object(value) ? value : {}, errors: string[] = [];
    const string = (key: string) => typeof d[key] === "string" ? d[key] as string : "";
    if (!object(value) || Object.keys(d).some(k => !allowed.has(k))) errors.push("Estrutura inválida ou campos não permitidos.");
    if (length(string("title").trim()) < 8 || length(string("title").trim()) > 160) errors.push("Título: use de 8 a 160 caracteres.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(string("slug")) || string("slug").length > 120 || ["api", "media", "assets", "categoria"].includes(string("slug"))) errors.push("Slug: use até 120 letras minúsculas, números e hífens, sem nome reservado.");
    if (length(string("summary").trim()) < 20 || length(string("summary").trim()) > 400) errors.push("Resumo: use de 20 a 400 caracteres.");
    for (const key of ["category", "author"]) if (length(string(key).trim()) < 2 || length(string(key)) > 80) errors.push(key === "category" ? "Informe uma categoria válida." : "Informe um autor válido.");
    if (!Array.isArray(d.tags) || d.tags.length > 12 || d.tags.some(t => typeof t !== "string" || length(t) > 80)) errors.push("Tags: use uma lista com até 12 nomes válidos.");
    if (!Array.isArray(d.blocks) || !d.blocks.length || d.blocks.length > 100 || d.blocks.some(b => !object(b))) errors.push("Conteúdo: use de 1 a 100 blocos estruturados.");
    for (const key of ["cover", "seo_title", "seo_description", "kind"]) if (key in d && typeof d[key] !== "string") errors.push(`O campo ${key} deve ser texto.`);
    for (const key of ["featured", "toc"]) if (key in d && typeof d[key] !== "boolean") errors.push(`O campo ${key} deve ser verdadeiro ou falso.`);
    if (new TextEncoder().encode(JSON.stringify(d)).length > 180_000) errors.push("O artigo excede o limite de 180 KB.");
    return { index, title: string("title") || `Artigo ${index + 1}`, slug: string("slug"), category: string("category"), document: d, errors, duplicate: false };
  });
}

export async function previewArticles(rows: ImportRow[], call: EditorialCall): Promise<ImportRow[]> {
  const candidates = rows.filter(r => !r.errors.length);
  if (!candidates.length) return rows;
  const result = await call("import_preview", { documents: candidates.map(r => r.document) });
  if (!Array.isArray(result?.items) || result.items.length !== candidates.length) throw Error("Prévia indisponível. Nenhum artigo foi importado.");
  const byIndex = new Map<number, { valid: boolean; duplicate: boolean; error?: string }>();
  result.items.forEach((item: any, i: number) => {
    if (item?.index !== i || typeof item.valid !== "boolean" || typeof item.duplicate !== "boolean" || (!item.valid && typeof item.error !== "string")) throw Error("Resposta de validação inválida. Nenhum artigo foi importado.");
    byIndex.set(candidates[i].index, item);
  });
  const seen = new Set<string>();
  return rows.map(row => {
    const check = byIndex.get(row.index);
    if (!check) return row;
    const errors = check.valid ? [] : [importError(check.error || "")];
    const duplicate = check.duplicate || (check.valid && seen.has(row.slug));
    if (check.valid) seen.add(row.slug);
    return { ...row, errors, duplicate };
  });
}

export async function importArticles(rows: ImportRow[], selected: Set<number>, call: EditorialCall, progress?: (done: number) => void): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  let stopped = false;
  for (const row of rows) {
    if (row.errors.length) results.push({ index: row.index, status: "rejected", message: row.errors.join(" ") });
    else if (row.duplicate || !selected.has(row.index) || stopped) results.push({ index: row.index, status: "ignored", message: row.duplicate ? "Slug já existente ou repetido no arquivo." : stopped ? "Não enviado: operação interrompida." : "Não selecionado." });
    else {
      try {
        const x = await call("import_draft", { document: row.document });
        if (x?.slug !== row.slug || !["created", "duplicate"].includes(x?.status) || (x.status === "created" && (x.state !== "draft" || !/^[a-f0-9-]{36}$/.test(x.post_id || "")))) throw Error("invalid_import_response");
        results.push({ index: row.index, status: x.status === "created" ? "created" : "ignored", message: x.status === "created" ? "Rascunho criado." : "Slug já existente. Nenhum artigo foi alterado." });
      } catch (error: any) {
        const code = String(error?.message || "");
        const denied = error?.code === "42501" || code === "access_denied";
        const known = denied || /^insights_(document_invalid|import_shape_invalid|taxonomy_required|tags_invalid|kind_invalid|media_missing|block_invalid|link_invalid)$/.test(code);
        results.push({ index: row.index, status: known ? "rejected" : "uncertain", message: known ? importError(denied ? "access_denied" : code) : "Confirmação indisponível. Reabra o importador para conferir antes de tentar novamente." });
        if (denied || !known) stopped = true;
      }
    }
    progress?.(results.length);
  }
  return results;
}
