const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 12;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function checkAuthRateLimit(env: Env, bucket: string): Promise<boolean> {
  const key = await sha256Hex(bucket);
  await env.DB.prepare(`
    INSERT INTO auth_rate_limits (bucket, attempts, window_started_at) VALUES (?1, 1, datetime('now'))
    ON CONFLICT(bucket) DO UPDATE SET
      attempts = CASE WHEN window_started_at <= datetime('now', '-${WINDOW_SECONDS} seconds') THEN 1 ELSE attempts + 1 END,
      window_started_at = CASE WHEN window_started_at <= datetime('now', '-${WINDOW_SECONDS} seconds') THEN datetime('now') ELSE window_started_at END
  `).bind(key).run();
  const row = await env.DB.prepare("SELECT attempts FROM auth_rate_limits WHERE bucket = ?1").bind(key).first<{ attempts: number }>();
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_started_at <= datetime('now', '-10 minutes')").run();
  return (row?.attempts ?? MAX_ATTEMPTS + 1) <= MAX_ATTEMPTS;
}

export function authRateLimitBucket(request: Request, route: string): string {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return `${route}:${ip}`;
}
