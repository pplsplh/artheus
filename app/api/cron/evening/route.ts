import { NextRequest, NextResponse } from "next/server";
import { listOpenTasks } from "@/lib/google-tasks";
import { esc, sendMessage } from "@/lib/telegram";
import { getDay, getStreak } from "@/lib/quest-engine";
import { renderQuests } from "@/lib/quest-bot";
import { addDays, todayWIB } from "@/lib/date";

/** Sekitar 20.00 WIB: ingatkan quest yang belum selesai dan tugas yang deadline-nya besok */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!chatId) return NextResponse.json({ ok: false, error: "TELEGRAM_ALLOWED_CHAT_ID kosong" });

  const today = todayWIB();
  const sent: string[] = [];

  const [day, streak] = await Promise.all([getDay(today), getStreak(today)]);
  const pending = day.quests.filter((q) => q.status === "todo").length;
  if (day.scheduled && pending) {
    const header = day.cleared
      ? `🌙 <b>Hari ini sudah aman.</b> Masih ada ${pending} quest kalau mau tambah XP.`
      : `🌙 <b>${streak.streak ? `Streak ${streak.streak} hari belum aman.` : "Quest hari ini belum aman."}</b> Kurang ${
          day.target - day.done
        } quest lagi.${streak.shieldLeft ? " Perisai minggu ini masih ada." : ""}`;
    const r = renderQuests(day, streak, header);
    await sendMessage(chatId, r.text, { reply_markup: r.reply_markup });
    sent.push("quests");
  }

  try {
    const tomorrow = addDays(today, 1);
    const dueTomorrow = (await listOpenTasks()).filter((t) => t.due?.slice(0, 10) === tomorrow);
    if (dueTomorrow.length) {
      const list = dueTomorrow.map((t, i) => `${i + 1}. ${esc(t.title)}`).join("\n");
      await sendMessage(chatId, `⏰ <b>Deadline besok</b>\n\n${list}`);
      sent.push("tomorrow");
    }
  } catch (err) {
    console.error("Cek deadline besok gagal:", err);
  }

  return NextResponse.json({ ok: true, sent });
}
