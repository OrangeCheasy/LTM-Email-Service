import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

const SESSION_COOKIE = "ltm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const OWNER_USER_ID = new TextEncoder().encode("ltm-mail-owner");

interface CredentialRow {
  id: string;
  public_key: ArrayBuffer;
  counter: number;
  transports: string | null;
}

interface ChallengeRow {
  challenge: string;
  ceremony: "registration" | "authentication";
  expires_at: string;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function parseCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }

  return null;
}

function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function rpContext(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

async function hasCredential(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM auth_credentials LIMIT 1").first<{ id: string }>();
  return Boolean(row);
}

async function cleanupExpiredAuthRows(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at <= datetime('now')"),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= datetime('now')"),
  ]);
}

async function createSession(env: Env): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  await env.DB.prepare(
    "INSERT INTO auth_sessions (token_hash, expires_at) VALUES (?, datetime('now', ?))",
  )
    .bind(tokenHash, `+${SESSION_TTL_SECONDS} seconds`)
    .run();

  return token;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return false;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT token_hash FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now') LIMIT 1",
  )
    .bind(tokenHash)
    .first<{ token_hash: string }>();

  if (!row) return false;

  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE token_hash = ?")
    .bind(tokenHash)
    .run();

  return true;
}

async function setupAuthorized(request: Request, env: Env, suppliedToken?: string): Promise<boolean> {
  if (await hasCredential(env)) return isAuthenticated(request, env);
  if (!env.AUTH_SETUP_TOKEN || !suppliedToken) return false;

  const expected = new TextEncoder().encode(env.AUTH_SETUP_TOKEN);
  const actual = new TextEncoder().encode(suppliedToken);
  if (expected.length !== actual.length) return false;

  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected[index] ^ actual[index];
  return diff === 0;
}

async function saveChallenge(
  env: Env,
  ceremony: "registration" | "authentication",
  challenge: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO auth_challenges (id, challenge, ceremony, expires_at) VALUES (?, ?, ?, datetime('now', ?))",
  )
    .bind(id, challenge, ceremony, `+${CHALLENGE_TTL_SECONDS} seconds`)
    .run();
  return id;
}

async function loadChallenge(
  env: Env,
  id: string,
  ceremony: "registration" | "authentication",
): Promise<ChallengeRow | null> {
  return env.DB.prepare(
    "SELECT challenge, ceremony, expires_at FROM auth_challenges WHERE id = ? AND ceremony = ? AND expires_at > datetime('now') LIMIT 1",
  )
    .bind(id, ceremony)
    .first<ChallengeRow>();
}

async function consumeChallenge(env: Env, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ?").bind(id).run();
}

export async function authStatus(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredAuthRows(env);
  const configured = await hasCredential(env);
  const authenticated = configured ? await isAuthenticated(request, env) : false;

  return Response.json({
    configured,
    authenticated,
    setupAvailable: !configured && Boolean(env.AUTH_SETUP_TOKEN),
  });
}

export async function registrationOptions(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { setupToken?: string } | null;
  if (!(await setupAuthorized(request, env, body?.setupToken))) {
    return jsonError((await hasCredential(env)) ? "Authentication required" : "Invalid setup token", 401);
  }

  await cleanupExpiredAuthRows(env);
  const existing = await env.DB.prepare("SELECT id, transports FROM auth_credentials ORDER BY created_at ASC")
    .all<{ id: string; transports: string | null }>();
  const { rpID } = rpContext(request);

  const options = await generateRegistrationOptions({
    rpName: "LTM Mails",
    rpID,
    userID: OWNER_USER_ID,
    userName: "contact@liamthemo.com",
    userDisplayName: "LTM Mail Owner",
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    excludeCredentials: existing.results.map((credential) => ({
      id: credential.id,
      transports: credential.transports
        ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[])
        : undefined,
    })),
  });

  const challengeId = await saveChallenge(env, "registration", options.challenge);
  return Response.json({ challengeId, options });
}

export async function verifyRegistration(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    challengeId?: string;
    response?: RegistrationResponseJSON;
    setupToken?: string;
  } | null;

  if (!body?.challengeId || !body.response) return jsonError("Invalid registration payload", 400);
  if (!(await setupAuthorized(request, env, body.setupToken))) {
    return jsonError((await hasCredential(env)) ? "Authentication required" : "Invalid setup token", 401);
  }

  const challenge = await loadChallenge(env, body.challengeId, "registration");
  if (!challenge) return jsonError("Registration challenge expired or invalid", 400);

  const { rpID, origin } = rpContext(request);
  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  await consumeChallenge(env, body.challengeId);
  if (!verification.verified || !verification.registrationInfo) {
    return jsonError("Passkey registration could not be verified", 400);
  }

  const { credential } = verification.registrationInfo;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO auth_credentials (id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
  )
    .bind(
      credential.id,
      credential.publicKey,
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
    )
    .run();

  const token = await createSession(env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token),
    },
  });
}

export async function authenticationOptions(request: Request, env: Env): Promise<Response> {
  await cleanupExpiredAuthRows(env);
  const credentials = await env.DB.prepare(
    "SELECT id, transports FROM auth_credentials ORDER BY created_at ASC",
  ).all<{ id: string; transports: string | null }>();

  if (credentials.results.length === 0) return jsonError("Passkey setup required", 409);

  const { rpID } = rpContext(request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: credentials.results.map((credential) => ({
      id: credential.id,
      transports: credential.transports
        ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[])
        : undefined,
    })),
  });

  const challengeId = await saveChallenge(env, "authentication", options.challenge);
  return Response.json({ challengeId, options });
}

export async function verifyAuthentication(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    challengeId?: string;
    response?: AuthenticationResponseJSON;
  } | null;
  if (!body?.challengeId || !body.response) return jsonError("Invalid authentication payload", 400);

  const challenge = await loadChallenge(env, body.challengeId, "authentication");
  if (!challenge) return jsonError("Authentication challenge expired or invalid", 400);

  const stored = await env.DB.prepare(
    "SELECT id, public_key, counter, transports FROM auth_credentials WHERE id = ? LIMIT 1",
  )
    .bind(body.response.id)
    .first<CredentialRow>();
  if (!stored) return jsonError("Unknown passkey", 400);

  const { rpID, origin } = rpContext(request);
  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: new Uint8Array(stored.public_key),
      counter: stored.counter,
      transports: stored.transports
        ? (JSON.parse(stored.transports) as AuthenticatorTransportFuture[])
        : undefined,
    },
    requireUserVerification: false,
  });

  await consumeChallenge(env, body.challengeId);
  if (!verification.verified) return jsonError("Passkey authentication failed", 401);

  await env.DB.prepare(
    "UPDATE auth_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?",
  )
    .bind(verification.authenticationInfo.newCounter, stored.id)
    .run();

  const token = await createSession(env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token),
    },
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": expiredSessionCookie(),
    },
  });
}

export function unauthorizedResponse(): Response {
  return jsonError("Authentication required", 401);
}
