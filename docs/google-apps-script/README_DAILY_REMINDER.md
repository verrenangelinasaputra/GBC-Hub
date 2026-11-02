# GBC Daily Reminder (email)

Pengingat harian agar tim menginput pengeluaran **hari ini** via web app.

## Jadwal (WIB)

- **09:00**, **12:00**, **15:00**, **18:00** — setiap hari

## Penerima (default di script)

- verren62@gmail.com
- verren.angelinas@gmail.com
- rossydanamu123@gmail.com
- indahdwiseptiani022@gmail.com

Ubah `RECIPIENTS` di `DailyExpenseReminder.gs` jika perlu.

## Pasang

1. Buka [spreadsheet hub](https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit) → **Extensions → Apps Script**.
2. **File → New → Script file** → tempel isi `DailyExpenseReminder.gs` (bisa digabung project yang sudah ada dengan Weekly Recap / Bukti).
3. Di `onOpen()` project, tambahkan baris: `onOpenDailyReminderMenu();` (refresh spreadsheet → menu **GBC Daily Reminder**).
4. Run **`installDailyReminderTriggers`** sekali → **Review permissions** → izinkan **Gmail send**.
5. Menu **GBC Daily Reminder → Kirim reminder sekarang (test)** untuk cek inbox.

## Trigger

- **`installDailyReminderTriggers`** — membuat 4 trigger harian (handler: `sendDailyExpenseReminder`).
- **`removeDailyReminderTriggers`** — hapus semua trigger reminder.
- **`debugDailyReminderTriggers`** — cek jumlah trigger vs CONFIG.

Setelah ubah jam di `REMINDER_HOURS`, hapus trigger lalu pasang ulang.

## Link di email

- Web app: `https://gbchub.vercel.app/`
- Spreadsheet hub: tab KAS KECIL / Bank
