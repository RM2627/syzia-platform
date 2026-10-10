// Server-only entry point. Importing the handler in local tests never starts an external connection.
import { createAccessMailer } from "./access-mail.mjs";
import http from "node:http";
import { enterpriseAccess, safeAccessError } from "./enterprise-access.mjs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  deliverInvitation,
  safeDeliveryError,
  InvitationDeliveryError,
} from "./invitations.mjs";
export function createPlatformHandler({
  origin,
  deliver,
  access,
  log = (entry) => console.warn(JSON.stringify(entry)),
}) {
  return async (req, res) => {
    const requestId = randomUUID();
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      });
      res.end(JSON.stringify(data));
    };
    if (req.headers.origin !== origin) {
      send(403, { error: "origin_denied", request_id: requestId });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
    if (req.method === "GET" && req.url === "/health") {
      send(200, { ready: true, service: "platform" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (
      req.method !== "POST" ||
      !(access
        ? /^\/access\/(login|global-login|identity-login|contexts|context|signup|contact|selfservice-register|selfservice-payment|verify|activate|provision|person|resume|reset|resend|create-organization)$/.test(
            req.url,
          )
        : req.url === "/invitations/send")
    ) {
      send(404, { error: "not_found" });
      return;
    }
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) {
          send(413, { error: "payload_too_large" });
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        if (access)
          throw Object.assign(Error("access_invalid"), {
            code: "access_invalid",
          });
        throw new InvitationDeliveryError("invitation_invalid");
      }
      if (access) {
        const result = await access(req.url, body, {
          token: (req.headers.authorization || "").match(
            /^Bearer ([^\s]+)$/,
          )?.[1],
          ip: req.socket.remoteAddress || "unknown",
        });
        send(200, result);
        return;
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).join(",") !== "invitation_id"
      )
        throw new InvitationDeliveryError("invitation_invalid");
      const token = (req.headers.authorization || "").match(
        /^Bearer ([^\s]+)$/,
      )?.[1];
      await deliver({ token, invitationId: body.invitation_id });
      // No provider payload, action_link or token can leak through the HTTP adapter.
      send(200, { sent: true });
    } catch (error) {
      const safe = access ? safeAccessError(error) : safeDeliveryError(error);
      log({
        event: access
          ? "enterprise_access_failed"
          : "invitation_delivery_failed",
        request_id: requestId,
        code: safe.code,
        stage: safe.stage,
        category: safe.diagnostic?.category,
        status: safe.diagnostic?.status || safe.status,
        reason: safe.diagnostic?.reason,
      });
      send(safe.status, {
        error: safe.code,
        request_id: requestId,
        ...(access
          ? {
              stage: safe.stage,
              organization_id: safe.organization_id,
              account_id: safe.account_id,
            }
          : {}),
      });
    }
  };
}
export function createPlatformServer(options) { return http.createServer(createPlatformHandler(options)); }
export function platformRuntime(env = process.env) {

  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.PLATFORM_APP_ORIGIN
  )
    throw Error("Configure server-only environment before starting");
  const origin = new URL(env.PLATFORM_APP_ORIGIN).origin;
  // Explicit implicit flow for server-generated recovery: no server-held PKCE verifier needed by the recipient.
  const authOptions = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: "implicit",
  };
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: authOptions,
  });
  const rpcAsService = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const inspectInvitation = async (token, id) => {
    const scoped = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: authOptions,
        global: { headers: { Authorization: "Bearer " + token } },
      },
    );
    const { data, error } = await scoped
      .from("organization_invitations")
      .select("state,expires_at,delivery_attempts")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  const asUser = async (token, name, args) => {
    const scoped = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: authOptions,
        global: { headers: { Authorization: "Bearer " + token } },
      },
    );
    const { data, error } = await scoped.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const access = enterpriseAccess({
    service: rpcAsService,
    sendInstructions: createAccessMailer(env),
    asUser,
    auth: client.auth,
    signIn: (credentials) =>
      createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: authOptions,
      }).auth.signInWithPassword(credentials),
    signUp: (credentials) =>
      createClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: authOptions },
      ).auth.signUp({
        ...credentials,
        options: {
          ...credentials.options,
          emailRedirectTo: origin + "/cadastrar",
        },
      }),
  });
  return {
    origin,
    access,
    deliver: ({ token, invitationId }) =>
      deliverInvitation({
        token,
        invitationId,
        auth: client.auth,
        rpcAsService,
        inspectInvitation,
        appOrigin: env.PLATFORM_APP_ORIGIN,
      }),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  createPlatformServer(platformRuntime(env)).listen(Number(env.PLATFORM_API_PORT || 8788), "127.0.0.1", () =>
    console.log("Platform API ready on loopback; no public deployment"),
  );
}
