import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Studio } from "../../src/studio/Studio";
import "../../src/style.css";
import "../../src/ui/design-system.css";
const transport = async (path: string, body: any = {}) => {
  const r = await fetch("/__studio/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
};
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Studio transport={transport} />
  </BrowserRouter>,
);
