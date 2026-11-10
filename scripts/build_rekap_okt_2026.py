# -*- coding: utf-8 -*-
"""Generate work recap Excel — 17 Okt – 7 Nov 2026."""
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = r"d:\Engku Yanto\1 - Transaction Management\Finance v2\GBC_Expense_Hub_Standalone_Full_Starter (1)\docs\Rekap_Kerja_17Okt_7Nov_2026_Verren_Angelina.xlsx"
OUT_LEGACY = r"d:\Engku Yanto\1 - Transaction Management\Finance v2\GBC_Expense_Hub_Standalone_Full_Starter (1)\docs\Rekap_Kerja_Okt_2026_Verren_Angelina.xlsx"

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
        "Pipeline OCR terhubung bot Telegram (~3 jam)",
        "Proyek terpisah dari GBC Cash Management.",
    ),
    (
        "20 Okt 2026",
        "Senin",
        "GBC Cash Management — studi kerangka",
        "—",
        "Memahami alur & kerangka project (Engku Yanto)",
        "Audit starter: Node/Express, Sheets, RBAC 3 role.",
    ),
    (
        "21 Okt 2026",
        "Selasa",
        "GBC Cash Management — website",
        5,
        "Pengembangan inti web app & dashboard",
        "Lihat sheet Detail — 21 Okt.",
    ),
    (
        "22 Okt 2026",
        "Rabu",
        "GBC Cash Management (lanjutan)",
        "—",
        "Apps Script compile, hub spreadsheet, initial commit",
        "cd1237b — GBC Expense Hub.",
    ),
    ("23 Okt 2026", "Kamis", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    (
        "24 Okt 2026",
        "Jumat",
        "GBC Cash Management — website",
        5,
        "Auth, CMS, integrasi Sheets/Drive, deploy",
        "5e9cab5.",
    ),
    (
        "25 Okt 2026",
        "Sabtu",
        "GBC — revisi Engku Yanto",
        "—",
        "Cache, weekly recap, filter dashboard, Apps Script",
        "c11c1df, eae5426.",
    ),
    ("26 Okt 2026", "Minggu", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    ("27 Okt 2026", "Senin", "—", "—", "Tidak ada catatan aktivitas spesifik", ""),
    (
        "28 Okt 2026",
        "Selasa",
        "GBC — revisi Engku Yanto",
        1,
        "Apps Script compile/bukti multi-drive, form hub, weekly recap",
        "c0e475a — Modifikasi Appscript dan Form berdasarkan revisi engku yanto.",
    ),
    ("29 Okt 2026", "Rabu", "—", "—", "Tidak ada commit / catatan di repo", ""),
    ("30 Okt 2026", "Kamis", "—", "—", "Tidak ada commit / catatan di repo", ""),
    ("31 Okt 2026", "Jumat", "—", "—", "Tidak ada commit / catatan di repo", ""),
    (
        "1 Nov 2026",
        "Sabtu",
        "GBC Cash Management — form & Drive",
        "—",
        "OAuth Drive Vercel, halaman form admin, upload multi-foto, verifikasi",
        "12 commit (lihat Referensi Git).",
    ),
    ("2 Nov 2026", "Minggu", "—", "—", "Tidak ada commit / catatan di repo", ""),
    (
        "3 Nov 2026",
        "Senin",
        "GBC — form & reminder",
        "—",
        "Opsi tambahan di form CMS; Daily Expense Reminder (Apps Script)",
        "8ffc73d.",
    ),
    ("4 Nov 2026", "Selasa", "—", "—", "Tidak ada commit / catatan di repo", ""),
    ("5 Nov 2026", "Rabu", "—", "—", "Tidak ada commit / catatan di repo", ""),
    ("6 Nov 2026", "Kamis", "—", "—", "Tidak ada commit / catatan di repo", ""),
    (
        "7 Nov 2026",
        "Jumat",
        "GBC — fitur export, admin, akun",
        "—",
        "Export PDF/Word, halaman modifikasi admin, username unik, beban lainnya",
        "10 commit (lihat Referensi Git).",
    ),
]

DETAIL_21 = [
    "Konfirmasi arsitektur: spreadsheet sebagai DB; kategori fixed list; RBAC demo.",
    "Setup Google Service Account & share spreadsheet.",
    "UI Kas Kecil: filter, header, kolom Bukti/PIC/Sumber Dana, nomor baris.",
    "Dashboard recap admin (KPI, filter, agregasi).",
    "Bukti Drive: rename file + folder per entitas.",
    "Ganti spreadsheet Kas Besar; perbaikan organize-bukti.gs.",
    "Rencana compile ke hub (compiled table, ENTITAS, LAPORAN BULANAN).",
]

DETAIL_24 = [
    "Registrasi/login, forgot-password, user registry spreadsheet.",
    "RBAC, API transaksi, upload bukti, compileRecap Node.",
    "CMS form Kas Kecil/Besar; docs auth & Drive.",
    "Deploy GitHub + Vercel.",
]

DETAIL_25 = [
    "WeeklyRecapEmail.gs; cache server; filter tanggal dashboard.",
    "Fix Apps Script compile (onOpen, getRange); URL production Vercel.",
]

DETAIL_28 = [
    "google-apps-script-compile-recap.gs: tab Bank, lock compile, formatHubInputTabs.",
    "BuktiMultiDrive.gs + README — sort bukti ke beberapa root Drive entitas.",
    "WeeklyRecapEmail.gs diperbarui; formDefinitions / hubForm.",
    "server.js & cms.js — penyesuaian form berdasarkan revisi.",
    "File rekap kerja Oktober (Excel) + script generator.",
]

DETAIL_NOV1 = [
    "Format Drive & otoritas folder bukti (fd404dd).",
    "Google Drive OAuth refresh token untuk deploy Vercel (28470b5).",
    "Menu admin: halaman form tambahan (8f05186).",
    "Akses entitas & Sumber Dana per user (68b689c).",
    "Rename gambar bukti → auto-map ke folder entitas G-Drive (22bf962, 3747685).",
    "Perbaikan tanggal di form CMS (a6ff134, d986db7).",
    "Upload banyak foto + cancel foto di form (7163a88, 9054c6f).",
    "Tombol verifikasi transaksi (a4278cb); perbaikan link Drive (a6b59cc).",
]

DETAIL_NOV3 = [
    "Opsi field tambahan di form (config/formDefinitions.js, cms.js).",
    "DailyExpenseReminder.gs — pengingat input harian (email/trigger).",
    "Perluasan WeeklyRecapEmail.gs.",
]

DETAIL_NOV7 = [
    "Username unik + login/register paralel dengan email (7a447fc, userRegistry).",
    "Kategori Beban Lainnya + jenis pengeluaran tambahan (1836ba0).",
    "Export rekap PDF & Word (3b83de2); embed/perbaikan gambar bukti (043e38e, 29277db, 2b88ec4).",
    "Halaman modifikasi data admin (a4c729d); perbaikan overlay UI (aed8527).",
    "Halaman revisi: auto-update file di Drive saat edit (1aacce6).",
    "Hapus data/file Drive lama saat revisi upload (0a4752f).",
]

GIT_ROWS = [
    ("2026-10-22", "cd1237b", "Initial commit: GBC Expense Hub"),
    ("2026-10-24", "5e9cab5", "Update fitur auth, CMS, dan integrasi Sheets/Drive"),
    ("2026-10-25", "c11c1df", "Update fitur cache dan weekly recap"),
    ("2026-10-25", "eae5426", "Update fitur dashboard filter tanggal"),
    ("2026-10-28", "c0e475a", "Modifikasi Appscript dan Form berdasarkan revisi engku yanto"),
    ("2026-11-01", "fd404dd", "Format Drive dan Authority Gdrive"),
    ("2026-11-01", "28470b5", "Google Drive Oath Refresh for GBC Vercel"),
    ("2026-11-01", "8f05186", "Menu Admin: Tambahan Page Form"),
    ("2026-11-01", "68b689c", "New Feature: Access Entities and Sumber Dana"),
    ("2026-11-01", "22bf962", "Solve Issue Renaming Gambar … Auto-Mapped ke G-Drive Entities"),
    ("2026-11-01", "3747685", "Solve issue format spasi gambar supaya tidak pakai dash"),
    ("2026-11-01", "a6ff134", "Solve Issue Tanggal di Form"),
    ("2026-11-01", "d986db7", "Solve Issue Reformat Tanggal di Form Part 2"),
    ("2026-11-01", "7163a88", "Bisa Upload Multiple Pictures"),
    ("2026-11-01", "9054c6f", "Solved Issue Tidak Bisa Cancel Photo di Form"),
    ("2026-11-01", "a4278cb", "New Feature: Button Verifikasi"),
    ("2026-11-01", "a6b59cc", "Solve Issue Link Drive"),
    ("2026-11-03", "8ffc73d", "Tambah Opsi di Form (+ DailyExpenseReminder)"),
    ("2026-11-07", "7a447fc", "New Feature: Username Unique and Email Paralel"),
    ("2026-11-07", "1836ba0", "New Feature: Beban Lainnya dan Jenis Pengeluaran Lainnya"),
    ("2026-11-07", "3b83de2", "New Feature: Export Recap PDF dan Word"),
    ("2026-11-07", "043e38e", "Issue Solved: Export Gambar"),
    ("2026-11-07", "29277db", "Issue Solved: Export Gambar via Docx"),
    ("2026-11-07", "2b88ec4", "Issue Solved: Auto-fit Docx"),
    ("2026-11-07", "a4c729d", "New Feature: Admin Modification Page"),
    ("2026-11-07", "aed8527", "Issue Solved: Overlay Page"),
    ("2026-11-07", "1aacce6", "Issue Solved: Revision Page auto Update Drive"),
    ("2026-11-07", "0a4752f", "Issue Solved: Remove Prior Data di Gdrive"),
]


def build_workbook():
    wb = Workbook()

    ws = wb.active
    ws.title = "Ringkasan"
    ws["A1"] = "REKAP KERJA — GBC / ENGKU YANTO"
    ws["A1"].font = TITLE_FONT
    ws.merge_cells("A1:F1")
    ws["A2"] = "Periode: 17 Okt – 7 Nov 2026  |  Verren Angelina Saputra  |  Klien/PM: Engku Yanto"
    ws.merge_cells("A2:F2")
    ws["A3"] = "Diperbarui: 7 Nov 2026"
    ws.merge_cells("A3:F3")

    headers = ["Tanggal", "Hari", "Proyek", "Jam", "Ringkasan singkat", "Catatan"]
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=5, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.border = BORDER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    total_hours = 0
    for i, row in enumerate(ROWS_SUMMARY, start=6):
        for col, val in enumerate(row, 1):
            cell = ws.cell(row=i, column=col, value=val)
            cell.border = BORDER
            cell.alignment = WRAP
        if isinstance(row[3], (int, float)):
            total_hours += row[3]
        if (i - 6) % 2 == 1:
            for col in range(1, 7):
                ws.cell(row=i, column=col).fill = SUBHEADER_FILL

    tr = 6 + len(ROWS_SUMMARY) + 1
    ws.cell(row=tr, column=1, value="TOTAL JAM (tercatat manual 17–28 Okt)").font = Font(bold=True)
    ws.cell(row=tr, column=4, value=total_hours).font = Font(bold=True)

    widths = [14, 10, 38, 8, 42, 36]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    wd = wb.create_sheet("Detail Perubahan")
    wd["A1"] = "DETAIL PERUBAHAN / DELIVERABLE PER TANGGAL"
    wd["A1"].font = TITLE_FONT
    wd.merge_cells("A1:C1")

    blocks = [
        ("19 Okt — OCR + Telegram (3 jam)", ["Pipeline OCR + bot Telegram (di luar repo GBC)."]),
        (
            "20 Okt — Pahami kerangka",
            [
                "Mapping stack Express + Google Sheets + RBAC.",
                "Gap: perlu hub spreadsheet & integrasi bukti Drive.",
            ],
        ),
        ("21 Okt — GBC website (5 jam)", DETAIL_21),
        (
            "22 Okt — Lanjutan",
            ["compile-recap.gs; appendTransaction hub; compileRecap.js (Node)."],
        ),
        ("24 Okt — Auth & CMS (5 jam)", DETAIL_24),
        ("25 Okt — Revisi", DETAIL_25),
        ("28 Okt — Revisi (commit c0e475a)", DETAIL_28),
        ("1 Nov — Form, Drive, OAuth", DETAIL_NOV1),
        ("3 Nov — Form & daily reminder", DETAIL_NOV3),
        ("7 Nov — Export, admin, akun", DETAIL_NOV7),
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

    wg = wb.create_sheet("Referensi Git")
    wg.append(["Tanggal", "Commit", "Pesan"])
    for row in GIT_ROWS:
        wg.append(row)
    for cell in wg[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    wg.column_dimensions["A"].width = 12
    wg.column_dimensions["B"].width = 10
    wg.column_dimensions["C"].width = 58

    return wb


if __name__ == "__main__":
    wb = build_workbook()
    wb.save(OUT)
    wb.save(OUT_LEGACY)
    print("Saved:", OUT)
    print("Also:", OUT_LEGACY)
