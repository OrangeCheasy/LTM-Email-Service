import { useMemo, useState } from "react";
import type { Folder, MessageListItem, NotificationState } from "../mailTypes";
import { formatDate, senderInitial, senderLabel } from "../mailUtils";
import { Icon } from "./Icon";
import { TopBar } from "./TopBar";

type MailListProps = {
  folder: Folder;
  folderLabel: string;
  messages: MessageListItem[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  unreadCount: number;
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onOpenMessage: (id: string) => void;
  onToggleNotifications: () => void;
};

type ListFilter = "all" | "unread" | "starred";

function notificationLabel(state: NotificationState): string {
  switch (state) {
    case "on": return "Notifications on";
    case "off": return "Enable notifications";
    case "blocked": return "Notifications blocked";
    case "unsupported": return "Notifications unavailable";
    case "unconfigured": return "Notification setup needed";
    case "working": return "Updating notifications";
    default: return "Checking notifications";
  }
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
}: MailListProps) {
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const filtersEnabled = folder !== "drafts";
  const threadedMessages = useMemo(() => {
    if (folder === "drafts") return messages;
    const conversations = new Map<string, MessageListItem>();
    for (const item of messages) {
      const existing = conversations.get(item.threadId);
      if (!existing) {
        conversations.set(item.threadId, { ...item });
        continue;
      }
      if (!item.isRead) existing.isRead = false;
      if (item.isStarred) existing.isStarred = true;
      if (item.hasAttachments) existing.hasAttachments = true;
    }
    return [...conversations.values()];
  }, [folder, messages]);
  const visibleMessages = useMemo(() => {
    if (!filtersEnabled) return threadedMessages;
    if (listFilter === "unread") return threadedMessages.filter((message) => !message.isRead);
    if (listFilter === "starred") return threadedMessages.filter((message) => message.isStarred);
    return threadedMessages;
  }, [filtersEnabled, listFilter, threadedMessages]);

  return (
    <section className="mail-list-pane">
      <TopBar
        search={search}
        notificationState={notificationState}
        notificationsDisabled={notificationsDisabled}
        onSearchChange={onSearchChange}
        onSearch={onRefresh}
        onToggleNotifications={onToggleNotifications}
      />

      <header className="mail-list-header">
        <div>
          <div className="eyebrow">{folder === "inbox" && unreadCount > 0 ? `${unreadCount} unread` : "Mailbox"}</div>
          <h1>{folderLabel}</h1>
        </div>
        <div className="mail-list-header-actions">
          <button
            className={`icon-button mobile-notification-button notification-${notificationState}`}
            type="button"
            aria-label={notificationLabel(notificationState)}
            title={notificationLabel(notificationState)}
            disabled={notificationsDisabled}
            onClick={onToggleNotifications}
          >
            <Icon name="bell" size={17} />
            {notificationState === "on" ? <i className="mobile-notification-status" aria-hidden="true" /> : null}
          </button>
          <button className="icon-button" type="button" aria-label="Refresh mailbox" onClick={onRefresh}><Icon name="refresh" size={17} /></button>
        </div>
      </header>

      <div className="search-wrap mail-list-search">
        <Icon name="search" size={17} />
        <input aria-label="Search mail" placeholder={folder === "drafts" ? "Search drafts…" : "Search emails, people, or keywords…"} value={search} onChange={(event) => onSearchChange(event.target.value)} />
        {search ? <button type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>×</button> : null}
      </div>

      {filtersEnabled ? (
        <div className="mail-filter-tabs" role="tablist" aria-label="Message filters">
          <button type="button" className={listFilter === "all" ? "active" : ""} onClick={() => setListFilter("all")}>All</button>
          <button type="button" className={listFilter === "unread" ? "active" : ""} onClick={() => setListFilter("unread")}>Unread</button>
          <button type="button" className={listFilter === "starred" ? "active" : ""} onClick={() => setListFilter("starred")}>Starred</button>
        </div>
      ) : <div className="draft-list-label">Autosaved drafts</div>}

      <div className="mail-list-scroll" aria-busy={loading}>
        {loading ? <div className="mail-list-state">Loading mail…</div> : null}
        {!loading && visibleMessages.length === 0 ? (
          <div className="mail-list-empty">
            <div className="empty-orb"><Icon name={search ? "search" : folder === "drafts" ? "draft" : "inbox"} size={22} /></div>
            <strong>{search ? "No results" : folder === "drafts" ? "No saved drafts" : listFilter === "all" ? `No mail in ${folderLabel.toLowerCase()}` : `No ${listFilter} messages`}</strong>
            <span>{search ? "Try a different name, subject, or phrase." : folder === "drafts" ? "Messages you start writing will autosave here." : "Messages will appear here when they arrive."}</span>
          </div>
        ) : null}

        {!loading && visibleMessages.map((message) => (
          <button
            key={message.id}
            className={`mail-row ${message.isRead ? "" : "unread"} ${message.isDraft ? "draft-row" : ""} ${selectedId === message.id ? "selected" : ""}`}
            type="button"
            onClick={() => onOpenMessage(message.id)}
          >
            <span className="mail-row-unread-marker" aria-hidden="true" />
            <div className="sender-avatar" aria-hidden="true">{message.isDraft ? <Icon name="draft" size={16} /> : senderInitial(message)}</div>
            <div className="mail-row-copy">
              <div className="mail-row-topline">
                <span className="mail-row-sender">{message.isDraft ? `Draft · ${message.toAddresses.join(", ") || "No recipient"}` : message.direction === "outbound" ? `To: ${senderLabel(message)}` : senderLabel(message)}</span>
                <time>{formatDate(message.sentAt || message.receivedAt)}</time>
              </div>
              <div className="mail-row-subject">
                <strong>{message.subject || "(no subject)"}</strong>
                {message.isStarred ? <span className="star-mark">★</span> : null}
                {message.hasAttachments ? <span className="attachment-mark"><Icon name="paperclip" size={13} /></span> : null}
              </div>
              <p>{message.preview || (message.isDraft ? "Empty draft" : "No preview available")}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
