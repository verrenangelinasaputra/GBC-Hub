# Weekly Recap Email (Apps Script)

Email **HTML** otomatis setiap **Minggu 11:00 WIB** — recap **Senin–Minggu** (minggu kalender, mis. minggu ke-23) berdasarkan **Tanggal Pengeluaran** di hub spreadsheet.

## Penerima default

`verren.angelinas@gmail.com`, `verren62@gmail.com` — edit di `WEEKLY_RECAP_CONFIG.RECIPIENTS`.

## Isi email

1. **Kartu ringkas:** total, Bank, Kas Kecil + perbandingan vs minggu sebelumnya  
2. **Tabel per entitas** (Bank / Kas Kecil / total)  
3. **Top kategori** & **Top PIC**  
4. **Transaksi terbesar** minggu ini  
5. **Tabel detail** (20 baris terakhir) + link bukti  
6. Link ke **spreadsheet hub**

## Pasang

1. Buka [spreadsheet hub](https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit) → **Extensions → Apps Script**  
   (atau project script yang sama dengan Bukti Drive Sorter.)
2. File baru → paste **`WeeklyRecapEmail.gs`**
3. **Project Settings** → Time zone: **Asia/Jakarta**
4. **Run** → `installWeeklyRecapTrigger` → izinkan **Gmail send**
5. **Run** → `testSendWeeklyRecap` untuk cek email (boleh hari apa saja)

Menu (refresh spreadsheet): **GBC Weekly Recap**

| Menu | Fungsi |
|------|--------|
| Kirim recap minggu ini (test) | Kirim sekarang |
| Pasang trigger Minggu 11:00 | Scheduler mingguan |
| Hapus trigger recap | Stop otomatis |

## Trigger manual (UI Google)

**Pemicu** → Tambah → **Berdasarkan waktu** → Minggu → jam **8–9** → fungsi `sendWeeklyRecapEmail`  
(Atau pakai menu **Pasang trigger** — sudah set `nearMinute(40)`.)

## Konfigurasi (`WEEKLY_RECAP_CONFIG`)

| Key | Default |
|-----|---------|
| `HUB_SPREADSHEET_ID` | Hub GBC |
| `RECIPIENTS` | 2 email Verren |
| `SEND_HOUR` / `SEND_MINUTE` | 11 / 0 |
| `TIMEZONE` | Asia/Jakarta |
| `APP_URL` | URL web app production (ganti dari localhost) |

Data diambil dari tab **`compiled table`**; jika kosong, dari tab **Bank** + **KAS KECIL**.

## Troubleshooting (eksekusi gagal / error)

| Penyebab | Perbaikan |
|----------|-----------|
| **`@ameliaffg@gmail.com`** (double `@`) | Ganti jadi `ameliaffg@gmail.com` saja |
| Gmail **Invalid argument** / **Address failed** | Semua alamat harus `nama@domain.com`, pisah koma |
| **Authorization required** | Run `testSendWeeklyRecap` → Allow → Gmail send |
| **Exceeded maximum email quota** | Kuota harian Gmail; coba lagi besok atau kurangi penerima |

Setelah ubah `RECIPIENTS`, run **`testSendWeeklyRecap`** lagi → **Eksekusi** → **Log** untuk detail.

## Catatan

- Kirim hanya jalan otomatis hari **Minggu** (`respectSchedule`). Test manual bisa kapan saja.
- Periode = **Senin 00:00 – Minggu 23:59** (tanggal pengeluaran).
- Butuh **Gmail** akun yang menjalankan trigger (kuota Gmail harian).
