# Upload bukti otomatis (Gmail / Drive pribadi)

Service account **tidak bisa** upload ke folder Drive pribadi.  
Solusi: **OAuth** — sekali login Google (akun yang punya folder bukti), server pakai **refresh token** untuk upload file ke folder Anda.

---

## 1. Google Cloud Console (project `sage-passkey-512315-f3`)

1. **APIs & Services → Enable APIs** → aktifkan **Google Drive API**.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (Gmail) atau Internal (Workspace)
   - Isi app name, email support → Save
   - **Test users**: tambah email Google Anda (jika app masih "Testing")
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorized redirect URIs** (wajib persis):
     - Lokal: `http://localhost:3000/api/oauth/drive/callback`
     - Production: `https://domain-anda.com/api/oauth/drive/callback`
   - Copy **Client ID** dan **Client secret**

## 2. File `.env`

```env
GOOGLE_DRIVE_BUKTI_FOLDER_ID=1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
# Opsional jika port/domain beda:
# GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/oauth/drive/callback
```

Restart `npm start`.

## 3. Hubungkan Drive (sekali)

1. Login web sebagai **superadmin**
2. Buka **Kas Besar** atau **Kas Kecil**
3. Klik **Hubungkan Google Drive (super admin, sekali)**
4. Login Google (**akun yang punya folder bukti**), Allow
5. Halaman menampilkan `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=...` → copy ke `.env`
6. Restart server lagi → **Ctrl+F5** form → **Choose Files** aktif

Folder bukti harus **milik akun Google yang sama** saat OAuth (atau Anda punya akses tulis).

---

## Alternatif: Google Workspace Shared drive

Tanpa OAuth: Shared drive + service account Content manager (lihat bagian lama di repo).  
Untuk **Gmail pribadi**, gunakan **OAuth** di atas.
