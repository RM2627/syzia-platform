// LOCAL DISPOSABLE FIXTURE ONLY. No network mail, Auth, database or Storage provider.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { createAcademyHandler } from "../../server/academy/http.mjs";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const c = await fixture();
await c.enable();
const cover = await c.controller.admin(
  "upload",
  {
    name: "capa-local.png",
    kind: "image",
    base64: (
      await readFile("public/brand/syzia/syzia-horizontal-light.png")
    ).toString("base64"),
  },
  "root",
);
const txt = await c.controller.admin(
  "upload",
  {
    name: "guia-local.txt",
    kind: "material",
    base64: Buffer.from("Organize sua rotina.").toString("base64"),
  },
  "root",
);
const courses = await c.admin("courses");
let course = await c.admin("course_get", { id: courses[0].id });
course = await c.admin("course_save", {
  id: course.id,
  revision: course.revision,
  state: "preparing",
  document: {
    ...course.draft,
    cover: cover.id,
    modules: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Organização inicial",
        lessons: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            title: "Preparar a rotina",
            description: "Orientações locais para uma rotina organizada.",
            video_id: "abcdefghijk",
            published: true,
            materials: [txt.id],
          },
        ],
      },
    ],
  },
});
await c.admin("course_publish", {
  id: course.id,
  revision: course.revision,
  confirmed: true,
});
const controller = c.make({ now: () => Date.now() });
const port = Number(
  process.env.PORT ||
    (process.argv.includes("--port")
      ? process.argv[process.argv.indexOf("--port") + 1]
      : 5197),
);
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  define: { "import.meta.env.VITE_ACADEMY_API_URL": JSON.stringify("") },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts: ["127.0.0.1", "localhost"],
  },
  plugins: [
    {
      name: "academy-local-fixture",
      configureServer(v) {
        v.middlewares.use(async (req, res, next) => {
          try {
            if (req.url === "/academy-theme.js") {
              res.setHeader("Content-Type", "text/javascript");
              res.end(await readFile("academy/public/academy-theme.js"));
              return;
            }
            if (req.url === "/__course" && req.method === "POST") {
              await c.enable("course");
              res.end("ok");
              return;
            }
            if (req.url === "/__fixture") {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  sent: c.sent.map((x) => ({
                    kind: x.kind,
                    link: x.link,
                    preferences: x.preferences,
                  })),
                  students: await c.admin("students"),
                  overview: await c.admin("overview"),
                }),
              );
              return;
            }
            if (req.url.startsWith("/academy/")) {
              const origin = req.headers.origin || "http://127.0.0.1:" + port;
              req.headers.origin = origin;
              await createAcademyHandler({
                controller,
                origin,
                adminOrigin: origin,
                log: () => {},
              })(req, res);
              return;
            }
            if (
              req.method === "GET" &&
              req.headers.accept?.includes("text/html") &&
              !req.url.split("?")[0].includes(".")
            ) {
              const html = await v.transformIndexHtml(
                req.url,
                (await readFile("academy/index.html", "utf8"))
                  .replace("/src.tsx", "/tests/academy-066/harness.tsx")
                  .replace(
                    req.url.startsWith("/admin")
                      ? '<script src="/academy-theme.js"></script>'
                      : "__never__",
                    "",
                  )
                  .replace(
                    req.url.startsWith("/admin")
                      ? /<style>[\s\S]*?<\/style>/
                      : /__never__/,
                    "",
                  ),
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
              return;
            }
            next();
          } catch {
            res.statusCode = 500;
            res.end("local_fixture_unavailable");
          }
        });
      },
    },
  ],
});
await server.listen();
server.printUrls();
console.log("ACADEMY_LOCAL_FIXTURE_READY");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    await controller.close();
    await c.db.close();
    process.exit(0);
  });
