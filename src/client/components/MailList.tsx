import { useEffect, useMemo, useRef, useState } from "react";
import type { Folder, MessageListItem, NotificationState } from "../mailTypes";
import { formatDate, notificationLabel, senderLabel } from "../mailUtils";
import { Icon } from "./Icon";
import { SenderAvatar } from "./SenderAvatar";
import { TopBar } from "./TopBar";

type Props = {
  folder: Folder;
  folderLabel: string;
  messages: MessageListItem[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  unreadCount: number;
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  onSearchChange: (v: string) => void;
  onRefresh: () => void | Promise<void>;
  onOpenMessage: (id: string) => void;
  onToggleNotifications: () => void;
};

type ListFilter = "all" | "unread" | "starred";
const PULL_TRIGGER_PX = 64;
const MAX_PULL_PX = 86;

function updatedLabel(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return "Updating…";
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 5) return "Last updated just now";
  if (seconds < 60) return `Last updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last updated ${days}d ago`;
}

export function MailList({
  folder,
  folderLabel,
  messages,
  selectedId,
  loading,
  search,
  unreadCount,
  notificationState,
  notificationsDisabled,
  onSearchChange,
  onRefresh,
  onOpenMessage,
  onToggleNotifications,
}: Props) {
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pullRefreshingRef = useRef(false);
  const filtersEnabled = folder !== "drafts";

  const setPullOffset = (distance: number) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  };

  useEffect(() => {
    if (!loading) {
      const now = Date.now();
      setLastUpdatedAt(now);
      setClock(now);
    }
  }, [messages, loading]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const resetPull = () => {
      touchStartY.current = null;
      if (!pullRefreshingRef.current) setPullOffset(0);
    };

    const refreshFromPull = async () => {
      if (pullRefreshingRef.current) return;
      pullRefreshingRef.current = true;
      setPullRefreshing(true);
      setPullOffset(48);
      try {
        await onRefresh();
      } finally {
        pullRefreshingRef.current = false;
        setPullRefreshing(false);
        setPullOffset(0);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (node.scrollTop <= 0 && !pullRefreshingRef.current) {
        touchStartY.current = event.touches[0]?.clientY ?? null;
      } else {
        touchStartY.current = null;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (touchStartY.current === null || pullRefreshingRef.current) return;
      if (node.scrollTop > 0) {
        resetPull();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? touchStartY.current;
      const delta = currentY - touchStartY.current;
      if (delta <= 0) {
        setPullOffset(0);
        return;
      }

      // iPadOS Safari/PWA can hand the gesture to native overscroll before
      // React's synthetic touch handler sees enough movement. This listener is
      // deliberately non-passive so the mailbox owns a downward pull at top.
      if (event.cancelable) event.preventDefault();
      setPullOffset(Math.min(MAX_PULL_PX, delta * 0.55));
    };

    const handleTouchEnd = () => {
      const shouldRefresh = pullDistanceRef.current >= PULL_TRIGGER_PX;
      touchStartY.current = null;
      if (shouldRefresh && !pullRefreshingRef.current) {
        void refreshFromPull();
      } else if (!pullRefreshingRef.current) {
        setPullOffset(0);
      }
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", resetPull, { passive: true });

    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", resetPull);
    };
  }, [onRefresh]);

  const threadedMessages = useMemo(() => {
    if (folder === "drafts") return messages;
    const collapsed = new Map<string, MessageListItem>();
    for (const item of messages) {
      const existing = collapsed.get(item.threadId);
      if (!existing) collapsed.set(item.threadId, { ...item });
      else {
        if (!item.isRead) existing.isRead = false;
        if (item.isStarred) existing.isStarred = true;
        if (item.hasAttachments) existing.hasAttachments = true;
      }
    }
    return [...collapsed.values()];
  }, [folder, messages]);

  const visible = useMemo(
    () => !filtersEnabled || listFilter === "all"
      ? threadedMessages
      : listFilter === "unread"
        ? threadedMessages.filter((message) => !message.isRead)
        : threadedMessages.filter((message) => message.isStarred),
    [filtersEnabled, listFilter, threadedMessages],
  );

  return <section className="mail-list-pane">
    <TopBar search={search} notificationState={notificationState} notificationsDisabled={notificationsDisabled} onSearchChange={onSearchChange} onSearch={onRefresh} onToggleNotifications={onToggleNotifications}/>
    <header className="mail-list-header">
      <div><div className="eyebrow">{folder === "inbox" && unreadCount > 0 ? `${unreadCount} unread` : "Mailbox"}</div><h1>{folderLabel}</h1><div className="mail-last-updated" aria-live="polite">{updatedLabel(lastUpdatedAt, clock)}</div></div>
      <div className="mail-list-header-actions">
        <button className={`icon-button mobile-notification-button notification-${notificationState}`} type="button" aria-label={notificationLabel(notificationState)} title={notificationLabel(notificationState)} disabled={notificationsDisabled} onClick={onToggleNotifications}><Icon name="bell" size={17}/>{notificationState === "on" ? <i className="mobile-notification-status" aria-hidden="true"/> : null}</button>
        <button className="icon-button" type="button" aria-label="Refresh mailbox" title="Refresh mailbox" onClick={() => void onRefresh()}><Icon name="refresh" size={17}/></button>
      </div>
    </header>
    <div className="search-wrap mail-list-search"><Icon name="search" size={17}/><input aria-label="Search mail" placeholder={folder === "drafts" ? "Search drafts…" : "Search emails, people, or keywords…"} value={search} onChange={(event) => onSearchChange(event.target.value)}/>{search ? <button type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>×</button> : null}</div>
    {filtersEnabled ? <div className="mail-filter-tabs" role="tablist" aria-label="Message filters"><button type="button" className={listFilter === "all" ? "active" : ""} onClick={() => setListFilter("all")}>All</button><button type="button" className={listFilter === "unread" ? "active" : ""} onClick={() => setListFilter("unread")}>Unread</button><button type="button" className={listFilter === "starred" ? "active" : ""} onClick={() => setListFilter("starred")}>Starred</button></div> : <div className="draft-list-label">Autosaved drafts</div>}
    <div ref={scrollRef} className="mail-list-scroll" aria-busy={loading || pullRefreshing}>
      <div aria-live="polite" style={{ height: pullDistance, opacity: pullDistance > 8 ? 1 : 0, display: "grid", placeItems: "center", overflow: "hidden", transition: touchStartY.current === null ? "height 160ms ease, opacity 160ms ease" : "none", color: "var(--muted)", fontSize: 11 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="refresh" size={15}/>{pullRefreshing ? "Refreshing…" : pullDistance >= PULL_TRIGGER_PX ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
      {loading ? <div className="mail-list-state">Loading mail…</div> : null}
      {!loading && visible.length === 0 ? <div className="mail-list-empty"><div className="empty-orb"><Icon name={search ? "search" : folder === "drafts" ? "draft" : "inbox"} size={22}/></div><strong>{search ? "No results" : folder === "drafts" ? "No saved drafts" : listFilter === "all" ? `No mail in ${folderLabel.toLowerCase()}` : `No ${listFilter} messages`}</strong><span>{search ? "Try a different name, subject, or phrase." : folder === "drafts" ? "Messages you start writing will autosave here." : "Messages will appear here when they arrive."}</span></div> : null}
      {!loading && visible.map((message) => <button key={message.id} className={`mail-row ${message.isRead ? "" : "unread"} ${message.isDraft ? "draft-row" : ""} ${selectedId === message.id ? "selected" : ""}`} type="button" onClick={() => onOpenMessage(message.id)}><span className="mail-row-unread-marker" aria-hidden="true"/><SenderAvatar message={message}/><div className="mail-row-copy"><div className="mail-row-topline"><span className="mail-row-sender">{message.isDraft ? `Draft · ${message.toAddresses.join(", ") || "No recipient"}` : message.direction === "outbound" ? `To: ${senderLabel(message)}` : senderLabel(message)}</span><time>{formatDate(message.sentAt || message.receivedAt)}</time></div><div className="mail-row-subject"><strong>{message.subject || "(no subject)"}</strong>{message.isStarred ? <span className="star-mark">★</span> : null}{message.hasAttachments ? <span className="attachment-mark"><Icon name="paperclip" size={13}/></span> : null}</div><p>{message.preview || (message.isDraft ? "Empty draft" : "No preview available")}</p></div></button>)}
    </div>
  </section>;
}
