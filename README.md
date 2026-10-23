# Telegram × Google Tasks Bot

Kirim tugas ke bot Telegram dengan bahasa biasa → Claude membaca judul dan deadline-nya → tugas masuk ke Google Tasks. Tiap pagi sekitar jam 07.00 WIB, bot mengirim ringkasan tugas, lengkap dengan tombol untuk menandai selesai.

## Fitur
- Pesan bebas → tugas baru (`esai Inovasi Pendidikan kumpul Jumat`)
- `/hari_ini` → tugas terlambat, hari ini, dan 7 hari ke depan
- `/tugas` → semua tugas terbuka
- Tombol ✅ → tandai selesai di Google Tasks
- Hanya merespons chat ID-mu
- **Quest Log**: daily quest bergaya RPG (Mini App di dalam Telegram) dengan XP, level, rank, stat, streak, dan perisai

## Setup

### 1. Bot Telegram
1. Chat **@BotFather** → `/newbot` → ikuti langkahnya.
2. Simpan token → `TELEGRAM_BOT_TOKEN`.
3. (Opsional) `/setcommands`, isi:
   ```
   hari_ini - Tugas terlambat, hari ini, dan 7 hari ke depan
   tugas - Semua tugas terbuka
   ```

### 2. Google Tasks API
1. Buka console.cloud.google.com → buat project baru.
2. **APIs & Services → Library** → aktifkan **Google Tasks API**.
3. **OAuth consent screen** → External → isi nama app dan email.
4. **PENTING:** ubah status publishing ke **In production**. Kalau dibiarkan di *Testing*, refresh token kedaluwarsa setelah 7 hari dan bot berhenti jalan. Untuk pemakaian pribadi, app tidak perlu diverifikasi; kamu cuma akan melihat peringatan "unverified" saat login.
5. **Credentials → Create OAuth client ID** → tipe **Web application** → tambahkan Authorized redirect URI:
   `https://developers.google.com/oauthplayground`
6. Simpan Client ID dan Secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
7. Buka developers.google.com/oauthplayground → ikon ⚙️ → centang **Use your own OAuth credentials** → isi Client ID dan Secret.
8. Di kolom scope, ketik `https://www.googleapis.com/auth/tasks` → **Authorize APIs** → login.
9. **Exchange authorization code for tokens** → salin **Refresh token** → `GOOGLE_REFRESH_TOKEN`.

### 3. Claude API
console.anthropic.com → API Keys → `ANTHROPIC_API_KEY`.

### 4. Deploy ke Vercel
1. Push ke GitHub → import di Vercel.
2. Buat dua secret acak (jalankan dua kali):
   ```bash
   openssl rand -hex 32
   ```
   → `TELEGRAM_WEBHOOK_SECRET` dan `CRON_SECRET`.
3. Isi semua env var dari `.env.example` di Vercel. `TELEGRAM_ALLOWED_CHAT_ID` dikosongkan dulu.
4. Deploy.

### 5. Sambungkan webhook
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<nama-app>.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
Harus muncul `"ok":true`.

### 6. Kunci bot ke akunmu
1. Kirim pesan apa saja ke bot → bot membalas `Chat ID kamu: 123456789`.
2. Isi `TELEGRAM_ALLOWED_CHAT_ID` di Vercel → **Redeploy**.
3. Coba kirim: `revisi Bab 2 besok`.

## Quest Log (daily quest RPG)

Rutinitas harian jadi quest. Selesai → dapat XP ke stat terkait (STR, AGI, INT, VIT, SEN), naik level dan rank (E → S). Tugas Google Tasks yang deadline-nya dekat muncul sebagai **side quest** di halaman yang sama.

**Aturan:**
- Hari dianggap **aman** kalau minimal 60% quest hari itu selesai. Hari aman berturut-turut = streak.
- Hari ini yang belum aman tidak memutus streak (masih berjalan).
- **Perisai**: satu hari gagal per minggu (Senin–Minggu) otomatis dilindungi, jadi streak tidak putus.
- Quest yang **dilewati** tidak memberi XP dan tidak dihitung selesai.
- Hanya **hari ini dan kemarin** yang bisa diubah (lupa centang semalam masih bisa dibetulkan).

**Di Telegram:**
- `/quest` → daftar quest hari ini dengan tombol ✓ dan tombol **Buka Quest Log**
- Pagi (~07.00 WIB): ringkasan tugas, lalu daftar quest hari ini
- Malam (~20.00 WIB): pengingat quest yang belum selesai + tugas yang deadline-nya besok

**Mengubah rutinitas:** edit `lib/quests.ts`, lalu push. Jangan mengganti `id` quest yang sudah dipakai.

### Setup Quest Log
1. Vercel → project → **Storage** (atau Marketplace) → tambahkan **Upstash Redis** → hubungkan ke project ini. Env Redis terisi otomatis.
2. (Opsional) Isi `QUEST_WEB_KEY` dengan string acak (`openssl rand -hex 16`) kalau mau buka dari browser: `https://<app>.vercel.app/quest?key=<QUEST_WEB_KEY>`.
3. Redeploy.
4. Pasang tombol menu Quest Log di chat bot (sekali saja):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setChatMenuButton" \
     -H "Content-Type: application/json" \
     -d '{"menu_button":{"type":"web_app","text":"Quest","web_app":{"url":"https://<app>.vercel.app/quest"}}}'
   ```
5. Tambahkan `quest - Daily quest hari ini` di `/setcommands` BotFather.

Uji lokal tanpa Redis dan tanpa token: `npm run dev` lalu buka `localhost:3000/quest` (data disimpan di memori, hilang saat server mati).

## Catatan
- Cron di `vercel.json`: `0 0 * * *` = 07.00 WIB (ringkasan pagi) dan `0 13 * * *` = 20.00 WIB (pengingat malam). Di plan Hobby, waktu eksekusinya bisa meleset di dalam jam tersebut.
- Google Tasks hanya menyimpan **tanggal** deadline, bukan jam.
- Kalau Claude API gagal, tugas tetap tersimpan memakai teks aslimu sebagai judul.
- Log error: Vercel → project → **Logs**.
