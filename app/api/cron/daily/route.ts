import { NextRequest, NextResponse } from "next/server";
import { listOpenTasks } from "@/lib/google-tasks";
import { dailyDigest } from "@/lib/digest";
import { sendMessage } from "@/lib/telegram";
import { getDay, getStreak } from "@/lib/quest-engine";
import { renderQuests } from "@/lib/quest-bot";
import { todayWIB } from "@/lib/date";

export async function GET(req: NextRequest) {
  // Vercel Cron mengirim header ini otomatis kalau CRON_SECRET di-set
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!chatId) return NextResponse.json({ ok: false, error: "TELEGRAM_ALLOWED_CHAT_ID kosong" });

  const r = dailyDigest(await listOpenTasks());
  await sendMessage(chatId, r.text, { reply_markup: r.reply_markup });

  // Daily quest dikirim terpisah supaya tombolnya tidak bercampur dengan tombol tugas
  try {
    const today = todayWIB();
    const [day, streak] = await Promise.all([getDay(today), getStreak(today)]);
    if (day.scheduled) {
      const q = renderQuests(day, streak);
      await sendMessage(chatId, q.text, { reply_markup: q.reply_markup });
    }
  } catch (err) {
    console.error("Daily quest pagi gagal:", err);
  }

  return NextResponse.json({ ok: true });
}
