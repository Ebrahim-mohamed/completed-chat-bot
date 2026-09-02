export default function TypingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-panelAlt px-4 py-3">
        <span className="typing-dot h-2 w-2 rounded-full bg-textMuted" />
        <span className="typing-dot h-2 w-2 rounded-full bg-textMuted" />
        <span className="typing-dot h-2 w-2 rounded-full bg-textMuted" />
      </div>
    </div>
  );
}
