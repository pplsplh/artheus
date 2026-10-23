import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_S = 7 * 24 * 3600;

/**
 * Cek tanda tangan initData dari Telegram Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Mengembalikan user id kalau valid, null kalau tidak.
 */
export function verifyInitData(initData: string, botToken: string, nowS = Date.now() / 1000): number | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();

  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || nowS - authDate > MAX_AGE_S) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as { id?: number } | null;
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

/**
 * Izinkan request ke API quest kalau:
 * - initData Telegram valid dan milik TELEGRAM_ALLOWED_CHAT_ID, atau
 * - header x-quest-key sama dengan QUEST_WEB_KEY (untuk buka dari browser biasa), atau
 * - sedang dev lokal tanpa TELEGRAM_BOT_TOKEN.
 */
export function isOwnerRequest(headers: Headers): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const allowed = process.env.TELEGRAM_ALLOWED_CHAT_ID ?? "";

  const userId = verifyInitData(headers.get("x-tg-init-data") ?? "", token);
  if (userId !== null && allowed && String(userId) === allowed) return true;

  const webKey = process.env.QUEST_WEB_KEY ?? "";
  const givenKey = headers.get("x-quest-key") ?? "";
  if (webKey.length >= 16 && givenKey.length === webKey.length) {
    if (timingSafeEqual(Buffer.from(givenKey), Buffer.from(webKey))) return true;
  }

  return process.env.NODE_ENV !== "production" && !token;
}
