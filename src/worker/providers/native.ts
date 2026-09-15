import type { MailProvider, ProviderListOptions, ProviderMutation } from "./types";

/**
 * Provider identity for the existing Cloudflare/D1/R2 mailbox.
 *
 * Phase 1 intentionally keeps the proven v1.0 mailbox queries in their
 * existing modules. Subsequent provider work can move those operations behind
 * this adapter incrementally without changing production behavior all at once.
 */
export class NativeMailProvider implements MailProvider {
  readonly kind = "native" as const;
  readonly accountId = "native:primary";

  constructor(private readonly env: Env) {}

  get address(): string {
    return this.env.PRIMARY_ADDRESS;
  }

  async listMessages(_options: ProviderListOptions): Promise<unknown[]> {
    throw new Error("Native provider list adapter is not wired yet");
  }

  async getMessage(_id: string): Promise<unknown | null> {
    throw new Error("Native provider detail adapter is not wired yet");
  }

  async patchMessage(_id: string, _mutation: ProviderMutation): Promise<boolean> {
    throw new Error("Native provider mutation adapter is not wired yet");
  }
}

export function nativeProvider(env: Env): NativeMailProvider {
  return new NativeMailProvider(env);
}
