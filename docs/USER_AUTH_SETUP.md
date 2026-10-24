# Registrasi user, verifikasi email, & User Access

Fitur ini menambah:

- **Daftar** (`/register`) → kode verifikasi ke email → baris user di Google Sheet
- **Lupa password** (`/forgot-password`) → kode ke email → password baru
- **Admin → User Access** → per modul: **Lihat** (History + Dashboard) dan **Isi form** (input transaksi)
- User baru login pertama kali → halaman **Selamat datang** (menu kosong) sampai admin memberi akses

Akun **admin / superadmin / owner** dari `.env` tidak berubah (bukan sheet).

---

## 1. Spreadsheet registry user

Default ID (bisa override lewat env):

`1MRM3lQ37fKHezJ7QW8IdTTuvXRhIvUBjA2cVjZJ3CqE`

**Share spreadsheet ke service account** (sama dengan hub) sebagai **Editor**:

`gbc-hub@sage-passkey-512315-f3.iam.gserviceaccount.com`

Tab dibuat otomatis saat pertama kali dipakai:

| Tab | Isi |
|-----|-----|
| **Users** | … `access_kas_kecil`, `access_kas_besar`, `input_kas_kecil`, `input_kas_besar`, `created_at`, `updated_at` |
| **AuthCodes** | Kode verifikasi sementara (register / reset password) |

Env opsional:

```env
USERS_REGISTRY_SPREADSHEET_ID=1MRM3lQ37fKHezJ7QW8IdTTuvXRhIvUBjA2cVjZJ3CqE
USERS_REGISTRY_TAB=Users
USERS_AUTH_CODES_TAB=AuthCodes
```

---

## 2. Email (SMTP)

Kode verifikasi dikirim lewat **nodemailer**. Contoh **Gmail App Password**:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=verren.angelinas@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
MAIL_FROM="GBC Cash Management <verren.angelinas@gmail.com>"

# Notifikasi admin saat user baru selesai verifikasi (default: nomarcengkareng@gmail.com)
ADMIN_NOTIFY_EMAIL=nomarcengkareng@gmail.com
APP_PUBLIC_URL=https://your-domain.com
```

Cara buat App Password: Google Account → Security → 2-Step Verification → App passwords.

### Development tanpa SMTP

```env
MAIL_DEV_LOG=true
```

Kode muncul di **console** saat `npm start` (jangan dipakai di production).

---

## 3. Alur pengguna

1. Buka `/register` → isi nama, email, telepon, password → **Kirim kode**
2. Cek email (atau console jika `MAIL_DEV_LOG=true`) → masukkan 6 digit → **Verifikasi**
3. Login dengan **email + password**
4. Admin mendapat **email notifikasi** (jika SMTP aktif) bahwa ada user baru
5. Admin login → **User Access** → per modul: **Lihat** / **Isi form** → **Simpan**, atau **Hapus** untuk menghapus akun dari sheet
6. User refresh → menu Kas muncul di sidebar

**Lupa password:** `/forgot-password` (hanya untuk user di sheet, bukan akun `.env`).

---

## 4. Role & akses

| Role | Sumber | Kas Kecil input | Kas Besar input | User Access |
|------|--------|-----------------|-----------------|-------------|
| admin | `.env` | Ya | Tidak | Ya |
| super_admin | `.env` | Ya | Ya | Ya |
| owner | `.env` | Lihat | Lihat | Tidak |
| member | Sheet | Jika di-centang admin | Jika di-centang admin | Tidak |

Member dengan akses input memakai route `/member/kas-kecil` dan `/member/kas-besar` (API sama dengan admin/superadmin).

---

## 5. Restart & cek

```bash
npm install
npm start
```

- Registry: buka link spreadsheet → tab **Users** terisi setelah registrasi sukses
- Jika error 503 registry: pastikan service account **Editor** di spreadsheet registry
- Jika email gagal: cek SMTP atau nyalakan `MAIL_DEV_LOG=true`

---

## Catatan production (Vercel)

- Set semua env di dashboard (termasuk SMTP, `USERS_REGISTRY_SPREADSHEET_ID`, service account JSON).
- Data pending registrasi (sebelum verifikasi) disimpan **sementara di memori server**; setelah verifikasi, user ada di Sheet. Untuk traffic besar, pertimbangkan simpan pending di Sheet (belum diimplementasi).
