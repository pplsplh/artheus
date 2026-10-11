import { todayWIB, weekdayWIB } from "./date";

export type ParsedTask = { title: string; due: string | null; notes: string | null };

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

/** Gemini (gratis, ada batas pemakaian). Dipakai kalau GEMINI_API_KEY diisi. */
async function askGemini(text: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** Claude (berbayar, butuh saldo API di console.anthropic.com) */
async function askClaude(text: string): Promise<string> {
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
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

export async function parseTask(text: string): Promise<ParsedTask> {
  const fallback: ParsedTask = { title: text.trim().slice(0, 200), due: null, notes: null };

  try {
    const raw = process.env.GEMINI_API_KEY ? await askGemini(text) : await askClaude(text);
    const p = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Partial<
      Record<keyof ParsedTask, unknown>
    >;

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