import { NextRequest, NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/telegram-auth";
import { completeTask } from "@/lib/google-tasks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isOwnerRequest(req.headers)) return NextResponse.json({ error: "Akses ditolak" }, { status: 401 });

  const { taskId } = (await req.json().catch(() => ({}))) as { taskId?: string };
  if (!taskId) return NextResponse.json({ error: "taskId wajib diisi" }, { status: 400 });

  try {
    await completeTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 });
  }
}
