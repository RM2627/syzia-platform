// Test-only process. No production IPC route or new production shutdown mechanism.
import { startUnified } from "../../server/unified.mjs";
let release;
const app = await startUnified({
  env: { PORT: "0", HOST: "127.0.0.1" },
  signals: false,
  log: () => {},
  runtime: {
    platform: {
      origin: "https://fixture.invalid",
      access: async () => {
        process.send({ event: "request" });
        await new Promise((r) => (release = r));
        return { ok: true };
      },
    },
    attachments: { origin: "https://fixture.invalid" },
    billing: { origin: "https://fixture.invalid" },
  },
});
process.send({ event: "ready", port: app.server.address().port });
process.on("message", async (message) => {
  if (message === "stop") {
    const stopped = app.stop();
    release();
    process.send({ event: "stopped", ...(await stopped) });
    process.disconnect();
  }
});
