// Imports only drafts; never publishes. Uses the existing authenticated editorial RPC.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const drafts = JSON.parse(
  await readFile(
    new URL("../../content/insights/drafts-061.json", import.meta.url),
    "utf8",
  ),
);
if (!process.argv.includes("--import-drafts-confirmed"))
  console.log(
    JSON.stringify(
      {
        mode: "offline-dry-run",
        drafts: drafts.map((d) => d.slug),
        externalRequests: 0,
      },
      null,
      2,
    ),
  );
else {
  try {
    const c = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization:
              "Bearer " + process.env.INSIGHTS_EDITOR_SESSION_TOKEN,
          },
        },
      },
    );
    const call = async (a, d = {}) => {
      const { data, error } = await c.rpc("insights_editor", {
        p_action: a,
        p_data: d,
      });
      if (error) throw error;
      return data;
    };
    const existing = await call("list");
    let imported = 0;
    for (const d of drafts)
      if (!existing.posts.some((p) => p.draft.slug === d.slug)) {
        await call("create", { document: d });
        imported++;
      }
    console.log(JSON.stringify({ imported, published: 0 }));
  } catch {
    console.error("insights_import_failed");
    process.exitCode = 1;
  }
}
