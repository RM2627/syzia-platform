// Readiness checks only local processes; never connects to Supabase or prints secrets.
import { readFile } from "node:fs/promises";
import { probeLocalGateway } from "./readiness.mjs";
const local = {};
for (const file of [".env", ".env.local", ".env.server"]) {
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m) local[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
const env = { ...local, ...process.env };
console.log("Homologação local: mantenha três terminais abertos.");
console.log("1. npm run dev — interface (normalmente 5173).");
console.log(
  "2. npm run platform:dev — acesso/provisionamento (normalmente 8788).",
);
console.log(
  "3. npm run attachments:dev — gateway privado de mídia (normalmente 8787).",
);
console.log("No Windows/PowerShell, use npm.cmd se necessário.");
for (const [service, key, origin] of [
  ["platform", "VITE_PLATFORM_API_URL", "PLATFORM_APP_ORIGIN"],
  ["media", "VITE_ATTACHMENT_GATEWAY_URL", "CONSUMER_ORIGIN"],
]) {
  const result = await probeLocalGateway(env[key], env[origin], service);
  console.log(JSON.stringify({ service, ...result }));
  if (result.result === "gateway_unreachable")
    console.log(
      service === "media"
        ? "Gateway de mídia indisponível. Inicie npm run attachments:dev e repita. Isto não comprova falha no Storage."
        : "API de acesso indisponível. Inicie npm run platform:dev e repita.",
    );
}
console.log(
  "Readiness confirma o processo local e a origem. Não valida Auth/Storage externos. SMTP é opcional; credenciais são entregues manualmente.",
);
