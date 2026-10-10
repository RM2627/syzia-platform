// Optional Linux-container fallback when Playwright's browser download is unavailable.
// Decompresses the public npm Chromium binary without restoring archive ownership.
// This has no effect on application authentication or RLS.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
await mkdir(".browser-runtime", { recursive: true });
const temporary = `.browser-runtime/chromium-${process.pid}.tmp`;
try {
  await pipeline(
    createReadStream("node_modules/@sparticuz/chromium/bin/chromium.br"),
    createBrotliDecompress(),
    createWriteStream(temporary, { mode: 0o700 }),
  );
  await rename(temporary, ".browser-runtime/chromium");
} finally {
  await rm(temporary, { force: true });
}
console.log("Chromium prepared at .browser-runtime/chromium");
