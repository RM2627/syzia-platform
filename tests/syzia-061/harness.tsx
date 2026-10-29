import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import { InsightsAdmin } from "../../src/insights/InsightsAdmin";
import { PublicCompany } from "../../src/consumer/Consumer";
import "../../src/style.css";
import "../../src/ui/design-system.css";
const quantity =
  new URLSearchParams(location.search).get("surface") === "quantity";
createRoot(document.getElementById("root")!).render(
  quantity ? (
    <MemoryRouter initialEntries={["/empresa/ms-auto-ficticia"]}>
      <Routes>
        <Route path="/empresa/:slug" element={<PublicCompany />} />
      </Routes>
    </MemoryRouter>
  ) : (
    <BrowserRouter>
      <main style={{ padding: 24 }}>
        <InsightsAdmin />
      </main>
    </BrowserRouter>
  ),
);
