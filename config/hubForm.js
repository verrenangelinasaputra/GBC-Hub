const {
  ENTITIES,
  EXPENSE_CATEGORIES,
  formHeadersForKind
} = require("./formDefinitions");

/** @deprecated gunakan formHeadersForKind(kind) */
const FORM_INPUT_HEADERS = formHeadersForKind("kas_kecil");

const COMPILED_HEADERS = [
  "No",
  "Jenis Kas",
  "Timestamp",
  "Tanggal Pengeluaran",
  "Entitas",
  "Kategori",
  "Nama Transaksi",
  "Jumlah (Rp)",
  "Keterangan",
  "Dibayarkan Kepada",
  "Sumber Dana",
  "Bukti Transaksi",
  "PIC",
  "Baris Sumber"
];

const ENTITY_TAB_DEFS = [
  {
    sheetName: "ENTITAS CV ANUGRAH",
    displayName: "CV Anugerah Impian Mandiri",
    match(norm) {
      return /anugerah|cv\s*anugerah|^aim$|^cv anugerah$/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS CV LEMBAYUNG",
    displayName: "CV Lembayung",
    match(norm) {
      return /lembayung|cv\s*lembayung/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS BKT",
    displayName: "PT Bersama Karunia Terang",
    match(norm) {
      return /^bkt$|bersama\s*karunia|karunia\s*terang/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS MJL",
    displayName: "PT Mata Jendela Langit",
    match(norm) {
      return /^mjl$|mata\s*jendela|jendela\s*langit/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS GBC",
    displayName: "GBC",
    match(norm) {
      return /^gbc$/.test(norm) || (norm.includes("gbc") && !norm.includes("anugerah"));
    }
  },
  {
    sheetName: "ENTITAS KEDIRI",
    displayName: "Kediri",
    match(norm) {
      return /^kediri$|^kdr$/.test(norm);
    }
  }
];

const HUB_TAB_ORDER = [
  "KAS KECIL",
  "Bank",
  "compiled table",
  ...ENTITY_TAB_DEFS.map(e => e.sheetName),
  "LAPORAN BULANAN"
];

module.exports = {
  FORM_INPUT_HEADERS,
  formHeadersForKind,
  ENTITIES,
  EXPENSE_CATEGORIES,
  COMPILED_HEADERS,
  ENTITY_TAB_DEFS,
  HUB_TAB_ORDER
};
