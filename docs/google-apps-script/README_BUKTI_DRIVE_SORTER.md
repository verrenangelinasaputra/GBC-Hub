# Apps Script: Sortir bukti Drive (inbox → arsip entitas)

**Possible?** Ya. Script ini jalan di **Google Apps Script** (gratis), baca file di folder inbox, lalu **memindahkan** (atau menyalin) ke struktur folder arsip berdasarkan **nama file** — sama dengan format upload dari GBC Cash Management.

## Format nama file

```
Jenis_Tanggal_Entitas_Kategori_Nama PIC.ext
```

| Bagian | Contoh |
|--------|--------|
| Jenis | `Bank` atau `Kas Kecil` |
| Tanggal | `2026-03-15` atau `15/03/2026` |
| Entitas | `GBC`, `Kediri`, `CV Anugrah`, `MJL`, `BKT` |
| Kategori | `Beban Listrik` (boleh ada spasi; underscore hanya pemisah bagian) |
| PIC | `Budi Santoso` |

Contoh: `Bank_2026-03-15_GBC_Beban Listrik_Budi Santoso.pdf`

## Struktur folder tujuan

Di bawah folder arsip [`1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy`](https://drive.google.com/drive/folders/1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy):

```
bukti pengeluaran GBC/
  Bank/          (alias: Kas Besar)
    03 - Maret 2026/
      Bank_2026-03-15_GBC_….pdf
  Kas Kecil/
    03 - Maret 2026/
      …
bukti pengeluaran BKT/
bukti pengeluaran CV Anugrah/
bukti pengeluaran Kediri/
bukti pengeluaran MJL/
```

Script **mencocokkan** entitas & jenis ke folder yang **sudah ada**. Folder bulan harus mengikuti pola `MM - NamaBulan YYYY` (mis. `03 - Maret 2026`). Tanggal transaksi dipakai untuk memilih bulan yang benar.

## Folder sumber (inbox)

Upload OAuth web app masuk ke: [`1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM`](https://drive.google.com/drive/folders/1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM)

Setelah sortir, file **dipindah** dari inbox ke arsip (bisa diubah ke salin-only di `CONFIG.MOVE_FROM_INBOX`).

## Cara pasang

1. Buka [Google Apps Script](https://script.google.com/) → **New project**.
2. Salin isi `BuktiDriveSorter.gs` ke editor (hapus `function myFunction` bawaan).
3. **Wajib:** **Project Settings** → centang **Show "appsscript.json" manifest file in editor** → tab `appsscript.json` → paste isi file `appsscript.json` dari repo (scope `https://www.googleapis.com/auth/drive`).
4. Sesuaikan `CONFIG` di bagian atas jika ID folder berubah.
5. **Run** → `sortBuktiFromInbox` → **Authorize** (izin kelola Drive).
6. (Opsional) Pemicu **Berdasarkan waktu** → setiap jam → `sortBuktiFromInbox`.

### Otorisasi Drive

Akun yang menjalankan script harus **Editor** pada folder inbox & arsip.

Jika log: **`moveTo`** / **`auth/drive`** → hapus akses app di [Google Account Permissions](https://myaccount.google.com/permissions), lalu run ulang dan setujui izin baru. Untuk tanggal `2026-10-01` pastikan ada folder **`10 - Oktober 2026`** di bawah Kas Kecil entitas tersebut, atau set `CREATE_MONTH_FOLDER_IF_MISSING: true` di `CONFIG`.

## Perilaku append (bukan replace)

- File **tidak menimpa** yang sudah ada: jika nama sama di folder bulan, ditambah suffix ` (1)`, ` (2)`, …
- Mode **pindah** = inbox kosong untuk file sukses; arsip terus bertambah.
- ID file yang sudah diproses disimpan di **Script Properties** agar tidak diproses ulang jika `MOVE_FROM_INBOX: false`.

## Konfigurasi (`CONFIG`)

| Key | Default | Arti |
|-----|---------|------|
| `INBOX_FOLDER_ID` | ID inbox OAuth | Sumber file |
| `ROOT_ARCHIVE_FOLDER_ID` | ID arsip | Root `bukti pengeluaran …` |
| `MOVE_FROM_INBOX` | `true` | Pindah vs salin |
| `CREATE_MONTH_FOLDER_IF_MISSING` | `false` | Buat folder bulan otomatis jika belum ada |
| `TRACK_PROCESSED_IDS` | `true` | Hindari duplikasi saat salin |

## Troubleshooting

| Gejala | Penyebab |
|--------|----------|
| Gagal: entitas tidak cocok | Token entitas di nama file tidak match map (sesuaikan `ENTITY_ROOT_FOLDERS`) |
| Gagal: folder tujuan tidak ditemukan | Subfolder `Bank` / `Kas Kecil` atau folder bulan belum dibuat |
| File tetap di inbox | Nama file tidak 5 bagian `_` atau tanggal tidak terbaca |
| **moveTo / auth/drive** | Scope Drive belum penuh — lihat langkah otorisasi di atas |
| **Butuh minimal 5 bagian** | Bukan format bukti (mis. `Screenshot …png`) — rename atau hapus dari inbox |

Hanya file dengan pola **`Jenis_Tanggal_Entitas_Kategori_PIC.ext`** yang diproses. File screenshot / nama bebas **sengaja dilewati** (gagal di log) sampai di-rename atau dipindah manual.

Uji parse: jalankan fungsi `testParseFileName` → **View → Logs**.

## Relasi dengan web app

Web app (`lib/buktiFileName.js`) menamai file saat upload ke folder inbox. Script ini **melengkapi** alur: inbox → arsip rapi per entitas / kas / bulan. Tidak perlu ubah Node.js kecuali ingin upload langsung ke arsip (lebih rumit karena path dinamis).
