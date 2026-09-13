import type { MessageListItem } from "../mailTypes";
import { senderInitial } from "../mailUtils";
import { Icon } from "./Icon";

type SenderAvatarProps = {
  message: MessageListItem;
};

export function SenderAvatar({ message }: SenderAvatarProps) {
  return (
    <span className="sender-avatar" aria-hidden="true">
      {message.isDraft ? <Icon name="draft" size={16} /> : senderInitial(message)}
    </span>
  );
}
