import { deleteDraft, getDraft, saveDraft } from "./api/drafts";
import { healthResponse } from "./api/health";
import { downloadAttachment, getMessage, listMessages, patchMessage } from "./api/mail";
import { deleteProfilePhoto, getProfile, getProfilePhoto, saveProfilePhoto } from "./api/profile";
import { receiveEmail } from "./email/receive";
import { sendEmail } from "./email/send";
import { pushConfig, subscribePush, unsubscribePush } from "./push";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

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

    const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (attachmentMatch && request.method === "GET") return downloadAttachment(request, decodeURIComponent(attachmentMatch[1]), env);

    if (url.pathname.startsWith("/api/")) return jsonError("Not found", 404);
    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx): Promise<void> {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
