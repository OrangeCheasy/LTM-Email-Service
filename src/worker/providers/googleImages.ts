const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ValidatedGoogleImage = {
  bytes: ArrayBuffer;
  contentType: string;
};

export function isAllowedGoogleImageUrl(url: URL): boolean {
  return url.protocol === "https:"
    && (
      url.hostname === "lh3.googleusercontent.com"
      || url.hostname.endsWith(".googleusercontent.com")
    );
}

export async function readValidatedGoogleImage(
  response: Response,
): Promise<ValidatedGoogleImage | null> {
  if (!response.ok) return null;

  const contentType = (response.headers.get("Content-Type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const declaredLength = Number(response.headers.get("Content-Length") ?? 0);
  if (
    !ALLOWED_IMAGE_TYPES.has(contentType)
    || (declaredLength > 0 && declaredLength > MAX_IMAGE_BYTES)
  ) {
    return null;
  }

  const bytes = await response.arrayBuffer();
  return bytes.byteLength <= MAX_IMAGE_BYTES
    ? { bytes, contentType }
    : null;
}

export function googleImageResponse(image: ValidatedGoogleImage): Response {
  return new Response(image.bytes, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
