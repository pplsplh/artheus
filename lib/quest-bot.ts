import { editable, type DaySummary, type StreakInfo } from "./quest-engine";
import { prettyDate } from "./date";
import { esc } from "./telegram";

type Button = { text: string; callback_data?: string; web_app?: { url: string } };
export type QuestMessage = { text: string; reply_markup?: { inline_keyboard: Button[][] } };

/** URL Mini App. Pakai MINIAPP_URL kalau diisi, kalau tidak dari domain production Vercel. */
export function miniAppUrl(): string | null {
  if (process.env.MINIAPP_URL) return process.env.MINIAPP_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/quest` : null;
}

const ICON = { done: "✅", skipped: "⏭", todo: "▫️" } as const;

export function questButtonData(date: string, id: string) {
  return `q:${date}:${id}`;
}

export function renderQuests(day: DaySummary, streak: StreakInfo, header?: string): QuestMessage {
  const lines = [header ?? `⚔️ <b>Daily Quest — ${prettyDate(day.date)}</b>`, ""];

  if (!day.scheduled) {
    lines.push("Nggak ada quest terjadwal hari ini.");
  } else {
    for (const q of day.quests) {
      const target = q.target ? ` <i>(${esc(q.target)})</i>` : "";
      const title = q.status === "todo" ? esc(q.title) : `<s>${esc(q.title)}</s>`;
      lines.push(`${ICON[q.status]} ${title}${target} · ${q.stat} +${q.xp}`);
    }
    // Header khusus (pengingat malam) sudah menjelaskan status streak
    if (!header) {
      lines.push("");
      const left = Math.max(0, day.target - day.done);
      if (day.cleared) lines.push(`🔥 Hari ini aman · streak ${streak.streak} hari`);
      else {
        const prefix = streak.streak ? `🔥 Streak ${streak.streak} hari · s` : "🔥 S";
        lines.push(`${prefix}elesaikan ${left} lagi untuk mengamankan hari ini`);
      }
      if (!day.cleared && streak.shieldLeft) lines.push("🛡 Perisai minggu ini masih ada");
    }
  }

  const rows: Button[][] = [];
  // Tombol ✓ hanya untuk tanggal yang masih bisa diubah (pesan lama tidak memunculkan tombol mati)
  const pending = editable(day.date) ? day.quests.filter((q) => q.status === "todo") : [];
  for (let i = 0; i < pending.length; i += 2) {
    rows.push(
      pending.slice(i, i + 2).map((q) => ({
        text: `✓ ${q.title.length > 22 ? `${q.title.slice(0, 21)}…` : q.title}`,
        callback_data: questButtonData(day.date, q.id),
      }))
    );
  }
  const url = miniAppUrl();
  if (url) rows.push([{ text: "🗡 Buka Quest Log", web_app: { url } }]);

  return { text: lines.join("\n"), reply_markup: rows.length ? { inline_keyboard: rows } : undefined };
}
