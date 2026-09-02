export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface ChatRequestBody {
  message: string;
  session_id: string;
  brand_filter?: string;
}

export interface ChatResponseBody {
  answer: string;
  [key: string]: unknown;
}

export interface UpdateRequestBody {
  session_id: string;
}

export interface UpdateResponseBody {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}
