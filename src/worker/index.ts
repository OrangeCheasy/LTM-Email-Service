import { getAccountAvatar } from "./api/accountAvatar";
import { getConnectedAccounts } from "./api/accounts";
import { previewAttachment } from "./api/attachments";
import { getContactAvatar } from "./api/contactAvatar";
import { deleteDraft, getDraft, saveDraft } from "./api/drafts";
import { healthResponse } from "./api/health";
import { downloadAttachment, getMessage, listMessages, patchMessage } from "./api/mail";
import { deleteProfilePhoto, getProfile, getProfilePhoto, saveProfilePhoto } from "./api/profile";
import {
  authenticationOptions,
  authStatus,
  isAuthenticated,
  logout,
  registrationOptions,
  resetSessions,
  revokeSession,
  sessionInfo,
  unauthorizedResponse,
  verifyAuthentication,
  verifyRegistration,
} from "./auth";
import { APP_ORIGIN } from "./config";
import { receiveEmail } from "./email/receive";
import { sendEmail } from "./email/send";
import { disconnectGoogle, googleOAuthCallback, startGoogleOAuth } from "./providers/google";
import { pushConfig, subscribePush, unsubscribePush } from "./push";
import { authRateLimitBucket, checkAuthRateLimit } from "./security";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_POSTS = new Set([
  "/api/auth/register/options",
  "/api/auth/register/verify",
  "/api/auth/login/options",
  "/api/auth/login/verify",
]);
const MAX_API_BODY_BYTES = 8 * 1024 * 1024;

const jsonError = (message: string, status: number, headers?: HeadersInit) =>
  Response.json({ error: message }, { status, headers });

const sameOrigin = (request: Request) =>
  SAFE_METHODS.has(request.method) || request.headers.get("Origin") === APP_ORIGIN;

function requestTooLarge(request: Request): boolean {
  const raw = request.headers.get("Content-Length");
  if (!raw) return false;

  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_API_BODY_BYTES;
}

function secureApiResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function decodedRouteId(match: RegExpMatchArray): string | null {
  return match[1] ? decodePathSegment(match[1]) : null;
}

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!sameOrigin(request)) return jsonError("Cross-origin request rejected", 403);
  if (!SAFE_METHODS.has(request.method) && requestTooLarge(request)) {
    return jsonError("Request body too large", 413);
  }

  if (
    request.method === "POST"
    && AUTH_POSTS.has(url.pathname)
    && !(await checkAuthRateLimit(env, authRateLimitBucket(request, url.pathname)))
  ) {
    return jsonError("Too many authentication attempts", 429, { "Retry-After": "60" });
  }

  // Authentication routes that must be reachable before a session exists.
  if (url.pathname === "/api/auth/status" && request.method === "GET") return authStatus(request, env);
  if (url.pathname === "/api/auth/register/options" && request.method === "POST") return registrationOptions(request, env);
  if (url.pathname === "/api/auth/register/verify" && request.method === "POST") return verifyRegistration(request, env);
  if (url.pathname === "/api/auth/login/options" && request.method === "POST") return authenticationOptions(request, env);
  if (url.pathname === "/api/auth/login/verify" && request.method === "POST") return verifyAuthentication(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
  if (url.pathname === "/api/accounts/gmail/callback" && request.method === "GET") return googleOAuthCallback(request, env);

  if (!(await isAuthenticated(request, env))) return unauthorizedResponse();

  // Authenticated account and session management.
  if (url.pathname === "/api/auth/sessions" && request.method === "GET") return sessionInfo(request, env);
  if (url.pathname === "/api/auth/sessions/reset" && request.method === "POST") return resetSessions(request, env);

  const sessionRoute = url.pathname.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (sessionRoute && request.method === "DELETE") {
    const sessionId = decodedRouteId(sessionRoute);
    if (!sessionId) return jsonError("Invalid session id", 400);
    return revokeSession(request, env, sessionId);
  }
  if (url.pathname === "/api/accounts/gmail/connect" && request.method === "POST") return startGoogleOAuth(env);
  if (url.pathname === "/api/contact-avatar" && request.method === "GET") return getContactAvatar(request, env);

  const accountRoute = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountRoute && request.method === "DELETE") {
    const accountId = decodedRouteId(accountRoute);
    if (!accountId) return jsonError("Invalid account id", 400);
    if (accountId.startsWith("gmail:")) return disconnectGoogle(accountId, env);
  }

  const avatarRoute = url.pathname.match(/^\/api\/accounts\/([^/]+)\/avatar$/);
  if (avatarRoute && request.method === "GET") {
    const accountId = decodedRouteId(avatarRoute);
    if (!accountId) return jsonError("Invalid account id", 400);
    if (accountId.startsWith("gmail:")) return getAccountAvatar(accountId, env);
  }

  // Mail and profile routes.
  if (url.pathname === "/api/health" && request.method === "GET") return healthResponse(env);
  if (url.pathname === "/api/accounts" && request.method === "GET") return getConnectedAccounts(env);
  if (url.pathname === "/api/messages" && request.method === "GET") return listMessages(request, env);
  if (url.pathname === "/api/send" && request.method === "POST") return sendEmail(request, env);
  if (url.pathname === "/api/drafts" && request.method === "POST") return saveDraft(request, env);
  if (url.pathname === "/api/profile" && request.method === "GET") return getProfile(env);

  if (url.pathname === "/api/profile/photo") {
    if (request.method === "GET") return getProfilePhoto(env);
    if (request.method === "PUT") return saveProfilePhoto(request, env);
    if (request.method === "DELETE") return deleteProfilePhoto(env);
    return jsonError("Method not allowed", 405);
  }

  // Push notification routes.
  if (url.pathname === "/api/push/config" && request.method === "GET") return pushConfig(env);
  if (url.pathname === "/api/push/subscribe" && request.method === "POST") return subscribePush(request, env);
  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") return unsubscribePush(request, env);

  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch) {
    const id = decodedRouteId(draftMatch);
    if (!id) return jsonError("Invalid draft id", 400);
    if (request.method === "GET") return getDraft(id, env);
    if (request.method === "DELETE") return deleteDraft(id, env);
    return jsonError("Method not allowed", 405);
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch) {
    const id = decodedRouteId(messageMatch);
    if (!id) return jsonError("Invalid message id", 400);
    if (request.method === "GET") return getMessage(request, id, env);
    if (request.method === "PATCH") return patchMessage(request, id, env);
    return jsonError("Method not allowed", 405);
  }

  const previewMatch = url.pathname.match(/^\/api\/attachment-previews\/([^/]+)$/);
  if (previewMatch && request.method === "GET") {
    const id = decodedRouteId(previewMatch);
    if (!id) return jsonError("Invalid attachment id", 400);
    return previewAttachment(request, id, env);
  }

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentMatch && request.method === "GET") {
    const id = decodedRouteId(attachmentMatch);
    if (!id) return jsonError("Invalid attachment id", 400);
    return downloadAttachment(request, id, env);
  }

  return jsonError("Not found", 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return secureApiResponse(await routeApi(request, env, url));
    }
    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx): Promise<void> {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
