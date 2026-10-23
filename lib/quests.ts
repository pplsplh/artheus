/**
 * DAFTAR DAILY QUEST — edit file ini untuk mengubah rutinitasmu.
 *
 * days: hari aktif, 0 = Minggu, 1 = Senin, ... 6 = Sabtu. Kosongkan (atau hapus) = setiap hari.
 * xp:   hadiah saat selesai. Patokan: 10 ringan, 15 sedang, 25 berat.
 * id:   huruf kecil tanpa spasi, maksimal 20 karakter. Jangan diganti setelah dipakai,
 *       karena riwayat dan XP tersimpan berdasarkan id.
 */

export const STATS = {
  STR: { name: "Strength", color: "#FF5C6C" },
  AGI: { name: "Agility", color: "#FFB547" },
  INT: { name: "Intelligence", color: "#A594FF" },
  VIT: { name: "Vitality", color: "#3DDBB0" },
  SEN: { name: "Sense", color: "#5CC8FF" },
} as const;

export type Stat = keyof typeof STATS;

export type Quest = {
  id: string;
  title: string;
  stat: Stat;
  target?: string;
  days?: number[];
  xp: number;
};

export const QUESTS: Quest[] = [
  { id: "sleep", title: "Tidur sebelum jam 23.00", stat: "VIT", xp: 15 },
  { id: "water", title: "Minum air", target: "2 L", stat: "VIT", xp: 10 },
  { id: "pushup", title: "Push-up", target: "20 rep", stat: "STR", xp: 15 },
  { id: "cardio", title: "Jalan cepat atau lari", target: "30 menit", stat: "AGI", days: [1, 3, 5], xp: 20 },
  { id: "sempro", title: "Kerjakan proposal sempro", target: "45 menit", stat: "INT", days: [1, 2, 3, 4, 5], xp: 25 },
  { id: "nihongo", title: "Latihan bahasa Jepang", target: "20 menit", stat: "SEN", xp: 20 },
];

/** Hari aktif quest untuk tanggal YYYY-MM-DD */
export function questsFor(ymd: string): Quest[] {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return QUESTS.filter((q) => !q.days?.length || q.days.includes(dow));
}

export const questById = (id: string) => QUESTS.find((q) => q.id === id);

/** Porsi quest yang harus selesai supaya streak hari itu aman */
export const CLEAR_RATIO = 0.6;
export const clearTarget = (scheduled: number) => (scheduled ? Math.ceil(scheduled * CLEAR_RATIO) : 0);
