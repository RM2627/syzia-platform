export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const e = escapeHTML;
export const safeURL = (value) => {
  try {
    if (typeof value !== "string" || /[\\\s<>"']/.test(value)) return "#";
    const u = new URL(value, "https://usesyzia.com.br");
    return u.protocol === "https:" &&
      (value.startsWith("https://") || /^\/[^/]/.test(value))
      ? value
      : "#";
  } catch {
    return "#";
  }
};
export function blocksHTML(blocks = []) {
  return blocks
    .map((b, i) => {
      let t = e(b.text);
      if (b.bold) t = `<strong>${t}</strong>`;
      if (b.italic) t = `<em>${t}</em>`;
      switch (b.type) {
        case "heading":
          return `<h${b.level === 3 ? 3 : 2} id="sec-${i}">${t}</h${b.level === 3 ? 3 : 2}>`;
        case "list":
          return `<ul>${String(b.text || "")
            .split("\n")
            .map((x) => `<li>${e(x)}</li>`)
            .join("")}</ul>`;
        case "quote":
          return `<blockquote>${t}</blockquote>`;
        case "callout":
          return `<aside class="callout">${t}</aside>`;
        case "table":
          return `<div class="table-scroll" tabindex="0" aria-label="Tabela"><table>${String(
            b.text || "",
          )
            .split("\n")
            .map(
              (line, n) =>
                `<tr>${line
                  .split("|")
                  .map(
                    (c) => `<${n ? "td" : "th"}>${e(c)}</${n ? "td" : "th"}>`,
                  )
                  .join("")}</tr>`,
            )
            .join("")}</table></div>`;
        case "image":
          return /^[a-f0-9-]{36}$/.test(b.media || "")
            ? `<figure><img loading="lazy" width="1200" height="800" src="/blog/media/${e(b.media)}" alt="${e(b.alt)}"><figcaption>${e(b.caption)}</figcaption></figure>`
            : "";
        case "link":
        case "cta":
          return `<p class="${b.type === "cta" ? "callout" : ""}"><a ${b.type === "cta" ? "data-cta" : ""} href="${e(safeURL(b.url))}" rel="noopener noreferrer">${t}</a></p>`;
        default:
          return `<p>${t.replace(/\n/g, "<br>")}</p>`;
      }
    })
    .join("");
}
const categorySlug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const link = (p) => `/blog/${encodeURIComponent(p.document.slug)}`;
const card = (p) =>
  `<article class="article-card">${p.document.cover ? `<img loading="lazy" width="720" height="480" src="/blog/media/${e(p.document.cover)}" alt="">` : ""}<span class="eyebrow">${e(p.document.category)}</span><h2><a href="${link(p)}">${e(p.document.title)}</a></h2><p>${e(p.document.summary)}</p><span class="meta">${e(p.document.author)}</span></article>`;
function layout({
  title,
  description,
  canonical,
  body,
  noindex = false,
  jsonld,
  origin,
  cover,
}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · SYZIA Insights</title><meta name="description" content="${e(description)}"><meta name="robots" content="${noindex ? "noindex,follow" : "index,follow"}"><link rel="canonical" href="${e(canonical)}"><meta property="og:type" content="${jsonld ? "article" : "website"}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:image" content="${e(origin + (cover ? "/blog/media/" + cover : "/blog/assets/logo.png"))}"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/blog/assets/insights.css">${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}<script defer src="/blog/assets/client.js"></script></head><body><a class="skip" href="#conteudo">Ir para o conteúdo</a><header class="masthead"><a href="/blog" aria-label="SYZIA Insights — início"><img src="/blog/assets/logo.png" alt="SYZIA" width="174" height="66"><span>Insights</span></a><nav aria-label="Principal"><a href="/blog">Artigos</a><a href="/blog?kind=guide">Guias</a><a href="/blog?kind=material">Materiais</a><a href="/contato">Conheça a SYZIA</a></nav></header><main id="conteudo">${body}</main><footer><strong>SYZIA Insights</strong><p>Conhecimento para quem faz o negócio acontecer.</p><nav aria-label="Institucional"><a href="/">SYZIA</a><a href="/contato">Contato</a><a href="/termos">Termos de Uso</a><a href="/privacidade">Privacidade</a></nav><p class="meta">Curtidas usam um identificador deste navegador. Limpar os dados ou trocar de dispositivo pode permitir nova curtida. Métricas opcionais não identificam pessoas.</p></footer></body></html>`;
}
export function renderBlog({ catalog, url, origin }) {
  const posts = catalog.posts || [],
    path = url.pathname.replace(/\/$/, "");
  const categoryPath = path.startsWith("/blog/categoria/"),
    foundCategory = categoryPath
      ? [...new Set(posts.map((p) => p.document.category))].find(
          (c) => categorySlug(c) === path.slice(16),
        )
      : null;
  if (foundCategory) url.searchParams.set("category", foundCategory);
  let p = posts.find((x) => link(x) === path);
  if (path !== "/blog" && !p && !foundCategory) {
    const slug = decodeURIComponent(path.slice(6)),
      redirect = catalog.redirects?.[slug];
    if (redirect)
      return { status: 301, location: "/blog/" + encodeURIComponent(redirect) };
    return {
      status: 404,
      html: layout({
        title: "Artigo não encontrado",
        description: "Explore outros conteúdos da SYZIA Insights.",
        canonical: origin + path,
        origin,
        noindex: true,
        body: '<section class="hero"><h1>Este artigo não está disponível.</h1><p>Você pode explorar os conteúdos publicados.</p><a href="/blog">Ver artigos</a></section>',
      }),
    };
  }
  if (p) {
    const d = p.document,
      related = posts
        .filter((x) => x.id !== p.id && x.document.category === d.category)
        .slice(0, 3),
      canonical = origin + link(p),
      headings = d.blocks
        .map((b, i) => ({ ...b, index: i }))
        .filter((b) => b.type === "heading");
    const body = `<nav class="breadcrumbs" aria-label="Caminho"><a href="/blog">Insights</a> / <a href="/blog/categoria/${categorySlug(d.category)}">${e(d.category)}</a></nav><article class="reading" data-post="${e(p.id)}"><header><span class="eyebrow">${e(d.category)}</span><h1>${e(d.title)}</h1><p class="intro">${e(d.summary)}</p><p class="meta">${e(d.author)} · <time datetime="${e(p.published_at)}">${new Date(p.published_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time> · Atualizado em ${new Date(p.updated_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></header>${d.cover ? `<img class="cover" width="1200" height="800" src="/blog/media/${e(d.cover)}" alt="${e(p.cover_alt || d.title)}">` : ""}${d.toc && headings.length ? `<nav class="toc" aria-label="Neste artigo"><strong>Neste artigo</strong>${headings.map((b) => `<a href="#sec-${b.index}">${e(b.text)}</a>`).join("")}</nav>` : ""}${blocksHTML(d.blocks)}${d.tags?.length ? `<p class="meta">Assuntos: ${d.tags.map(e).join(" · ")}</p>` : ""}<div class="engagement"><button id="like" aria-pressed="false">Curtir <span id="like-count"></span></button><button id="share">Compartilhar</button><button id="copy-link">Copiar link</button><a data-share href="https://wa.me/?text=${encodeURIComponent(d.title + " " + canonical)}" rel="noopener noreferrer" target="_blank">WhatsApp</a><a data-share href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}" rel="noopener noreferrer" target="_blank">LinkedIn</a><a data-share href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}" rel="noopener noreferrer" target="_blank">Facebook</a></div><p role="status" id="feedback"></p><label class="metric-choice"><input id="measure" type="checkbox">Permitir métricas de leitura neste navegador (opcional)</label><aside class="callout"><h2>Organize a próxima etapa do atendimento</h2><p>Conheça como a SYZIA conecta apresentação de serviços e rotina de atendimento.</p><a href="/contato" data-cta>Conhecer a SYZIA</a></aside><details class="interest"><summary>Quero conversar sobre a SYZIA</summary><form id="interest-form"><label>Nome<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Segmento (opcional)<input name="segment" maxlength="120"></label><label>O que deseja organizar? (opcional)<textarea name="need" maxlength="1000"></textarea></label><input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><label><input name="consent" type="checkbox" required>Solicito contato sobre a SYZIA e autorizo o uso destes dados para responder ao meu interesse, conforme a <a href="/privacidade">Política de Privacidade</a>.</label><button>Solicitar contato</button></form></details></article>${related.length ? `<section class="related"><h2>Continue a leitura</h2><div class="cards">${related.map(card).join("")}</div></section>` : ""}`;
    const jsonld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: d.title,
          description: d.summary,
          datePublished: p.published_at,
          dateModified: p.updated_at,
          author: { "@type": "Organization", name: d.author },
          publisher: { "@type": "Organization", name: "SYZIA" },
          mainEntityOfPage: canonical,
          ...(d.cover ? { image: origin + "/blog/media/" + d.cover } : {}),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "SYZIA Insights",
              item: origin + "/blog",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: d.title,
              item: canonical,
            },
          ],
        },
      ],
    };
    return {
      status: 200,
      html: layout({
        title: d.seo_title || d.title,
        description: d.seo_description || d.summary,
        canonical,
        body,
        origin,
        jsonld,
        cover: d.cover,
      }),
    };
  }
  const q = (url.searchParams.get("q") || "").slice(0, 120),
    category = url.searchParams.get("category"),
    kind = url.searchParams.get("kind"),
    page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(url.searchParams.get("page")) || 1)),
    );
  const matching = posts
    .filter(
      (x) =>
        (!category || x.document.category === category) &&
        (!kind || x.document.kind === kind) &&
        (!q ||
          `${x.document.title} ${x.document.summary}`
            .toLocaleLowerCase("pt-BR")
            .includes(q.toLocaleLowerCase("pt-BR"))),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.document.featured)) -
          Number(Boolean(a.document.featured)) ||
        Date.parse(b.published_at) - Date.parse(a.published_at),
    );
  const popular = (catalog.popular || [])
    .map((id) => posts.find((p) => p.id === id))
    .filter(Boolean);
  const categories = [...new Set(posts.map((p) => p.document.category))],
    pager = (n) => {
      const u = new URL(url);
      u.searchParams.set("page", n);
      return u.pathname + u.search;
    };
  const section = q
      ? `Resultados para “${q}”`
      : category ||
        (kind === "guide"
          ? "Guias por profissão"
          : kind === "material"
            ? "Materiais úteis"
            : "Conhecimento para quem presta serviços"),
    canonical = new URL(
      category && categories.includes(category)
        ? "/blog/categoria/" + categorySlug(category)
        : "/blog",
      origin,
    );
  if (["guide", "material"].includes(kind))
    canonical.searchParams.set("kind", kind);
  if (q) canonical.searchParams.set("q", q);
  if (page > 1) canonical.searchParams.set("page", page);
  return {
    status: page > 1 && (page - 1) * 9 >= matching.length ? 404 : 200,
    html: layout({
      title: section + (page > 1 ? ` — página ${page}` : ""),
      description:
        q || category || kind
          ? `${section}. Conteúdos práticos da SYZIA Insights para prestadores de serviços.${page > 1 ? ` Página ${page}.` : ""}`
          : "Guias práticos sobre organização, atendimento e presença digital para prestadores de serviços.",
      canonical: canonical.href,
      origin,
      noindex: !!q,
      body: `<section class="hero"><span class="eyebrow">SYZIA INSIGHTS</span><h1>Conhecimento para quem faz o negócio acontecer.</h1><p>Ideias práticas para apresentar serviços, organizar a rotina e cuidar de cada atendimento.</p><form role="search" action="/blog"><label for="search">Encontre um assunto</label><div><input id="search" name="q" type="search" value="${e(q)}" maxlength="120"><button>Buscar</button></div></form></section><nav class="categories" aria-label="Categorias"><a href="/blog">Todos</a>${categories.map((c) => `<a href="/blog/categoria/${categorySlug(c)}">${e(c)}</a>`).join("")}</nav><section aria-label="Artigos"><div class="cards">${matching
        .slice((page - 1) * 9, page * 9)
        .map(card)
        .join(
          "",
        )}</div>${!matching.length ? '<p class="empty">Nenhum artigo publicado para esta seleção.</p>' : ""}</section>${!q && !category && page === 1 && popular.length ? `<section class="related"><h2>Mais lidos nos últimos 30 dias</h2><p class="meta">Com base nas leituras com medição autorizada.</p><ul>${popular.map((p) => `<li><a href="${link(p)}">${e(p.document.title)}</a></li>`).join("")}</ul></section>` : ""}<nav class="pagination" aria-label="Páginas">${page > 1 ? `<a href="${e(pager(page - 1))}">Anterior</a>` : ""}${matching.length > page * 9 ? `<a href="${e(pager(page + 1))}">Próxima</a>` : ""}</nav>`,
    }),
  };
}
