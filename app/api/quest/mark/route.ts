import { NextRequest, NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/telegram-auth";
import { getDay, getProfile, getStreak, setStatus, type Status } from "@/lib/quest-engine";
import { todayWIB } from "@/lib/date";

export const dynamic = "force-dynamic";

const STATUSES: Status[] = ["todo", "done", "skipped"];

export async function POST(req: NextRequest) {
  if (!isOwnerRequest(req.headers)) return NextResponse.json({ error: "Akses ditolak" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { date?: string; questId?: string; status?: string };
  if (!body.date || !body.questId || !STATUSES.includes(body.status as Status)) {
    return NextResponse.json({ error: "date, questId, dan status wajib diisi" }, { status: 400 });
  }

  try {
    const result = await setStatus(body.date, body.questId, body.status as Status);
    const [day, streak, profile] = await Promise.all([getDay(body.date), getStreak(todayWIB()), getProfile()]);
    return NextResponse.json({ result, day, streak, profile });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
