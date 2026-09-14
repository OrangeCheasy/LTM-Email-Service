import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./dark.css";
import "./mobile-notifications.css";
import "./mockup.css";
import "./phase1.css";
import "./mockup-alignment.css";
import "./logo-fix.css";
import "./profile-preview.css";
import "./profile-crop.css";
import "./mobile-mail-actions.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
