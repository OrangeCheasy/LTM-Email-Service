import type { MessageDetail } from "../mailTypes";
import { formatBytes, formatFullDate, senderInitial, senderLabel } from "../mailUtils";
import { Icon } from "./Icon";

type MessageReaderProps = {
  message: MessageDetail | null;
  onBack: () => void;
  onReply: () => void;
  onPatch: (patch: Record<string, boolean>, closeAfter?: boolean) => void;
};

export function MessageReader({ message, onBack, onReply, onPatch }: MessageReaderProps) {
  if (!message) {
    return (
      <section className="reader-pane reader-empty">
        <div className="reader-empty-card">
          <div className="reader-empty-icon"><Icon name="inbox" size={24} /></div>
          <strong>Select a message</strong>
          <span>Choose an email from the list to read it here.</span>
        </div>
      </section>
    );
  }

  const sender = message.direction === "outbound" ? "You" : senderLabel(message);
  const secondary = message.direction === "outbound"
    ? `to ${message.toAddresses.join(", ") || "Unknown recipient"}`
    : message.fromName ? message.fromAddress : `to ${message.toAddresses.join(", ") || "you"}`;

  return (
    <section className="reader-pane">
      <header className="reader-toolbar">
        <button className="reader-back" type="button" onClick={onBack}><Icon name="back" size={18} /><span>Inbox</span></button>
        <div className="reader-title-block">
          <h2>{message.subject || "(no subject)"}</h2>
          <span>{message.direction === "inbound" ? "Received message" : "Sent message"}</span>
        </div>
        <div className="reader-actions">
          <button className={message.isStarred ? "active-star" : ""} type="button" onClick={() => onPatch({ isStarred: !message.isStarred })}><Icon name="star" size={16} /><span>{message.isStarred ? "Unstar" : "Star"}</span></button>
        </div>
      </header>

      <article className="reader-scroll">
        <div className="message-heading">
          <div className="message-heading-meta">
            <span className="reader-avatar">{senderInitial(message)}</span>
            <div>
              <strong>{sender}</strong>
              <span>{secondary}</span>
            </div>
            <time>{formatFullDate(message.sentAt || message.receivedAt)}</time>
          </div>
        </div>

        {message.deliveryStatus === "failed" ? <div className="delivery-error">Delivery failed: {message.deliveryError}</div> : null}

        <div className="message-content">
          <pre>{message.bodyText || "(No readable text content)"}</pre>
          {message.bodyHtmlAvailable ? (
            <div className="security-note"><Icon name="lock" size={14} /><span>HTML is rendered safely. Remote tracking images stay blocked.</span></div>
          ) : null}
        </div>

        {message.attachments.length > 0 ? (
          <section className="reader-attachments" aria-label="Attachments">
            <div className="attachment-heading-row">
              <h3>{message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}</h3>
            </div>
            <div className="attachment-grid">
              {message.attachments.map((attachment) => {
                const href = `/api/attachments/${encodeURIComponent(attachment.id)}`;
                const isImage = attachment.contentType.startsWith("image/");
                return (
                  <a key={attachment.id} className={`attachment-card ${isImage ? "image-attachment" : ""}`} href={href}>
                    {isImage ? <img src={href} alt="" loading="lazy" /> : <span className="attachment-card-icon"><Icon name="paperclip" size={17} /></span>}
                    <span className="attachment-card-copy"><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}
      </article>

      <footer className="reader-reply-bar">
        <button className="reply-primary" type="button" onClick={onReply}><Icon name="reply" size={17} />Reply</button>
        {!message.isDeleted ? (
          <button type="button" onClick={() => onPatch({ isArchived: !message.isArchived }, true)}><Icon name="archive" size={16} />{message.isArchived ? "Unarchive" : "Archive"}</button>
        ) : null}
        {!message.isDeleted ? (
          <button className="destructive" type="button" onClick={() => onPatch({ isDeleted: true }, true)}><Icon name="trash" size={16} />Delete</button>
        ) : (
          <button type="button" onClick={() => onPatch({ isDeleted: false }, true)}><Icon name="inbox" size={16} />Restore</button>
        )}
      </footer>
    </section>
  );
}
