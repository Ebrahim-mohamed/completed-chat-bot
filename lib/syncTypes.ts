export type SyncState =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "SUCCEEDED_WITH_WARNINGS"
  | "FAILED";

export interface SyncError {
  code: string;
  stage: string | null;
  source_file: string | null;
  sheet: string | null;
  message: string;
  hint: string;
  retryable: boolean;
  at: string;
}

export interface SyncFileProgress {
  source_file: string;
  stage: string;
  percent: number;
  rows: number | null;
  embeddings_total?: number | null;
  embeddings_done?: number | null;
  error: SyncError | null;
}

export interface SyncUnmatchedContract {
  sheet_name: string;
  contract_id: string;
  source_file: string | null;
}

export interface SyncRunProgress {
  run_id: string | null;
  task_id?: string;
  state: SyncState;
  status?: string;
  phase: string;
  is_complete: boolean;
  progress?: {
    percent: number;
    files?: {
      total: number;
      done: number;
      failed: number;
      skipped: number;
      deleted: number;
    };
    embeddings?: {
      total: number;
      done: number;
    };
    current?: {
      source_file: string;
      stage: string;
      detail: string | null;
    } | null;
  };
  timing?: {
    started_at: string | null;
    finished_at: string | null;
    data_switched_at: string | null;
    elapsed_seconds: number | null;
    eta_seconds: number | null;
    eta_basis: string | null;
  };
  files?: SyncFileProgress[];
  errors?: SyncError[];
  warnings?: {
    invariants?: Record<string, unknown>;
    unmatched_contracts?: SyncUnmatchedContract[];
  };
}

// POST /api/sync  (202) and the 409 body
export interface SyncStartResponse {
  task_id?: string;
  status?: string;
  status_url?: string;
  detail?: string;
  run_id?: string;
  progress_url?: string;
}

// GET /api/sync/{task_id}/status
export interface SyncTaskStatus {
  task_id: string;
  status: string;
  progress?: SyncRunProgress;
}