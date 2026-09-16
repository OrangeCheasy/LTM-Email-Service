const BROWSER_TAB_ICON = "/browser-tab-icon-v17.png";

let activeObjectUrl: string | null = null;

const replaceFaviconLinks = (href: string, type: string) => {
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => link.remove());

  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = type || "image/png";
  icon.href = href;

  const shortcutIcon = document.createElement("link");
  shortcutIcon.rel = "shortcut icon";
  shortcutIcon.type = type || "image/png";
  shortcutIcon.href = href;

  document.head.append(icon, shortcutIcon);
};

const refreshBrowserFavicon = async () => {
  try {
    const response = await fetch(`${BROWSER_TAB_ICON}?runtime=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const previousObjectUrl = activeObjectUrl;

    replaceFaviconLinks(objectUrl, blob.type);
    activeObjectUrl = objectUrl;

    if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
  } catch {
    // Keep the static HTML favicon if the runtime refresh cannot load.
  }
};

export const installFreshBrowserFavicon = () => {
  void refreshBrowserFavicon();

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshBrowserFavicon();
  });
};
