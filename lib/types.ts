export type ChatRole = "user" | "assistant";

export type Audience = "agent" | "patient";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  // Voice notes: local playback URL of the recorded audio + the cleaned transcript.
  audioUrl?: string;
  transcript?: string;
}

export interface ChatRequestBody {
  message: string;
  session_id: string;
  user_id: number;
  brand_filter?: string;
  audience?: Audience;
}

export interface ChatResponseBody {
  answer: string;
  [key: string]: unknown;
}

export type VoiceStatus = "answered" | "failed";

export interface VoiceResponseBody {
  reply: string;
  messages: string[];
  transcript: string | null;
  voice_status: VoiceStatus;
  failure_reason: string | null;
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