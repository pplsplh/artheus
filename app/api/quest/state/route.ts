import { NextRequest, NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/telegram-auth";
import { editable, getDay, getProfile, getStreak } from "@/lib/quest-engine";
import { listOpenTasks } from "@/lib/google-tasks";
import { addDays, todayWIB } from "@/lib/date";

export const dynamic = "force-dynamic";

const SIDE_DAYS = 7;
const SIDE_MAX = 8;

export async function GET(req: NextRequest) {
  if (!isOwnerRequest(req.headers)) return NextResponse.json({ error: "Akses ditolak" }, { status: 401 });

  const today = todayWIB();
  const asked = req.nextUrl.searchParams.get("date") ?? today;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;

  try {
    const [day, streak, profile, side] = await Promise.all([
      getDay(date),
      getStreak(today),
      getProfile(),
      sideQuests(today),
    ]);
    return NextResponse.json({ today, editable: editable(date, today), day, streak, profile, side });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

/** Tugas Google Tasks yang terlambat atau jatuh tempo dalam 7 hari. Gagal tidak menghentikan halaman. */
async function sideQuests(today: string) {
  try {
    const limit = addDays(today, SIDE_DAYS);
    const tasks = await listOpenTasks();
    const dated = tasks.filter((t) => t.due && t.due.slice(0, 10) <= limit);
    return {
      ok: true,
      items: dated.slice(0, SIDE_MAX).map((t) => ({ id: t.id, title: t.title, due: t.due!.slice(0, 10) })),
      more: dated.length - Math.min(dated.length, SIDE_MAX) + (tasks.length - dated.length),
    };
  } catch (err) {
    console.error("Side quest gagal dimuat:", err);
    return { ok: false, items: [], more: 0 };
  }
}
