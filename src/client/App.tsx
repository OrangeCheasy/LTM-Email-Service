import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ComposeModal } from "./components/ComposeModal";
import { MailList } from "./components/MailList";
import { MessageReader } from "./components/MessageReader";
import { MobileNav } from "./components/MobileNav";
import { Sidebar } from "./components/Sidebar";
import type { ComposeState, Folder, FolderDefinition, HealthState, MessageDetail, MessageListItem, NotificationState } from "./mailTypes";
import { replySubject } from "./mailUtils";

const folders: FolderDefinition[] = [
  { key: "inbox", label: "Inbox", icon: "inbox" },
  { key: "starred", label: "Starred", icon: "star" },
  { key: "sent", label: "Sent", icon: "send" },
  { key: "archive", label: "Archive", icon: "archive" },
  { key: "trash", label: "Trash", icon: "trash" },
];

const emptyCompose: ComposeState = { to: "", cc: "", bcc: "", subject: "", text: "", replyToMessageId: "" };
const AUTO_REFRESH_MS = 15_000;

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.trim().replace(/\s+/g, "").replace(/=+$/g, "");
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("Notification key is invalid. Re-save the VAPID public key and redeploy.");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
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

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const changeFolder = (next: Folder) => {
    setFolder(next);
    setSelected(null);
    setSearch("");
  };

  const toggleNotifications = async () => {
    if (!pushPublicKey || ["blocked", "unsupported", "unconfigured", "checking", "working"].includes(notificationState)) return;
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
    const listItem = messages.find((message) => message.id === id);
    const wasUnreadInbound = Boolean(listItem && !listItem.isRead && listItem.direction === "inbound");

    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Could not open message");
      const data = await response.json() as { message: MessageDetail };
      setSelected(data.message);
      setMessages((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
      if (wasUnreadInbound) setUnreadCount((count) => Math.max(0, count - 1));
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
    <main className={`app-shell ${selected ? "message-open" : ""}`}>
      <Sidebar
        folders={folders}
        activeFolder={folder}
        unreadCount={unreadCount}
        health={health}
        notificationState={notificationState}
        notificationsDisabled={notificationsDisabled}
        onFolderChange={changeFolder}
        onCompose={startCompose}
        onToggleNotifications={() => void toggleNotifications()}
      />

      <div className="mail-workspace">
        <MailList
          folder={folder}
          folderLabel={currentFolderLabel}
          messages={messages}
          selectedId={selected?.id ?? null}
          loading={loading}
          search={search}
          unreadCount={unreadCount}
          onSearchChange={setSearch}
          onRefresh={() => void loadMessages()}
          onOpenMessage={(id) => void openMessage(id)}
        />
        <MessageReader
          message={selected}
          onBack={() => setSelected(null)}
          onReply={startReply}
          onPatch={(patch, closeAfter) => void patchSelected(patch, closeAfter)}
        />
      </div>

      <MobileNav folders={folders} activeFolder={folder} unreadCount={unreadCount} onFolderChange={changeFolder} onCompose={startCompose} />

      <ComposeModal
        open={composeOpen}
        compose={compose}
        files={files}
        sending={sending}
        onChange={setCompose}
        onFilesChange={setFiles}
        onClose={() => setComposeOpen(false)}
        onSubmit={submitCompose}
      />

      {error ? <div className="toast-error" role="alert">{error}</div> : null}
    </main>
  );
}
