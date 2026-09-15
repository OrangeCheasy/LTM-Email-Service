import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposeModal } from "./components/ComposeModal";
import { MailList } from "./components/MailList";
import { MessageReader } from "./components/MessageReader";
import { MobileNav } from "./components/MobileNav";
import { Sidebar } from "./components/Sidebar";
import type { ComposeState, DraftDetail, Folder, FolderDefinition, HealthState, MessageDetail, MessageListItem, NotificationState } from "./mailTypes";
import { formatFullDate, forwardSubject, replySubject } from "./mailUtils";

const folders: FolderDefinition[] = [
  { key: "inbox", label: "Inbox", icon: "inbox" },
  { key: "starred", label: "Starred", icon: "star" },
  { key: "sent", label: "Sent", icon: "send" },
  { key: "drafts", label: "Drafts", icon: "draft" },
  { key: "archive", label: "Archive", icon: "archive" },
  { key: "trash", label: "Trash", icon: "trash" },
];

const emptyCompose: ComposeState = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  text: "",
  replyToMessageId: "",
  forwardMessageId: "",
  draftId: "",
};
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

function hasDraftContent(compose: ComposeState): boolean {
  return Boolean(
    compose.to.trim()
    || compose.cc.trim()
    || compose.bcc.trim()
    || compose.subject.trim()
    || compose.text.trim()
    || compose.replyToMessageId
    || compose.forwardMessageId,
  );
}

function forwardedBody(message: MessageDetail): string {
  const from = message.direction === "outbound"
    ? "contact@liamthemo.com"
    : message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress;
  const to = message.toAddresses.join(", ") || "contact@liamthemo.com";
  const date = formatFullDate(message.sentAt || message.receivedAt);
  return `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${date}\nSubject: ${message.subject || "(no subject)"}\nTo: ${to}\n\n${message.bodyText || ""}`;
}

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<MessageDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(emptyCompose);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationState>("checking");
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const persistedDraftIds = useRef(new Set<string>());
  const draftFilesCache = useRef(new Map<string, File[]>());

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
      const data = await response.json() as { messages: MessageListItem[]; unreadCount: number; draftCount: number };
      setMessages(data.messages);
      setUnreadCount(data.unreadCount);
      setDraftCount(data.draftCount);
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

  const persistDraft = useCallback(async (snapshot: ComposeState): Promise<void> => {
    if (!snapshot.draftId || !hasDraftContent(snapshot)) return;
    setDraftStatus("saving");
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: snapshot.draftId,
          to: snapshot.to,
          cc: snapshot.cc,
          bcc: snapshot.bcc,
          subject: snapshot.subject,
          text: snapshot.text,
          replyToMessageId: snapshot.replyToMessageId,
          forwardMessageId: snapshot.forwardMessageId,
        }),
      });
      if (!response.ok) throw new Error("Draft could not be saved");
      const wasKnown = persistedDraftIds.current.has(snapshot.draftId);
      persistedDraftIds.current.add(snapshot.draftId);
      if (!wasKnown) setDraftCount((count) => count + 1);
      setDraftStatus("saved");
    } catch {
      setDraftStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!composeOpen || sending || !hasDraftContent(compose)) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => void persistDraft(compose), 900);
    return () => window.clearTimeout(timer);
  }, [compose, composeOpen, persistDraft, sending]);

  const changeFolder = (next: Folder) => {
    setFolder(next);
    setSelected(null);
    setThread([]);
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

    try {
      if (listItem?.isDraft || folder === "drafts") {
        const response = await fetch(`/api/drafts/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("Could not open draft");
        const data = await response.json() as { draft: DraftDetail };
        const draft = data.draft;
        persistedDraftIds.current.add(draft.id);
        setCompose({
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          text: draft.text,
          replyToMessageId: draft.replyToMessageId,
          forwardMessageId: draft.forwardMessageId,
          draftId: draft.id,
        });
        setFiles(draftFilesCache.current.get(draft.id) ?? []);
        setDraftStatus("saved");
        setSelected(null);
        setThread([]);
        setComposeOpen(true);
        return;
      }

      const response = await fetch(`/api/messages/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Could not open message");
      const data = await response.json() as { message: MessageDetail; thread: MessageDetail[]; newlyReadCount: number };
      setSelected(data.message);
      setThread(data.thread);
      setMessages((current) => current.map((item) => item.threadId === data.message.threadId ? { ...item, isRead: true } : item));
      if (data.newlyReadCount > 0) setUnreadCount((count) => Math.max(0, count - data.newlyReadCount));
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
    if (closeAfter) {
      setSelected(null);
      setThread([]);
    } else {
      setSelected((current) => current ? { ...current, ...patch } as MessageDetail : current);
      setThread((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } as MessageDetail : item));
    }
    await loadMessages();
  };

  const startCompose = () => {
    setCompose({ ...emptyCompose, draftId: crypto.randomUUID() });
    setFiles([]);
    setDraftStatus(null);
    setComposeOpen(true);
  };

  const startReply = () => {
    if (!selected) return;
    const target = thread[thread.length - 1] ?? selected;
    const recipient = target.direction === "inbound" ? target.fromAddress : target.toAddresses[0] ?? "";
    setCompose({
      to: recipient,
      cc: "",
      bcc: "",
      subject: replySubject(target.subject),
      text: "",
      replyToMessageId: target.id,
      forwardMessageId: "",
      draftId: crypto.randomUUID(),
    });
    setFiles([]);
    setDraftStatus(null);
    setComposeOpen(true);
  };

  const startForward = () => {
    if (!selected) return;
    setCompose({
      to: "",
      cc: "",
      bcc: "",
      subject: forwardSubject(selected.subject),
      text: forwardedBody(selected),
      replyToMessageId: "",
      forwardMessageId: selected.id,
      draftId: crypto.randomUUID(),
    });
    setFiles([]);
    setDraftStatus(null);
    setComposeOpen(true);
  };

  const closeCompose = () => {
    if (hasDraftContent(compose)) void persistDraft(compose);
    if (compose.draftId && files.length > 0) draftFilesCache.current.set(compose.draftId, files);
    setComposeOpen(false);
    setFiles([]);
    setDraftStatus(null);
  };

  const discardCompose = async () => {
    const id = compose.draftId;
    if (id && persistedDraftIds.current.has(id)) {
      await fetch(`/api/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
      persistedDraftIds.current.delete(id);
      setDraftCount((count) => Math.max(0, count - 1));
    }
    if (id) draftFilesCache.current.delete(id);
    setComposeOpen(false);
    setCompose(emptyCompose);
    setFiles([]);
    setDraftStatus(null);
    if (folder === "drafts") void loadMessages("drafts", search, true);
  };

  const updateFiles = (nextFiles: File[]) => {
    setFiles(nextFiles);
    if (compose.draftId) draftFilesCache.current.set(compose.draftId, nextFiles);
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
      if (compose.forwardMessageId) form.set("forwardMessageId", compose.forwardMessageId);
      if (compose.draftId) form.set("draftId", compose.draftId);
      files.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/send", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Email could not be sent");

      if (compose.draftId && persistedDraftIds.current.has(compose.draftId)) {
        persistedDraftIds.current.delete(compose.draftId);
        setDraftCount((count) => Math.max(0, count - 1));
      }
      if (compose.draftId) draftFilesCache.current.delete(compose.draftId);

      setComposeOpen(false);
      setCompose(emptyCompose);
      setFiles([]);
      setDraftStatus(null);
      setFolder("sent");
      setSelected(null);
      setThread([]);
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
        draftCount={draftCount}
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
          selectedId={folder === "drafts" && composeOpen ? compose.draftId : selected?.id ?? null}
          loading={loading}
          search={search}
          unreadCount={unreadCount}
          notificationState={notificationState}
          notificationsDisabled={notificationsDisabled}
          onSearchChange={setSearch}
          onRefresh={() => void loadMessages()}
          onOpenMessage={(id) => void openMessage(id)}
          onToggleNotifications={() => void toggleNotifications()}
        />
        <MessageReader
          message={selected}
          thread={thread}
          onBack={() => { setSelected(null); setThread([]); }}
          onReply={startReply}
          onForward={startForward}
          onPatch={(patch, closeAfter) => void patchSelected(patch, closeAfter)}
        />
      </div>

      <MobileNav folders={folders} activeFolder={folder} unreadCount={unreadCount} draftCount={draftCount} onFolderChange={changeFolder} onCompose={startCompose} />

      <ComposeModal
        open={composeOpen}
        compose={compose}
        files={files}
        sending={sending}
        draftStatus={draftStatus}
        onChange={setCompose}
        onFilesChange={updateFiles}
        onClose={closeCompose}
        onDiscard={() => void discardCompose()}
        onSubmit={submitCompose}
      />

      {error ? <div className="toast-error" role="alert">{error}</div> : null}
    </main>
  );
}
