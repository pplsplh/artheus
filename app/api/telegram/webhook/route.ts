import { NextRequest, NextResponse } from "next/server";
import { completeTask, createTask, listOpenTasks } from "@/lib/google-tasks";
import { parseTask } from "@/lib/parse-task";
import { allTasks, dailyDigest } from "@/lib/digest";
import { esc, sendMessage, tg } from "@/lib/telegram";
import { prettyDate, todayWIB } from "@/lib/date";
import { getDay, getStreak, setStatus } from "@/lib/quest-engine";
import { renderQuests } from "@/lib/quest-bot";

type InlineKeyboard = { text: string; callback_data?: string; web_app?: { url: string } }[][];

type Update = {
  message?: { chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number }; message_id: number; reply_markup?: { inline_keyboard: InlineKeyboard } };
  };
};

const HELP = `Kirim tugas dengan bahasa biasa, contoh:
<i>esai Inovasi Pendidikan kumpul Jumat</i>
<i>revisi Bab 2 sempro besok, cek catatan Pak Cepi</i>

Perintah:
/hari_ini – yang terlambat, hari ini, dan 7 hari ke depan
/tugas – semua tugas terbuka
/quest – daily quest hari ini`;

const isAllowed = (chatId: number) => String(chatId) === process.env.TELEGRAM_ALLOWED_CHAT_ID;

export async function POST(req: NextRequest) {
  // Tolak request yang bukan dari Telegram
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse("forbidden", { status: 401 });
  }

  const update = (await req.json()) as Update;
  try {
    if (update.callback_query) await onButton(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (err) {
    console.error(err);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId && isAllowed(chatId)) {
      await sendMessage(chatId, `❌ Ada error: ${esc(String(err)).slice(0, 300)}`);
    }
  }
  // Selalu balas 200 supaya Telegram tidak mengirim ulang update yang sama
  return NextResponse.json({ ok: true });
}

async function onMessage(msg: NonNullable<Update["message"]>) {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) {
    await sendMessage(chatId, `Bot ini privat.\nChat ID kamu: <code>${chatId}</code>`);
    return;
  }

  const text = msg.text?.trim();
  if (!text) return;
  const command = text.startsWith("/") ? text.split(/[\s@]/)[0].toLowerCase() : null;

  if (command === "/start" || command === "/help") return void (await sendMessage(chatId, HELP));
  if (command === "/hari_ini") {
    const r = dailyDigest(await listOpenTasks());
    return void (await sendMessage(chatId, r.text, { reply_markup: r.reply_markup }));
  }
  if (command === "/tugas") {
    const r = allTasks(await listOpenTasks());
    return void (await sendMessage(chatId, r.text, { reply_markup: r.reply_markup }));
  }
  if (command === "/quest") return void (await sendQuests(chatId));
  if (command) return void (await sendMessage(chatId, `Perintah nggak dikenal.\n\n${HELP}`));

  const task = await parseTask(text);
  await createTask(task.title, task.due, task.notes);

  const lines = [`✅ Tersimpan: <b>${esc(task.title)}</b>`];
  lines.push(task.due ? `📅 ${prettyDate(task.due)}` : "📅 Tanpa deadline");
  if (task.notes) lines.push(`📝 ${esc(task.notes)}`);
  await sendMessage(chatId, lines.join("\n"));
}

async function onButton(cb: NonNullable<Update["callback_query"]>) {
  if (!isAllowed(cb.from.id) || !cb.message) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  if (cb.data?.startsWith("q:")) return void (await onQuestButton(cb));
  if (!cb.data?.startsWith("done:")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }

  await completeTask(cb.data.slice("done:".length));
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Selesai ✅" });

  // Hapus tombol yang barusan ditekan
  const rows = (cb.message.reply_markup?.inline_keyboard ?? [])
    .map((row) => row.filter((b) => b.callback_data !== cb.data))
    .filter((row) => row.length);
  await tg("editMessageReplyMarkup", {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendQuests(chatId: number) {
  const today = todayWIB();
  const [day, streak] = await Promise.all([getDay(today), getStreak(today)]);
  const r = renderQuests(day, streak);
  await sendMessage(chatId, r.text, { reply_markup: r.reply_markup });
}

/** Tombol "q:<tanggal>:<id>" → tandai quest selesai, lalu perbarui pesan yang sama */
async function onQuestButton(cb: NonNullable<Update["callback_query"]>) {
  const [, date, id] = (cb.data ?? "").split(":");
  const msg = cb.message!;
  let notice = "";
  try {
    const r = await setStatus(date, id, "done");
    notice = r.xpDelta ? `+${r.xpDelta} XP` : "Sudah selesai";
    if (r.levelUp) notice += ` · LEVEL UP! Lv ${r.levelUp}`;
  } catch (err) {
    notice = String(err instanceof Error ? err.message : err).slice(0, 180);
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: notice });

  const [day, streak] = await Promise.all([getDay(date), getStreak(todayWIB())]);
  const r = renderQuests(day, streak);
  await tg("editMessageText", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text: r.text,
    parse_mode: "HTML",
    reply_markup: r.reply_markup ?? { inline_keyboard: [] },
  });
}
