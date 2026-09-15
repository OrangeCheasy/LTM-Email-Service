import { previewAttachment } from "./api/attachments";
import { deleteDraft, getDraft, saveDraft } from "./api/drafts";
import { healthResponse } from "./api/health";
import { downloadAttachment, getMessage, listMessages, patchMessage } from "./api/mail";
import { deleteProfilePhoto, getProfile, getProfilePhoto, saveProfilePhoto } from "./api/profile";
import { authenticationOptions, authStatus, isAuthenticated, logout, registrationOptions, unauthorizedResponse, verifyAuthentication, verifyRegistration } from "./auth";
import { receiveEmail } from "./email/receive";
import { sendEmail } from "./email/send";
import { pushConfig, subscribePush, unsubscribePush } from "./push";

const APP_ORIGIN = "https://email.liamthemo.com";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function sameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  return request.headers.get("Origin") === APP_ORIGIN;
}

function secureApiResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!sameOrigin(request)) return jsonError("Cross-origin request rejected", 403);

  if (url.pathname === "/api/auth/status" && request.method === "GET") return authStatus(request, env);
  if (url.pathname === "/api/auth/register/options" && request.method === "POST") return registrationOptions(request, env);
  if (url.pathname === "/api/auth/register/verify" && request.method === "POST") return verifyRegistration(request, env);
  if (url.pathname === "/api/auth/login/options" && request.method === "POST") return authenticationOptions(request, env);
  if (url.pathname === "/api/auth/login/verify" && request.method === "POST") return verifyAuthentication(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);

  if (!(await isAuthenticated(request, env))) return unauthorizedResponse();

  if (url.pathname === "/api/health" && request.method === "GET") return healthResponse(env);
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
  if (url.pathname === "/api/push/config" && request.method === "GET") return pushConfig(env);
  if (url.pathname === "/api/push/subscribe" && request.method === "POST") return subscribePush(request, env);
  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") return unsubscribePush(request, env);

  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch) {
    const id = decodeURIComponent(draftMatch[1]);
    if (request.method === "GET") return getDraft(id, env);
    if (request.method === "DELETE") return deleteDraft(id, env);
    return jsonError("Method not allowed", 405);
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch) {
    const id = decodeURIComponent(messageMatch[1]);
    if (request.method === "GET") return getMessage(id, env);
    if (request.method === "PATCH") return patchMessage(request, id, env);
    return jsonError("Method not allowed", 405);
  }

  const previewMatch = url.pathname.match(/^\/api\/attachment-previews\/([^/]+)$/);
  if (previewMatch && request.method === "GET") return previewAttachment(decodeURIComponent(previewMatch[1]), env);

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentMatch && request.method === "GET") return downloadAttachment(decodeURIComponent(attachmentMatch[1]), env);

  return jsonError("Not found", 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return secureApiResponse(await routeApi(request, env, url));
    return env.ASSETS.fetch(request);
  },
  async email(message, env, ctx): Promise<void> {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
