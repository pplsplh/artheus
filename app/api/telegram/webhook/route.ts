import { NextRequest, NextResponse } from "next/server";
import { completeTask, createTask, listOpenTasks } from "@/lib/google-tasks";
import { parseTask } from "@/lib/parse-task";
import { allTasks, dailyDigest } from "@/lib/digest";
import { esc, sendMessage, tg } from "@/lib/telegram";
import { prettyDate } from "@/lib/date";

type InlineKeyboard = { text: string; callback_data?: string }[][];

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
/tugas – semua tugas terbuka`;

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
  if (command) return void (await sendMessage(chatId, `Perintah nggak dikenal.\n\n${HELP}`));

  const task = await parseTask(text);
  await createTask(task.title, task.due, task.notes);

  const lines = [`✅ Tersimpan: <b>${esc(task.title)}</b>`];
  lines.push(task.due ? `📅 ${prettyDate(task.due)}` : "📅 Tanpa deadline");
  if (task.notes) lines.push(`📝 ${esc(task.notes)}`);
  await sendMessage(chatId, lines.join("\n"));
}

async function onButton(cb: NonNullable<Update["callback_query"]>) {
  if (!isAllowed(cb.from.id) || !cb.data?.startsWith("done:") || !cb.message) {
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
