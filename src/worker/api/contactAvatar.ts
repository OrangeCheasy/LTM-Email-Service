import { googleContactPhotoSources } from "../providers/googleContacts";
import { getGoogleAccessToken } from "../providers/googleCredentials";
import {
  googleImageResponse,
  isAllowedGoogleImageUrl,
  readValidatedGoogleImage,
} from "../providers/googleImages";

const notFound = () => new Response(null, { status: 404 });

export async function getContactAvatar(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") ?? "";
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!accountId.startsWith("gmail:") || !email || email.length > 320) return notFound();

  try {
    const sources = await googleContactPhotoSources(env, accountId, [email]);
    const rawPhotoUrl = sources.get(email);
    if (!rawPhotoUrl) return notFound();

    const photoUrl = new URL(rawPhotoUrl);
    if (!isAllowedGoogleImageUrl(photoUrl)) return notFound();

    const token = await getGoogleAccessToken(env, accountId);
    const response = await fetch(photoUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
    });
    if (!response.ok || !response.url) return notFound();

    const finalUrl = new URL(response.url);
    if (!isAllowedGoogleImageUrl(finalUrl)) return notFound();

    const image = await readValidatedGoogleImage(response);
    return image ? googleImageResponse(image) : notFound();
  } catch {
    return notFound();
  }
}
