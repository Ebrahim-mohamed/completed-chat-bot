/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ComponentPropsWithoutRef, ElementType } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { ChatMessage } from "@/lib/types";
import { arabicFont } from "@/lib/fonts";
import "./markdown.css";

type MdProps<T extends ElementType> = ComponentPropsWithoutRef<T> & {
  node?: unknown;
};

// dir="auto" on every block so each one follows its own first strong
// character (the invisible direction marks are kept untouched in the text).
const markdownComponents: Components = {
  p: ({ node, ...props }: MdProps<"p">) => <p dir="auto" {...props} />,
  li: ({ node, ...props }: MdProps<"li">) => <li dir="auto" {...props} />,
  ul: ({ node, ...props }: MdProps<"ul">) => <ul dir="auto" {...props} />,
  ol: ({ node, ...props }: MdProps<"ol">) => <ol dir="auto" {...props} />,
  h1: ({ node, ...props }: MdProps<"h1">) => <h1 dir="auto" {...props} />,
  h2: ({ node, ...props }: MdProps<"h2">) => <h2 dir="auto" {...props} />,
  h3: ({ node, ...props }: MdProps<"h3">) => <h3 dir="auto" {...props} />,
  h4: ({ node, ...props }: MdProps<"h4">) => <h4 dir="auto" {...props} />,
  blockquote: ({ node, ...props }: MdProps<"blockquote">) => (
    <blockquote dir="auto" {...props} />
  ),
  th: ({ node, ...props }: MdProps<"th">) => <th dir="auto" {...props} />,
  td: ({ node, ...props }: MdProps<"td">) => <td dir="auto" {...props} />,
  table: ({ node, ...props }: MdProps<"table">) => (
    <div className="md-table-wrap">
      <table {...props} />
    </div>
  ),
  a: ({ node, ...props }: MdProps<"a">) => (
    <a target="_blank" rel="noopener noreferrer" {...props} />
  ),
};

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
        className={`${arabicFont.className} max-w-[75%] rounded-2xl px-4 py-3 text-[15px] ${
          isUser
            ? "whitespace-pre-wrap leading-relaxed bg-accent text-white rounded-br-sm"
            : "bg-panelAlt text-textPrimary rounded-bl-sm border border-border"
        }`}
      >
        {isUser ? (
          <>
            {message.audioUrl && (
              <audio controls src={message.audioUrl} className="max-w-full" />
            )}
            {message.content}
            {message.transcript && (
              <p dir="auto" className="mt-2 text-xs opacity-80">
                {message.transcript}
              </p>
            )}
          </>
        ) : (
          <div className="md-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}