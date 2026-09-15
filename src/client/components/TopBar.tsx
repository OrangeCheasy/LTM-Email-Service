import type { FormEvent } from "react";
import type { NotificationState } from "../mailTypes";
import { notificationLabel } from "../mailUtils";
import { Icon } from "./Icon";

type TopBarProps = {
  search: string;
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  profilePhotoUrl: string | null;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onToggleNotifications: () => void;
  onOpenProfile: () => void;
};

export function TopBar({
  search,
  notificationState,
  notificationsDisabled,
  profilePhotoUrl,
  onSearchChange,
  onSearch,
  onToggleNotifications,
  onOpenProfile,
}: TopBarProps) {
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <header className="desktop-topbar">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true"><Icon name="mail" size={18} /></span>
        <strong className="topbar-brand-title">LTM Mails</strong>
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
        {search ? <button className="topbar-search-clear" type="button" aria-label="Clear search" onClick={() => onSearchChange("")}>×</button> : null}
        <button className="topbar-search-submit" type="submit"><Icon name="search" size={14} />Search</button>
      </form>

      <div className="topbar-status">
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
        <button className="topbar-profile" type="button" aria-label="Open profile settings" onClick={onOpenProfile}>
          <span className="topbar-profile-avatar">{profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : "LM"}</span>
          <span><small>Private mailbox</small><strong>LTM</strong></span>
        </button>
      </div>
    </header>
  );
}
