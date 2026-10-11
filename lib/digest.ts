import type { Task } from "./google-tasks";
import { addDays, prettyDate, todayWIB } from "./date";
import { esc } from "./telegram";

type Button = { text: string; callback_data: string };
export type Rendered = { text: string; reply_markup?: { inline_keyboard: Button[][] } };

const MAX_SHOWN = 20;
const dueOf = (t: Task) => t.due?.slice(0, 10) ?? "";

function render(header: string, sections: [string, Task[]][], footer = ""): Rendered {
  const lines: string[] = [header];
  const buttons: Button[] = [];
  let n = 0;

  for (const [label, tasks] of sections) {
    const shown = tasks.slice(0, Math.max(0, MAX_SHOWN - n));
    if (!shown.length) continue;
    lines.push("", `<b>${label}</b>`);
    for (const t of shown) {
      n++;
      const due = t.due ? ` <i>(${prettyDate(dueOf(t))})</i>` : "";
      lines.push(`${n}. ${esc(t.title)}${due}`);
      buttons.push({ text: `✅ ${n}`, callback_data: `done:${t.id}` });
    }
  }

  if (n === 0) return { text: `${header}\n\nNggak ada tugas di sini. Aman 😌${footer}` };

  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(buttons.slice(i, i + 5));
  return {
    text: `${lines.join("\n")}${footer}\n\nTekan nomor untuk menandai selesai.`,
    reply_markup: { inline_keyboard: rows },
  };
}

/** Ringkasan pagi: terlambat, hari ini, 7 hari ke depan */
export function dailyDigest(tasks: Task[]): Rendered {
  const today = todayWIB();
  const week = addDays(today, 7);
  const dated = tasks.filter((t) => t.due);
  const noDue = tasks.length - dated.length;

  return render(
    `☀️ <b>Tugas ${prettyDate(today)}</b>`,
    [
      ["⚠️ Terlambat", dated.filter((t) => dueOf(t) < today)],
      ["📌 Hari ini", dated.filter((t) => dueOf(t) === today)],
      ["🗓 7 hari ke depan", dated.filter((t) => dueOf(t) > today && dueOf(t) <= week)],
    ],
    noDue ? `\n\n+ ${noDue} tugas tanpa deadline (/tugas untuk lihat semua)` : ""
  );
}

export function allTasks(tasks: Task[]): Rendered {
  return render("📋 <b>Semua tugas terbuka</b>", [
    ["Ada deadline", tasks.filter((t) => t.due)],
    ["Tanpa deadline", tasks.filter((t) => !t.due)],
  ]);
}
