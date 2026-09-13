import { useEffect, useState } from "react";
import type { MessageDetail } from "../mailTypes";
import { formatBytes, formatFullDate, senderInitial, senderLabel } from "../mailUtils";
import { AttachmentPreview } from "./AttachmentPreview";
import { Icon } from "./Icon";

type MessageReaderProps = {
  message: MessageDetail | null;
  thread: MessageDetail[];
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onPatch: (patch: Record<string, boolean>, closeAfter?: boolean) => void;
};

function messageSender(message: MessageDetail): string {
  return message.direction === "outbound" ? "You" : senderLabel(message);
}

function messageAvatarLabel(message: MessageDetail): string {
  return message.direction === "outbound" ? "LM" : senderInitial(message);
}

function messageSecondary(message: MessageDetail): string {
  return message.direction === "outbound"
    ? `to ${message.toAddresses.join(", ") || "Unknown recipient"}`
    : message.fromName ? message.fromAddress : `to ${message.toAddresses.join(", ") || "you"}`;
}

export function MessageReader({ message, thread, onBack, onReply, onForward, onPatch }: MessageReaderProps) {
  const [previewAttachment, setPreviewAttachment] = useState<MessageDetail["attachments"][number] | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ hasPhoto: boolean; version: string | null }>;
      })
      .then((profile) => {
        if (!cancelled && profile?.hasPhoto) {
          setProfilePhotoUrl(`/api/profile/photo?v=${encodeURIComponent(profile.version ?? "1")}`);
        }
      })
      .catch(() => undefined);

    const onProfilePhotoChanged = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      setProfilePhotoUrl(customEvent.detail ?? null);
    };
    window.addEventListener("profile-photo-changed", onProfilePhotoChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-photo-changed", onProfilePhotoChanged);
    };
  }, []);

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

  const conversation = thread.length > 0 ? thread : [message];

  return (
    <section className="reader-pane">
      <header className="reader-toolbar">
        <button className="reader-back" type="button" onClick={onBack}><Icon name="back" size={18} /><span>Inbox</span></button>
        <div className="reader-title-block">
          <h2>{message.subject || "(no subject)"}</h2>
          <span>{conversation.length > 1 ? `${conversation.length} messages in this conversation` : message.direction === "inbound" ? "Received message" : "Sent message"}</span>
        </div>
        <div className="reader-actions">
          <button className={message.isStarred ? "active-star" : ""} type="button" onClick={() => onPatch({ isStarred: !message.isStarred })}><Icon name="star" size={16} /><span>{message.isStarred ? "Unstar" : "Star"}</span></button>
        </div>
      </header>

      <article className="reader-scroll conversation-thread">
        {conversation.map((item) => (
          <section key={item.id} className={`conversation-message ${item.id === message.id ? "conversation-current" : ""}`}>
            <div className="message-heading">
              <div className="message-heading-meta">
                <span className="sender-avatar reader-avatar" aria-hidden="true">
                  {item.direction === "outbound" && profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : messageAvatarLabel(item)}
                </span>
                <div>
                  <strong>{messageSender(item)}</strong>
                  <span>{messageSecondary(item)}</span>
                </div>
                <time>{formatFullDate(item.sentAt || item.receivedAt)}</time>
              </div>
            </div>

            {item.deliveryStatus === "failed" ? <div className="delivery-error">Delivery failed: {item.deliveryError}</div> : null}

            <div className="message-content">
              <pre>{item.bodyText || "(No readable text content)"}</pre>
              {item.bodyHtmlAvailable ? (
                <div className="security-note"><Icon name="lock" size={14} /><span>HTML is rendered safely. Remote tracking images stay blocked.</span></div>
              ) : null}
            </div>

            {item.attachments.length > 0 ? (
              <section className="reader-attachments" aria-label="Attachments">
                <div className="attachment-heading-row">
                  <h3>{item.attachments.length} attachment{item.attachments.length === 1 ? "" : "s"}</h3>
                </div>
                <div className="attachment-grid">
                  {item.attachments.map((attachment) => {
                    const previewHref = `/api/attachment-previews/${encodeURIComponent(attachment.id)}`;
                    const isImage = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(attachment.contentType);
                    return (
                      <button
                        key={attachment.id}
                        className={`attachment-card ${isImage ? "image-attachment" : ""}`}
                        type="button"
                        onClick={() => setPreviewAttachment(attachment)}
                      >
                        {isImage ? <img src={previewHref} alt="" loading="lazy" /> : <span className="attachment-card-icon"><Icon name="paperclip" size={17} /></span>}
                        <span className="attachment-card-copy"><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </section>
        ))}
      </article>

      <footer className="reader-reply-bar">
        <button className="reply-primary" type="button" onClick={onReply}><Icon name="reply" size={17} />Reply</button>
        <button type="button" onClick={onForward}><Icon name="forward" size={16} />Forward</button>
        {!message.isDeleted ? (
          <button type="button" onClick={() => onPatch({ isArchived: !message.isArchived }, true)}><Icon name="archive" size={16} />{message.isArchived ? "Unarchive" : "Archive"}</button>
        ) : null}
        {!message.isDeleted ? (
          <button className="destructive" type="button" onClick={() => onPatch({ isDeleted: true }, true)}><Icon name="trash" size={16} />Delete</button>
        ) : (
          <button type="button" onClick={() => onPatch({ isDeleted: false }, true)}><Icon name="inbox" size={16} />Restore</button>
        )}
      </footer>

      <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </section>
  );
}
