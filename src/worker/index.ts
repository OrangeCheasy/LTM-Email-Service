import { healthResponse } from "./api/health";
import { receiveEmail } from "./email/receive";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return healthResponse(env);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonError("Not found", 404);
    }

    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx): Promise<void> {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
