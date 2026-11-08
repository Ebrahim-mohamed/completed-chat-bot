// ---------------------------------------------------------------------------
// Dashboard  (GET /api/analytics/dashboard)
// ---------------------------------------------------------------------------

export type Traffic = "all" | "users";

export interface AnalyticsItem {
  name: string;
  category: string | null;
  group: string | null;
  kind: string;
  count: number;
  conversations: number;
  percentage: number;
}

export interface PerformanceBreakdown {
  answered: number;
  menu_offered: number;
  unavailable_reported: number;
  knowledge_gap: number;
  existing_item_unanswered: number;
  technical_error: number;
  verification_failed: number;
}

export interface PerformanceSummary {
  total_searches: number;
  accuracy_rate: number;
  knowledge_gap_rate: number;
  ai_error_rate: number;
  breakdown: PerformanceBreakdown;
  entity_coverage_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
}

export interface DashboardAnalytics {
  period: {
    period_from: string;
    period_to: string;
  };
  traffic: Traffic;
  performance_summary: PerformanceSummary;
  top_searches: AnalyticsItem[];
  knowledge_gaps: AnalyticsItem[];
  unavailable_services: AnalyticsItem[];
  ai_errors: AnalyticsItem[];
}

// ---------------------------------------------------------------------------
// User history  (GET /api/analytics/user-history)
// ---------------------------------------------------------------------------

export interface UserHistorySummary {
  sessions: number;
  messages: number;
  first_message_at: string | null;
  last_message_at: string | null;
  outcomes: Record<string, number>;
}

export interface UserHistorySession {
  session_id: string;
  title: string | null;
  audience: string | null;
  deleted: boolean;
  turns: number;
}

export interface UserHistorySubject {
  kind: string;
  name: string;
  category: string | null;
  group: string | null;
}

export interface UserHistoryTurn {
  session_id: string;
  created_at: string;
  user_message: string | null;
  assistant_reply: string | null;
  intent: string | null;
  outcome_status: string | null;
  routing_outcome: string | null;
  modality: string | null;
  latency_ms: number | null;
  subjects: UserHistorySubject[];
}

export interface UserHistoryResponse {
  user_id: string;
  summary: UserHistorySummary;
  sessions: UserHistorySession[];
  turns: UserHistoryTurn[];
  has_more: boolean;
  next_before: string | null;
}