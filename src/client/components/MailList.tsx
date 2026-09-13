import type { Folder, MessageListItem } from "../mailTypes";
import { formatDate, senderInitial, senderLabel } from "../mailUtils";
import { Icon } from "./Icon";

type MailListProps = {
  folder: Folder;
  folderLabel: string;
  messages: MessageListItem[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  unreadCount: number;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onOpenMessage: (id: string) => void;
};

export function MailList({ folder, folderLabel, messages, selectedId, loading, search, unreadCount, onSearchChange, onRefresh, onOpenMessage }: MailListProps) {
  return (
    <section className="mail-list-pane">
      <header className="mail-list-header">
        <div>
          <div className="eyebrow">{folder === "inbox" && unreadCount > 0 ? `${unreadCount} unread` : "Mailbox"}</div>
          <h1>{folderLabel}</h1>
        </div>
        <button className="icon-button" type="button" aria-label="Refresh mailbox" onClick={onRefresh}><Icon name="refresh" size={17} /></button>
      </header>

      <div className="search-wrap">
        <Icon name="search" size={17} />
        <input aria-label="Search mail" placeholder="Search mail" value={search} onChange={(event) => onSearchChange(event.target.value)} />
        {search ? <button type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>×</button> : null}
      </div>

      <div className="mail-list-scroll" aria-busy={loading}>
        {loading ? <div className="mail-list-state">Loading mail…</div> : null}
        {!loading && messages.length === 0 ? (
          <div className="mail-list-empty">
            <div className="empty-orb"><Icon name={search ? "search" : "inbox"} size={22} /></div>
            <strong>{search ? "No results" : `No mail in ${folderLabel.toLowerCase()}`}</strong>
            <span>{search ? "Try a different name, subject, or phrase." : "Messages will appear here when they arrive."}</span>
          </div>
        ) : null}

        {!loading && messages.map((message) => (
          <button
            key={message.id}
            className={`mail-row ${message.isRead ? "" : "unread"} ${selectedId === message.id ? "selected" : ""}`}
            type="button"
            onClick={() => onOpenMessage(message.id)}
          >
            <div className="sender-avatar" aria-hidden="true">{senderInitial(message)}</div>
            <div className="mail-row-copy">
              <div className="mail-row-topline">
                <span className="mail-row-sender">{message.direction === "outbound" ? `To: ${senderLabel(message)}` : senderLabel(message)}</span>
                <time>{formatDate(message.sentAt || message.receivedAt)}</time>
              </div>
              <div className="mail-row-subject">
                {!message.isRead ? <i className="unread-dot" /> : null}
                <strong>{message.subject || "(no subject)"}</strong>
                {message.isStarred ? <span className="star-mark">★</span> : null}
                {message.hasAttachments ? <span className="attachment-mark"><Icon name="paperclip" size={13} /></span> : null}
              </div>
              <p>{message.preview || "No preview available"}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
