import type { FormEvent } from "react";
import type { ComposeState } from "../mailTypes";
import { Icon } from "./Icon";

type ComposeModalProps = {
  open: boolean;
  compose: ComposeState;
  files: File[];
  sending: boolean;
  onChange: (next: ComposeState) => void;
  onFilesChange: (files: File[]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ComposeModal({ open, compose, files, sending, onChange, onFilesChange, onClose, onSubmit }: ComposeModalProps) {
  if (!open) return null;

  return (
    <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) onClose(); }}>
      <form className="compose-modal" onSubmit={onSubmit}>
        <header className="compose-header">
          <div>
            <span className="eyebrow">{compose.replyToMessageId ? "Conversation" : "Compose"}</span>
            <strong>{compose.replyToMessageId ? "Reply" : "New message"}</strong>
          </div>
          <button className="compose-close" type="button" aria-label="Close compose" disabled={sending} onClick={onClose}>×</button>
        </header>

        <div className="compose-fields">
          <label><span>To</span><input required autoFocus value={compose.to} onChange={(event) => onChange({ ...compose, to: event.target.value })} placeholder="name@example.com" /></label>
          <div className="compose-inline-fields">
            <label><span>Cc</span><input value={compose.cc} onChange={(event) => onChange({ ...compose, cc: event.target.value })} /></label>
            <label><span>Bcc</span><input value={compose.bcc} onChange={(event) => onChange({ ...compose, bcc: event.target.value })} /></label>
          </div>
          <label><span>Subject</span><input value={compose.subject} onChange={(event) => onChange({ ...compose, subject: event.target.value })} placeholder="What’s this about?" /></label>
        </div>

        <textarea required className="compose-body" aria-label="Message" value={compose.text} onChange={(event) => onChange({ ...compose, text: event.target.value })} placeholder="Write your message…" />

        {files.length > 0 ? (
          <div className="file-chips">
            {files.map((file) => <span key={`${file.name}-${file.lastModified}`}><Icon name="paperclip" size={13} />{file.name}</span>)}
          </div>
        ) : null}

        <footer className="compose-footer">
          <label className="attach-control"><Icon name="paperclip" size={16} /><span>Attach</span><input type="file" multiple onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))} /></label>
          <span className="compose-from">From contact@liamthemo.com</span>
          <button className="send-control" type="submit" disabled={sending}><Icon name="send" size={15} />{sending ? "Sending…" : "Send"}</button>
        </footer>
      </form>
    </div>
  );
}
