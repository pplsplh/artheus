/**
 * Klien Upstash Redis lewat REST (tanpa dependency).
 * Env diisi otomatis oleh integrasi Upstash di Vercel Marketplace:
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, atau KV_REST_API_URL + KV_REST_API_TOKEN.
 * Kalau env kosong dan bukan production, pakai memori lokal (untuk `npm run dev`).
 */

type Cmd = (string | number)[];

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

export function redisConfigured(): boolean {
  return Boolean(url() && token());
}

/** Jalankan beberapa perintah sekaligus. Hasil sesuai urutan perintah. */
export async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  if (!cmds.length) return [];
  if (!redisConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Redis belum disambungkan: isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN");
    }
    return cmds.map(memory);
  }

  const res = await fetch(`${url()}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = data.find((d) => d.error);
  if (failed) throw new Error(`Redis: ${failed.error}`);
  return data.map((d) => d.result);
}

export async function cmd(c: Cmd): Promise<unknown> {
  return (await pipeline([c]))[0];
}

/** Ubah balasan HGETALL (array datar [k, v, k, v]) jadi object */
export function toHash(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) out[k] = String(v);
  }
  return out;
}

// ---------- Penyimpanan memori untuk dev lokal ----------
const g = globalThis as unknown as { __questMem?: Map<string, string | Map<string, string>> };
const mem = (g.__questMem ??= new Map());

function hashOf(key: string): Map<string, string> {
  let h = mem.get(key);
  if (!(h instanceof Map)) {
    h = new Map();
    mem.set(key, h);
  }
  return h;
}

function memory(c: Cmd): unknown {
  const [op, key, ...a] = c.map(String);
  switch (op.toUpperCase()) {
    case "GET": {
      const v = mem.get(key);
      return typeof v === "string" ? v : null;
    }
    case "SET":
      mem.set(key, a[0]);
      return "OK";
    case "SETNX":
      if (mem.has(key)) return 0;
      mem.set(key, a[0]);
      return 1;
    case "HGETALL":
      return [...hashOf(key).entries()].flat();
    case "HGET":
      return hashOf(key).get(a[0]) ?? null;
    case "HSET":
      for (let i = 0; i + 1 < a.length; i += 2) hashOf(key).set(a[i], a[i + 1]);
      return 1;
    case "HDEL":
      return a.filter((f) => hashOf(key).delete(f)).length;
    case "HINCRBY": {
      const h = hashOf(key);
      const n = Number(h.get(a[0]) ?? 0) + Number(a[1]);
      h.set(a[0], String(n));
      return n;
    }
    default:
      throw new Error(`Perintah ${op} belum didukung di memori lokal`);
  }
}
