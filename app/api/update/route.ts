import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { UPDATE_ENDPOINT, ADMIN_API_KEY } from "@/lib/backendConfig";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const res = await fetch(UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Api-Key": ADMIN_API_KEY,
      },
      body: JSON.stringify({ client_id: session.client_id }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[/api/update] backend returned ${res.status}: ${text}`);
      return NextResponse.json(
        { error: "Failed to reach the update backend." },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({ success: true }));
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[/api/update] backend call failed:", err);
    return NextResponse.json(
      { error: "Failed to reach the update backend." },
      { status: 502 }
    );
  }
}
