import { useState } from "react";
import type { MessageListItem } from "../mailTypes";
import { senderInitial } from "../mailUtils";
import { Icon } from "./Icon";

type SenderAvatarProps = {
  message: MessageListItem;
};

export function SenderAvatar({ message }: SenderAvatarProps) {
  const [failed, setFailed] = useState(false);
  const photoUrl = !message.isDraft && !failed
    ? message.senderAvatarUrl
    : null;

  return (
    <i
      className="sender-avatar"
      aria-hidden="true"
      style={{ fontStyle: "normal", overflow: "hidden" }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : message.isDraft ? (
        <Icon name="draft" size={16} />
      ) : (
        senderInitial(message)
      )}
    </i>
  );
}
