import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type HealthState = "checking" | "online" | "offline";
type Folder = "inbox" | "starred" | "sent" | "archive" | "trash";
type NotificationState = "checking" | "off" | "on" | "blocked" | "unsupported" | "unconfigured" | "working";

type MessageListItem = {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  preview: string;
  receivedAt: string;
  sentAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  hasAttachments: boolean;
  deliveryStatus: string | null;
};

type MessageDetail = MessageListItem & {
  ccAddresses: string[];
  bccAddresses: string[];
  bodyText: string;
  bodyHtmlAvailable: boolean;
  deliveryError: string | null;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
};

type ComposeState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  replyToMessageId: string;
};

const folders: Array<{ key: Folder; label: string }> = [
  { key: "inbox", label: "Inbox" },
  { key: "starred", label: "Starred" },
  { key: "sent", label: "Sent" },
  { key: "archive", label: "Archive" },
  { key: "trash", label: "Trash" },
];

const emptyCompose: ComposeState = { to: "", cc: "", bcc: "", subject: "", text: "", replyToMessageId: "" };
const AUTO_REFRESH_MS = 15_000;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function senderLabel(message: MessageListItem): string {
  if (message.direction === "outbound") return `To: ${message.toAddresses.join(", ") || "Unknown"}`;
  return message.fromName || message.fromAddress;
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

function notificationLabel(state: NotificationState): string {
  switch (state) {
    case "on": return "Notifications on";
    case "off": return "Enable notifications";
    case "blocked": return "Notifications blocked";
    case "unsupported": return "Notifications unavailable";
    case "unconfigured": return "Notifications setup needed";
    case "working": return "Updating notifications…";
    default: return "Checking notifications…";
  }
}

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(emptyCompose);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationState>("checking");
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed");
        setHealth("online");
      })
      .catch(() => setHealth("offline"));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializePush = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setNotificationState("unsupported");
        return;
      }

      try {
        const configResponse = await fetch("/api/push/config", { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Could not load notification configuration");
        const config = await configResponse.json() as { configured: boolean; publicKey: string | null };
        if (!config.configured || !config.publicKey) {
          if (!cancelled) setNotificationState("unconfigured");
          return;
        }

        setPushPublicKey(config.publicKey);
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (Notification.permission === "denied") setNotificationState("blocked");
        else setNotificationState(subscription ? "on" : "off");
      } catch {
        if (!cancelled) setNotificationState("unsupported");
      }
    };

    void initializePush();
    return () => { cancelled = true; };
  }, []);

  const loadMessages = useCallback(async (activeFolder = folder, query = search, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams({ folder: activeFolder });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/messages?${params}`);
      if (!response.ok) throw new Error("Could not load mail");
      const data = await response.json() as { messages: MessageListItem[]; unreadCount: number };
      setMessages(data.messages);
      setUnreadCount(data.unreadCount);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Could not load mail");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [folder, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMessages(folder, search), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [folder, search, loadMessages]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadMessages(folder, search, true);
    };

    const interval = window.setInterval(refresh, AUTO_REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [folder, search, loadMessages]);

  const toggleNotifications = async () => {
    if (!pushPublicKey || notificationState === "blocked" || notificationState === "unsupported" || notificationState === "unconfigured" || notificationState === "checking" || notificationState === "working") return;
    setNotificationState("working");
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setNotificationState("off");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(pushPublicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("Could not save notification subscription");
      }

      setNotificationState("on");
    } catch (notificationError) {
      setNotificationState("off");
      setError(notificationError instanceof Error ? notificationError.message : "Could not update notifications");
    }
  };

  const openMessage = async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Could not open message");
      const data = await response.json() as { message: MessageDetail };
      setSelected(data.message);
      setMessages((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
      if (!data.message.isRead && data.message.direction === "inbound") setUnreadCount((count) => Math.max(0, count - 1));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open message");
    }
  };

  const patchSelected = async (patch: Record<string, boolean>, closeAfter = false) => {
    if (!selected) return;
    const response = await fetch(`/api/messages/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Could not update message" })) as { error?: string };
      setError(data.error ?? "Could not update message");
      return;
    }
    if (closeAfter) setSelected(null);
    else setSelected((current) => current ? { ...current, ...patch } as MessageDetail : current);
    await loadMessages();
  };

  const startCompose = () => {
    setCompose(emptyCompose);
    setFiles([]);
    setComposeOpen(true);
  };

  const startReply = () => {
    if (!selected) return;
    const recipient = selected.direction === "inbound" ? selected.fromAddress : selected.toAddresses[0] ?? "";
    setCompose({ to: recipient, cc: "", bcc: "", subject: replySubject(selected.subject), text: "", replyToMessageId: selected.id });
    setFiles([]);
    setComposeOpen(true);
  };

  const submitCompose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("to", compose.to);
      form.set("cc", compose.cc);
      form.set("bcc", compose.bcc);
      form.set("subject", compose.subject);
      form.set("text", compose.text);
      if (compose.replyToMessageId) form.set("replyToMessageId", compose.replyToMessageId);
      files.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/send", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Email could not be sent");
      setComposeOpen(false);
      setCompose(emptyCompose);
      setFiles([]);
      setFolder("sent");
      setSelected(null);
      setSearch("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Email could not be sent");
    } finally {
      setSending(false);
    }
  };

  const currentFolderLabel = useMemo(() => folders.find((item) => item.key === folder)?.label ?? "Mail", [folder]);
  const notificationsDisabled = ["checking", "working", "blocked", "unsupported", "unconfigured"].includes(notificationState);

  return (
    <main className="mail-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">LM</span>
          <div><strong>LTM Mail</strong><small>Private webmail</small></div>
        </div>
        <button className="compose-button" type="button" onClick={startCompose}><span aria-hidden="true">＋</span> Compose</button>
        <nav aria-label="Mail folders">
          {folders.map((item) => (
            <button className={folder === item.key ? "folder active" : "folder"} key={item.key} type="button" onClick={() => { setFolder(item.key); setSelected(null); }}>
              <span>{item.label}</span>
              {item.key === "inbox" && unreadCount > 0 ? <span className="folder-count">{unreadCount}</span> : null}
            </button>
          ))}
        </nav>
        <button className="folder" type="button" disabled={notificationsDisabled} onClick={() => void toggleNotifications()}>
          <span>{notificationState === "on" ? "●" : "○"} {notificationLabel(notificationState)}</span>
        </button>
        <div className="sidebar-footer">
          <span className={`status-dot ${health}`} />
          <span>{health === "checking" ? "Checking Worker" : health === "online" ? "Worker online" : "Worker unavailable"}</span>
        </div>
      </aside>

      <section className="mail-view">
        <header className="topbar">
          <div>
            <h1>{selected ? selected.subject : currentFolderLabel}</h1>
            <p>{selected ? senderLabel(selected) : "contact@liamthemo.com"}</p>
          </div>
          <div className="private-badge">Private</div>
        </header>

        <div className="toolbar">
          {selected ? (
            <>
              <button type="button" onClick={() => setSelected(null)}>← Back</button>
              <button type="button" onClick={startReply}>Reply</button>
              <button type="button" onClick={() => void patchSelected({ isStarred: !selected.isStarred })}>{selected.isStarred ? "Unstar" : "Star"}</button>
              {!selected.isDeleted ? <button type="button" onClick={() => void patchSelected({ isArchived: true }, true)}>Archive</button> : null}
              {!selected.isDeleted ? <button className="danger-button" type="button" onClick={() => void patchSelected({ isDeleted: true }, true)}>Trash</button> : <button type="button" onClick={() => void patchSelected({ isDeleted: false }, true)}>Restore</button>}
            </>
          ) : <button type="button" onClick={() => void loadMessages()}>Refresh</button>}
          {!selected ? (
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Search mail" placeholder="Search mail" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          ) : null}
        </div>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        {selected ? (
          <article className="message-reader">
            <div className="message-meta">
              <div className="avatar">{(selected.fromName || selected.fromAddress).slice(0, 1).toUpperCase()}</div>
              <div className="message-meta-copy">
                <strong>{selected.direction === "outbound" ? "You" : selected.fromName || selected.fromAddress}</strong>
                <span>{selected.direction === "outbound" ? `to ${selected.toAddresses.join(", ")}` : `<${selected.fromAddress}>`}</span>
              </div>
              <time>{formatDate(selected.sentAt || selected.receivedAt)}</time>
            </div>
            {selected.deliveryStatus === "failed" ? <div className="delivery-error">Delivery failed: {selected.deliveryError}</div> : null}
            <pre className="message-body">{selected.bodyText || "(No readable text content)"}</pre>
            {selected.bodyHtmlAvailable ? <p className="security-note">HTML is displayed as safe text in this version. Remote images are not loaded.</p> : null}
            {selected.attachments.length > 0 ? (
              <section className="attachments" aria-label="Attachments">
                <h2>Attachments</h2>
                <div className="attachment-list">
                  {selected.attachments.map((attachment) => (
                    <a key={attachment.id} className="attachment" href={`/api/attachments/${encodeURIComponent(attachment.id)}`}>
                      <span className="attachment-icon" aria-hidden="true">↧</span>
                      <span><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        ) : (
          <div className="message-list" aria-busy={loading}>
            {loading ? <div className="list-status">Loading mail…</div> : null}
            {!loading && messages.length === 0 ? (
              <div className="empty-state">
                <div className="mail-icon" aria-hidden="true">✉</div>
                <h2>{search ? "No matching messages." : `No messages in ${currentFolderLabel.toLowerCase()}.`}</h2>
                <p>{search ? "Try a different search." : "Messages will appear here as soon as they arrive or are sent."}</p>
              </div>
            ) : null}
            {!loading && messages.map((message) => (
              <button className={`message-row ${message.isRead ? "" : "unread"}`} key={message.id} type="button" onClick={() => void openMessage(message.id)}>
                <span className="star-indicator" aria-label={message.isStarred ? "Starred" : undefined}>{message.isStarred ? "★" : ""}</span>
                <span className="sender">{senderLabel(message)}</span>
                <span className="subject-line"><strong>{message.subject || "(no subject)"}</strong><span> — {message.preview}</span></span>
                {message.hasAttachments ? <span className="paperclip" aria-label="Has attachments">⌕</span> : null}
                <time>{formatDate(message.sentAt || message.receivedAt)}</time>
              </button>
            ))}
          </div>
        )}
      </section>

      {composeOpen ? (
        <div className="compose-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) setComposeOpen(false); }}>
          <form className="compose-panel" onSubmit={submitCompose}>
            <header><strong>{compose.replyToMessageId ? "Reply" : "New message"}</strong><button type="button" aria-label="Close compose" disabled={sending} onClick={() => setComposeOpen(false)}>×</button></header>
            <label><span>To</span><input required autoFocus value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="name@example.com" /></label>
            <div className="compose-split">
              <label><span>Cc</span><input value={compose.cc} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} /></label>
              <label><span>Bcc</span><input value={compose.bcc} onChange={(event) => setCompose({ ...compose, bcc: event.target.value })} /></label>
            </div>
            <label><span>Subject</span><input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
            <textarea required aria-label="Message" value={compose.text} onChange={(event) => setCompose({ ...compose, text: event.target.value })} placeholder="Write your message…" />
            {files.length > 0 ? <div className="selected-files">{files.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}</div> : null}
            <footer>
              <label className="attach-button">Attach<input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
              <button className="send-button" type="submit" disabled={sending}>{sending ? "Sending…" : "Send"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
