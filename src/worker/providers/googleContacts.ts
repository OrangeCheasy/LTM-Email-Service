import { getGoogleAccessToken } from "./googleCredentials";

const PEOPLE_API = "https://people.googleapis.com/v1";
const MAX_PAGES = 10;
const MAX_CONTACTS = 5_000;

type Person = {
  emailAddresses?: Array<{ value?: string }>;
  photos?: Array<{ url?: string; default?: boolean }>;
};

type ConnectionsResponse = {
  connections?: Person[];
  nextPageToken?: string;
};

function safeGooglePhotoUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowedHost = url.hostname === "lh3.googleusercontent.com"
      || url.hostname.endsWith(".googleusercontent.com");
    return url.protocol === "https:" && allowedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function googleContactPhotoSources(
  env: Env,
  accountId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(
    emails
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const results = new Map<string, string>();
  if (!wanted.size) return results;

  const token = await getGoogleAccessToken(env, accountId);
  let pageToken = "";
  let seen = 0;

  for (
    let page = 0;
    page < MAX_PAGES && wanted.size && seen < MAX_CONTACTS;
    page += 1
  ) {
    const query = new URLSearchParams({
      pageSize: "500",
      personFields: "emailAddresses,photos",
    });
    if (pageToken) query.set("pageToken", pageToken);

    const response = await fetch(`${PEOPLE_API}/people/me/connections?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return results;

    const data = await response.json<ConnectionsResponse>();
    for (const person of data.connections ?? []) {
      seen += 1;
      const photo = safeGooglePhotoUrl(
        person.photos?.find((entry) => !entry.default)?.url ?? person.photos?.[0]?.url,
      );
      if (!photo) continue;

      for (const entry of person.emailAddresses ?? []) {
        const email = entry.value?.trim().toLowerCase();
        if (email && wanted.has(email)) {
          results.set(email, photo);
          wanted.delete(email);
        }
      }
    }

    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }

  return results;
}

export async function googleContactPhotos(
  env: Env,
  accountId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const sources = await googleContactPhotoSources(env, accountId, emails);
  const results = new Map<string, string>();
  for (const email of sources.keys()) {
    results.set(
      email,
      `/api/contact-avatar?accountId=${encodeURIComponent(accountId)}&email=${encodeURIComponent(email)}`,
    );
  }
  return results;
}
