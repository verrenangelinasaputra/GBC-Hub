# GBC Cash Management — Kas Besar & Kas Kecil

Portal internal dengan login username/password, Role-Based Access Control (RBAC), dan data dari Google Spreadsheet yang tersinkronisasi melalui Google Form.

## Alur Data

1. Staff mengisi Google Form untuk Kas Besar atau Kas Kecil.
2. Jawaban masuk ke Google Spreadsheet yang terhubung.
3. Website membaca spreadsheet melalui API untuk menampilkan tabel transaksi dan dashboard Owner.
4. Website tidak menyediakan form input transaksi dan tidak menggunakan file database `.db` lokal.

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

## Link Form & Spreadsheet

- **Kas Besar Form:** https://forms.gle/n3kfDNSQ9j18dPKMA
- **Kas Kecil Form:** https://forms.gle/jN6rXf3oCJK9eyZx7
- **Spreadsheet:** tersedia melalui tombol di dalam aplikasi setelah login.

## Keamanan

- Password diverifikasi menggunakan mekanisme hashing bcrypt.
- Kredensial aplikasi dikonfigurasi melalui environment variables.
- Session menggunakan cookie HttpOnly dan mekanisme CSRF untuk logout.
- Role-Based Access Control (RBAC) diterapkan pada route HTML dan API.
- Jangan commit file `.env`, private key, API key, atau kredensial lainnya ke repository.
- Ganti kredensial default sebelum aplikasi digunakan di lingkungan produksi.
