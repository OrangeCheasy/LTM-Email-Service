import type { FormEvent } from "react";
import type { HealthState, NotificationState } from "../mailTypes";
import { Icon } from "./Icon";

type TopBarProps = {
  search: string;
  health: HealthState;
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onToggleNotifications: () => void;
};

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

export function TopBar({
  search,
  health,
  notificationState,
  notificationsDisabled,
  onSearchChange,
  onSearch,
  onToggleNotifications,
}: TopBarProps) {
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <header className="desktop-topbar">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true"><Icon name="mail" size={20} /></span>
        <strong>LTM Mails</strong>
        <span className="topbar-brand-divider" aria-hidden="true" />
        <span className="topbar-context">Private • Personal</span>
      </div>

      <form className="topbar-search" role="search" onSubmit={submitSearch}>
        <Icon name="search" size={18} />
        <input
          aria-label="Search mail"
          type="search"
          placeholder="Search emails, people, or keywords…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {search ? (
          <button className="topbar-search-clear" type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>×</button>
        ) : null}
        <button className="topbar-search-submit" type="submit"><Icon name="search" size={14} />Search</button>
      </form>

      <div className="topbar-status">
        <span className="system-status"><i className={`status-dot ${health}`} />{health === "online" ? "All systems good" : health === "checking" ? "Connecting" : "Offline"}</span>
        <button
          className={`topbar-icon-button notification-${notificationState}`}
          type="button"
          aria-label={notificationLabel(notificationState)}
          title={notificationLabel(notificationState)}
          disabled={notificationsDisabled}
          onClick={onToggleNotifications}
        >
          <Icon name="bell" size={19} />
          {notificationState === "on" ? <i className="topbar-notification-dot" aria-hidden="true" /> : null}
        </button>
        <div className="topbar-profile" aria-label="Current mailbox">
          <span className="topbar-profile-avatar">LM</span>
          <span><small>Good evening,</small><strong>LTM</strong></span>
        </div>
      </div>
    </header>
  );
}
