import type { Folder, FolderDefinition } from "../mailTypes";
import { Icon } from "./Icon";

type MobileNavProps = {
  folders: FolderDefinition[];
  activeFolder: Folder;
  unreadCount: number;
  draftCount: number;
  onFolderChange: (folder: Folder) => void;
  onCompose: () => void;
};

export function MobileNav({ folders, activeFolder, unreadCount, draftCount, onFolderChange, onCompose }: MobileNavProps) {
  return (
    <>
      <button className="mobile-compose-fab" type="button" aria-label="Compose new message" onClick={onCompose}><Icon name="compose" size={22} /></button>
      <nav className="mobile-nav" aria-label="Mobile mail folders">
        {folders.map((item) => {
          const count = item.key === "inbox" ? unreadCount : item.key === "drafts" ? draftCount : 0;
          return (
            <button key={item.key} className={activeFolder === item.key ? "active" : ""} type="button" onClick={() => onFolderChange(item.key)}>
              <span className="mobile-nav-icon"><Icon name={item.icon} size={18} />{count > 0 ? <i>{count}</i> : null}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
