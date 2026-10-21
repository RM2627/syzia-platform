import { createAttachmentHandler } from "../attachments.mjs";
import { safeDiagnostic } from "../diagnostics.mjs";
export function createDemoMediaHandler({
  store,
  controller,
  origins,
  resolvePublic,
  log = (record) => console.warn(JSON.stringify(record)),
}) {
  const limits = new Map();
  return async (req, res) => {
    const match =
      /^\/demonstration-media\/(media|company-media|attachments)\/([mf]_[a-f0-9]{24})$/.exec(
        req.url || "",
      );
    const fail = () => {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "demo_media_unavailable" }));
    };
    if (!match) return fail();
    const now = Date.now();
    for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
    const key = req.socket.remoteAddress || "unknown",
      v = limits.get(key) || { count: 0, until: now + 60000 };
    v.count++;
    limits.set(key, v);
    if (limits.size > 10000 || v.count > 90) {
      res.writeHead(429, { "Cache-Control": "no-store" });
      res.end();
      return;
    }

    let session, token, person;
    try {
      if (match[1] === "media" && req.method === "GET") {
        session = await store.publicMediaContext(match[2]);
        if (!session) return fail();
        const d = await resolvePublic(session.source_id);
        if (d.generation !== session.generation) return fail();
      } else if (req.method !== "OPTIONS") {
        const bearer = (req.headers.authorization || "").match(
          /^Bearer (.+)\.(company|consumer)$/,
        );
        if (!bearer) return fail();
        token = bearer[1];
        const operatorToken=(req.headers['x-commercial-authorization']||'').match(/^Bearer ([^\s]+)$/)?.[1];
        const { d } = await controller.demoDefinition(token,operatorToken);
        session = await store.mediaContext(token, d);
        person =
          bearer[2] === "company" ? session.manager_id : session.consumer_id;
      }
      const paths = new Set();
      const server = {
        rpc: async (name, args) => {
          try {
            const operation = name === "access_media" ? args.p_operation : name,
              body = name === "access_media" ? args.p_args : args;
            if (
              name === "access_media" &&
              (args.p_user !== person || body.p_user !== person)
            )
              throw Error("demo_scope_denied");
            const data = await store.mediaRPC(session, operation, body);
            if (data?.path) paths.add(data.path);
            return { data, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
        storage: {
          from: (bucket) => ({
            upload: async (path, bytes, options) => {
              try {
                if (!paths.has(path)) throw Error("demo_scope_denied");
                const item = await store.mediaObject(
                  bucket,
                  path,
                  bytes,
                  options.contentType,
                );
                if (!Buffer.from(item.bytes).equals(bytes))
                  return { error: { statusCode: 409 } };
                return { error: null };
              } catch (error) {
                return { error };
              }
            },
            download: async (path) => {
              try {
                if (!paths.has(path)) throw Error("demo_scope_denied");
                const item = await store.mediaObject(bucket, path);
                return {
                  data: new Blob([item.bytes], { type: item.mime }),
                  error: null,
                };
              } catch (error) {
                return { data: null, error };
              }
            },
          }),
        },
      };
      const verifier = {
        auth: {
          getUser: async () => ({
            data: { user: { id: person } },
            error: null,
          }),
        },
      };
      const handler = createAttachmentHandler({
        server,
        verifier,
        origin: session?.kind==='editor' || req.headers.origin===origins.appOrigin ? origins.appOrigin : origins.publicOrigin,
        log,
      });
      req.url = req.url.slice("/demonstration-media".length);
      if(req.method==='OPTIONS'&&req.headers.origin===origins.appOrigin) {
        res.writeHead(204,{'Access-Control-Allow-Origin':origins.appOrigin,'Access-Control-Allow-Headers':'Authorization,Content-Type,X-Download-Ticket,X-Commercial-Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Vary':'Origin'});res.end();return;
      }
      await handler(req, res);
    } catch (error) {
      log(safeDiagnostic(error, "demo_media_context", 403));
      fail();
    }
  };
}
