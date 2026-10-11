export const metadata = { title: "Kebijakan Privasi – Artheus" };

export default function Privacy() {
  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>Kebijakan Privasi Artheus</h1>
      <p>Artheus adalah bot Telegram pribadi yang hanya digunakan oleh pemiliknya.</p>
      <p>
        Bot ini mengakses Google Tasks milik pemilik untuk membuat, membaca, dan menandai tugas selesai.
        Teks pesan dikirim ke Claude API (Anthropic) hanya untuk membaca judul dan tanggal tugas.
      </p>
      <p>Bot tidak menyimpan data di server sendiri dan tidak membagikan data kepada pihak lain.</p>
    </main>
  );
}
