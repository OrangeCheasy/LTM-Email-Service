import { healthResponse } from "./api/health";
import { downloadAttachment, getMessage, listMessages, patchMessage } from "./api/mail";
import { receiveEmail } from "./email/receive";
import { sendEmail } from "./email/send";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") return healthResponse(env);
    if (url.pathname === "/api/messages" && request.method === "GET") return listMessages(request, env);
    if (url.pathname === "/api/send" && request.method === "POST") return sendEmail(request, env);

    const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (messageMatch) {
      const id = decodeURIComponent(messageMatch[1]);
      if (request.method === "GET") return getMessage(id, env);
      if (request.method === "PATCH") return patchMessage(request, id, env);
      return jsonError("Method not allowed", 405);
    }

    const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (attachmentMatch && request.method === "GET") return downloadAttachment(decodeURIComponent(attachmentMatch[1]), env);

    if (url.pathname.startsWith("/api/")) return jsonError("Not found", 404);
    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx): Promise<void> {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
