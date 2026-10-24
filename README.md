# GBC Cash Management — Kas Besar & Kas Kecil

Portal internal dengan login username/password, RBAC, input transaksi via **web app**, dan data di **spreadsheet hub** Google Sheets.

## Alur Data

1. Staff login → isi form **Kas Kecil** (admin) atau **Kas Besar** (super admin) di web.
2. Baris baru masuk tab **KAS KECIL** / **KAS BESAR** di spreadsheet hub (`HUB_SPREADSHEET_ID`).
3. Server otomatis **compile** ke `compiled table`, tab **ENTITAS**, dan **LAPORAN BULANAN**.
4. Dashboard Owner / recap membaca tab input yang sama. Tidak ada database `.db` lokal.

Spreadsheet hub default: `1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY`.  
Apps Script opsional (format sheet manual): lihat [docs/APPS_SCRIPT_SETUP.md](docs/APPS_SCRIPT_SETUP.md).

## Role & URL

| Role | Login | Akses |
|---|---|---|
| `admin` | `admin` | `/admin/kas-kecil` |
| `super_admin` | `superadmin` | Kas Besar dan Kas Kecil |
| `owner` | `owner` | Dashboard dan kedua jenis kas |

**Catatan:** Password akun harus dikonfigurasi sesuai mekanisme autentikasi aplikasi. Jangan mencantumkan password default yang masih aktif di dokumentasi repository.

## Setup Lokal

Pastikan Node.js dan npm sudah terpasang.

```bash
npm install
```

1. Salin `.env.example` menjadi `.env`.
2. Isi `SESSION_SECRET` dengan secret acak yang kuat.
3. Konfigurasikan Google Service Account untuk mengakses spreadsheet:
   - Buka Google Cloud Console dan buat project.
   - Aktifkan Google Sheets API.
   - Buat Service Account dan unduh key JSON.
   - Simpan file JSON di lokasi yang aman.
   - Atur `GOOGLE_SERVICE_ACCOUNT_PATH` di `.env`.
   - Bagikan spreadsheet Kas Besar dan Kas Kecil kepada email Service Account dengan akses minimal Viewer jika hanya perlu membaca data.
4. Jalankan aplikasi:

```bash
npm start
```

Buka `http://localhost:3000`.

## Kategori

Edit `config/categories.json` agar sesuai dengan pilihan kategori pada Google Form. Daftar ini digunakan untuk filter pada tabel transaksi.

## Spreadsheet hub

- https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit  
- Tombol **Buka spreadsheet pusat** di CMS setelah login.

## Keamanan

- Password diverifikasi menggunakan mekanisme hashing bcrypt.
- Kredensial aplikasi dikonfigurasi melalui environment variables.
- Session menggunakan cookie HttpOnly dan mekanisme CSRF untuk logout.
- Role-Based Access Control (RBAC) diterapkan pada route HTML dan API.
- Jangan commit file `.env`, private key, API key, atau kredensial lainnya ke repository.
- Ganti kredensial default sebelum aplikasi digunakan di lingkungan produksi.
