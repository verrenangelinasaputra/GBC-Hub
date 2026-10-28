/** Opsi form Kas Besar (Bank) & Kas Kecil — selaras Google Form GBC. */

const ENTITIES = ["GBC", "Kediri", "CV Anugerah", "CV Lembayung", "MJL", "BKT"];

const EXPENSE_CATEGORIES = [
  "Bahan Baku Plastik Lokal",
  "Bayar Hutang Import",
  "Bayar Hutang Lokal",
  "Beban Alat Tulis Kantor",
  "Beban Bensin, Parkir, Tol Kendaraan",
  "Beban Bongkar Muat",
  "Beban Ekspedisi, Pos & Materai",
  "Beban Forwarder",
  "Beban Gaji, Upah & Honorer",
  "Beban Gathering Kantor",
  "Beban Iklan",
  "Beban Katering & Makan Karyawan",
  "Beban Keamanan dan Kebersihan",
  "Beban Kuli Angkut Ekspedisi",
  "Beban Listrik",
  "Beban Moulding",
  "Beban Operasional Lainnya",
  "Beban PAM",
  "Beban Packaging",
  "Beban Perjalanan Dinas",
  "Beban Perlengkapan Kantor",
  "Beban Printing",
  "Beban Renovasi",
  "Beban Retribusi & Sumbangan",
  "Beban Sample",
  "Beban Software",
  "Beban Telekomunikasi",
  "Beban Tempat Kontainer",
  "Beban Transportasi Karyawan",
  "Beban Wi-Fi & Internet",
  "PIB & Notulen",
  "Pajak PPh & PPn"
];

const SUMBER_DANA_BANK = [
  "Bank Agung — 110111",
  "Bank Ami — 110108",
  "Bank Amir — 110110",
  "Bank BKT — 110106",
  "Bank CV Anugerah — 110118",
  "Bank Candra — 110123",
  "Bank Eddy — 110113",
  "Bank Janne — 110126",
  "Bank Joseph — 110112",
  "Bank Lie Hok Ting — 110109",
  "Bank MJL — 110117",
  "Bank Rifki — 110120",
  "Bank Rizky — 110115",
  "Bank Yanti — 110114",
  "Bank Yulianto — 110107",
  "Bank Virtual (Cust - Supplier)"
];

const SUMBER_DANA_KAS_KECIL = [
  "Kas Amir — 110121",
  "Kas Barata — 110103",
  "Kas Besar — 110101",
  "Kas Bojong — 110104",
  "Kas CV Anugerah — 110119",
  "Kas Dimas Boris — 110127",
  "Kas Eddy — 110122",
  "Kas Kecil BKT — 110102",
  "Kas MJL — 110116",
  "Kas Matraman — 110105",
  "Kas Rifki — 110128"
];

const FORM_HEADERS_KAS_BESAR = [
  "Timestamp",
  "1. Tanggal Pengeluaran",
  "2. Entitas Pengeluaran",
  "3. Kategori Pengeluaran",
  "4. Nama Transaksi",
  "5. Jumlah Pengeluaran (Rp)",
  "6. Keterangan Pengeluaran",
  "7. Dibayarkan Kepada",
  "8. Sumber Dana Bank",
  "9. Bukti Transaksi",
  "10. Nama PIC"
];

const FORM_HEADERS_KAS_KECIL = [
  "Timestamp",
  "1. Tanggal Pengeluaran",
  "2. Entitas Pengeluaran",
  "3. Kategori Pengeluaran",
  "4. Nama Transaksi",
  "5. Jumlah Pengeluaran (Rp)",
  "6. Keterangan Pengeluaran",
  "7. Dibayarkan Kepada",
  "8. Sumber Dana Kas Kecil",
  "9. Bukti Transaksi",
  "10. Nama PIC"
];

function formHeadersForKind(kind) {
  return kind === "kas_besar" ? FORM_HEADERS_KAS_BESAR : FORM_HEADERS_KAS_KECIL;
}

function formOptionsForKind(kind) {
  const isBesar = kind === "kas_besar";
  return {
    kind,
    title: isBesar ? "Form Pengeluaran Bank" : "Form Pengeluaran Kas Kecil",
    subtitle: isBesar
      ? "Formulir untuk mencatat transaksi pengeluaran perusahaan yang dibayarkan melalui rekening bank."
      : "Formulir untuk mencatat transaksi pengeluaran perusahaan yang dibayarkan melalui kas kecil.",
    entities: ENTITIES,
    categories: EXPENSE_CATEGORIES,
    sumberDana: isBesar ? SUMBER_DANA_BANK : SUMBER_DANA_KAS_KECIL,
    sumberDanaLabel: isBesar ? "8. Sumber Dana Bank" : "8. Sumber Dana Kas Kecil",
    maxBuktiFiles: 5,
    maxBuktiBytes: 10 * 1024 * 1024
  };
}

module.exports = {
  ENTITIES,
  EXPENSE_CATEGORIES,
  SUMBER_DANA_BANK,
  SUMBER_DANA_KAS_KECIL,
  FORM_HEADERS_KAS_BESAR,
  FORM_HEADERS_KAS_KECIL,
  formHeadersForKind,
  formOptionsForKind
};
