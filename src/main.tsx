import { platformBrand } from "./brand/platform";
import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./style.css";
import "./ui/design-system.css";
const Site = lazy(() =>
  import("./acquisition/PublicSite").then((m) => ({ default: m.PublicSite })),
);
const Plans = lazy(() =>
  import("./acquisition/PublicSite").then((m) => ({ default: m.PublicPlans })),
);
const Contact = lazy(() =>
  import("./acquisition/PublicSite").then((m) => ({ default: m.Contact })),
);
const Register = lazy(() =>
  import("./acquisition/SelfService").then((m) => ({ default: m.SelfService })),
);
const Foundation = lazy(() => import("./FoundationApp"));
const RecoveryRequest = lazy(() => import("./access/PasswordRecovery").then(m => ({ default: m.RequestPasswordRecovery })));
const RecoveryUpdate = lazy(() => import("./access/PasswordRecovery").then(m => ({ default: m.UpdatePassword })));
const PublicCompany = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.PublicCompany })),
);
const MyRequests = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.MyRequests })),
);
const Tracking = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.Tracking })),
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense
        fallback={
          <main className="app-loading" role="status">
            <img
              src={platformBrand.symbol}
              alt={platformBrand.name}
              width="48"
              height="48"
            />
            <h1>Preparando sua experiência</h1>
            <p>Carregando com segurança…</p>
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<Site />} />
          <Route path="/planos" element={<Plans />} />
          <Route path="/contato" element={<Contact />} />
          <Route path="/cadastrar" element={<Register />} />
          <Route path="/empresa/:slug" element={<PublicCompany />} />
          <Route path="/minhas-solicitacoes" element={<MyRequests />} />
          <Route path="/acompanhar/:code" element={<Tracking />} />
          <Route path="/recuperar-acesso" element={<RecoveryRequest />} />
          <Route path="/atualizar-senha" element={<RecoveryUpdate />} />
          <Route path="*" element={<Foundation />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
