export interface SessionInfo {
  id: number;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
}

type Props = {
  open: boolean;
  sessions: SessionInfo[] | null;
  busy: boolean;
  onClose: () => void;
  onResetSessions: () => void;
};

function formatDate(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Browser session";
  const value = userAgent.toLowerCase();

  if (value.includes("iphone")) return "iPhone browser";
  if (value.includes("ipad")) return "iPad browser";
  if (value.includes("android")) return "Android browser";
  if (value.includes("edg/")) return "Microsoft Edge";
  if (value.includes("firefox/")) return "Firefox";
  if (value.includes("chrome/")) return "Chrome";
  if (value.includes("safari/")) return "Safari";
  return "Browser session";
}

export function SessionListModal(props: Props) {
  if (!props.open) return null;

  const otherSessions = props.sessions?.filter((session) => !session.current).length ?? 0;

  return (
    <div
      className="sessions-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        className="sessions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sessions-title"
      >
        <header className="sessions-header">
          <div>
            <span>Security</span>
            <h2 id="sessions-title">Logged-in sessions</h2>
          </div>
          <button
            className="sessions-close"
            type="button"
            onClick={props.onClose}
            aria-label="Close sessions"
          >
            ×
          </button>
        </header>

        <p className="sessions-description">
          These are the active browser sessions for your mailbox. The current device is marked below.
        </p>

        <div className="sessions-list" aria-live="polite">
          {props.sessions === null ? (
            <p className="sessions-state">Loading sessions…</p>
          ) : props.sessions.length === 0 ? (
            <p className="sessions-state">No active sessions were found.</p>
          ) : (
            props.sessions.map((session) => (
              <article className="session-card" key={session.id}>
                <div className="session-card-heading">
                  <div>
                    <strong>{describeUserAgent(session.userAgent)}</strong>
                    <small>{session.current ? "Current device" : "Signed in"}</small>
                  </div>
                  {session.current ? <span className="session-current">Current</span> : null}
                </div>
                <dl className="session-details">
                  <div>
                    <dt>Last active</dt>
                    <dd>{formatDate(session.lastSeenAt)}</dd>
                  </div>
                  <div>
                    <dt>Signed in</dt>
                    <dd>{formatDate(session.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatDate(session.expiresAt)}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        <footer className="sessions-actions">
          <button type="button" onClick={props.onClose}>Done</button>
          <button
            className="sessions-danger"
            type="button"
            disabled={props.busy || otherSessions === 0}
            onClick={props.onResetSessions}
          >
            Reset other sessions
          </button>
        </footer>
      </section>
    </div>
  );
}
