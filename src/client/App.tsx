import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { ComposeModal } from "./components/ComposeModal";
import { MailList } from "./components/MailList";
import { MessageReader } from "./components/MessageReader";
import { MobileNav } from "./components/MobileNav";
import { ProfileModal } from "./components/ProfileModal";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import type { ComposeState, ConnectedAccount, DraftDetail, Folder, FolderDefinition, MessageDetail, MessageListItem, NotificationState } from "./mailTypes";
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
const DETAIL_CACHE_MS = 5 * 60_000;

type DetailCacheEntry = { savedAt: number; message: MessageDetail; thread: MessageDetail[] };

function base64UrlToArrayBuffer(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(/=+$/g, "");
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("Notification key is invalid.");
  const base64 = (normalized + "=".repeat((4 - normalized.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

const hasDraftContent = (compose: ComposeState) => Boolean(
  compose.to.trim() || compose.cc.trim() || compose.bcc.trim() || compose.subject.trim() || compose.text.trim() || compose.replyToMessageId || compose.forwardMessageId,
);

function forwardedBody(message: MessageDetail) {
  const from = message.direction === "outbound"
    ? "contact@liamthemo.com"
    : message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress;
  const to = message.toAddresses.join(", ") || "contact@liamthemo.com";
  return `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${formatFullDate(message.sentAt || message.receivedAt)}\nSubject: ${message.subject || "(no subject)"}\nTo: ${to}\n\n${message.bodyText || ""}`;
}

function belongsInFolder(folder: Folder, message: MessageListItem) {
  if (message.isDraft) return folder === "drafts";
  if (folder === "trash") return message.isDeleted;
  if (message.isDeleted) return false;
  if (folder === "starred") return message.isStarred;
  if (folder === "archive") return message.isArchived;
  if (folder === "sent") return message.direction === "outbound";
  if (folder === "inbox") return !message.isArchived;
  return true;
}

export function App() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<MessageDetail[]>([]);
  const [openingMessageId, setOpeningMessageId] = useState<string | null>(null);
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
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState("native:primary");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);

  const persistedDraftIds = useRef(new Set<string>());
  const detailCache = useRef(new Map<string, DetailCacheEntry>());
  const openRequest = useRef(0);

  const detailCacheKey = useCallback((id: string) => `${activeAccountId}:${id}`, [activeAccountId]);

  const refreshAccounts = useCallback(async () => {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    if (response.ok) setAccounts((await response.json() as { accounts: ConnectedAccount[] }).accounts);
  }, []);

  useEffect(() => {
    void refreshAccounts();
    fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ hasPhoto: boolean; version: string | null }> : null)
      .then((profile) => {
        if (profile?.hasPhoto) setProfilePhotoUrl(`/api/profile/photo?v=${encodeURIComponent(profile.version ?? "1")}`);
      })
      .catch(() => undefined);
  }, [refreshAccounts]);

  useEffect(() => {
    if (!settingsOpen) return;
    fetch("/api/auth/sessions", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setSessionCount((await response.json() as { sessions: unknown[] }).sessions.length);
      })
      .catch(() => undefined);
  }, [settingsOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setNotificationState("unsupported");
        return;
      }
      try {
        const response = await fetch("/api/push/config", { cache: "no-store" });
        const config = await response.json() as { configured: boolean; publicKey: string | null };
        if (!config.configured || !config.publicKey) {
          setNotificationState("unconfigured");
          return;
        }
        setPushPublicKey(config.publicKey);
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setNotificationState(Notification.permission === "denied" ? "blocked" : subscription ? "on" : "off");
      } catch {
        if (!cancelled) setNotificationState("unsupported");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMessages = useCallback(async (activeFolder = folder, query = search, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({ folder: activeFolder, accountId: activeAccountId });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/messages?${params}`);
      if (!response.ok) throw new Error("Could not load mail");
      const data = await response.json() as { messages: MessageListItem[]; unreadCount: number; draftCount: number };
      setMessages(data.messages);
      setUnreadCount(data.unreadCount);
      setDraftCount(data.draftCount);
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "Could not load mail");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [folder, search, activeAccountId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadMessages(folder, search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [folder, search, activeAccountId, loadMessages]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadMessages(folder, search, true);
    };
    const interval = setInterval(refresh, AUTO_REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [folder, search, loadMessages]);

  const connectGmail = async () => {
    setConnectingGmail(true);
    setError(null);
    try {
      const response = await fetch("/api/accounts/gmail/connect", { method: "POST" });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start Gmail connection");
      window.location.assign(data.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect Gmail");
      setConnectingGmail(false);
    }
  };

  const switchAccount = (id: string) => {
    openRequest.current += 1;
    setActiveAccountId(id);
    setSelected(null);
    setThread([]);
    setOpeningMessageId(null);
    setSearch("");
  };

  const persistDraft = useCallback(async (current: ComposeState) => {
    if (!current.draftId || !hasDraftContent(current)) return;
    setDraftStatus("saving");
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: current.draftId,
          to: current.to,
          cc: current.cc,
          bcc: current.bcc,
          subject: current.subject,
          text: current.text,
          replyToMessageId: current.replyToMessageId,
          forwardMessageId: current.forwardMessageId,
        }),
      });
      if (!response.ok) throw new Error();
      const known = persistedDraftIds.current.has(current.draftId);
      persistedDraftIds.current.add(current.draftId);
      if (!known) setDraftCount((count) => count + 1);
      setDraftStatus("saved");
    } catch {
      setDraftStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!composeOpen || sending || !hasDraftContent(compose)) return;
    const timer = setTimeout(() => void persistDraft(compose), 900);
    return () => clearTimeout(timer);
  }, [compose, composeOpen, sending, persistDraft]);

  const changeFolder = (nextFolder: Folder) => {
    openRequest.current += 1;
    setFolder(nextFolder);
    setSelected(null);
    setThread([]);
    setOpeningMessageId(null);
    setSearch("");
  };

  const toggleNotifications = async () => {
    if (!pushPublicKey || ["blocked", "unsupported", "unconfigured", "checking", "working"].includes(notificationState)) return;
    setNotificationState("working");
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
      if (await Notification.requestPermission() !== "granted") {
        setNotificationState("off");
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
      if (!response.ok) throw new Error();
      setNotificationState("on");
    } catch {
      setNotificationState("off");
      setError("Could not update notifications");
    }
  };

  const removeAccount = async (id: string) => {
    if (!confirm("Remove this Gmail inbox from LTM Mails?")) return;
    setSettingsBusy("remove");
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      if (activeAccountId === id) switchAccount("native:primary");
      await refreshAccounts();
    } catch {
      setError("Could not remove Gmail inbox");
    } finally {
      setSettingsBusy(null);
    }
  };

  const addPasskey = async () => {
    setSettingsBusy("passkey");
    try {
      const optionsResponse = await fetch("/api/auth/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await optionsResponse.json() as {
        challengeId?: string;
        options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };
      if (!optionsResponse.ok || !data.challengeId || !data.options) throw new Error();
      const response = await startRegistration({ optionsJSON: data.options });
      const verifyResponse = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: data.challengeId, response }),
      });
      if (!verifyResponse.ok) throw new Error();
    } catch {
      setError("Could not add passkey");
    } finally {
      setSettingsBusy(null);
    }
  };

  const resetSessions = async () => {
    if (!confirm("Sign out every other browser and device? This device stays signed in.")) return;
    setSettingsBusy("sessions");
    try {
      const response = await fetch("/api/auth/sessions/reset", { method: "POST" });
      if (!response.ok) throw new Error();
      setSessionCount(1);
    } catch {
      setError("Could not reset sessions");
    } finally {
      setSettingsBusy(null);
    }
  };

  const logout = async () => {
    setSettingsBusy("logout");
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    location.reload();
  };

  const openMessage = async (id: string) => {
    const listItem = messages.find((message) => message.id === id);
    if (listItem?.isDraft || folder === "drafts") {
      try {
        const response = await fetch(`/api/drafts/${encodeURIComponent(id)}`);
        const data = await response.json() as { draft: DraftDetail };
        if (!response.ok) throw new Error();
        const draft = data.draft;
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
        setComposeOpen(true);
      } catch {
        setError("Could not open message");
      }
      return;
    }

    const requestId = ++openRequest.current;
    const key = detailCacheKey(id);
    const cached = detailCache.current.get(key);
    const wasUnread = Boolean(listItem && !listItem.isRead);

    setError(null);
    if (wasUnread) {
      setMessages((current) => current.map((message) => message.id === id ? { ...message, isRead: true } : message));
      setUnreadCount((count) => Math.max(0, count - 1));
    }

    if (cached && Date.now() - cached.savedAt < DETAIL_CACHE_MS) {
      setSelected(cached.message);
      setThread(cached.thread);
      setOpeningMessageId(null);
    } else {
      if (cached) detailCache.current.delete(key);
      setSelected(null);
      setThread([]);
      setOpeningMessageId(id);
    }

    try {
      const params = new URLSearchParams({ accountId: activeAccountId });
      if (listItem?.threadId) params.set("threadId", listItem.threadId);
      const response = await fetch(`/api/messages/${encodeURIComponent(id)}?${params}`);
      if (!response.ok) throw new Error();
      const data = await response.json() as { message: MessageDetail; thread: MessageDetail[]; newlyReadCount: number };
      if (requestId !== openRequest.current) return;

      const message = listItem?.senderAvatarUrl && !data.message.senderAvatarUrl
        ? { ...data.message, senderAvatarUrl: listItem.senderAvatarUrl }
        : data.message;
      const nextThread = data.thread.map((item) => item.id === message.id ? message : item);
      detailCache.current.set(key, { savedAt: Date.now(), message, thread: nextThread });
      setSelected(message);
      setThread(nextThread);
      setOpeningMessageId(null);
      setMessages((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
      if (!wasUnread && data.newlyReadCount) setUnreadCount((count) => Math.max(0, count - data.newlyReadCount));
    } catch {
      if (requestId !== openRequest.current) return;
      setOpeningMessageId(null);
      if (wasUnread) {
        setMessages((current) => current.map((message) => message.id === id ? { ...message, isRead: false } : message));
        setUnreadCount((count) => count + 1);
      }
      setError("Could not open message");
    }
  };

  const patchSelected = async (patch: Record<string, boolean>, close = false) => {
    if (!selected) return;

    const target = selected;
    const key = detailCacheKey(target.id);
    const previousMessages = messages;
    const previousSelected = selected;
    const previousThread = thread;
    const previousUnreadCount = unreadCount;
    const nextSelected = { ...target, ...patch } as MessageDetail;
    const keepInCurrentFolder = belongsInFolder(folder, nextSelected);

    setError(null);
    setMessages((current) => current
      .map((message) => message.id === target.id ? { ...message, ...patch } as MessageListItem : message)
      .filter((message) => message.id !== target.id || belongsInFolder(folder, message)));
    setThread((current) => current.map((message) => message.id === target.id ? { ...message, ...patch } as MessageDetail : message));

    if (close || !keepInCurrentFolder) {
      setSelected(null);
      setThread([]);
    } else {
      setSelected(nextSelected);
    }

    const cached = detailCache.current.get(key);
    if (cached) {
      const cachedMessage = { ...cached.message, ...patch } as MessageDetail;
      const cachedThread = cached.thread.map((message) => message.id === target.id ? cachedMessage : message);
      detailCache.current.set(key, { savedAt: Date.now(), message: cachedMessage, thread: cachedThread });
    }

    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(target.id)}?accountId=${encodeURIComponent(activeAccountId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
    } catch {
      setMessages(previousMessages);
      setSelected(previousSelected);
      setThread(previousThread);
      setUnreadCount(previousUnreadCount);
      if (cached) detailCache.current.set(key, cached);
      else detailCache.current.delete(key);
      setError("Could not update message");
    }
  };

  const startCompose = () => {
    setCompose({ ...emptyCompose, draftId: crypto.randomUUID() });
    setFiles([]);
    setDraftStatus(null);
    setComposeOpen(true);
  };

  const startReply = () => {
    if (!selected) return;
    const target = thread.at(-1) ?? selected;
    setCompose({
      ...emptyCompose,
      to: target.direction === "inbound" ? target.fromAddress : target.toAddresses[0] ?? "",
      subject: replySubject(target.subject),
      replyToMessageId: target.id,
      draftId: crypto.randomUUID(),
    });
    setComposeOpen(true);
  };

  const startForward = () => {
    if (!selected) return;
    setCompose({
      ...emptyCompose,
      subject: forwardSubject(selected.subject),
      text: forwardedBody(selected),
      forwardMessageId: selected.id,
      draftId: crypto.randomUUID(),
    });
    setComposeOpen(true);
  };

  const closeCompose = () => {
    if (hasDraftContent(compose)) void persistDraft(compose);
    setComposeOpen(false);
  };

  const discardCompose = async () => {
    if (compose.draftId) await fetch(`/api/drafts/${encodeURIComponent(compose.draftId)}`, { method: "DELETE" }).catch(() => undefined);
    setComposeOpen(false);
    setCompose(emptyCompose);
    setFiles([]);
  };

  const submitCompose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    try {
      const form = new FormData();
      form.set("accountId", activeAccountId);
      for (const key of ["to", "cc", "bcc", "subject", "text", "replyToMessageId", "forwardMessageId", "draftId"] as const) {
        if (compose[key]) form.set(key, compose[key]);
      }
      files.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/send", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Email could not be sent");
      setComposeOpen(false);
      setCompose(emptyCompose);
      setFiles([]);
      setFolder("sent");
      setSelected(null);
      setThread([]);
      setOpeningMessageId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email could not be sent");
    } finally {
      setSending(false);
    }
  };

  const closeReader = () => {
    openRequest.current += 1;
    setSelected(null);
    setThread([]);
    setOpeningMessageId(null);
  };

  const label = useMemo(() => folders.find((item) => item.key === folder)?.label ?? "Mail", [folder]);
  const notificationsDisabled = ["checking", "working", "blocked", "unsupported", "unconfigured"].includes(notificationState);
  const readerOpen = Boolean(selected || openingMessageId);

  return (
    <main className={`app-shell ${readerOpen ? "message-open" : ""}`}>
      <Sidebar
        folders={folders}
        activeFolder={folder}
        unreadCount={unreadCount}
        draftCount={draftCount}
        notificationState={notificationState}
        notificationsDisabled={notificationsDisabled}
        accounts={accounts}
        activeAccountId={activeAccountId}
        connectingGmail={connectingGmail}
        onAccountChange={switchAccount}
        onConnectGmail={() => void connectGmail()}
        onFolderChange={changeFolder}
        onCompose={startCompose}
        onToggleNotifications={() => void toggleNotifications()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="mail-workspace">
        <MailList
          folder={folder}
          folderLabel={label}
          messages={messages}
          selectedId={selected?.id ?? openingMessageId}
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
          loading={Boolean(openingMessageId && !selected)}
          onBack={closeReader}
          onReply={startReply}
          onForward={startForward}
          onPatch={(patch, closeAfter) => void patchSelected(patch, closeAfter)}
        />
      </div>
      <MobileNav
        folders={folders}
        activeFolder={folder}
        unreadCount={unreadCount}
        draftCount={draftCount}
        accounts={accounts}
        activeAccountId={activeAccountId}
        connectingGmail={connectingGmail}
        onAccountChange={switchAccount}
        onConnectGmail={() => void connectGmail()}
        onOpenSettings={() => setSettingsOpen(true)}
        onFolderChange={changeFolder}
        onCompose={startCompose}
      />
      <ComposeModal
        open={composeOpen}
        compose={compose}
        files={files}
        sending={sending}
        draftStatus={draftStatus}
        onChange={setCompose}
        onFilesChange={setFiles}
        onClose={closeCompose}
        onDiscard={() => void discardCompose()}
        onSubmit={submitCompose}
      />
      <SettingsModal
        open={settingsOpen}
        accounts={accounts}
        notificationState={notificationState}
        notificationsDisabled={notificationsDisabled}
        connectingGmail={connectingGmail}
        sessionCount={sessionCount}
        busy={settingsBusy}
        onClose={() => setSettingsOpen(false)}
        onToggleNotifications={() => void toggleNotifications()}
        onConnectGmail={() => void connectGmail()}
        onRemoveAccount={(id) => void removeAccount(id)}
        onEditProfile={() => {
          setSettingsOpen(false);
          setProfileOpen(true);
        }}
        onAddPasskey={() => void addPasskey()}
        onResetSessions={() => void resetSessions()}
        onLogout={() => void logout()}
      />
      <ProfileModal
        open={profileOpen}
        photoUrl={profilePhotoUrl}
        onClose={() => {
          setProfileOpen(false);
          setSettingsOpen(true);
        }}
        onPhotoChange={(url) => {
          setProfilePhotoUrl(url);
          void refreshAccounts();
        }}
      />
      {error ? <div className="toast-error" role="alert">{error}</div> : null}
    </main>
  );
}
