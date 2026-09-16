import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./AuthGate";
import { installFreshBrowserFavicon } from "./browserFavicon";
import { installMailFetchCache } from "./mailCache";
import "./styles.css";
import "./dark.css";
import "./ui-overrides.css";
import "./mobile-accounts.css";
import "./email-html.css";

installFreshBrowserFavicon();
installMailFetchCache();
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
);
