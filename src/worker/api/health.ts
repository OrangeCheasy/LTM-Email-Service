export function healthResponse(env: Env): Response {
  return Response.json({
    ok: true,
    service: "ltm-email-service",
    address: env.PRIMARY_ADDRESS,
    timestamp: new Date().toISOString(),
  });
}
