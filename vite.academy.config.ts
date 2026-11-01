import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    Object.keys(env).some((k) =>
      /SECRET|SERVICE_ROLE|DATABASE_URL|SMTP|PASSWORD/i.test(k),
    )
  )
    throw Error("Privileged configuration cannot use VITE_.");
  const api = env.VITE_ACADEMY_API_URL || "http://127.0.0.1:10000";
  const u = new URL(api);
  if (
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    !["https:", "http:"].includes(u.protocol)
  )
    throw Error("Invalid Academy API origin.");
  return {
    root: "academy",
    define: { "import.meta.env.VITE_ACADEMY_API_URL": JSON.stringify(api) },
    envDir: resolve("."),
    publicDir: "public",
    build: { outDir: "../dist-academy", emptyOutDir: true, sourcemap: false },
    server: { host: "127.0.0.1", port: 5175, fs: { allow: [resolve(".")] } },
    plugins: [
      {
        name: "academy-brand-and-headers",
        async closeBundle() {
          const out = resolve("dist-academy");
          await mkdir(out + "/brand/syzia", { recursive: true });
          for (const f of [
            "syzia-horizontal-light.png",
            "syzia-horizontal-dark.png",
          ])
            await copyFile(
              "public/brand/syzia/" + f,
              out + "/brand/syzia/" + f,
            );
          await writeFile(out + "/_redirects", "/* /index.html 200\n");
          await writeFile(
            out + "/_headers",
            `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' ${u.origin} blob:; connect-src 'self' ${u.origin} https://cloudflareinsights.com; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n`,
          );
        },
        configureServer(s) {
          s.middlewares.use("/brand", async (req, res, next) => {
            if (
              !/^\/syzia\/syzia-horizontal-(light|dark)\.png$/.test(
                req.url || "",
              )
            )
              return next();
            const { readFile } = await import("node:fs/promises");
            res.setHeader("Content-Type", "image/png");
            res.end(await readFile("public/brand" + req.url));
          });
        },
      },
    ],
  };
});
