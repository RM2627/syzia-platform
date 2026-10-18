import { PGlite } from "../support/pglite.mjs";
import { bootstrapDemo } from "../../scripts/commercial/bootstrap-demo.mjs";
import { createDemoStore } from "../../server/commercial/demo-store.mjs";
export async function demoFixture() {
  if (process.env.SYZIA_COMMERCIAL_NATIVE_SOCKET) {
    const { default: pg } = await import("pg");
    const options = {
      host: process.env.SYZIA_COMMERCIAL_NATIVE_SOCKET,
      user: "postgres",
      database: "syzia_commercial_isolated",
    };
    if (!options.host.includes("syzia-commercial-pg-"))
      throw Error("isolated_native_socket_required");
    const client = new pg.Client(options);
    await client.connect();
    const db = {
      query: (...a) => client.query(...a),
      exec: (s) => client.query(s),
    };
    await bootstrapDemo(db);
    const pool = new pg.Pool({ ...options, max: 4 });
    const store = createDemoStore(pool),
      close = store.close;
    store.close = async () => {
      await close();
      await client.end();
    };
    return { db, store, pool };
  }
  const db = new PGlite();
  await bootstrapDemo(db);
  let tail = Promise.resolve();
  const pool = {
    async connect() {
      let release;
      const previous = tail;
      tail = new Promise((r) => (release = r));
      await previous;
      return { query: (...a) => db.query(...a), release };
    },
    end: () => db.close(),
  };
  return { db, store: createDemoStore(pool), pool };
}
