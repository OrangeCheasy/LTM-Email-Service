import type { Folder, FolderDefinition } from "../mailTypes";
import { Icon } from "./Icon";

type MobileNavProps = {
  folders: FolderDefinition[];
  activeFolder: Folder;
  unreadCount: number;
  onFolderChange: (folder: Folder) => void;
  onCompose: () => void;
};

export function MobileNav({ folders, activeFolder, unreadCount, onFolderChange, onCompose }: MobileNavProps) {
  return (
    <>
      <button className="mobile-compose-fab" type="button" aria-label="Compose new message" onClick={onCompose}><Icon name="compose" size={22} /></button>
      <nav className="mobile-nav" aria-label="Mobile mail folders">
        {folders.map((item) => (
          <button key={item.key} className={activeFolder === item.key ? "active" : ""} type="button" onClick={() => onFolderChange(item.key)}>
            <span className="mobile-nav-icon"><Icon name={item.icon} size={18} />{item.key === "inbox" && unreadCount > 0 ? <i>{unreadCount}</i> : null}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
