import { fixture as original } from "../insights-065/fixture.mjs";
import { readFile } from "node:fs/promises";
import { academyController } from "../../server/academy/controller.mjs";
export async function fixture() {
  const c = await original();
  try {
    await c.db.exec(
      await readFile("supabase/migrations/202610310066_academy.sql", "utf8"),
    );
  } catch (e) {
    await c.db.close();
    throw e;
  }
  const sent = [],
    files = new Map(),
    service = (a, d = {}) =>
      c.service("academy_service", { p_action: a, p_data: d }),
    admin = (a, d = {}) =>
      c.asUser("root", "academy_admin", { p_action: a, p_data: d });
  let clock = Date.now();
  const storage = {
    put: async (p, b, m) => files.set(p, { b, m }),
    get: async (p) => {
      if (!files.has(p)) throw Error("not found");
      return files.get(p).b;
    },
    remove: async (p) => files.delete(p),
  };
  const make = (extra = {}) =>
    academyController({
      service,
      asUser: (user, a, d) =>
        c.asUser(user, "academy_admin", { p_action: a, p_data: d }),
      send: async (v) => sent.push(v),
      storage,
      origin: "http://127.0.0.1:5196",
      secret: "ab".repeat(32),
      mailEnabled: true,
      now: () => clock,
      ...extra,
    });
  const controller = make();
  const config = async () => {
    const r = await controller.publicAction("config");
    clock += 2100;
    return r;
  };
  const terms = "Condições educacionais fictícias para teste local. ".repeat(
      12,
    ),
    privacy =
      "Aviso de privacidade fictício para teste local e isolamento. ".repeat(
        12,
      );
  async function enable(mode = "waitlist") {
    const o = await admin("overview");
    await admin("settings", {
      revision: o.settings.revision,
      settings: {
        ...o.settings,
        mode,
        waitlist_enabled: true,
        contact_name: "Academy de desenvolvimento isolado",
        contact_email: "privacy@example.invalid",
        terms,
        privacy,
      },
      confirmed: true,
    });
  }
  async function subscribe(address = "learner@example.invalid", extra = {}) {
    const co = await config();
    return controller.publicAction(
      "subscribe",
      {
        name: "Marina Exemplo",
        email: address,
        segment: "Design",
        difficulty: "Organizar as solicitações recebidas.",
        consent: true,
        utm: { utm_source: "local" },
        challenge: co.challenge,
        notice_id: co.notice.id,
        ...extra,
      },
      "",
      "127.0.0.1",
    );
  }
  return {
    ...c,
    service,
    admin,
    controller,
    make,
    storage,
    sent,
    files,
    config,
    enable,
    subscribe,
    tick: (n) => (clock += n),
    rawToken: (v) => new URLSearchParams(new URL(v).hash.slice(1)).get("token"),
  };
}
