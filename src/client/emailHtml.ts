const BLOCKED_ELEMENTS = "script,iframe,object,embed,form,input,button,textarea,select,option,meta,base,link,svg,math,video,audio,source,track,template";
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

function isSafeImage(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("data:image/") || trimmed.startsWith("cid:");
}

/**
 * Creates an isolated email document. The source HTML has already been cleaned
 * on the worker, but this performs a second browser-side sanitization pass and
 * adds a restrictive CSP before it is handed to the sandboxed iframe.
 */
export function buildSafeEmailDocument(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove());

  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || ["srcdoc", "formaction", "action", "ping", "nonce", "integrity", "crossorigin"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href");
      if (href && !isSafeLink(href)) element.removeAttribute("href");
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer nofollow");
    }

    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute("src");
      if (src && !isSafeImage(src)) element.removeAttribute("src");
      element.removeAttribute("srcset");
      element.removeAttribute("usemap");
    }

    element.removeAttribute("background");
    element.removeAttribute("poster");
  });

  const csp = document.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'";

  const viewport = document.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";

  const safetyStyles = document.createElement("style");
  safetyStyles.textContent = `
    html, body { margin: 0; padding: 0; min-width: 0; background: transparent; }
    body { overflow-wrap: anywhere; word-break: normal; }
    img, table { max-width: 100% !important; }
    img { height: auto !important; }
    pre { white-space: pre-wrap; }
    a { cursor: pointer; }
  `;

  document.head.prepend(safetyStyles);
  document.head.prepend(viewport);
  document.head.prepend(csp);
  return `<!doctype html>${document.documentElement.outerHTML}`;
}
