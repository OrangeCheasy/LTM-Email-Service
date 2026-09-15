import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./AuthGate";
import "./styles.css";
import "./dark.css";
import "./ui-overrides.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
);
