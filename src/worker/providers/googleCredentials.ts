import { decryptSecret, encryptSecret } from "./crypto";
import {
  GOOGLE_TOKEN_ENDPOINT,
  hasRequiredGoogleScopes,
  isGoogleConfigured,
} from "./googleConfig";

const REFRESH_SKEW_MS = 60_000;

type StoredGoogleCredential = {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  scope: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type CredentialRow = {
  encrypted_blob: string;
  expires_at: string | null;
};

async function markReauthRequired(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE connected_accounts
    SET status = 'reauth_required', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1 AND provider = 'gmail'
  `)
    .bind(accountId)
    .run();
}

export async function getGoogleAccessToken(env: Env, accountId: string): Promise<string> {
  if (!isGoogleConfigured(env) || !accountId.startsWith("gmail:")) {
    throw new Error("Gmail account is unavailable");
  }

  const row = await env.DB.prepare(`
    SELECT encrypted_blob, expires_at
    FROM provider_credentials
    WHERE account_id = ?1
  `)
    .bind(accountId)
    .first<CredentialRow>();
  if (!row) throw new Error("Gmail account is unavailable");

  let credential: StoredGoogleCredential;
  try {
    credential = await decryptSecret<StoredGoogleCredential>(
      env,
      row.encrypted_blob,
      `credential:${accountId}`,
    );
  } catch {
    await markReauthRequired(env, accountId);
    throw new Error("Gmail account requires reconnection");
  }

  if (!credential.refreshToken || !hasRequiredGoogleScopes(credential.scope || "")) {
    await markReauthRequired(env, accountId);
    throw new Error("Gmail account requires reconnection");
  }

  const expiresAt = Date.parse(credential.accessTokenExpiresAt || row.expires_at || "");
  if (
    credential.accessToken
    && Number.isFinite(expiresAt)
    && expiresAt - Date.now() > REFRESH_SKEW_MS
  ) {
    return credential.accessToken;
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
      }),
    });
  } catch {
    throw new Error("Gmail token refresh temporarily failed");
  }

  if (!response.ok) {
    const requiresReauth = response.status === 400 || response.status === 401;
    if (requiresReauth) await markReauthRequired(env, accountId);
    throw new Error(
      requiresReauth
        ? "Gmail account requires reconnection"
        : "Gmail token refresh temporarily failed",
    );
  }

  const token = await response.json<TokenResponse>();
  if (!token.access_token) throw new Error("Gmail token refresh temporarily failed");

  const scope = token.scope ?? credential.scope;
  if (!hasRequiredGoogleScopes(scope)) {
    await markReauthRequired(env, accountId);
    throw new Error("Gmail account requires reconnection");
  }

  const expiresAtIso = new Date(
    Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
  ).toISOString();
  const updated: StoredGoogleCredential = {
    refreshToken: token.refresh_token ?? credential.refreshToken,
    accessToken: token.access_token,
    accessTokenExpiresAt: expiresAtIso,
    scope,
  };
  const encrypted = await encryptSecret(env, updated, `credential:${accountId}`);

  await env.DB.prepare(`
    UPDATE provider_credentials
    SET encrypted_blob = ?2, expires_at = ?3, updated_at = CURRENT_TIMESTAMP
    WHERE account_id = ?1
  `)
    .bind(accountId, encrypted, expiresAtIso)
    .run();

  return token.access_token;
}
