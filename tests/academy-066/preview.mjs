// LOCAL DISPOSABLE FIXTURE ONLY. No network mail, Auth, database or Storage provider.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { createAcademyHandler } from "../../server/academy/http.mjs";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const c = await fixture();
await c.enable();
const controller = c.make({ now: () => Date.now() });
const port = Number(
  process.env.PORT ||
    (process.argv.includes("--port")
      ? process.argv[process.argv.indexOf("--port") + 1]
      : 5196),
);
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  define: { "import.meta.env.VITE_ACADEMY_API_URL": JSON.stringify("") },
  server: { host: "0.0.0.0", port, strictPort: true, allowedHosts: true },
  plugins: [
    {
      name: "academy-local-fixture",
      configureServer(v) {
        v.middlewares.use(async (req, res, next) => {
          try {
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
                '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYZIA Academy — ambiente local</title></head><body><div id="root"></div><script type="module" src="/tests/academy-066/harness.tsx"></script></body></html>',
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
