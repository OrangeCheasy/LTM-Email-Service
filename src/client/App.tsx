import { useEffect, useState } from "react";

type HealthState = "checking" | "online" | "offline";

const folders = ["Inbox", "Starred", "Sent", "Drafts", "Archive", "Trash"];

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed");
        setHealth("online");
      })
      .catch(() => setHealth("offline"));
  }, []);

  return (
    <main className="mail-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">LM</span>
          <div>
            <strong>LTM Mail</strong>
            <small>Private webmail</small>
          </div>
        </div>

        <button className="compose-button" type="button" disabled>
          <span aria-hidden="true">＋</span> Compose
        </button>

        <nav aria-label="Mail folders">
          {folders.map((folder, index) => (
            <button className={index === 0 ? "folder active" : "folder"} key={folder} type="button">
              <span>{folder}</span>
              {folder === "Inbox" ? <span className="folder-count">0</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className={`status-dot ${health}`} />
          <span>{health === "checking" ? "Checking Worker" : health === "online" ? "Worker online" : "Worker unavailable"}</span>
        </div>
      </aside>

      <section className="mail-view">
        <header className="topbar">
          <div>
            <h1>Inbox</h1>
            <p>contact@liamthemo.com</p>
          </div>
          <div className="private-badge">Private</div>
        </header>

        <div className="toolbar">
          <button type="button" disabled>Refresh</button>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search mail" placeholder="Search mail" disabled />
          </label>
        </div>

        <div className="empty-state">
          <div className="mail-icon" aria-hidden="true">✉</div>
          <h2>Your private inbox is ready to connect.</h2>
          <p>
            The application shell is deployed from the LTM Email Service repository. Once the Cloudflare D1, R2,
            Email Routing, and Access configuration is completed, incoming mail will appear here.
          </p>
          <div className="setup-chip">v0.1 foundation</div>
        </div>
      </section>
    </main>
  );
}
