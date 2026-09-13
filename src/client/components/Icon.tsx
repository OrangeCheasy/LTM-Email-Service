type IconName = "inbox" | "star" | "send" | "archive" | "trash" | "search" | "compose" | "reply" | "back" | "refresh" | "paperclip" | "bell" | "lock" | "more";

type IconProps = {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, JSX.Element> = {
  inbox: <><path d="M4 5.5h16l1.5 9.5v3.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V15L4 5.5Z"/><path d="M3 15h5l1.5 2h5L16 15h5"/></>,
  star: <path d="m12 3 2.8 5.67 6.2.9-4.5 4.39 1.06 6.2L12 17.24l-5.56 2.92 1.06-6.2L3 9.57l6.2-.9L12 3Z"/>,
  send: <><path d="m21 3-7.2 18-3.3-7.5L3 10.2 21 3Z"/><path d="M10.5 13.5 21 3"/></>,
  archive: <><path d="M4 5h16v4H4z"/><path d="M6 9v10h12V9M9.5 13h5"/></>,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  compose: <><path d="M12 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7"/><path d="m14 5 5 5M11 13l8-8 2 2-8 8-4 1 1-4Z"/></>,
  reply: <><path d="m9 8-5 4 5 4"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>,
  back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18.2 9A7 7 0 1 0 19 15"/></>,
  paperclip: <path d="m9 12.5 6.8-6.8a3 3 0 1 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.1-8.1"/>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
};

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
