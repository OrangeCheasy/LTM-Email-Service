const PROFILE_KEY = "profile/avatar.jpg";
const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function getProfile(env: Env): Promise<Response> {
  const object = await env.MAIL.head(PROFILE_KEY);
  return Response.json({
    hasPhoto: Boolean(object),
    version: object?.customMetadata?.uploadedAt ?? object?.etag ?? null,
  });
}

export async function getProfilePhoto(env: Env): Promise<Response> {
  const object = await env.MAIL.get(PROFILE_KEY);
  if (!object) return Response.json({ error: "Profile photo not found" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function saveProfilePhoto(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return Response.json({ error: "Photo is required" }, { status: 400 });
  if (!ALLOWED_PROFILE_TYPES.has(photo.type)) return Response.json({ error: "Use a JPEG, PNG, or WebP image" }, { status: 415 });
  if (photo.size <= 0 || photo.size > MAX_PROFILE_BYTES) return Response.json({ error: "Profile photo must be 5 MB or smaller" }, { status: 413 });

  const uploadedAt = new Date().toISOString();
  const bytes = await photo.arrayBuffer();
  await env.MAIL.put(PROFILE_KEY, bytes, {
    httpMetadata: { contentType: photo.type },
    customMetadata: { uploadedAt },
  });

  return Response.json({ ok: true, version: uploadedAt });
}

export async function deleteProfilePhoto(env: Env): Promise<Response> {
  await env.MAIL.delete(PROFILE_KEY);
  return Response.json({ ok: true });
}
