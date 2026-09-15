type AttachmentRow = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  r2_key: string;
};

const SAFE_PREVIEW_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export async function previewAttachment(id: string, env: Env): Promise<Response> {
  const attachment = await env.DB.prepare(
    "SELECT id, filename, content_type, size, r2_key FROM attachments WHERE id = ?1",
  ).bind(id).first<AttachmentRow>();
  if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
  if (!SAFE_PREVIEW_TYPES.has(attachment.content_type)) {
    return Response.json({ error: "This file type cannot be previewed safely" }, { status: 415 });
  }

  const object = await env.MAIL.get(attachment.r2_key);
  if (!object) return Response.json({ error: "Attachment data is unavailable" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.content_type,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
