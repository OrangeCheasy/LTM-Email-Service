import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState, type ReactNode } from "react";

interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  setupAvailable: boolean;
}

interface OptionsEnvelope<T> {
  challengeId: string;
  options: T;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function friendlyAuthError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey sign-in was cancelled or timed out.";
  }
  if (error instanceof Error) return error.message;
  return "Authentication failed. Please try again.";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await apiJson<AuthStatus>("/api/auth/status", { method: "GET" });
      setStatus(next);
      setError("");
    } catch (caught) {
      setError(friendlyAuthError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const envelope = await apiJson<OptionsEnvelope<Parameters<typeof startAuthentication>[0]["optionsJSON"]>>(
        "/api/auth/login/options",
        { method: "POST", body: "{}" },
      );
      const response = await startAuthentication({ optionsJSON: envelope.options });
      await apiJson<{ ok: true }>("/api/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: envelope.challengeId, response }),
      });
      await refresh();
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function setUpPasskey() {
    if (!setupToken.trim()) {
      setError("Enter the one-time setup secret first.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const envelope = await apiJson<OptionsEnvelope<Parameters<typeof startRegistration>[0]["optionsJSON"]>>(
        "/api/auth/register/options",
        {
          method: "POST",
          body: JSON.stringify({ setupToken }),
        },
      );
      const response = await startRegistration({ optionsJSON: envelope.options });
      await apiJson<{ ok: true }>("/api/auth/register/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: envelope.challengeId, response, setupToken }),
      });
      setSetupToken("");
      await refresh();
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (status?.authenticated) return <>{children}</>;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-live="polite">
        <img className="auth-logo" src="/apple-touch-icon.png" alt="" width="72" height="72" />
        <div className="auth-heading">
          <p className="auth-eyebrow">Private webmail</p>
          <h1>LTM Mails</h1>
          <p>Sign in securely to access contact@liamthemo.com.</p>
        </div>

        {!status ? (
          <div className="auth-state">Checking session…</div>
        ) : status.configured ? (
          <button className="auth-primary" type="button" onClick={() => void signIn()} disabled={busy}>
            {busy ? "Signing in…" : "Sign in with passkey"}
          </button>
        ) : status.setupAvailable ? (
          <div className="auth-setup">
            <label htmlFor="setup-token">One-time setup secret</label>
            <input
              id="setup-token"
              type="password"
              autoComplete="off"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              placeholder="Enter setup secret"
              disabled={busy}
            />
            <button className="auth-primary" type="button" onClick={() => void setUpPasskey()} disabled={busy}>
              {busy ? "Creating passkey…" : "Create my passkey"}
            </button>
            <p className="auth-note">This setup secret stops anyone else from claiming the mailbox before your first passkey exists.</p>
          </div>
        ) : (
          <div className="auth-warning">
            Passkey setup is locked until the server has an <code>AUTH_SETUP_TOKEN</code> secret.
          </div>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}
