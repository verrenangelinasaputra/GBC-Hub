# -*- coding: utf-8 -*-
"""Generate monthly work recap Excel — Oktober 2026."""
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = r"d:\Engku Yanto\1 - Transaction Management\Finance v2\GBC_Expense_Hub_Standalone_Full_Starter (1)\docs\Rekap_Kerja_Okt_2026_Verren_Angelina.xlsx"

HEADER_FILL = PatternFill("solid", fgColor="172554")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
SUBHEADER_FILL = PatternFill("solid", fgColor="E8EDFF")
TITLE_FONT = Font(bold=True, size=14, color="172554")
THIN = Side(style="thin", color="D7DCE8")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

ROWS_SUMMARY = [
    ("17 Okt 2026", "Jumat", "—", "—", "Hari mulai kerja (onboarding / setup awal)", ""),
    ("18 Okt 2026", "Sabtu", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    (
        "19 Okt 2026",
        "Minggu",
        "Proyek OCR + Telegram (di luar repo GBC)",
        3,
        "Berhasil membangun pipeline OCR terhubung ke bot Telegram (~3 jam)",
        "Integrasi bot Telegram untuk terima/gambar dokumen → OCR → respons otomatis (proyek terpisah dari GBC Cash Management).",
    ),
    (
        "20 Okt 2026",
        "Senin",
        "GBC Cash Management — studi kerangka",
        "—",
        "Memahami alur & kerangka project pertama (Engku Yanto)",
        "Audit starter GBC Expense Hub: Node/Express, public CMS, lib/sheets.js, role admin/super_admin/owner, sumber data Google Sheets & Google Form, tanpa DB lokal.",
    ),
    (
        "21 Okt 2026",
        "Selasa",
        "GBC Cash Management — website",
        5,
        "Pengembangan inti web app Kas Kecil / Kas Besar & dashboard",
        "Lihat sheet Detail — 21 Okt (banyak item).",
    ),
    ("22 Okt 2026", "Rabu", "GBC Cash Management (lanjutan malam)", "—", "Lanjutan dari sesi 21 Okt (Apps Script compile, hub spreadsheet)", "Initial commit repo; script compile rekap ke spreadsheet hub; integrasi append transaksi + compileRecap di Node."),
    ("23 Okt 2026", "Kamis", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    (
        "24 Okt 2026",
        "Jumat",
        "GBC Cash Management — website (penyelesaian)",
        5,
        "Auth penuh, CMS, Sheets/Drive, deploy GitHub/Vercel",
        "Commit: Update fitur auth, CMS, dan integrasi Sheets/Drive (~4500+ baris).",
    ),
    (
        "25 Okt 2026",
        "Sabtu",
        "GBC — revisi dari Engku Yanto (diterima & dikerjakan sebagian)",
        "—",
        "Terima feedback; perbaikan cache, weekly recap, filter dashboard, Apps Script",
        "Commit cache/weekly recap; filter tanggal dashboard; perbaikan compile Apps Script & URL Vercel production.",
    ),
    ("26 Okt 2026", "Minggu", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    ("27 Okt 2026", "Senin", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    (
        "28 Okt 2026",
        "Selasa",
        "GBC — tuntas revisi",
        1,
        "Penyesuaian Apps Script compile + weekly recap (tab Bank, lock, format hub)",
        "Perubahan lokal belum di-commit: kasBesarTab → Bank, onOpenCompileRecapMenu, formatHubInputTabs, lock compile, WeeklyRecapEmail.",
    ),
    ("29–31 Okt 2026", "—", "—", "—", "Di luar periode catatan / belum diisi", ""),
]

DETAIL_21 = [
    "Konfirmasi arsitektur: redirect ke Google Form + baca spreadsheet (bukan form web baru); tanpa SQLite; kategori fixed list; akun demo admin/superadmin/owner.",
    "Setup Google Service Account (.env, share spreadsheet Kas Kecil & Kas Besar ke client_email).",
    "Perbaikan UI menu Kas Kecil: filter, header tabel, kolom Bukti/PIC/Sumber Dana, perbaikan nomor baris tabel.",
    "Dashboard recap Kas Kecil untuk admin (KPI, filter, agregasi per kategori/entitas).",
    "Perbaikan filter Kas Kecil; styling dashboard.",
    "Apps Script / alur bukti: rename file Drive (tanggal upload + Entitas + Kategori + Nama transaksi); folder bukti per entitas.",
    "Ganti spreadsheet Kas Besar ke ID 1jgcaW0NLr_… (gid 1533749503).",
    "Perbaikan google-apps-script-organize-bukti.gs (openById, fix “Tidak ada spreadsheet aktif”).",
    "Permintaan Apps Script compile: spreadsheet hub 1sRiwrn_nLH… → tab compiled table, ENTITAS (CV Anugerah, BKT, MJL, GBC, Kediri), LAPORAN BULANAN.",
]

DETAIL_24 = [
    "Registrasi & login user (register, forgot-password, verifikasi email/resend), registry user di spreadsheet.",
    "RBAC & session; perluasan server.js (API transaksi, upload bukti, OAuth Drive opsional).",
    "lib/compileRecap.js — compile otomatis ke hub saat simpan transaksi.",
    "lib/driveUpload.js, buktiFileName.js, dokumentasi DRIVE_BUKTI_SETUP.",
    "CMS (cms.js/html): form input Kas Kecil/Kas Besar di web, progress upload, integrasi hub spreadsheet.",
    "config/hubForm.js, formDefinitions.js, categories.json.",
    "Docs: USER_AUTH_SETUP, APPS_SCRIPT_SETUP; BuktiDriveSorter.gs.",
    "Push GitHub + panduan deploy Vercel (vercel.json).",
]

DETAIL_25 = [
    "WeeklyRecapEmail.gs + README — email rekap mingguan.",
    "Server: cache response; penyesuaian login UI.",
    "Dashboard Owner: perbaikan filter rentang tanggal (cms.js).",
    "Revisi: fix error Apps Script compile (duplikat onOpen, getRange); integrasi menu compile ke BuktiDriveSorter.",
    "Konsultasi URL production Vercel (gbc-hub-seven.vercel.app vs URL deployment panjang).",
]

DETAIL_28 = [
    "Compile script: tab Kas Besar membaca \"Bank\" (sesuai web app), bukan \"KAS BESAR\".",
    "Menu GBC Compile: item \"Format tab KAS KECIL + Bank\" (formatHubInputTabs).",
    "Document/script lock agar compile & format tidak bentrok.",
    "loadSourceRowsFromSheet_ / resolveKasBesarSheet_ — baca langsung dari tab hub.",
    "Sinkronisasi docs/google-apps-script/* dan WeeklyRecapEmail.gs dengan perubahan di atas.",
]

wb = Workbook()

# --- Sheet 1: Ringkasan ---
ws = wb.active
ws.title = "Ringkasan Okt 2026"
ws["A1"] = "REKAP KERJA — OKTOBER 2026"
ws["A1"].font = TITLE_FONT
ws.merge_cells("A1:F1")
ws["A2"] = "Periode: 17 Okt – 31 Okt 2026  |  Nama: Verren Angelina Saputra  |  Klien/PM: Engku Yanto"
ws.merge_cells("A2:F2")

headers = ["Tanggal", "Hari", "Proyek", "Jam", "Ringkasan singkat", "Catatan"]
for col, h in enumerate(headers, 1):
    c = ws.cell(row=4, column=col, value=h)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.border = BORDER
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

total_hours = 0
for i, row in enumerate(ROWS_SUMMARY, start=5):
    for col, val in enumerate(row, 1):
        cell = ws.cell(row=i, column=col, value=val)
        cell.border = BORDER
        cell.alignment = WRAP
    if isinstance(row[3], (int, float)):
        total_hours += row[3]
    if (i - 5) % 2 == 1:
        for col in range(1, 7):
            ws.cell(row=i, column=col).fill = SUBHEADER_FILL

ws.cell(row=5 + len(ROWS_SUMMARY) + 1, column=1, value="TOTAL JAM (tercatat)").font = Font(bold=True)
ws.cell(row=5 + len(ROWS_SUMMARY) + 1, column=4, value=total_hours).font = Font(bold=True)

widths = [14, 10, 38, 8, 42, 36]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w

# --- Sheet 2: Detail perubahan ---
wd = wb.create_sheet("Detail Perubahan")
wd["A1"] = "DETAIL PERUBAHAN / DELIVERABLE PER TANGGAL"
wd["A1"].font = TITLE_FONT
wd.merge_cells("A1:C1")

blocks = [
    ("19 Okt 2026 — OCR + Telegram (3 jam)", ["Pipeline OCR + bot Telegram (proyek terpisah dari repo GBC Hub)."]),
    (
        "20 Okt 2026 — Pahami kerangka project",
        [
            "Mapping stack: Express server, Google Sheets API, CMS static, RBAC 3 role.",
            "Identifikasi gap: form masih external, perlu hub spreadsheet & bukti Drive.",
        ],
    ),
    ("21 Okt 2026 — GBC website (5 jam)", DETAIL_21),
    ("22 Okt 2026 — Lanjutan (malam)", ["google-apps-script-compile-recap.gs (compile ke hub).", "lib/sheets.js appendTransaction + hub mode.", "lib/compileRecap.js di Node; docs APPS_SCRIPT_SETUP."]),
    ("24 Okt 2026 — GBC website selesai (5 jam)", DETAIL_24),
    ("25 Okt 2026 — Revisi Engku Yanto", DETAIL_25),
    ("28 Okt 2026 — Tuntas revisi (1 jam)", DETAIL_28),
]

r = 3
for title, items in blocks:
    wd.cell(row=r, column=1, value=title).font = Font(bold=True, color="172554")
    wd.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    r += 1
    for idx, item in enumerate(items, 1):
        wd.cell(row=r, column=1, value=idx)
        wd.cell(row=r, column=2, value=item)
        wd.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        for col in range(1, 4):
            wd.cell(row=r, column=col).border = BORDER
            wd.cell(row=r, column=col).alignment = WRAP
        r += 1
    r += 1

wd.column_dimensions["A"].width = 6
wd.column_dimensions["B"].width = 95
wd.column_dimensions["C"].width = 12

# --- Sheet 3: Referensi git ---
wg = wb.create_sheet("Referensi Git")
wg.append(["Tanggal", "Commit", "Pesan"])
for row in [
    ("2026-10-22", "cd1237b", "Initial commit: GBC Expense Hub"),
    ("2026-10-24", "5e9cab5", "Update fitur auth, CMS, dan integrasi Sheets/Drive"),
    ("2026-10-25", "c11c1df", "Update fitur cache dan weekly recap"),
    ("2026-10-25", "eae5426", "Update fitur dashboard filter tanggal"),
]:
    wg.append(row)
for cell in wg[1]:
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
wg.column_dimensions["A"].width = 12
wg.column_dimensions["B"].width = 10
wg.column_dimensions["C"].width = 55

wb.save(OUT)
print("Saved:", OUT)
