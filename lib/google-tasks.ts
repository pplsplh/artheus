const API = "https://tasks.googleapis.com/tasks/v1";

export type Task = {
  id: string;
  title: string;
  notes?: string;
  due?: string; // RFC3339, Google hanya memakai bagian tanggalnya
  status: "needsAction" | "completed";
};

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Refresh token Google gagal: ${data.error ?? res.status}`);
  }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Tasks ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const list = () => encodeURIComponent(process.env.GOOGLE_TASKLIST_ID || "@default");

/** Tugas belum selesai; yang punya deadline di atas, terdekat duluan */
export async function listOpenTasks(): Promise<Task[]> {
  const data = await call<{ items?: Task[] }>(
    `/lists/${list()}/tasks?showCompleted=false&showHidden=false&maxResults=100`
  );
  return (data.items ?? [])
    .filter((t) => t.title?.trim())
    .sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
}

export function createTask(title: string, due: string | null, notes: string | null) {
  return call<Task>(`/lists/${list()}/tasks`, "POST", {
    title,
    notes: notes ?? undefined,
    due: due ? `${due}T00:00:00.000Z` : undefined,
  });
}

export function completeTask(id: string) {
  return call<Task>(`/lists/${list()}/tasks/${encodeURIComponent(id)}`, "PATCH", {
    status: "completed",
  });
}
