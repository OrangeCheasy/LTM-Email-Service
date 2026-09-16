const PREFIX = "ltm-mail-cache:v2:";
const FRESH_MS = 5 * 60_000;

type Entry = {
  savedAt: number;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

function cacheKey(url: URL): string {
  return `${PREFIX}${url.pathname}?${url.searchParams.toString()}`;
}

function cacheablePath(url: URL): boolean {
  return url.pathname === "/api/messages" || /^\/api\/messages\/[^/]+$/.test(url.pathname);
}

function read(key: string): Entry | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (!entry || Date.now() - entry.savedAt > FRESH_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function responseFrom(entry: Entry): Response {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function store(key: string, response: Response): Promise<void> {
  if (!response.ok) return;
  try {
    const clone = response.clone();
    const body = await clone.text();
    const entry: Entry = {
      savedAt: Date.now(),
      status: clone.status,
      statusText: clone.statusText,
      headers: Array.from(clone.headers.entries()),
      body,
    };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Caching is opportunistic; network responses still succeed without it.
  }
}

function clearAllMailCache(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export function installMailFetchCache(): void {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url, location.origin);
    const sameOrigin = url.origin === location.origin;
    const cacheable = request.method === "GET" && sameOrigin && cacheablePath(url);

    if (cacheable) {
      const key = cacheKey(url);
      const cached = read(key);
      if (cached) {
        void original(request)
          .then(async (network) => { await store(key, network); })
          .catch(() => undefined);
        return responseFrom(cached);
      }

      const network = await original(request);
      await store(key, network);
      return network;
    }

    const network = await original(request);
    if (
      network.ok
      && sameOrigin
      && request.method !== "GET"
      && request.method !== "HEAD"
      && url.pathname.startsWith("/api/")
    ) {
      clearAllMailCache();
    }
    return network;
  };
}
