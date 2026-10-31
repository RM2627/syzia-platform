import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
export const acceptedId = "c890d935-2739-452b-b344-1c9d0d827d27";
export const env = {
  ACADEMY_MAIL_ENABLED: "true",
  ACCESS_MAIL_ENABLED: "true",
  ACADEMY_MAIL_TRANSPORT: "https_resend",
  ACADEMY_RESEND_API_KEY: "re_local_simulation_only",
  ACCESS_MAIL_FROM: "SYZIA <sender@example.invalid>",
};
export const messageValue = {
  kind: "confirm",
  email: "learner@example.invalid",
  delivery_id: "ba9cfeaa-8ef1-40c0-9fa3-14725ff2d777",
  link: "https://academy.example.invalid/confirmar#token=local-only",
  preferences: "https://academy.example.invalid/preferencias#token=local-only",
  contact: "privacy@example.invalid",
};
export function fakeHttps(plans = [{}]) {
  const calls = [];
  const request = (url, options, callback) => {
    const plan = plans[Math.min(calls.length, plans.length - 1)];
    const call = { url, options, writes: [], secure: false, destroyed: false };
    calls.push(call);
    const req = new EventEmitter();
    req.destroy = () => {
      call.destroyed = true;
    };
    req.end = (body) => {
      if (!call.secure) throw Error("HTTP body before secureConnect");
      call.writes.push(body);
      queueMicrotask(() => {
        if (plan.kind === "after_error") {
          req.emit(
            "error",
            Object.assign(Error("private error learner@example.invalid"), {
              code: plan.code || "ECONNRESET",
            }),
          );
          return;
        }
        if (plan.kind === "response_timeout") return;
        const content =
          plan.raw ?? JSON.stringify(plan.body ?? { id: acceptedId });
        const res = Readable.from([Buffer.from(content)]);
        res.statusCode = plan.status ?? 200;
        callback(res);
      });
    };
    queueMicrotask(() => {
      if (plan.kind === "before_error") {
        req.emit(
          "error",
          Object.assign(Error("private error"), { code: plan.code }),
        );
        return;
      }
      const socket = new EventEmitter();
      socket.authorized = plan.kind !== "tls_unauthorized";
      req.emit("socket", socket);
      if (plan.kind === "connection_timeout") return;
      call.secure = true;
      socket.emit("secureConnect");
    });
    return req;
  };
  return {
    request,
    calls,
    options: { request, connectionTimeoutMs: 20, responseTimeoutMs: 20 },
  };
}
