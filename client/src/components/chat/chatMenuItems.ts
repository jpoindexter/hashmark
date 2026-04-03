import type { ContextMenuItem } from "../shared/ContextMenu";
import type { Message } from "./MessageBubbles";

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "- ");
}

export function buildUserMenuItems(msg: Message): ContextMenuItem[] {
  return [
    {
      label: "Copy Text",
      onClick: () => {
        void navigator.clipboard.writeText(msg.content);
      },
    },
  ];
}

export function buildAssistantMenuItems(msg: Message, messages: Message[]): ContextMenuItem[] {
  const msgIndex = messages.findIndex((m) => m.id === msg.id);
  let lastUserMsg: Message | undefined;
  for (let i = msgIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserMsg = messages[i];
      break;
    }
  }

  const items: ContextMenuItem[] = [
    {
      label: "Copy Text",
      onClick: () => {
        void navigator.clipboard.writeText(stripMarkdown(msg.content));
      },
    },
    {
      label: "Copy as Markdown",
      onClick: () => {
        void navigator.clipboard.writeText(msg.content);
      },
    },
  ];

  if (lastUserMsg) {
    items.push({ label: "", onClick: () => {}, separator: true });
    items.push({
      label: "Retry",
      onClick: () => {
        window.dispatchEvent(
          new CustomEvent("studio:suggest", { detail: { text: lastUserMsg.content } })
        );
      },
    });
  }

  return items;
}
