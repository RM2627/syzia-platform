(() => {
  const article = document.querySelector("[data-post]");
  if (!article) return;
  const id = article.dataset.post,
    feedback = document.querySelector("#feedback");
  let liked = false,
    key = crypto.randomUUID(),
    started = Date.now();
  const say = (s) => {
    feedback.textContent = s;
  };
  const sessionHeader = () => {
    try {
      const key = document.querySelector(
        "meta[name=syzia-auth-storage-key]",
      )?.content;
      if (!key) return {};
      for (const storageKey of [key, "consumer-session-v1"]) {
        const session = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (
          session?.access_token &&
          !session.user?.is_anonymous &&
          session.expires_at * 1000 > Date.now()
        )
          return { Authorization: "Bearer " + session.access_token };
      }
      return {};
    } catch {
      return {};
    }
  };
  const request = async (action, data = {}) => {
    const r = await fetch("/blog/api/" + action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...sessionHeader() },
      body: JSON.stringify({ id, ...data }),
    });
    if (!r.ok) throw Error("Não foi possível concluir agora. Tente novamente.");
    return r.json();
  };
  const metrics = () => {
    try {
      return localStorage.getItem("syzia-insights-measure") === "yes";
    } catch {
      return false;
    }
  };
  const event = (type) => {
    if (metrics()) void request("event", { event: type }).catch(() => {});
  };
  const like = document.querySelector("#like");
  like.disabled = true;
  request("likes")
    .then((r) => {
      liked = r.liked;
      like.setAttribute("aria-pressed", String(liked));
      document.querySelector("#like-count").textContent = r.count;
    })
    .catch(() => {
      say("Não foi possível carregar as curtidas.");
    })
    .finally(() => {
      like.disabled = false;
    });
  like.onclick = async () => {
    like.disabled = true;
    try {
      const r = await request("like", { liked: !liked });
      liked = r.liked;
      like.setAttribute("aria-pressed", String(liked));
      document.querySelector("#like-count").textContent = r.count;
      say(liked ? "Curtida registrada." : "Curtida removida.");
    } catch (e) {
      say(e.message);
    } finally {
      like.disabled = false;
    }
  };
  const canonical = document.querySelector("link[rel=canonical]").href;
  document.querySelector("#copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(canonical);
      say("Link copiado.");
      event("share_intent");
    } catch {
      say("Copie o endereço desta página para compartilhar.");
    }
  };
  document.querySelector("#share").onclick = async () => {
    if (navigator.share) {
      try {
        event("share_intent");
        await navigator.share({ title: document.title, url: canonical });
      } catch {}
    } else document.querySelector("#copy-link").click();
  };
  document
    .querySelectorAll("[data-share]")
    .forEach((a) => a.addEventListener("click", () => event("share_intent")));
  document
    .querySelectorAll("[data-cta]")
    .forEach((a) => a.addEventListener("click", () => event("cta")));
  const measure = document.querySelector("#measure");
  measure.checked = metrics();
  measure.onchange = () => {
    try {
      localStorage.setItem(
        "syzia-insights-measure",
        measure.checked ? "yes" : "no",
      );
    } catch {}
    if (measure.checked) event("view");
  };
  if (metrics() && document.visibilityState === "visible") event("view");
  document.querySelector("#interest-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget,
      data = Object.fromEntries(new FormData(form));
    if (data.website) return;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const u = new URL(location.href),
        utm = {};
      for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
        const v = u.searchParams.get(k);
        if (v && /^[\w .-]{1,80}$/.test(v)) utm[k] = v;
      }
      await request("lead", {
        ...data,
        consent: data.consent === "on",
        key,
        elapsed: Date.now() - started,
        utm,
      });
      say(
        "Solicitação recebida. A equipe poderá responder pelo contato informado.",
      );
      form.reset();
    } catch (e) {
      say(e.message);
    } finally {
      button.disabled = false;
    }
  };
})();
