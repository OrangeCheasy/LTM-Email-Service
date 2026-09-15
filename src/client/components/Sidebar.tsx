import type { Folder, FolderDefinition, HealthState, NotificationState } from "../mailTypes";
import { Icon } from "./Icon";

type SidebarProps = {
  folders: FolderDefinition[];
  activeFolder: Folder;
  unreadCount: number;
  draftCount: number;
  health: HealthState;
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  onFolderChange: (folder: Folder) => void;
  onCompose: () => void;
  onToggleNotifications: () => void;
};

function notificationText(state: NotificationState): string {
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

export function Sidebar({ folders, activeFolder, unreadCount, draftCount, health, notificationState, notificationsDisabled, onFolderChange, onCompose, onToggleNotifications }: SidebarProps) {
  return (
    <aside className="desktop-sidebar">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true"><Icon name="mail" size={17} /></div>
        <div className="brand-copy">
          <strong className="brand-title">LTM Mails</strong>
        </div>
      </div>

      <button className="primary-compose" type="button" onClick={onCompose}>
        <Icon name="compose" size={17} />
        <span>New message</span>
      </button>

      <nav className="folder-nav" aria-label="Mail folders">
        <div className="nav-label">Mailbox</div>
        {folders.map((item) => {
          const count = item.key === "inbox" ? unreadCount : item.key === "drafts" ? draftCount : 0;
          return (
            <button
              key={item.key}
              className={`nav-item ${activeFolder === item.key ? "active" : ""}`}
              type="button"
              onClick={() => onFolderChange(item.key)}
            >
              <span className="nav-item-main"><Icon name={item.icon} size={17} />{item.label}</span>
              {count > 0 ? <span className="nav-count">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <button className="notification-card" type="button" disabled={notificationsDisabled} onClick={onToggleNotifications}>
        <span className={`notification-icon ${notificationState === "on" ? "enabled" : ""}`}><Icon name="bell" size={16} /></span>
        <span className="notification-copy"><strong>{notificationText(notificationState)}</strong><small>Push alerts for new mail</small></span>
      </button>

      <div className="account-card">
        <div className="account-avatar"><Icon name="mail" size={14} /></div>
        <div><strong>Private mailbox</strong><span><i className={`status-dot ${health}`} />{health === "online" ? "Connected" : health === "checking" ? "Connecting" : "Offline"}</span></div>
        <Icon name="lock" size={15} />
      </div>
    </aside>
  );
}
