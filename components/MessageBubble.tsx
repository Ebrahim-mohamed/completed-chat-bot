import type { ChatMessage } from "@/lib/types";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`message-enter flex w-full ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        dir="auto"
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? "bg-accent text-white rounded-br-sm"
            : "bg-panelAlt text-textPrimary rounded-bl-sm border border-border"
        }`}
      >
        {message.audioUrl && (
          <audio controls src={message.audioUrl} className="max-w-full" />
        )}
        {message.content}
        {message.transcript && (
          <p className="mt-2 text-xs opacity-80">{message.transcript}</p>
        )}
      </div>
    </div>
  );
}