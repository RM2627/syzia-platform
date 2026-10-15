import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { NotificationLink } from "../../src/operations/NotificationLink";
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <NotificationLink
      org="11111111-1111-4111-8111-111111111111"
      notification={{
        id: "22222222-2222-4222-8222-222222222222",
        href: "/destino",
        read: false,
      }}
    >
      Atualização fictícia
    </NotificationLink>
  </BrowserRouter>,
);
