import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fixture } from "./fixture.mjs";
import { renderBlog, blocksHTML } from "../../server/insights/render.mjs";
export const doc = {
  title: "Uma agenda organizada para atender melhor",
  slug: "agenda-organizada",
  summary:
    "Veja como organizar a agenda e preparar os dados necessários para o atendimento.",
  category: "Gestão e rotina",
  author: "Equipe SYZIA",
  tags: ["Organização"],
  blocks: [
    { type: "heading", text: "Prepare a rotina" },
    {
      type: "paragraph",
      text: "Separe tempo de execução, deslocamento e revisão.",
    },
  ],
  cover: "",
  seo_title: "",
  seo_description: "",
  featured: false,
  kind: "article",
  toc: true,
};
test("061 Insights: real SQL editorial lifecycle, privacy and acquisition", async (t) => {
  const c = await fixture();
  const edit = (action, data = {}, who = "root") =>
    c.asUser(who, "insights_editor", { p_action: action, p_data: data });
  const pub = (action, data = {}) =>
    c.service("insights_service", { p_action: action, p_data: data });
  let p;
  const visitor = "a".repeat(64);
  try {
    await t.test(
      "ordinary tenant and anon denied; FORCE RLS; explicit editor grant",
      async () => {
        assert.equal((await edit("access", {}, "adminA")).allowed, false);
        await assert.rejects(edit("list", {}, "adminA"), /denied/);
        await assert.rejects(edit("list", {}, "anon"), /permission denied/);
        await assert.rejects(
          c.service("insights_editor", { p_action: "list", p_data: {} }),
          /permission denied/,
        );
        const rows = (
          await c.rawSQL(
            "select relrowsecurity,relforcerowsecurity,has_table_privilege('authenticated',oid,'SELECT') readable from pg_class where relnamespace='private'::regnamespace and relname like 'insights_%'",
          )
        ).rows;
        assert.ok(rows.filter((x) => x.relrowsecurity).length >= 10);
        assert.ok(
          rows
            .filter((x) => x.relrowsecurity)
            .every((x) => x.relforcerowsecurity && !x.readable),
        );
        await edit("grant", { user_id: c.users.adminB, enabled: true });
        assert.equal((await edit("access", {}, "adminB")).allowed, true);
        await edit("grant", { user_id: c.users.adminB, enabled: false });
      },
    );
    await t.test(
      "draft cannot be read publicly; required fields and XSS safe",
      async () => {
        await assert.rejects(
          edit("create", { document: { ...doc, title: null } }),
          /invalid/,
        );
        p = await edit("create", { document: doc });
        assert.equal((await pub("catalog")).posts.length, 0);
        const html = blocksHTML([
          { type: "paragraph", text: "<script>alert(1)</script>" },
          { type: "link", text: "open", url: "javascript:alert(1)" },
        ]);
        assert.ok(!html.includes("<script>"));
        assert.ok(!html.includes('href="javascript'));
      },
    );
    await t.test("publish, private changes, conflict and restore", async () => {
      p = await edit("publish", { id: p.id, revision: p.revision });
      p = await edit("save", {
        id: p.id,
        revision: p.revision,
        document: { ...doc, title: "Título alterado somente no rascunho" },
      });
      assert.equal((await pub("catalog")).posts[0].document.title, doc.title);
      await assert.rejects(
        edit("save", { id: p.id, revision: 1, document: doc }),
        /conflict/,
      );
      p = await edit("restore", {
        id: p.id,
        revision: p.revision,
        restore_revision: 1,
      });
      assert.equal(p.draft.title, doc.title);
    });
    await t.test(
      "concurrent revision attempts: exactly one winner",
      async () => {
        const result = await Promise.allSettled([
          edit("save", { id: p.id, revision: p.revision, document: doc }),
          edit("save", { id: p.id, revision: p.revision, document: doc }),
        ]);
        assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
        p = await edit("get", { id: p.id });
      },
    );
    await t.test(
      "slug redirects and indexable article HTML without JS",
      async () => {
        p = await edit("save", {
          id: p.id,
          revision: p.revision,
          document: { ...doc, slug: "agenda-nova" },
        });
        p = await edit("publish", { id: p.id, revision: p.revision });
        const catalog = await pub("catalog");
        assert.equal(
          renderBlog({
            catalog,
            url: new URL("https://usesyzia.com.br/blog/agenda-organizada"),
            origin: "https://usesyzia.com.br",
          }).status,
          301,
        );
        const page = renderBlog({
          catalog,
          url: new URL("https://usesyzia.com.br/blog/agenda-nova"),
          origin: "https://usesyzia.com.br",
        });
        assert.equal(page.status, 200);
        assert.match(page.html, /Separe tempo de execução/);
        assert.match(page.html, /application\/ld\+json/);
        assert.match(page.html, /rel="canonical"/);
        const category = renderBlog({
          catalog,
          origin: "https://usesyzia.com.br",
          url: new URL(
            "https://usesyzia.com.br/blog?category=" +
              encodeURIComponent(doc.category),
          ),
        });
        assert.ok(
          category.html.includes(
            `<title>${doc.category} · SYZIA Insights</title>`,
          ),
        );
        assert.match(
          category.html,
          /rel="canonical" href="https:\/\/usesyzia.com.br\/blog\/categoria\//,
        );
        const guide = renderBlog({
          catalog,
          origin: "https://usesyzia.com.br",
          url: new URL("https://usesyzia.com.br/blog?kind=guide"),
        });
        assert.match(
          guide.html,
          /<title>Guias por profissão · SYZIA Insights<\/title>/,
        );
        assert.match(
          guide.html,
          /rel="canonical" href="https:\/\/usesyzia.com.br\/blog\?kind=guide"/,
        );
      },
    );
    await t.test(
      "likes are persistent, unique and reversible; identities absent publicly",
      async () => {
        for (let i = 0; i < 3; i++)
          assert.equal(
            (await pub("like", { id: p.id, visitor, liked: true })).count,
            1,
          );
        assert.equal((await pub("likes", { id: p.id, visitor })).liked, true);
        assert.equal(
          (await pub("like", { id: p.id, visitor, liked: false })).count,
          0,
        );
        assert.ok(!JSON.stringify(await pub("catalog")).includes(visitor));
      },
    );
    await t.test(
      "repeat views deduped and leads reuse acquisition with actual consent",
      async () => {
        await pub("event", { id: p.id, visitor, event: "view" });
        await pub("event", { id: p.id, visitor, event: "view" });
        await assert.rejects(
          pub("lead", {
            id: p.id,
            visitor,
            key: randomUUID(),
            name: "Pessoa Exemplo",
            email: "pessoa@example.invalid",
          }),
          /invalid/,
        );
        for (let i = 0; i < 2; i++)
          await pub("lead", {
            id: p.id,
            visitor,
            key: randomUUID(),
            name: "Pessoa Exemplo",
            email: "pessoa@example.invalid",
            consent: true,
          });
        const stats = await edit("stats");
        assert.equal(Number(stats.rows[0].views), 1);
        assert.equal(Number(stats.rows[0].leads), 1);
        assert.equal(
          (
            await c.rawSQL(
              "select count(*)::int n from private.acquisition_leads where email='pessoa@example.invalid'",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "media references protect revisions and private media cannot be fetched publicly",
      async () => {
        const b = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#6850cf" },
        })
          .webp()
          .toBuffer();
        const m = await edit("media_add", {
          body: b.toString("base64"),
          alt: "Padrão de cor local",
          width: 8,
          height: 8,
        });
        assert.equal((await edit("media_list")).length, 1);
        await assert.rejects(pub("media", { id: m.id }), /not_found/);
        const draft = await edit("create", {
          document: { ...doc, slug: "imagem-privada", cover: m.id },
        });
        await assert.rejects(edit("media_delete", { id: m.id }), /in_use/);
        await edit("save", {
          id: draft.id,
          revision: draft.revision,
          document: { ...draft.draft, cover: "" },
        });
        await assert.rejects(edit("media_delete", { id: m.id }), /in_use/);
      },
    );
    await t.test(
      "status changes also reject stale revisions; scheduling failure backs off safely",
      async () => {
        let d = await edit("create", {
          document: { ...doc, slug: "status-atomico" },
        });
        const old = d.revision;
        d = await edit("publish", { id: d.id, revision: old });
        await assert.rejects(
          edit("archive", { id: d.id, revision: old }),
          /conflict/,
        );
        d = await edit("unpublish", { id: d.id, revision: d.revision });
        d = await edit("schedule", {
          id: d.id,
          revision: d.revision,
          at: new Date(Date.now() + 60000).toISOString(),
        });
        await c.rawSQL(
          "update private.insights_posts set scheduled_at=now()-interval '1 minute',scheduled_revision=0 where id=$1",
          [d.id],
        );
        assert.equal((await pub("tick")).failed, 1);
        assert.equal((await pub("tick")).failed, 0);
        const retry = await edit("get", { id: d.id });
        assert.equal(retry.schedule_attempts, 1);
        assert.equal(retry.published, null);
      },
    );
    await t.test(
      "scheduling is server-side, idempotent, fail-safe and private until due",
      async () => {
        let d = await edit("create", {
          document: { ...doc, slug: "publicacao-agendada" },
        });
        await edit("schedule", {
          id: d.id,
          revision: d.revision,
          at: new Date(Date.now() + 60000).toISOString(),
        });
        assert.equal((await pub("catalog")).posts.length, 1);
        await c.rawSQL(
          "update private.insights_posts set scheduled_at=now()-interval '1 minute'where id=$1",
          [d.id],
        );
        assert.equal((await pub("tick")).published, 1);
        assert.equal((await pub("tick")).published, 0);
        d = await edit("get", { id: d.id });
        await edit("unpublish", { id: d.id, revision: d.revision });
        assert.equal((await pub("catalog")).posts.length, 1);
      },
    );
  } finally {
    await c.db.close();
  }
});
