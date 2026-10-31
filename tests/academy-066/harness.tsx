import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink } from "react-router-dom";
import { Academy } from "../../src/academy/Academy";
import { AcademyAdmin } from "../../src/academy/AcademyAdmin";
import { Workspace, WorkspaceGroup } from "../../src/workspace/Workspace";
if (location.pathname.startsWith("/admin"))
  await Promise.all([
    import("../../src/style.css"),
    import("../../src/ui/design-system.css"),
  ]);
const call = async (action: string, data: Record<string, unknown> = {}) => {
  const r = await fetch("/academy/admin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer root",
    },
    body: JSON.stringify({ action, data }),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
};
createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/admin") ? (
    <BrowserRouter>
      <Workspace
        accountName="Operador local"
        role="Super Admin"
        globalNavigation={
          <WorkspaceGroup id="platform" label="Plataforma SYZIA">
            <NavLink to="/admin/academy">SYZIA Academy</NavLink>
          </WorkspaceGroup>
        }
        logout={() => {}}
      >
        <AcademyAdmin call={call} />
      </Workspace>
    </BrowserRouter>
  ) : (
    <Academy />
  ),
);
