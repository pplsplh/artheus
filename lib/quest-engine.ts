import { cmd, pipeline, toHash } from "./redis";
import { STATS, clearTarget, questById, questsFor, type Quest, type Stat } from "./quests";
import { addDays, todayWIB } from "./date";

export type Status = "todo" | "done" | "skipped";

const LOG = (ymd: string) => `quest:log:${ymd}`;
const XP_KEY = "quest:xp";
const SINCE_KEY = "quest:since";
const STREAK_SCAN = 45; // hari yang dibaca per batch saat menghitung streak

// ---------- Level & rank ----------

/** XP untuk naik dari level L ke L+1 */
export const xpToNext = (level: number) => 100 + 20 * (level - 1);

export function levelInfo(totalXp: number) {
  let level = 1;
  let floor = 0;
  while (totalXp >= floor + xpToNext(level)) {
    floor += xpToNext(level);
    level++;
  }
  return { level, intoLevel: totalXp - floor, needed: xpToNext(level) };
}

export function rankOf(level: number): string {
  if (level >= 50) return "S";
  if (level >= 35) return "A";
  if (level >= 20) return "B";
  if (level >= 10) return "C";
  if (level >= 5) return "D";
  return "E";
}

export const statLevel = (xp: number) => Math.floor(Math.max(0, xp) / 60) + 1;

// ---------- Hari ----------

export type DayQuest = Quest & { status: Status };

export type DaySummary = {
  date: string;
  quests: DayQuest[];
  done: number;
  skipped: number;
  scheduled: number;
  target: number;
  cleared: boolean;
};

function summarize(date: string, log: Record<string, string>): DaySummary {
  const quests = questsFor(date).map((q) => ({
    ...q,
    status: (log[q.id] === "done" || log[q.id] === "skipped" ? log[q.id] : "todo") as Status,
  }));
  const done = quests.filter((q) => q.status === "done").length;
  const skipped = quests.filter((q) => q.status === "skipped").length;
  const target = clearTarget(quests.length);
  return { date, quests, done, skipped, scheduled: quests.length, target, cleared: target > 0 && done >= target };
}

export async function getDay(date: string): Promise<DaySummary> {
  return summarize(date, toHash(await cmd(["HGETALL", LOG(date)])));
}

/** Tanggal yang masih boleh diubah: hari ini dan kemarin (WIB) */
export function editable(date: string, today = todayWIB()): boolean {
  return date === today || date === addDays(today, -1);
}

export type MarkResult = { status: Status; xpDelta: number; levelUp: number | null; quest: Quest };

/** Ubah status satu quest. Mengembalikan perubahan XP dan level baru kalau naik. */
export async function setStatus(date: string, questId: string, status: Status): Promise<MarkResult> {
  const quest = questById(questId);
  if (!quest) throw new Error(`Quest "${questId}" tidak ada`);
  if (!questsFor(date).some((q) => q.id === questId)) throw new Error("Quest ini tidak aktif di tanggal itu");
  if (!editable(date)) throw new Error("Hanya hari ini dan kemarin yang bisa diubah");

  const [prevRaw, xpRaw] = await pipeline([
    ["HGET", LOG(date), questId],
    ["HGET", XP_KEY, "total"],
  ]);
  const prev: Status = prevRaw === "done" || prevRaw === "skipped" ? prevRaw : "todo";
  if (prev === status) return { status, xpDelta: 0, levelUp: null, quest };

  const xpDelta = (status === "done" ? quest.xp : 0) - (prev === "done" ? quest.xp : 0);
  const cmds: (string | number)[][] = [
    status === "todo" ? ["HDEL", LOG(date), questId] : ["HSET", LOG(date), questId, status],
    ["SETNX", SINCE_KEY, date],
  ];
  if (xpDelta) cmds.push(["HINCRBY", XP_KEY, "total", xpDelta], ["HINCRBY", XP_KEY, quest.stat, xpDelta]);
  await pipeline(cmds);

  // Kalau tanggal ini lebih awal dari "since" yang tersimpan (misal kemarin), mundurkan
  const since = (await cmd(["GET", SINCE_KEY])) as string | null;
  if (since && date < since) await cmd(["SET", SINCE_KEY, date]);

  const before = levelInfo(Number(xpRaw ?? 0)).level;
  const after = levelInfo(Math.max(0, Number(xpRaw ?? 0) + xpDelta)).level;
  return { status, xpDelta, levelUp: after > before ? after : null, quest };
}

// ---------- Streak & perisai ----------

/** Senin dari minggu tanggal itu, dipakai sebagai kunci jatah perisai */
export function weekOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDays(ymd, -((dow + 6) % 7));
}

export type StreakInfo = { streak: number; shieldLeft: number; protectedDays: string[] };

/**
 * Streak = jumlah hari berturut-turut yang "clear" (≥ 60% quest selesai).
 * Hari ini dihitung kalau sudah clear; kalau belum, tidak memutus streak.
 * Satu hari gagal per minggu (Senin–Minggu) otomatis dilindungi perisai.
 * Hari tanpa quest terjadwal dilewati tanpa menambah atau memutus streak.
 *
 * `bound` = tanggal tertua yang boleh ditelusuri (since, atau batas log yang sudah dibaca).
 * `reachedBound` = penelusuran sampai `bound` tanpa putus, jadi mungkin masih berlanjut.
 */
export function computeStreak(
  today: string,
  bound: string | null,
  logs: Map<string, Record<string, string>>
): StreakInfo & { reachedBound: boolean } {
  const shieldUsed = new Set<string>();
  const protectedDays: string[] = [];
  let streak = summarize(today, logs.get(today) ?? {}).cleared ? 1 : 0;
  let reachedBound = true;

  for (let d = addDays(today, -1); bound && d >= bound; d = addDays(d, -1)) {
    const s = summarize(d, logs.get(d) ?? {});
    if (s.scheduled === 0) continue;
    if (s.cleared) {
      streak++;
      continue;
    }
    const wk = weekOf(d);
    if (shieldUsed.has(wk)) {
      reachedBound = false;
      break;
    }
    shieldUsed.add(wk);
    protectedDays.push(d);
  }

  return { streak, shieldLeft: shieldUsed.has(weekOf(today)) ? 0 : 1, protectedDays, reachedBound };
}

export async function getStreak(today = todayWIB()): Promise<StreakInfo> {
  const since = (await cmd(["GET", SINCE_KEY])) as string | null;
  const logs = new Map<string, Record<string, string>>();
  let oldest = addDays(today, 1);

  // Baca log per batch; berhenti kalau streak putus atau sudah sampai tanggal pertama pemakaian
  for (;;) {
    const dates: string[] = [];
    for (let d = addDays(oldest, -1); since && d >= since && dates.length < STREAK_SCAN; d = addDays(d, -1)) {
      dates.push(d);
    }
    if (!dates.length) {
      const { streak, shieldLeft, protectedDays } = computeStreak(today, since, logs);
      return { streak, shieldLeft, protectedDays };
    }
    const raw = await pipeline(dates.map((d) => ["HGETALL", LOG(d)]));
    dates.forEach((d, i) => logs.set(d, toHash(raw[i])));
    oldest = dates[dates.length - 1];

    const r = computeStreak(today, oldest, logs);
    if (!r.reachedBound || oldest === since) {
      return { streak: r.streak, shieldLeft: r.shieldLeft, protectedDays: r.protectedDays };
    }
  }
}

// ---------- Profil ----------

export type Profile = {
  totalXp: number;
  level: number;
  rank: string;
  intoLevel: number;
  needed: number;
  stats: { key: Stat; name: string; color: string; xp: number; level: number }[];
};

export async function getProfile(): Promise<Profile> {
  const xp = toHash(await cmd(["HGETALL", XP_KEY]));
  const totalXp = Math.max(0, Number(xp.total ?? 0));
  const info = levelInfo(totalXp);
  return {
    totalXp,
    ...info,
    rank: rankOf(info.level),
    stats: (Object.keys(STATS) as Stat[]).map((key) => {
      const v = Number(xp[key] ?? 0);
      return { key, name: STATS[key].name, color: STATS[key].color, xp: v, level: statLevel(v) };
    }),
  };
}
