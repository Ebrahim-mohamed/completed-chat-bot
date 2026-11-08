import { NextRequest, NextResponse } from "next/server";
import { UPDATE_ENDPOINT } from "@/lib/backendConfig";
import { callSyncBackend } from "@/lib/syncProxy";

export const dynamic = "force-dynamic";

// A run id (UUID) or the word "latest".
const ID_PATTERN = /^[0-9a-zA-Z-]{1,64}$/;

interface RouteContext {
  params: Promise<{ runId: string }> | { runId: string };
}

// GET /api/sync/runs/{runId}/progress -> progress of one run (or "latest").
export async function GET(req: NextRequest, context: RouteContext) {
  const { runId } = await context.params;

  if (!ID_PATTERN.test(runId)) {
    return NextResponse.json(
      { error: "Invalid run id.", detail: "Invalid run id." },
      { status: 400 }
    );
  }

  return callSyncBackend(
    req,
    `${UPDATE_ENDPOINT}/runs/${encodeURIComponent(runId)}/progress`,
    "GET"
  );
}