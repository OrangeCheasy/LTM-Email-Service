import { nativeProvider } from "./native";
import type { MailProvider, MailProviderKind } from "./types";

export type ConnectedAccount = {
  id: string;
  provider: MailProviderKind;
  emailAddress: string;
  displayName: string | null;
  status: "active" | "reauth_required" | "disabled";
  lastSyncedAt: string | null;
};

type AccountRow = {
  id: string;
  provider: MailProviderKind;
  email_address: string;
  display_name: string | null;
  status: ConnectedAccount["status"];
  last_synced_at: string | null;
};

const NATIVE_ACCOUNT_ID = "native:primary";

export async function ensureNativeAccount(env: Env): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO connected_accounts (id, provider, provider_account_id, email_address, display_name, status, updated_at)
    VALUES (?1, 'native', ?1, ?2, 'LTM Email', 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET email_address = excluded.email_address, status = 'active', updated_at = CURRENT_TIMESTAMP
  `).bind(NATIVE_ACCOUNT_ID, env.PRIMARY_ADDRESS).run();
}

export async function listConnectedAccounts(env: Env): Promise<ConnectedAccount[]> {
  await ensureNativeAccount(env);
  const result = await env.DB.prepare(`
    SELECT id, provider, email_address, display_name, status, last_synced_at
    FROM connected_accounts
    WHERE status != 'disabled'
    ORDER BY CASE provider WHEN 'native' THEN 0 ELSE 1 END, created_at ASC
  `).all<AccountRow>();
  return result.results.map(row => ({
    id: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    displayName: row.display_name,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
  }));
}

export async function resolveProvider(env: Env, accountId?: string | null): Promise<MailProvider | null> {
  const requested = accountId?.trim() || NATIVE_ACCOUNT_ID;
  if (requested === NATIVE_ACCOUNT_ID) return nativeProvider(env);
  const account = await env.DB.prepare("SELECT provider, status FROM connected_accounts WHERE id = ?1 LIMIT 1").bind(requested).first<{ provider: MailProviderKind; status: string }>();
  if (!account || account.status !== "active") return null;
  // Gmail is registered in the data model but is not executable until the OAuth provider is implemented.
  return null;
}

export { NATIVE_ACCOUNT_ID };
