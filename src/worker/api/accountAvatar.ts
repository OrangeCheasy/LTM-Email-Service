import { getGoogleAccessToken } from "../providers/googleCredentials";
import {
  googleImageResponse,
  isAllowedGoogleImageUrl,
  readValidatedGoogleImage,
} from "../providers/googleImages";

type GooglePerson = {
  photos?: Array<{ url?: string; default?: boolean }>;
};

const notFound = () => new Response(null, { status: 404 });

export async function getAccountAvatar(accountId: string, env: Env): Promise<Response> {
  if (!accountId.startsWith("gmail:")) return notFound();

  const account = await env.DB.prepare(`
    SELECT status
    FROM connected_accounts
    WHERE id = ?1 AND provider = 'gmail'
    LIMIT 1
  `)
    .bind(accountId)
    .first<{ status: string }>();
  if (!account || account.status !== "active") return notFound();

  try {
    const token = await getGoogleAccessToken(env, accountId);
    const profileResponse = await fetch(
      "https://people.googleapis.com/v1/people/me?personFields=photos",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!profileResponse.ok) return notFound();

    const profile = await profileResponse.json<GooglePerson>();
    const photo = profile.photos?.find((entry) => entry.url && !entry.default)
      ?? profile.photos?.find((entry) => entry.url);
    if (!photo?.url) return notFound();

    let photoUrl = new URL(photo.url);
    if (!isAllowedGoogleImageUrl(photoUrl)) return notFound();

    let imageResponse = await fetch(photoUrl.toString(), { redirect: "manual" });
    if (imageResponse.status >= 300 && imageResponse.status < 400) {
      const location = imageResponse.headers.get("Location");
      if (!location) return notFound();

      photoUrl = new URL(location, photoUrl);
      if (!isAllowedGoogleImageUrl(photoUrl)) return notFound();
      imageResponse = await fetch(photoUrl.toString(), { redirect: "error" });
    }

    const image = await readValidatedGoogleImage(imageResponse);
    return image ? googleImageResponse(image) : notFound();
  } catch {
    return notFound();
  }
}
