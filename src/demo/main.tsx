import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { DemoApp } from "./DemoApp";
import "../style.css";
import "../ui/design-system.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<main role="status">Carregando demonstração…</main>}>
        <DemoApp />
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
