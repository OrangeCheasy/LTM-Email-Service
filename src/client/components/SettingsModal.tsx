import type { ConnectedAccount, NotificationState } from "../mailTypes";
import { notificationLabel } from "../mailUtils";

type Props = {
  open: boolean;
  accounts: ConnectedAccount[];
  notificationState: NotificationState;
  notificationsDisabled: boolean;
  connectingGmail: boolean;
  sessionCount: number | null;
  busy: string | null;
  onClose: () => void;
  onToggleNotifications: () => void;
  onConnectGmail: () => void;
  onRemoveAccount: (id: string) => void;
  onEditProfile: () => void;
  onViewSessions: () => void;
  onResetSessions: () => void;
  onLogout: () => void;
};

export function SettingsModal(props: Props) {
  if (!props.open) return null;

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <span>Private mailbox</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            className="settings-close"
            type="button"
            onClick={props.onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div className="settings-scroll">
          <section className="settings-section">
            <h3>Inboxes</h3>
            <p>Accounts available inside LTM Mails.</p>
            <div className="settings-accounts">
              {props.accounts.map((account) => (
                <div className="settings-account" key={account.id}>
                  {account.avatarUrl ? (
                    <img src={account.avatarUrl} alt="" />
                  ) : (
                    <span className="settings-avatar-fallback">
                      {account.emailAddress[0]?.toUpperCase()}
                    </span>
                  )}
                  <div>
                    <strong>{account.displayName || account.emailAddress}</strong>
                    <small>
                      {account.provider === "gmail" ? "Google · " : "Custom · "}
                      {account.emailAddress}
                    </small>
                  </div>
                  {account.provider === "gmail" ? (
                    <button
                      type="button"
                      disabled={props.busy !== null}
                      onClick={() => props.onRemoveAccount(account.id)}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={props.busy !== null}
                      onClick={props.onEditProfile}
                    >
                      Edit profile
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="settings-primary"
              type="button"
              disabled={props.connectingGmail || props.busy !== null}
              onClick={props.onConnectGmail}
            >
              {props.connectingGmail ? "Connecting…" : "Add Gmail inbox"}
            </button>
          </section>

          <section className="settings-section">
            <h3>Notifications</h3>
            <div className="settings-row">
              <div>
                <strong>Push notifications</strong>
                <small>
                  {notificationLabel(props.notificationState)} · alerts contain no sender or subject
                </small>
              </div>
              <button
                type="button"
                disabled={props.notificationsDisabled}
                onClick={props.onToggleNotifications}
              >
                {props.notificationState === "on" ? "Turn off" : "Turn on"}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Security &amp; sessions</h3>
            <div className="settings-row">
              <div>
                <strong>Passkeys</strong>
                <small>Passkey creation is disabled after initial setup.</small>
              </div>
              <span className="settings-locked">Locked</span>
            </div>
            <div className="settings-row">
              <div>
                <strong>Active sessions</strong>
                <small>
                  {props.sessionCount === null
                    ? "Checking…"
                    : `${props.sessionCount} signed-in session${props.sessionCount === 1 ? "" : "s"}`}
                </small>
              </div>
              <div className="settings-row-actions">
                <button
                  type="button"
                  disabled={props.busy !== null}
                  onClick={props.onViewSessions}
                >
                  View all
                </button>
                <button
                  type="button"
                  disabled={props.busy !== null}
                  onClick={props.onResetSessions}
                >
                  Reset others
                </button>
              </div>
            </div>
            <div className="settings-row danger">
              <div>
                <strong>Log out</strong>
                <small>End this browser session and require your passkey again.</small>
              </div>
              <button
                type="button"
                disabled={props.busy !== null}
                onClick={props.onLogout}
              >
                Log out
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
