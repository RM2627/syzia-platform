import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import http from "node:http";
import { fixture } from "./fixture.mjs";
import { createAcademyHandler } from "../../server/academy/http.mjs";
import { academyRuntime } from "../../server/academy/runtime.mjs";
import {
  cryptoBox,
  signup,
  youtube,
  csv,
  hash,
} from "../../server/academy/validation.mjs";
import { message } from "../../server/academy/mail.mjs";
test("Academy 066 — validation and private token primitives", () => {
  assert.throws(() => signup({ name: "x", email: "bad" }));
  assert.throws(() =>
    signup({
      name: "Marina",
      email: "m@example.invalid",
      segment: "Design",
      difficulty: "Rotina",
      consent: false,
    }),
  );
  assert.equal(youtube("https://youtu.be/abcdefghijk"), "abcdefghijk");
  for (const u of [
    "https://youtube.com.evil.invalid/watch?v=abcdefghijk",
    "javascript:alert(1)",
    "http://youtube.com/watch?v=abcdefghijk",
  ])
    assert.throws(() => youtube(u));
  const box = cryptoBox("ab".repeat(32)),
    secret = { email: "x@example.invalid", token: "sensitive" };
  assert.deepEqual(box.open(box.seal(secret)), secret);
  assert.ok(!box.seal(secret).includes(secret.email));
  assert.throws(() => box.open("bad"));
  const ch = box.challenge(10000);
  assert.equal(box.verify(ch, 10001), false);
  assert.equal(box.verify(ch, 13000), true);
  assert.equal(box.verify(ch + "x", 13000), false);
  assert.match(csv([{ name: "=cmd", email: "x@example.invalid" }]), /'=cmd/);
  const m = message({
    kind: "launch",
    subject: "Aviso <unsafe>",
    body: "Texto",
    email: "x@example.invalid",
    link: "https://academy.example.invalid/aulas",
    preferences: "https://academy.example.invalid/preferencias",
    contact: "help@example.invalid",
  });
  assert.ok(m.html.includes("&lt;unsafe&gt;"));
  assert.ok(!m.html.includes("<unsafe>"));
  assert.equal(academyRuntime({ ACADEMY_ENABLED: "false" }), null);
});
test("Academy 066 — actual SQL/RLS + controller, isolated fake SMTP/storage", async (t) => {
  const c = await fixture();
  let session, first, lessonId, courseId, materialId;
  try {
    await t.test(
      "Permissions: no direct data/privileged function grants; ordinary company users denied",
      async () => {
        for (const who of ["anon", "adminA", "adminB"])
          await assert.rejects(
            c.asUser(who, "academy_admin", { p_action: "courses", p_data: {} }),
          );
        await assert.rejects(
          c.asUser("adminA", "academy_service", {
            p_action: "config",
            p_data: {},
          }),
        );
        assert.equal((await c.admin("access")).allowed, true);
        const r = await c.rawSQL(
          "select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='academy'::regnamespace and relkind='r'",
        );
        assert.ok(
          r.rows.length >= 12 &&
            r.rows.every((x) => x.relrowsecurity && x.relforcerowsecurity),
        );
        const grants = await c.rawSQL(
          "select has_schema_privilege('anon','academy','usage') a,has_function_privilege('authenticated','public.academy_service(text,jsonb)','execute') b,has_function_privilege('service_role','public.academy_admin(text,jsonb)','execute') c",
        );
        assert.deepEqual(grants.rows[0], { a: false, b: false, c: false });
      },
    );
    await t.test(
      "Closed by default; legal data, explicit settings confirmation and revision required",
      async () => {
        assert.equal((await c.config()).waitlist_enabled, false);
        await assert.rejects(c.subscribe());
        const o = await c.admin("overview");
        await assert.rejects(
          c.admin("settings", {
            revision: o.settings.revision,
            settings: { ...o.settings, waitlist_enabled: true },
            confirmed: true,
          }),
        );
        await c.enable();
        await assert.rejects(
          c.admin("settings", {
            revision: o.settings.revision,
            settings: o.settings,
            confirmed: true,
          }),
          /revision/,
        );
        assert.equal((await c.config()).courses.length, 0);
      },
    );
    await t.test(
      "Valid/invalid registration, generic duplicate response, no automatic marketing consent",
      async () => {
        await assert.rejects(c.subscribe("bad-email"), /invalid/);
        await assert.rejects(
          c.subscribe("not-consented@example.invalid", { consent: false }),
          /consent/,
        );
        first = await c.subscribe();
        assert.equal(first.accepted, true);
        const dup = await c.subscribe();
        assert.deepEqual(dup, first);
        const rows = await c.admin("students");
        assert.equal(rows.length, 1);
        assert.equal(rows[0].status, "pending");
        assert.equal(rows[0].notifications, false);
        assert.equal(c.sent.length, 0);
        await c.controller.drain();
        assert.equal(c.sent.length, 1);
        assert.equal(c.sent[0].kind, "confirm");
      },
    );
    await t.test(
      "Email verification is single-use; database stores hashes; waitlist blocks classroom",
      async () => {
        const raw = c.rawToken(c.sent[0].link);
        assert.ok(raw);
        const r = await c.controller.publicAction(
          "consume",
          { token: raw },
          "",
          "127.0.0.1",
        );
        session = r.session;
        await assert.rejects(
          c.controller.publicAction("consume", { token: raw }, "", "127.0.0.1"),
          /link_invalid/,
        );
        await assert.rejects(
          c.controller.publicAction("student", {}, session),
          /closed/,
        );
        const rows = await c.admin("students");
        assert.equal(rows[0].notifications, true);
        assert.equal(rows[0].status, "confirmed");
        const db = await c.rawSQL("select hash from academy.tokens");
        assert.ok(!JSON.stringify(db.rows).includes(raw));
        const rawDump = await c.rawSQL(
          "select payload from academy.deliveries",
        );
        assert.ok(rawDump.rows.every((r) => r.payload === null));
      },
    );
    await t.test(
      "Spam protection: honeypot, minimum challenge time, replay and email limits",
      async () => {
        const config = await c.controller.publicAction("config");
        await assert.rejects(
          c.controller.publicAction(
            "subscribe",
            { challenge: config.challenge },
            "",
            "other",
          ),
          /challenge/,
        );
        const h = await c.subscribe("robot@example.invalid", {
          website: "spam",
        });
        assert.deepEqual(h, first);
        const cfg = await c.config(),
          data = {
            name: "Marina",
            email: "second@example.invalid",
            segment: "Design",
            difficulty: "Organizar a rotina",
            consent: true,
            notice_id: cfg.notice.id,
            challenge: cfg.challenge,
          };
        await c.controller.publicAction("subscribe", data, "", "new");
        await assert.rejects(
          c.controller.publicAction("subscribe", data, "", "new"),
          /rate_limited/,
        );
        assert.equal((await c.admin("students")).length, 2);
      },
    );
    await t.test(
      "Material validation: actual image/PDF/text, executable and active PDF blocked",
      async () => {
        const bytes = await sharp({
          create: { width: 20, height: 20, channels: 3, background: "#6240dd" },
        })
          .png()
          .toBuffer();
        const img = await c.controller.admin(
          "upload",
          {
            name: "cover.png",
            kind: "image",
            base64: bytes.toString("base64"),
          },
          "root",
        );
        const txt = await c.controller.admin(
          "upload",
          {
            name: "checklist.txt",
            kind: "material",
            base64: Buffer.from("Revisar serviços e horários.").toString(
              "base64",
            ),
          },
          "root",
        );
        materialId = txt.id;
        const pdf = await PDFDocument.create();
        pdf.addPage();
        await c.controller.admin(
          "upload",
          {
            name: "guia.pdf",
            kind: "material",
            base64: Buffer.from(await pdf.save()).toString("base64"),
          },
          "root",
        );
        pdf.catalog.set(PDFName.of("OpenAction"), PDFString.of("danger"));
        await assert.rejects(
          c.controller.admin(
            "upload",
            {
              name: "ativo.pdf",
              kind: "material",
              base64: Buffer.from(await pdf.save()).toString("base64"),
            },
            "root",
          ),
          /material_invalid/,
        );
        await assert.rejects(
          c.controller.admin(
            "upload",
            {
              name: "programa.exe",
              kind: "material",
              base64: Buffer.from("MZcode").toString("base64"),
            },
            "root",
          ),
        );
        await assert.rejects(
          c.controller.admin(
            "upload",
            {
              name: "data.csv",
              kind: "material",
              base64: Buffer.from("name,=cmd\n").toString("base64"),
            },
            "root",
          ),
        );
        await assert.rejects(
          c.controller.admin(
            "upload",
            { name: "a.txt", kind: "material", base64: "YQ==" },
            "adminA",
          ),
        );
        await assert.rejects(
          c.controller.file(materialId, { session }),
          /closed/,
        );
        const all = await c.admin("courses");
        courseId = all[0].id;
        let course = await c.admin("course_get", { id: courseId });
        lessonId = randomUUID();
        course = await c.admin("course_save", {
          id: courseId,
          revision: course.revision,
          state: "preparing",
          document: {
            ...course.draft,
            cover: img.id,
            modules: [
              {
                id: randomUUID(),
                title: "Organização inicial",
                lessons: [
                  {
                    id: lessonId,
                    title: "Preparar a rotina",
                    description:
                      "Orientações reais de exemplo para o teste local.",
                    video_id: "abcdefghijk",
                    published: false,
                    materials: [materialId],
                  },
                ],
              },
            ],
          },
        });
        assert.equal(course.state, "preparing");
      },
    );
    await t.test(
      "Course CRUD, publication, immutable snapshots, individual visibility and independent launch",
      async () => {
        let course = await c.admin("course_get", { id: courseId });
        await assert.rejects(
          c.admin("course_publish", {
            id: courseId,
            revision: course.revision,
            confirmed: true,
          }),
          /incomplete/,
        );
        course = await c.admin("lesson_visibility", {
          id: courseId,
          revision: course.revision,
          lesson_id: lessonId,
          published: true,
          confirmed: true,
        });
        course = await c.admin("course_publish", {
          id: courseId,
          revision: course.revision,
          confirmed: true,
        });
        assert.equal(course.state, "published");
        assert.equal((await c.config()).courses.length, 0);
        await c.enable("course");
        assert.equal((await c.config()).courses.length, 1);
        const student = await c.controller.publicAction("student", {}, session);
        assert.equal(
          student.courses[0].document.modules[0].lessons[0].id,
          lessonId,
        );
        assert.equal(student.materials.length, 1);
        assert.equal(
          (await c.controller.file(materialId, { session })).bytes.toString(),
          "Revisar serviços e horários.",
        );
        await assert.rejects(
          c.rawSQL("update academy.versions set revision=99"),
          /immutable/,
        );
        await assert.rejects(
          c.admin("course_save", {
            id: courseId,
            revision: 1,
            state: "preparing",
            document: course.draft,
          }),
          /revision/,
        );
        const copy = await c.admin("course_duplicate", {
          id: courseId,
          revision: course.revision,
        });
        assert.notEqual(copy.draft.modules[0].lessons[0].id, lessonId);
        assert.equal(copy.state, "draft");
        assert.equal(copy.published, null);
        await c.admin("course_archive", {
          id: copy.id,
          revision: copy.revision,
        });
        await assert.rejects(
          c.admin("course_archive", {
            id: courseId,
            revision: course.revision,
          }),
          /return_waitlist/,
        );
      },
    );
    await t.test(
      "Saved draft never leaks; hidden lesson and unreferenced material remain inaccessible",
      async () => {
        let course = await c.admin("course_get", { id: courseId });
        const secondId = randomUUID();
        course.draft.title = "Título interno ainda não publicado";
        course.draft.modules[0].lessons.push({
          id: secondId,
          title: "Aula confidencial em rascunho",
          description: "Conteúdo futuro.",
          video_id: "abcdefghijk",
          published: false,
          materials: [],
        });
        course = await c.admin("course_save", {
          id: courseId,
          revision: course.revision,
          state: "preparing",
          document: course.draft,
        });
        assert.notEqual(
          (await c.config()).courses[0].title,
          course.draft.title,
        );
        assert.equal(
          (await c.controller.publicAction("student", {}, session)).courses[0]
            .document.modules[0].lessons.length,
          1,
        );
        await assert.rejects(
          c.controller.publicAction(
            "progress",
            { course_id: courseId, lesson_id: secondId, completed: true },
            session,
          ),
        );
        course = await c.admin("lesson_visibility", {
          id: courseId,
          revision: course.revision,
          lesson_id: secondId,
          published: true,
          confirmed: true,
        });
        assert.equal(
          (await c.controller.publicAction("student", {}, session)).courses[0]
            .document.modules[0].lessons.length,
          2,
        );
        course = await c.admin("lesson_visibility", {
          id: courseId,
          revision: course.revision,
          lesson_id: secondId,
          published: false,
          confirmed: true,
        });
        assert.equal(
          (await c.controller.publicAction("student", {}, session)).courses[0]
            .document.modules[0].lessons.length,
          1,
        );
        await assert.rejects(
          c.controller.publicAction("student", {}, "x".repeat(43)),
        );
        await c.controller.publicAction(
          "progress",
          { course_id: courseId, lesson_id: lessonId, completed: true },
          session,
        );
        assert.equal(
          (await c.controller.publicAction("student", {}, session)).progress[0]
            .completed,
          true,
        );
        await assert.rejects(
          c.controller.publicAction(
            "progress",
            { course_id: randomUUID(), lesson_id: lessonId, completed: true },
            session,
          ),
        );
      },
    );
    await t.test(
      "Launch: preview does not send, explicit confirmation, duplicate prevention and accurate delivery states",
      async () => {
        const before = c.sent.length,
          p = await c.controller.admin("launch_preview", {}, "root");
        assert.equal(p.count, 1);
        assert.equal(c.sent.length, before);
        await assert.rejects(
          c.controller.admin("launch_confirm", { id: p.id }, "root"),
          /confirmation/,
        );
        await Promise.all([
          c.controller.admin(
            "launch_confirm",
            { id: p.id, confirmed: true },
            "root",
          ),
          c.controller.admin(
            "launch_confirm",
            { id: p.id, confirmed: true },
            "root",
          ),
        ]);
        await c.controller.drain(p.id);
        assert.equal(c.sent.filter((x) => x.kind === "launch").length, 1);
        assert.equal(
          (await c.controller.admin("launch_preview", {}, "root")).count,
          0,
        );
        assert.equal(
          (await c.admin("students")).find(
            (x) => x.email === "learner@example.invalid",
          ).status,
          "invited",
        );
      },
    );
    await t.test(
      "Unsubscribe, private preferences and deletion, without cross-student access",
      async () => {
        const pref = c.rawToken(
          c.sent.find((x) => x.kind === "launch").preferences,
        );
        assert.equal(
          (await c.controller.publicAction("preferences", { token: pref }))
            .notifications,
          true,
        );
        await c.controller.publicAction("unsubscribe", {
          token: pref,
          confirmed: true,
        });
        assert.equal(
          (await c.admin("students")).find(
            (x) => x.email === "learner@example.invalid",
          ).notifications,
          false,
        );
        await assert.rejects(
          c.controller.publicAction("unsubscribe", {
            token: "bad",
            confirmed: true,
          }),
        );
        await assert.rejects(
          c.controller.publicAction("delete_student", {
            token: pref,
            confirmed: false,
          }),
          /confirmation/,
        );
        await c.controller.publicAction("delete_student", {
          token: pref,
          confirmed: true,
        });
        assert.equal((await c.admin("students")).length, 1);
        await assert.rejects(c.controller.publicAction("student", {}, session));
        assert.equal(
          (await c.rawSQL("select count(*) n from academy.progress")).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "Failed/uncertain SMTP, expiration, no retry after ambiguity, quotas",
      async () => {
        await c.controller.drain();
        const raw = c.rawToken(
          c.sent.find((x) => x.email === "second@example.invalid").link,
        );
        await c.rawSQL(
          "update academy.tokens set expires_at=now()-interval '1 hour'where hash=$1",
          [hash(raw)],
        );
        await assert.rejects(
          c.controller.publicAction("consume", { token: raw }, "", "x"),
          /link_invalid/,
        );
        await c.subscribe("timeout@example.invalid");
        const failing = c.make({
          send: async () => {
            throw Object.assign(Error("sensitive provider body"), {
              code: "ETIMEDOUT",
            });
          },
        });
        await failing.drain();
        assert.ok(
          (await c.admin("overview")).deliveries.some(
            (d) => d.status === "uncertain",
          ),
        );
        let calls = 0;
        await c
          .make({
            send: async () => {
              calls++;
            },
          })
          .drain();
        assert.equal(calls, 0);
        await c.subscribe("quota@example.invalid");
        await c.make({ dailyLimit: 1 }).drain();
        assert.ok(
          (await c.admin("overview")).deliveries.some(
            (d) => d.status === "pending",
          ),
        );
      },
    );
    await t.test(
      "HTTP: exact CORS, cookie protection, method/body limits, sanitization",
      async () => {
        const logs = [],
          handler = createAcademyHandler({
            controller: c.controller,
            origin: "http://academy.invalid",
            adminOrigin: "http://admin.invalid",
            production: true,
            log: (r) => logs.push(r),
          });
        const server = http.createServer(handler);
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const root = "http://127.0.0.1:" + server.address().port + "/academy/";
        try {
          assert.equal(
            (
              await fetch(root + "config", {
                headers: { origin: "http://evil.invalid" },
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await fetch(root + "config", {
                headers: { origin: "http://academy.invalid" },
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await fetch(root + "admin", {
                method: "POST",
                headers: {
                  origin: "http://academy.invalid",
                  "content-type": "application/json",
                },
                body: "{}",
              })
            ).status,
            403,
          );
          const r = await fetch(root + "admin", {
            method: "POST",
            headers: {
              origin: "http://admin.invalid",
              "content-type": "application/json",
              authorization: "Bearer adminA",
            },
            body: JSON.stringify({ action: "students" }),
          });
          assert.equal(r.status, 403);
          await c.subscribe("cookie@example.invalid");
          await c.controller.drain();
          const mail = c.sent.find((x) => x.email === "cookie@example.invalid");
          const login = await fetch(root + "consume", {
            method: "POST",
            headers: {
              origin: "http://academy.invalid",
              "content-type": "application/json",
            },
            body: JSON.stringify({ token: c.rawToken(mail.link) }),
          });
          assert.equal(login.status, 200);
          assert.match(
            login.headers.get("set-cookie"),
            /^__Host-syzia-academy=.*HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/,
          );
          assert.equal((await login.json()).session, undefined);
          const bad = await fetch(root + "subscribe", {
            method: "POST",
            headers: {
              origin: "http://academy.invalid",
              "content-type": "application/json",
            },
            body: "{",
          });
          assert.equal(bad.status, 400);
          const tooLarge = await fetch(root + "subscribe", {
            method: "POST",
            headers: {
              origin: "http://academy.invalid",
              "content-type": "application/json",
            },
            body: JSON.stringify({ value: "a".repeat(13000) }),
          });
          assert.equal(tooLarge.status, 413);
          assert.ok(!JSON.stringify(logs).includes("Bearer"));
          assert.ok(!JSON.stringify(logs).includes("@"));
        } finally {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
        }
      },
    );
    await t.test(
      "Retention deletes only expired Academy data, preserves immutable notices and operational tenants",
      async () => {
        const before = (
          await c.rawSQL("select count(*)n from public.organizations")
        ).rows[0].n;
        await c.rawSQL(
          "update academy.students set last_activity=now()-interval '400 days'",
        );
        const r = await c.admin("cleanup");
        assert.ok(r.removed >= 1);
        assert.equal((await c.admin("students")).length, 0);
        assert.ok(
          (await c.rawSQL("select count(*)n from academy.notices")).rows[0].n >=
            1,
        );
        assert.equal(
          (await c.rawSQL("select count(*)n from public.organizations")).rows[0]
            .n,
          before,
        );
      },
    );
  } finally {
    await c.controller.close();
    await c.db.close();
  }
});
