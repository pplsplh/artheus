"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------- Tipe data dari API ----------
type Status = "todo" | "done" | "skipped";
type Stat = "STR" | "AGI" | "INT" | "VIT" | "SEN";
type DayQuest = { id: string; title: string; stat: Stat; target?: string; xp: number; status: Status };
type Day = {
  date: string;
  quests: DayQuest[];
  done: number;
  skipped: number;
  scheduled: number;
  target: number;
  cleared: boolean;
};
type Streak = { streak: number; shieldLeft: number; protectedDays: string[] };
type Profile = {
  totalXp: number;
  level: number;
  rank: string;
  intoLevel: number;
  needed: number;
  stats: { key: Stat; name: string; color: string; xp: number; level: number }[];
};
type Side = { ok: boolean; items: { id: string; title: string; due: string }[]; more: number };
type State = { today: string; editable: boolean; day: Day; streak: Streak; profile: Profile; side: Side };
type MarkResponse = {
  result: { xpDelta: number; levelUp: number | null; quest: { title: string } };
  day: Day;
  streak: Streak;
  profile: Profile;
};

type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string } };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: { notificationOccurred: (t: "success" | "error" | "warning") => void };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const STAT_COLOR: Record<Stat, string> = {
  STR: "#FF5C6C",
  AGI: "#FFB547",
  INT: "#A594FF",
  VIT: "#3DDBB0",
  SEN: "#5CC8FF",
};

const XP_SEGMENTS = 20;

// ---------- Utilitas ----------
function loadTelegram(): Promise<TgWebApp | null> {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    const done = () => resolve(window.Telegram?.WebApp ?? null);
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(done, 2500);
  });
}

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayLabel(ymd: string, today: string) {
  if (ymd === today) return "Hari ini";
  if (ymd === addDays(today, -1)) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long" }).format(new Date(`${ymd}T00:00:00Z`));
}

function dateLabel(ymd: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "long" }).format(
    new Date(`${ymd}T00:00:00Z`)
  );
}

function dueLabel(due: string, today: string) {
  if (due < today) return { text: "Terlambat", tone: "text-danger" };
  if (due === today) return { text: "Hari ini", tone: "text-gold" };
  if (due === addDays(today, 1)) return { text: "Besok", tone: "text-gold" };
  return {
    text: new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
      new Date(`${due}T00:00:00Z`)
    ),
    tone: "text-muted",
  };
}

// ---------- Komponen utama ----------
export default function QuestApp() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [tab, setTab] = useState<Status>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("Hunter");
  const [system, setSystem] = useState<{ id: number; lines: string[] } | null>(null);
  const auth = useRef<Record<string, string>>({});
  const tg = useRef<TgWebApp | null>(null);

  const api = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...auth.current },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Server membalas ${res.status}`);
    return data;
  }, []);

  const load = useCallback(
    async (d?: string) => {
      try {
        const s = await api<State>(`/api/quest/state${d ? `?date=${d}` : ""}`);
        setState(s);
        setDate(s.day.date);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [api]
  );

  useEffect(() => {
    (async () => {
      const key = new URLSearchParams(window.location.search).get("key");
      if (key) auth.current["x-quest-key"] = key;
      const app = await loadTelegram();
      if (app?.initData) {
        tg.current = app;
        auth.current["x-tg-init-data"] = app.initData;
        app.ready();
        app.expand();
        app.setHeaderColor?.("#060912");
        app.setBackgroundColor?.("#060912");
        const first = app.initDataUnsafe?.user?.first_name;
        if (first) setName(first);
      }
      await load();
    })();
  }, [load]);

  const say = useCallback((lines: string[]) => {
    setSystem({ id: Date.now(), lines });
  }, []);

  useEffect(() => {
    if (!system) return;
    const t = setTimeout(() => setSystem(null), 3200);
    return () => clearTimeout(t);
  }, [system]);

  async function mark(q: DayQuest, status: Status) {
    if (!state) return;
    setBusy(q.id);
    try {
      const r = await api<MarkResponse>("/api/quest/mark", { date: state.day.date, questId: q.id, status });
      const wasCleared = state.day.cleared;
      setState({ ...state, day: r.day, streak: r.streak, profile: r.profile });
      const lines: string[] = [];
      if (status === "done") lines.push(`Quest selesai: ${q.title}.`, `+${r.result.xpDelta} XP ke ${q.stat}.`);
      else if (status === "skipped") lines.push(`Quest dilewati: ${q.title}.`, "Tidak ada XP.");
      else lines.push(`Quest dikembalikan: ${q.title}.`, r.result.xpDelta < 0 ? `${r.result.xpDelta} XP.` : "");
      if (r.result.levelUp) lines.push(`Naik level. Sekarang Lv ${r.result.levelUp}, rank ${r.profile.rank}.`);
      if (!wasCleared && r.day.cleared) lines.push("Hari ini aman. Streak berlanjut.");
      say(lines.filter(Boolean));
      tg.current?.HapticFeedback?.notificationOccurred(status === "done" ? "success" : "warning");
    } catch (e) {
      say([`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`]);
      tg.current?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setBusy(null);
    }
  }

  async function finishSide(id: string, title: string) {
    if (!state) return;
    setBusy(id);
    try {
      await api("/api/quest/side", { taskId: id });
      setState({ ...state, side: { ...state.side, items: state.side.items.filter((t) => t.id !== id) } });
      say([`Side quest selesai: ${title}.`, "Ditandai selesai di Google Tasks."]);
      tg.current?.HapticFeedback?.notificationOccurred("success");
    } catch (e) {
      say([`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(() => state?.day.quests.filter((q) => q.status === tab) ?? [], [state, tab]);

  if (error && !state) return <Fatal message={error} onRetry={() => load()} />;
  if (!state || !date) return <Loading />;

  const { day, profile, streak, side, today, editable } = state;
  const counts = { todo: day.quests.filter((q) => q.status === "todo").length, done: day.done, skipped: day.skipped };
  const filled = Math.round((profile.intoLevel / profile.needed) * XP_SEGMENTS);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4">
      {/* Jendela status */}
      <section className="win p-4" aria-label="Status karakter">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-pixel text-[11px] text-glow">STATUS</p>
            <h1 className="font-pixel truncate text-3xl leading-tight text-white">{name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-right">
            <div>
              <p className="font-pixel text-4xl leading-none text-gold">{profile.rank}</p>
              <p className="text-[11px] text-muted">Rank</p>
            </div>
            <div>
              <p className="font-pixel text-4xl leading-none text-white">{profile.level}</p>
              <p className="text-[11px] text-muted">Level</p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex gap-[3px]" role="img" aria-label={`${profile.intoLevel} dari ${profile.needed} XP`}>
            {Array.from({ length: XP_SEGMENTS }, (_, i) => (
              <span key={i} className="xp-seg h-2.5 flex-1 rounded-[1px]" data-on={i < filled} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>
              <span className="font-pixel text-ice">{profile.intoLevel}</span> / {profile.needed} XP
            </span>
            <span>{profile.totalXp} XP total</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2 text-sm">
          <span className="flex items-center gap-1.5 rounded border border-gold/40 px-2 py-1 text-gold">
            <span aria-hidden>🔥</span>
            <span className="font-pixel">{streak.streak}</span> hari
          </span>
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 ${
              streak.shieldLeft ? "border-glow/40 text-glow" : "border-line text-muted"
            }`}
          >
            <span aria-hidden>🛡</span>
            {streak.shieldLeft ? "Perisai siap" : "Perisai terpakai"}
          </span>
        </div>

        <ul className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Stat">
          {profile.stats.map((s) => (
            <li key={s.key} className="rounded border border-line/80 bg-deep/70 px-1 py-1.5 text-center">
              <p className="font-pixel text-[11px]" style={{ color: s.color }}>
                {s.key}
              </p>
              <p className="font-pixel text-lg leading-tight text-white">{s.level}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Daily quest */}
      <section className="win p-4" aria-label="Daily quest">
        <div className="flex items-center justify-between gap-2">
          <button
            className="font-pixel grid size-9 place-items-center rounded border border-line text-ice hover:border-glow"
            onClick={() => load(addDays(day.date, -1))}
            aria-label="Hari sebelumnya"
          >
            ◀
          </button>
          <div className="text-center">
            <h2 className="font-pixel text-xl text-white">{dayLabel(day.date, today)}</h2>
            <p className="text-xs text-muted">{dateLabel(day.date)}</p>
          </div>
          <button
            className="font-pixel grid size-9 place-items-center rounded border border-line text-ice hover:border-glow disabled:opacity-25"
            onClick={() => load(addDays(day.date, 1))}
            disabled={day.date >= today}
            aria-label="Hari berikutnya"
          >
            ▶
          </button>
        </div>

        {day.scheduled > 0 && (
          <div className="mt-3 rounded border border-line/70 bg-deep/60 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className={day.cleared ? "text-gold" : "text-muted"}>
                {day.cleared
                  ? "Hari ini aman untuk streak"
                  : `Selesaikan ${day.target - day.done} lagi untuk mengamankan streak`}
              </span>
              <span className="font-pixel text-ice">
                {day.done}/{day.scheduled}
              </span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {day.quests.map((q, i) => (
                <span
                  key={q.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    q.status === "done" ? "bg-gold" : i < day.target ? "bg-line" : "bg-line/40"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Filter quest">
          {(
            [
              ["todo", "Quest"],
              ["done", "Selesai"],
              ["skipped", "Dilewati"],
            ] as [Status, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded border px-2 py-2 text-sm font-semibold transition-colors ${
                tab === key ? "border-glow bg-glow/15 text-white" : "border-line text-muted hover:text-ice"
              }`}
            >
              {label} <span className="font-pixel">{counts[key]}</span>
            </button>
          ))}
        </div>

        {!editable && (
          <p className="mt-3 text-xs text-muted">Riwayat. Hanya hari ini dan kemarin yang bisa diubah.</p>
        )}

        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((q, i) => (
            <QuestRow
              key={q.id}
              q={q}
              active={editable && tab === "todo" && i === 0}
              editable={editable}
              busy={busy === q.id}
              onMark={(s) => mark(q, s)}
            />
          ))}
        </ul>

        {shown.length === 0 && <EmptyTab tab={tab} scheduled={day.scheduled} />}
      </section>

      {/* Side quest dari Google Tasks */}
      <section className="win win-quiet p-4" aria-label="Side quest">
        <div className="flex items-baseline justify-between">
          <h2 className="font-pixel text-lg text-white">Side quest</h2>
          <p className="text-xs text-muted">Google Tasks, 7 hari ke depan</p>
        </div>
        {!side.ok && <p className="mt-2 text-sm text-danger">Google Tasks tidak bisa dimuat. Cek log Vercel.</p>}
        {side.ok && side.items.length === 0 && (
          <p className="mt-2 text-sm text-muted">Tidak ada deadline dalam 7 hari. Kirim tugas baru lewat chat bot.</p>
        )}
        <ul className="mt-2 flex flex-col">
          {side.items.map((t) => {
            const due = dueLabel(t.due, today);
            return (
              <li key={t.id} className="flex items-center gap-3 border-b border-line/50 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ice">{t.title}</p>
                  <p className={`text-xs ${due.tone}`}>{due.text}</p>
                </div>
                <button
                  onClick={() => finishSide(t.id, t.title)}
                  disabled={busy === t.id}
                  className="shrink-0 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-ice hover:border-glow disabled:opacity-40"
                >
                  {busy === t.id ? "…" : "Selesai"}
                </button>
              </li>
            );
          })}
        </ul>
        {side.more > 0 && <p className="mt-2 text-xs text-muted">+{side.more} tugas lain. Ketik /tugas di bot.</p>}
      </section>

      {system && <SystemMessage key={system.id} lines={system.lines} />}
    </main>
  );
}

// ---------- Baris quest ----------
function QuestRow({
  q,
  active,
  editable,
  busy,
  onMark,
}: {
  q: DayQuest;
  active: boolean;
  editable: boolean;
  busy: boolean;
  onMark: (s: Status) => void;
}) {
  const color = STAT_COLOR[q.stat];
  const finished = q.status !== "todo";
  return (
    <li
      data-active={active}
      className={`row relative flex items-center gap-2 overflow-hidden rounded border bg-deep/80 py-3 pr-2.5 pl-3 ${
        active ? "border-glow/60" : finished ? "border-line/50" : "border-line"
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} aria-hidden />
      <span className="cursor font-pixel text-gold" aria-hidden>
        ▶
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-snug font-semibold ${finished ? "text-muted line-through" : "text-white"}`}>
          {q.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="font-pixel" style={{ color }}>
            {q.stat}
          </span>
          {q.target && <span>{q.target}</span>}
          <span className="text-gold/80">+{q.xp} XP</span>
        </p>
      </div>
      {editable && (
        <div className="flex shrink-0 items-center gap-1.5">
          {q.status === "todo" ? (
            <>
              <button
                onClick={() => onMark("skipped")}
                disabled={busy}
                className="rounded px-2 py-2 text-xs text-muted hover:text-ice disabled:opacity-40"
              >
                Lewati
              </button>
              <button
                onClick={() => onMark("done")}
                disabled={busy}
                aria-label={`Selesaikan ${q.title}`}
                className="font-pixel grid size-11 place-items-center rounded border-2 border-glow bg-glow/15 text-lg text-white shadow-[0_0_12px_rgb(76_155_255/0.35)] hover:bg-glow/30 disabled:opacity-40"
              >
                {busy ? "…" : "✓"}
              </button>
            </>
          ) : (
            <button
              onClick={() => onMark("todo")}
              disabled={busy}
              className="rounded border border-line px-2.5 py-1.5 text-xs text-muted hover:text-ice disabled:opacity-40"
            >
              {busy ? "…" : "Batalkan"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function EmptyTab({ tab, scheduled }: { tab: Status; scheduled: number }) {
  const text =
    scheduled === 0
      ? "Tidak ada quest terjadwal di hari ini."
      : tab === "todo"
        ? "Semua quest sudah ditangani. Lihat tab Selesai."
        : tab === "done"
          ? "Belum ada quest yang selesai."
          : "Tidak ada quest yang dilewati.";
  return <p className="mt-3 rounded border border-dashed border-line px-3 py-4 text-center text-sm text-muted">{text}</p>;
}

// ---------- Kotak pesan [SYSTEM] ----------
function SystemMessage({ lines }: { lines: string[] }) {
  const full = lines.join("\n");
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? full : ""
  );

  useEffect(() => {
    if (shown === full) return;
    const t = setTimeout(() => setShown(full.slice(0, shown.length + 2)), 16);
    return () => clearTimeout(t);
  }, [shown, full]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),14px)]">
      <div className="win sys-enter mx-auto max-w-md px-4 py-3" role="status" aria-live="polite">
        <p className="font-pixel text-xs text-glow">[SYSTEM]</p>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-white" aria-hidden>
          {shown}
        </p>
        <span className="sr-only">{full}</span>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-md place-items-center">
      <p className="font-pixel text-glow">Memuat quest…</p>
    </main>
  );
}

function Fatal({ message, onRetry }: { message: string; onRetry: () => void }) {
  const denied = /ditolak/i.test(message);
  return (
    <main className="mx-auto mt-10 max-w-md">
      <div className="win p-5">
        <p className="font-pixel text-xs text-danger">[SYSTEM]</p>
        <h1 className="font-pixel mt-1 text-xl text-white">
          {denied ? "Akses ditolak" : "Quest gagal dimuat"}
        </h1>
        <p className="mt-2 text-sm text-ice">
          {denied
            ? "Buka halaman ini lewat tombol Buka Quest Log di bot Artheus, atau tambahkan ?key= di URL."
            : message}
        </p>
        {!denied && (
          <button onClick={onRetry} className="mt-4 rounded border border-glow px-3 py-2 text-sm text-white">
            Coba lagi
          </button>
        )}
      </div>
    </main>
  );
}
