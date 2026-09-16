import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState, type ReactNode } from "react";

interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  setupAvailable: boolean;
  smsSecondFactorConfigured?: boolean;
}

interface OptionsEnvelope<T> {
  challengeId: string;
  options: T;
}

interface LoginResult {
  ok: true;
  smsRequired?: boolean;
  challengeId?: string;
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
  const [smsChallengeId, setSmsChallengeId] = useState("");
  const [smsCode, setSmsCode] = useState("");
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
    setSmsChallengeId("");
    setSmsCode("");
    try {
      const envelope = await apiJson<OptionsEnvelope<Parameters<typeof startAuthentication>[0]["optionsJSON"]>>(
        "/api/auth/login/options",
        { method: "POST", body: "{}" },
      );
      const response = await startAuthentication({ optionsJSON: envelope.options });
      const result = await apiJson<LoginResult>("/api/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: envelope.challengeId, response }),
      });
      if (result.smsRequired) {
        if (!result.challengeId) throw new Error("The server did not return a verification challenge.");
        setSmsChallengeId(result.challengeId);
        return;
      }
      await refresh();
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifySms() {
    if (!smsChallengeId || !/^\d{4,10}$/.test(smsCode.trim())) {
      setError("Enter the verification code from the text message.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiJson<{ ok: true }>("/api/auth/sms/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: smsChallengeId, code: smsCode.trim() }),
      });
      setSmsChallengeId("");
      setSmsCode("");
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
        ) : smsChallengeId ? (
          <div className="auth-setup">
            <label htmlFor="sms-code">Verification code</label>
            <input
              id="sms-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, ""))}
              placeholder="Enter SMS code"
              disabled={busy}
              autoFocus
            />
            <button className="auth-primary" type="button" onClick={() => void verifySms()} disabled={busy}>
              {busy ? "Verifying…" : "Verify code"}
            </button>
            <button className="auth-secondary" type="button" onClick={() => { setSmsChallengeId(""); setSmsCode(""); setError(""); }} disabled={busy}>
              Use passkey again
            </button>
            <p className="auth-note">This browser is new to LTM Mails. The server sent a one-time code to the private phone number configured in backend secrets.</p>
          </div>
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
