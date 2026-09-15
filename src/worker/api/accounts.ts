import { listConnectedAccounts } from "../providers/registry";

export async function getConnectedAccounts(env: Env): Promise<Response> {
  const accounts = await listConnectedAccounts(env);
  return Response.json({ accounts });
}
