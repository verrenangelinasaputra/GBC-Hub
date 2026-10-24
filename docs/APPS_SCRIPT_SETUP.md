# Apps Script (opsional) — Compile rekap dengan format cantik

**Compile utama sudah di web app (Node)** — setiap simpan transaksi, server mengisi `compiled table`, tab ENTITAS, dan `LAPORAN BULANAN`.

Apps Script **tidak wajib**. Gunakan hanya jika Anda ingin:

- Tombol **GBC Compile → Compile semua tab** di dalam Google Sheets
- Format tabel warna/filter seperti versi script lama (Node menulis data polos baris 1 = header)

---

## File yang dibuat di Google

1. Buka spreadsheet hub:  
   https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit

2. **Extensions → Apps Script**

3. Hapus isi default `Code.gs`, lalu **salin seluruh isi** file repo:  
   `scripts/google-apps-script-compile-recap.gs`

4. **Save** project (nama bebas, mis. `GBC Compile Recap`)

5. Pastikan di bagian atas script:
   - `destinationId` = ID spreadsheet hub (sudah default)
   - `useLegacyFormSources: false` (baca tab **KAS KECIL** / **KAS BESAR** di file yang sama)
   - `kasKecilTab` / `kasBesarTab` = nama tab input (default: `KAS KECIL`, `KAS BESAR`)

6. **Jalankan sekali** fungsi `compileAllRecap` → **Authorize** (akun Google yang punya akses Editor ke sheet)

7. (Opsional) **Triggers** → Add trigger → `compileAllRecap` → Time-driven → mis. setiap 1 jam  
   *(Hanya jika ada yang edit manual di tab input; kalau semua lewat web app, trigger tidak perlu.)*

---

## Tab yang harus ada di spreadsheet hub

| Tab | Fungsi |
|-----|--------|
| **KAS KECIL** | Input web (admin / super admin) |
| **KAS BESAR** | Input web (super admin) |
| **compiled table** | Gabungan (auto Node / Apps Script) |
| **ENTITAS …** (5 tab) | Filter per entitas |
| **LAPORAN BULANAN** | Ringkasan per bulan & entitas |

Tab input bisa **dibuat otomatis** saat pertama kali simpan dari web (service account **Editor**). Header baris 1 dibuat otomatis jika kosong.

---

## Service account vs Apps Script

| | Web app (Node) | Apps Script |
|--|----------------|-------------|
| Input transaksi | Ya | Tidak |
| Compile rekap | Ya (otomatis) | Ya (manual/trigger) |
| Format warna/filter | Data polos | Bisa lengkap (script lama) |

Share spreadsheet hub ke **email service account** dengan role **Editor** (bukan Viewer).
