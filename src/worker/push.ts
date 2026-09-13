import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
};

type SubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

type NewMailPush = {
  id: string;
  sender: string;
  subject: string;
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

const VAPID_SUBJECT = "mailto:contact@liamthemo.com";
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function normalizeVapidKey(value: string | undefined): string {
  let normalized = (value ?? "").trim();
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [open, close] of quotePairs) {
    if (normalized.startsWith(open) && normalized.endsWith(close)) {
      normalized = normalized.slice(open.length, -close.length).trim();
      break;
    }
  }

  return normalized.replace(/\s+/g, "").replace(/=+$/g, "");
}

function vapidKeys(env: Env): VapidKeys | null {
  const publicKey = normalizeVapidKey(env.VAPID_PUBLIC_KEY);
  const privateKey = normalizeVapidKey(env.VAPID_PRIVATE_KEY);

  // A Web Push VAPID P-256 public key is 65 bytes (87 base64url chars)
  // and the private scalar is 32 bytes (43 base64url chars), without padding.
  if (
    publicKey.length !== 87
    || privateKey.length !== 43
    || !BASE64URL.test(publicKey)
    || !BASE64URL.test(privateKey)
  ) {
    return null;
  }

  return { publicKey, privateKey };
}

function configured(env: Env): boolean {
  return vapidKeys(env) !== null;
}

export function pushConfig(env: Env): Response {
  const keys = vapidKeys(env);
  return Response.json({
    configured: Boolean(keys),
    publicKey: keys?.publicKey ?? null,
  });
}

export async function subscribePush(request: Request, env: Env): Promise<Response> {
  if (!configured(env)) return Response.json({ error: "Push notifications are not configured" }, { status: 503 });

  let body: SubscriptionInput;
  try {
    body = await request.json<SubscriptionInput>();
  } catch {
    return Response.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
  const expirationTime = typeof body.expirationTime === "number" && Number.isFinite(body.expirationTime)
    ? Math.floor(body.expirationTime)
    : null;

  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, expiration_time, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       expiration_time = excluded.expiration_time,
       updated_at = excluded.updated_at`,
  ).bind(id, endpoint, p256dh, auth, expirationTime, now).run();

  return Response.json({ ok: true }, { status: 201 });
}

export async function unsubscribePush(request: Request, env: Env): Promise<Response> {
  let body: { endpoint?: unknown };
  try {
    body = await request.json<{ endpoint?: unknown }>();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) return Response.json({ error: "Endpoint is required" }, { status: 400 });
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(endpoint).run();
  return Response.json({ ok: true });
}

async function sendToSubscription(env: Env, row: StoredSubscription, notification: NewMailPush): Promise<void> {
  const keys = vapidKeys(env);
  if (!keys) return;

  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: row.expiration_time,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };

  const payload = await buildPushPayload(
    {
      data: JSON.stringify({
        title: "LTM Mail",
        body: `${notification.sender}: ${notification.subject}`.slice(0, 220),
        tag: `message-${notification.id}`,
        url: "/",
      }),
      options: { ttl: 60 * 60 },
    },
    subscription,
    {
      subject: VAPID_SUBJECT,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    },
  );

  const response = await fetch(row.endpoint, payload);
  if (response.status === 404 || response.status === 410) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(row.endpoint).run();
    return;
  }
  if (!response.ok) console.warn("Push delivery failed", response.status, await response.text().catch(() => ""));
}

export async function sendNewMailPush(env: Env, notification: NewMailPush): Promise<void> {
  if (!configured(env)) return;

  const subscriptions = await env.DB.prepare(
    "SELECT id, endpoint, p256dh, auth, expiration_time FROM push_subscriptions ORDER BY updated_at DESC LIMIT 20",
  ).all<StoredSubscription>();

  await Promise.allSettled(subscriptions.results.map((row) => sendToSubscription(env, row, notification)));
}
