# GBC Cash Management — Kas Besar & Kas Kecil

Portal internal dengan **login username/password**, **RBAC**, dan data dari **Google Spreadsheet** (sinkron otomatis lewat Google Form).

## Alur data

1. Staff mengisi **Google Form** (Kas Besar / Kas Kecil).
2. Jawaban masuk ke **Google Spreadsheet** (sudah terhubung di Google).
3. Website **membaca spreadsheet** via API → tabel + dashboard Owner.
4. **Tidak ada** form input di website dan **tidak ada** file `.db` lokal.

## Role & URL

| Role | Login | Akses |
|------|-------|--------|
| admin | `admin` / `Admin123!` | `/admin/kas-kecil` |
| super_admin | `superadmin` / `SuperAdmin123!` | Kas Besar + Kas Kecil |
| owner | `owner` / `Owner123!` | Dashboard + kedua kas |

## Setup lokal

```bash
npm install
```

1. Copy `.env.example` → `.env`, isi `SESSION_SECRET`.
2. **Google Service Account** (wajib untuk tabel/dashboard):
   - Google Cloud Console → buat project → aktifkan **Google Sheets API**.
   - IAM → Service Accounts → buat akun → buat key JSON.
   - Simpan JSON, set `GOOGLE_SERVICE_ACCOUNT_PATH=...` di `.env`.
   - **Share** spreadsheet Kas Besar & Kas Kecil ke email service account (mis. `xxx@xxx.iam.gserviceaccount.com`) minimal **Viewer**.
3. `npm start` → `http://localhost:3000`

## Kategori (fixed list)

Edit `config/categories.json` agar sama dengan dropdown **Google Form** (untuk filter di tabel).

## Link form & sheet

- Kas Besar Form: https://forms.gle/n3kfDNSQ9j18dPKMA  
- Kas Kecil Form: https://forms.gle/jN6rXf3oCJK9eyZx7  
- Spreadsheet: tombol di dalam aplikasi setelah login

## Keamanan

- Password di-hash saat verifikasi (bcrypt), kredensial dari `.env`.
- Session HttpOnly + CSRF untuk logout.
- RBAC di route HTML dan API.
