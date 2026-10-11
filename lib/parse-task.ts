import { todayWIB, weekdayWIB } from "./date";

export type ParsedTask = { title: string; due: string | null; notes: string | null };

type ContentBlock = { type: string; text?: string };

function systemPrompt(): string {
  return `Kamu mengubah satu pesan (bahasa Indonesia, boleh santai) menjadi satu tugas.
Hari ini ${weekdayWIB()}, ${todayWIB()} (zona Asia/Jakarta).

Balas HANYA dengan JSON, tanpa teks lain dan tanpa backtick:
{"title": string, "due": "YYYY-MM-DD" atau null, "notes": string atau null}

Aturan:
- title: singkat dan jelas, diawali kata kerja kalau masuk akal. Buang keterangan waktunya.
- due: isi hanya kalau pesan menyebut waktu ("besok", "lusa", "Jumat", "tgl 20", "akhir bulan").
  Nama hari = hari itu yang terdekat SETELAH hari ini. Jangan mengarang deadline.
- notes: detail tambahan (link, nama dosen, catatan). null kalau tidak ada.`;
}

export async function parseTask(text: string): Promise<ParsedTask> {
  const fallback: ParsedTask = { title: text.trim().slice(0, 200), due: null, notes: null };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        system: systemPrompt(),
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      console.error("Claude API error:", res.status, await res.text());
      return fallback;
    }

    const data = (await res.json()) as { content?: ContentBlock[] };
    const raw = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const p = JSON.parse(raw) as Partial<Record<keyof ParsedTask, unknown>>;

    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (!title) return fallback;
    const due = typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : null;
    const notes = typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : null;

    return { title: title.slice(0, 200), due, notes };
  } catch (err) {
    console.error("Parse gagal, pakai teks mentah:", err);
    return fallback;
  }
}
