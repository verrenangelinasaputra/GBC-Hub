# Apps Script: Bukti → Shared + Drive per entitas (salin, bukan pindah)

Script: `BuktiMultiDrive.gs` (sumber repo: `scripts/google-apps-script-bukti-multi-drive.gs`)

## Apa yang dilakukan?

Ya, maksud Anda dipahami:

1. **Arsip shared** ([folder shared](https://drive.google.com/drive/folders/1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy)) tetap **lengkap** — file **tidak dipindah keluar** dari sana.
2. Setiap bukti juga **disalin** ke **Drive entitas** sesuai **entitas** + **jenis** (Bank / Kas Kecil).
3. Upload Google Form → **salin** ke shared (struktur bulan) + **salin** ke drive entitas.
4. File yang **sudah** ada di shared → jalankan **backfill** sekali (menu) untuk menyalin ke drive entitas tanpa mengosongkan shared.

Script memakai `file.makeCopy()` — **bukan** `moveTo()`.

## Peta folder entitas

| Entitas | Drive root | Struktur di bawah root |
|--------|------------|-------------------------|
| **GBC** | [1MbHGqMqTsgUu4zVxzsA4frVJW-bGpRMH](https://drive.google.com/drive/folders/1MbHGqMqTsgUu4zVxzsA4frVJW-bGpRMH) | `Bukti Pengeluaran Perusahaan GBC dan Kediri` → **GBC** → `Bank` / `Kas Kecil` |
| **Kediri** | (sama dengan GBC) | … → **Kediri** → `Bank` / `Kas Kecil` |
| **MJL** | [1LxJer5eBJ8YXDqwurZBsVfEjgju6y3Fe](https://drive.google.com/drive/u/1/folders/1LxJer5eBJ8YXDqwurZBsVfEjgju6y3Fe) | `BUKTI PENGELUARAN MJL` → `Bank` / `Kas Kecil` |
| **BKT** | [1ztj4N_ldNG1j857Al0GOy203NHHGO90p](https://drive.google.com/drive/u/2/folders/1ztj4N_ldNG1j857Al0GOy203NHHGO90p) | `BUKTI PENGELUARAN BKT` → `Bank` / `Kas Kecil` |
| **CV Lembayung** (LIGHT) | [1NIxnDIW8J_Twv3VmGjgvJwOoh6U8FTbp](https://drive.google.com/drive/folders/1NIxnDIW8J_Twv3VmGjgvJwOoh6U8FTbp) | `BUKTI PENGELUARAN CV LEMBAYUNG` → `Bank` / `Kas Kecil` |
| **CV Anugerah** | *(belum)* | Isi variabel `CV_ANUGERAH_DRIVE_ROOT_ID` di script |

Form **Kas Besar** → subfolder **Bank**. Form **Kas Kecil** → subfolder **Kas Kecil**.

Shared arsip tetap bisa memakai folder **`KAS BESAR` / `KAS KECIL`** + **`MM - BULAN YYYY`** (sama seperti `organize-bukti.gs`).

## Yang harus Anda lakukan

### 1. Buat project Apps Script

1. Buka **spreadsheet respons** Form Kas Kecil (atau buat [project standalone](https://script.google.com)).
2. **Extensions → Apps Script**.
3. Tempel isi `BuktiMultiDrive.gs`.
4. Tab **Project Settings** → aktifkan manifest → paste `appsscript.json` dari repo. Wajib scope **`spreadsheets`** (bukan hanya `spreadsheets.currentonly`) karena debug & log memakai `SpreadsheetApp.openById`.
5. Sesuaikan di bagian atas script jika perlu:
   - `CV_ANUGERAH_DRIVE_ROOT_ID = "..."` (nanti)
   - ID folder jika berubah

### 2. Izin Google

1. Setelah mengubah `appsscript.json`, **hapus akses lama** app di [Google Account → Third-party access](https://myaccount.google.com/permissions) (nama project Apps Script Anda), lalu run ulang agar scope baru muncul.
2. Run sekali **`debugMultiDriveLastRowKecil`** (atau `distributeAllFromSharedArchive`).
3. **Authorize** — akun harus **Editor** pada:
   - folder shared arsip,
   - semua drive root entitas,
   - spreadsheet respons form.

### 3. Trigger form (submit baru)

Untuk **Kas Kecil** spreadsheet:

- **Triggers** → Add → From spreadsheet → **On form submit** → `onFormSubmitKasKecil`

Ulangi project/trigger untuk **Kas Besar** → `onFormSubmitKasBesar`  
(bisa satu project dengan dua spreadsheet bound, atau dua copy script.)

### 4. Matikan script lama (penting)

Jika masih terpasang `google-apps-script-organize-bukti.gs` dengan **`moveTo`**, **nonaktifkan trigger-nya** agar file tidak “hilang” dari shared hanya karena dipindah.

### 5. Backfill file yang sudah di shared

1. Buka spreadsheet → menu **GBC Multi Drive Bukti**.
2. **Salin dari shared → drive entitas (semua file)**  
   (`distributeAllFromSharedArchive`)
3. Opsional: **Pasang trigger jam** untuk salinan entitas dari file baru di shared.

Log: sheet **`_GBC_MultiDrive_Log`** di spreadsheet respons.

Duplikasi dicegah lewat **Script Properties** (sumber file + folder tujuan).

### 6. Inbox form lama (opsional)

Folder [inbox GForm](https://drive.google.com/drive/folders/1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM): set `PROCESS_FORM_INBOX: true` lalu menu **Salin inbox form → shared + entitas** (nama file harus format web app `Jenis_Tanggal_Entitas_...`).

## Gabung dengan menu script lain

Jika satu project berisi Compile Recap / Bukti Sorter, di `onOpen()` panggil:

```javascript
function onOpen() {
  onOpenMultiDriveBuktiMenu();
  // onOpenCompileRecapMenu(); …
}
```

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `openById` / izin `spreadsheets` tidak cukup | Ganti `spreadsheets.currentonly` → `https://www.googleapis.com/auth/spreadsheets` di `appsscript.json`, hapus izin app lama, authorize ulang |
| CV Anugerah tidak tersalin | Isi `CV_ANUGERAH_DRIVE_ROOT_ID` |
| Access denied | Share folder ke akun yang menjalankan script |
| File shared tidak ke entitas | Pastikan path shared punya folder entitas + Kas Kecil/Bank (atau KAS KECIL/KAS BESAR); cek Execution log |
| Duplikat banyak | Normal jika nama file beda; tracking per **file ID** sumber |
