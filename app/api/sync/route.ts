import { NextRequest } from "next/server";
import { UPDATE_ENDPOINT } from "@/lib/backendConfig";
import { callSyncBackend } from "@/lib/syncProxy";

export const dynamic = "force-dynamic";

// POST /api/sync -> start a sync (202), or 409 if one is already running.
export async function POST(req: NextRequest) {
  return callSyncBackend(req, UPDATE_ENDPOINT, "POST");
}