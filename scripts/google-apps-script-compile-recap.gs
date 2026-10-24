/**
 * GBC — Compile rekap Kas Kecil + Kas Besar (Bank) ke spreadsheet pusat.
 *
 * SUMBER (default — tab input di spreadsheet yang sama):
 * - Tab "KAS KECIL" dan "KAS BESAR" di spreadsheet hub (isi dari web app GBC)
 *
 * Legacy (jika USE_LEGACY_FORM_SOURCES = true):
 * - Kas Kecil / Kas Besar dari spreadsheet Google Form lama
 *
 * TUJUAN / HUB:
 * - 1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY
 *
 * TAB (urutan disarankan):
 * 1. KAS KECIL
 * 2. KAS BESAR
 * 3. compiled table
 * 2. ENTITAS CV ANUGRAH
 * 3. ENTITAS BKT
 * 4. ENTITAS MJL
 * 5. ENTITAS GBC
 * 6. ENTITAS KEDIRI
 * 7. LAPORAN BULANAN
 *
 * PASANG:
 * 1. Buka spreadsheet TUJUAN → Extensions → Apps Script
 * 2. Tempel file ini, Save
 * 3. Jalankan sekali `compileAllRecap` → authorize
 * 4. (Opsional) Triggers → Time-driven → daily → compileAllRecap
 *
 * Service account / akun script harus punya akses Viewer ke kedua sheet sumber.
 */

var COMPILE_CONFIG = {
  destinationId: "1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY",
  /** false = baca tab KAS KECIL / KAS BESAR di destinationId (disarankan + web app) */
  useLegacyFormSources: false,
  kasKecilTab: "KAS KECIL",
  kasBesarTab: "KAS BESAR",
  kasKecil: { spreadsheetId: "1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM", gid: 423968165 },
  kasBesar: { spreadsheetId: "1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY", gid: 1533749503 },
  logSheetName: "_GBC_Compile_Log"
};

var COMPILED_HEADERS = [
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

var ENTITY_TAB_DEFS = [
  {
    sheetName: "ENTITAS CV ANUGRAH",
    displayName: "CV Anugerah Impian Mandiri",
    match: function (norm) {
      return /anugerah|cv\s*anugerah|^aim$/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS BKT",
    displayName: "PT Bersama Karunia Terang",
    match: function (norm) {
      return /^bkt$|bersama\s*karunia|karunia\s*terang/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS MJL",
    displayName: "PT Mata Jendela Langit",
    match: function (norm) {
      return /^mjl$|mata\s*jendela|jendela\s*langit/.test(norm);
    }
  },
  {
    sheetName: "ENTITAS GBC",
    displayName: "GBC",
    match: function (norm) {
      return /^gbc$/.test(norm) || (norm.indexOf("gbc") >= 0 && norm.indexOf("anugerah") < 0);
    }
  },
  {
    sheetName: "ENTITAS KEDIRI",
    displayName: "Kediri",
    match: function (norm) {
      return /^kediri$|^kdr$/.test(norm);
    }
  }
];

var TAB_ORDER = [
  COMPILE_CONFIG.kasKecilTab,
  COMPILE_CONFIG.kasBesarTab,
  "compiled table"
].concat(ENTITY_TAB_DEFS.map(function (e) { return e.sheetName; })).concat(["LAPORAN BULANAN"]);

var MONTH_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
];

/** Palet & layout (selaras dengan GBC Expense Hub CMS). */
var SHEET_THEME = {
  titleBg: "#172554",
  titleFg: "#ffffff",
  metaFg: "#53617a",
  headerBg: "#3458d4",
  headerFg: "#ffffff",
  headerFontSize: 10,
  titleFontSize: 14,
  zebra: "#f8faff",
  border: "#d7dce8",
  kecilFill: "#ecfdf5",
  kecilText: "#047857",
  besarFill: "#eef2ff",
  besarText: "#2a4a9b",
  summaryBg: "#f0f4ff",
  summaryBorder: "#c5d4ff",
  totalRowBg: "#e8edff"
};

var COMPILED_COL = {
  no: 1,
  jenis: 2,
  jumlah: 8,
  bukti: 12,
  count: COMPILED_HEADERS.length
};

/** Menu custom saat spreadsheet dibuka (bound script). */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Compile")
    .addItem("Compile semua tab", "compileAllRecap")
    .addToUi();
}

function compileAllRecap() {
  var started = new Date();
  try {
    logCompile_("INFO", "Mulai compile", "");
    var kkRows = loadSourceRows_("KAS KECIL", COMPILE_CONFIG.kasKecil);
    var kbRows = loadSourceRows_("KAS BESAR", COMPILE_CONFIG.kasBesar);
    var all = kkRows.concat(kbRows);
    all.sort(compareCompiledRows_);

    var dest = SpreadsheetApp.openById(COMPILE_CONFIG.destinationId);
    ensureTabsInOrder_(dest);

    writeCompiledTable_(dest.getSheetByName("compiled table"), all);
    ENTITY_TAB_DEFS.forEach(function (def) {
      var subset = all.filter(function (r) { return entityKeyForRow_(r) === def.sheetName; });
      writeEntityTab_(dest.getSheetByName(def.sheetName), def, subset);
    });
    writeLaporanBulanan_(dest.getSheetByName("LAPORAN BULANAN"), all);

    var msg = "Selesai: " + all.length + " transaksi (" + kkRows.length + " kecil, " + kbRows.length + " besar).";
    logCompile_("OK", msg, (new Date() - started) + " ms");
    SpreadsheetApp.getActiveSpreadsheet() &&
      SpreadsheetApp.getUi().alert("Compile berhasil\n\n" + msg);
  } catch (err) {
    logCompile_("ERROR", String(err.message || err), err.stack || "");
    throw err;
  }
}

function loadSourceRows_(jenisKas, cfg) {
  var ss;
  var sh;
  if (!COMPILE_CONFIG.useLegacyFormSources) {
    ss = SpreadsheetApp.openById(COMPILE_CONFIG.destinationId);
    var tabName = jenisKas === "KAS KECIL" ? COMPILE_CONFIG.kasKecilTab : COMPILE_CONFIG.kasBesarTab;
    sh = ss.getSheetByName(tabName);
    if (!sh) {
      throw new Error("Tab tidak ditemukan: " + tabName + " — buat tab atau jalankan web app sekali.");
    }
  } else {
    ss = SpreadsheetApp.openById(cfg.spreadsheetId);
    sh = getSheetByGid_(ss, cfg.gid);
  }
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var numRows = lastRow - 1;
  if (numRows < 1) return [];
  var values = sh.getRange(2, 1, numRows, lastCol).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!rowHasData_(row)) continue;
    var rec = rowToRecord_(headers, row, jenisKas, sh.getSheetName(), i + 2);
    if (rec) out.push(rec);
  }
  return out;
}

function rowToRecord_(headers, row, jenisKas, sheetName, rowNumber) {
  var map = headerMap_(headers);
  var amount = parseMoney_(pick_(row, map, /jumlah uang|jumlah\s*\(rp\)/i));
  if (!amount && amount !== 0) amount = 0;
  var tanggalRaw = pick_(row, map, /tanggal pengeluaran/i);
  var dateIso = normalizeDateIso_(tanggalRaw);
  var entitas = pick_(row, map, /entitas pengeluaran/i);

  return {
    jenisKas: jenisKas,
    timestamp: pick_(row, map, /^timestamp$/i),
    tanggal: tanggalRaw,
    dateIso: dateIso,
    monthKey: dateIso ? dateIso.slice(0, 7) : "TANPA-TANGGAL",
    entitas: entitas,
    entitasNorm: normalizeEntityText_(entitas),
    category: pick_(row, map, /kategori pengeluaran/i),
    namaTransaksi: pick_(row, map, /nama transaksi/i),
    amount: amount,
    keterangan: pick_(row, map, /keterangan/i),
    dibayarkan: pick_(row, map, /dibayarkan/i),
    sumberDana: pick_(row, map, /sumber dana/i),
    bukti: pick_(row, map, /bukti transaksi/i),
    pic: pick_(row, map, /nama pic|\bpic\b/i),
    sourceRef: sheetName + "!" + rowNumber
  };
}

function recordToCompiledRow_(no, rec) {
  return [
    no,
    rec.jenisKas,
    rec.timestamp,
    rec.tanggal,
    rec.entitas,
    rec.category,
    rec.namaTransaksi,
    rec.amount,
    rec.keterangan,
    rec.dibayarkan,
    rec.sumberDana,
    rec.bukti,
    rec.pic,
    rec.sourceRef
  ];
}

function writeCompiledTable_(sh, rows) {
  sh.clear();
  try { sh.getRange(1, 1, sh.getMaxRows(), COMPILED_COL.count).breakApart(); } catch (e) { /* ignore */ }
  var headerRow = 4;
  writeReportTitleBlock_(sh, "GBC — REKAP COMPILE (KAS KECIL + KAS BESAR)", rows.length, COMPILED_COL.count);
  setValuesBlock_(sh, headerRow, 1, [COMPILED_HEADERS]);
  styleHeaderRow_(sh, headerRow, COMPILED_COL.count);

  var dataStart = headerRow + 1;
  if (rows.length) {
    var data = rows.map(function (r, i) { return recordToCompiledRow_(i + 1, r); });
    setValuesBlock_(sh, dataStart, 1, data);
    formatTransactionTable_(sh, dataStart, data.length);
    createTableFilter_(sh, headerRow, data.length);
  }
  sh.setFrozenRows(headerRow);
  setColumnWidthsCompiled_(sh);
  sh.setHiddenGridlines(true);
}

function writeEntityTab_(sh, def, rows) {
  sh.clear();
  try { sh.getRange(1, 1, sh.getMaxRows(), COMPILED_COL.count).breakApart(); } catch (e) { /* ignore */ }
  var headerRow = 5;
  writeReportTitleBlock_(
    sh,
    "LAPORAN PENGELUARAN — " + def.displayName.toUpperCase(),
    rows.length,
    COMPILED_COL.count
  );

  setValuesBlock_(sh, headerRow, 1, [COMPILED_HEADERS]);
  styleHeaderRow_(sh, headerRow, COMPILED_COL.count);

  var dataStart = headerRow + 1;
  if (rows.length) {
    var data = rows.map(function (r, i) { return recordToCompiledRow_(i + 1, r); });
    setValuesBlock_(sh, dataStart, 1, data);
    formatTransactionTable_(sh, dataStart, data.length);
    createTableFilter_(sh, headerRow, data.length);
  }

  var sumRow = dataStart + rows.length + 2;
  formatSummaryBlock_(sh, sumRow, sumByJenis_(rows), COMPILED_COL.count);

  sh.setFrozenRows(headerRow);
  setColumnWidthsCompiled_(sh);
  sh.setHiddenGridlines(true);
}

function writeLaporanBulanan_(sh, allRows) {
  sh.clear();
  var colCount = 9;
  try { sh.getRange(1, 1, sh.getMaxRows(), colCount).breakApart(); } catch (e) { /* ignore */ }

  var headers = [
    "Bulan",
    "Label Bulan",
    "Entitas",
    "Kas Kecil (Rp)",
    "Kas Besar / Bank (Rp)",
    "Total (Rp)",
    "# Transaksi Kecil",
    "# Transaksi Besar",
    "# Total Transaksi"
  ];
  var headerRow = 4;
  writeReportTitleBlock_(sh, "LAPORAN BULANAN — RINGKASAN PER ENTITAS & BULAN", allRows.length, colCount);
  setValuesBlock_(sh, headerRow, 1, [headers]);
  styleHeaderRow_(sh, headerRow, headers.length);

  var bucket = {};
  allRows.forEach(function (r) {
    var entKey = entityKeyForRow_(r) || "LAINNYA / TIDAK DIISI";
    var entLabel = entityLabelForKey_(entKey, r.entitas);
    var mk = r.monthKey || "TANPA-TANGGAL";
    var key = mk + "|" + entKey;
    if (!bucket[key]) {
      bucket[key] = {
        monthKey: mk,
        entKey: entKey,
        entLabel: entLabel,
        kk: 0,
        kb: 0,
        cKk: 0,
        cKb: 0
      };
    }
    var b = bucket[key];
    if (r.jenisKas === "KAS KECIL") {
      b.kk += r.amount;
      b.cKk += 1;
    } else {
      b.kb += r.amount;
      b.cKb += 1;
    }
  });

  var keys = Object.keys(bucket).sort();
  var out = keys.map(function (k) {
    var b = bucket[k];
    return [
      b.monthKey,
      monthLabelFromKey_(b.monthKey),
      b.entLabel,
      b.kk,
      b.kb,
      b.kk + b.kb,
      b.cKk,
      b.cKb,
      b.cKk + b.cKb
    ];
  });

  var dataStart = headerRow + 1;
  if (out.length) {
    setValuesBlock_(sh, dataStart, 1, out);
    formatMonthlyTable_(sh, dataStart, out.length, colCount);
    createTableFilterMonthly_(sh, headerRow, out.length, colCount);
    appendMonthlyGrandTotal_(sh, dataStart + out.length + 1, out, colCount);
  }
  sh.setFrozenRows(headerRow);
  setColumnWidthsMonthly_(sh, colCount);
  sh.setHiddenGridlines(true);
}

function sumByJenis_(rows) {
  var o = { kasKecil: 0, kasBesar: 0, countKecil: 0, countBesar: 0, total: 0, count: 0 };
  rows.forEach(function (r) {
    o.count += 1;
    o.total += r.amount;
    if (r.jenisKas === "KAS KECIL") {
      o.kasKecil += r.amount;
      o.countKecil += 1;
    } else {
      o.kasBesar += r.amount;
      o.countBesar += 1;
    }
  });
  return o;
}

function entityKeyForRow_(rec) {
  var norm = rec.entitasNorm;
  if (!norm) return "";
  for (var i = 0; i < ENTITY_TAB_DEFS.length; i++) {
    if (ENTITY_TAB_DEFS[i].match(norm)) return ENTITY_TAB_DEFS[i].sheetName;
  }
  return "";
}

function entityLabelForKey_(key, fallback) {
  for (var i = 0; i < ENTITY_TAB_DEFS.length; i++) {
    if (ENTITY_TAB_DEFS[i].sheetName === key) return ENTITY_TAB_DEFS[i].displayName;
  }
  return fallback || key || "Lainnya";
}

function compareCompiledRows_(a, b) {
  var da = a.dateIso || "";
  var db = b.dateIso || "";
  if (da !== db) return da < db ? -1 : 1;
  return String(a.sourceRef).localeCompare(String(b.sourceRef));
}

function ensureTabsInOrder_(ss) {
  TAB_ORDER.forEach(function (name, index) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(index + 1);
  });
  var logSh = ss.getSheetByName(COMPILE_CONFIG.logSheetName);
  if (!logSh) logSh = ss.insertSheet(COMPILE_CONFIG.logSheetName);
  ss.setActiveSheet(logSh);
  ss.moveActiveSheet(ss.getSheets().length);
}

function getSheetByGid_(ss, gid) {
  var target = Number(gid);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === target) return sheets[i];
  }
  return sheets[0];
}

function headerMap_(headers) {
  var map = [];
  for (var c = 0; c < headers.length; c++) {
    map.push({ index: c, key: String(headers[c] || "").trim().toLowerCase() });
  }
  return map;
}

function pick_(row, map, pattern) {
  for (var i = 0; i < map.length; i++) {
    if (pattern.test(map[i].key)) {
      var v = row[map[i].index];
      return v === null || v === undefined ? "" : String(v).trim();
    }
  }
  return "";
}

function rowHasData_(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== "" && row[i] !== null && row[i] !== undefined) return true;
  }
  return false;
}

function normalizeEntityText_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
}

function parseMoney_(raw) {
  if (raw === "" || raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  var s = String(raw).replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.indexOf(",") >= 0) {
    s = s.replace(",", ".");
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizeDateIso_(raw) {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (Object.prototype.toString.call(raw) === "[object Date]" && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(raw).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    var dd = ("0" + m[1]).slice(-2);
    var mm = ("0" + m[2]).slice(-2);
    return m[3] + "-" + mm + "-" + dd;
  }
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch (e) { /* ignore */ }
  return "";
}

function monthLabelFromKey_(monthKey) {
  if (!monthKey || monthKey === "TANPA-TANGGAL") return monthKey;
  var p = monthKey.split("-");
  if (p.length < 2) return monthKey;
  var y = p[0];
  var m = parseInt(p[1], 10);
  if (m >= 1 && m <= 12) return MONTH_ID[m - 1] + " " + y;
  return monthKey;
}

function formatTsId_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
}

/**
 * Sheet.getRange(row, col, numRows, numColumns) — argumen 3 & 4 adalah JUMLAH baris/kolom, bukan indeks akhir.
 */
function setValuesBlock_(sh, startRow, startCol, values) {
  if (!values || !values.length) return;
  var numRows = values.length;
  var numCols = values[0].length;
  sh.getRange(startRow, startCol, numRows, numCols).setValues(values);
}

function writeReportTitleBlock_(sh, title, txCount, colCount) {
  var band = sh.getRange(1, 1, 1, colCount);
  band.merge();
  band.setValue(title);
  band.setBackground(SHEET_THEME.titleBg);
  band.setFontColor(SHEET_THEME.titleFg);
  band.setFontWeight("bold");
  band.setFontSize(SHEET_THEME.titleFontSize);
  band.setHorizontalAlignment("left");
  band.setVerticalAlignment("middle");
  sh.setRowHeight(1, 36);

  var meta = sh.getRange(2, 1, 1, colCount);
  meta.merge();
  meta.setValue(
    "Di-compile: " + formatTsId_(new Date()) + "  ·  Total transaksi dalam tab: " + txCount
  );
  meta.setFontSize(SHEET_THEME.headerFontSize);
  meta.setFontColor(SHEET_THEME.metaFg);
  meta.setBackground("#ffffff");
  sh.setRowHeight(2, 22);

  sh.getRange(3, 1, 1, colCount).merge().setBackground("#ffffff");
  sh.setRowHeight(3, 8);
}

function styleHeaderRow_(sh, row, colCount) {
  var hdr = sh.getRange(row, 1, 1, colCount);
  hdr
    .setFontWeight("bold")
    .setBackground(SHEET_THEME.headerBg)
    .setFontColor(SHEET_THEME.headerFg)
    .setFontSize(SHEET_THEME.headerFontSize)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);
  sh.setRowHeight(row, 32);
  applyBorder_(hdr, SHEET_THEME.border, true);
}

function formatTransactionTable_(sh, dataStart, numRows) {
  if (!numRows) return;
  var cols = COMPILED_COL.count;
  var body = sh.getRange(dataStart, 1, numRows, cols);
  body.setVerticalAlignment("top").setWrap(true).setFontSize(10);
  applyBorder_(body, SHEET_THEME.border, false);
  applyZebra_(sh, dataStart, numRows, cols);

  sh.getRange(dataStart, COMPILED_COL.no, numRows, 1).setHorizontalAlignment("center");
  sh.getRange(dataStart, COMPILED_COL.jenis, numRows, 1).setHorizontalAlignment("center");
  sh.getRange(dataStart, COMPILED_COL.jumlah, numRows, 1)
    .setHorizontalAlignment("right")
    .setNumberFormat("#,##0");

  colorJenisKasColumn_(sh, dataStart, numRows);
  applyBuktiLinks_(sh, dataStart, numRows);
}

function formatMonthlyTable_(sh, dataStart, numRows, colCount) {
  var body = sh.getRange(dataStart, 1, numRows, colCount);
  body.setFontSize(10).setVerticalAlignment("middle");
  applyBorder_(body, SHEET_THEME.border, false);
  applyZebra_(sh, dataStart, numRows, colCount);
  sh.getRange(dataStart, 4, numRows, 3).setHorizontalAlignment("right").setNumberFormat("#,##0");
  sh.getRange(dataStart, 7, numRows, 3).setHorizontalAlignment("center").setNumberFormat("0");
  sh.getRange(dataStart, 1, numRows, 1).setHorizontalAlignment("center");
}

function appendMonthlyGrandTotal_(sh, row, out, colCount) {
  var t = { kk: 0, kb: 0, cKk: 0, cKb: 0 };
  out.forEach(function (r) {
    t.kk += r[3];
    t.kb += r[4];
    t.cKk += r[6];
    t.cKb += r[7];
  });
  setValuesBlock_(sh, row, 1, [[
    "GRAND TOTAL",
    "",
    "",
    t.kk,
    t.kb,
    t.kk + t.kb,
    t.cKk,
    t.cKb,
    t.cKk + t.cKb
  ]]);
  var rng = sh.getRange(row, 1, 1, colCount);
  rng.setFontWeight("bold").setBackground(SHEET_THEME.totalRowBg);
  sh.getRange(row, 4, 1, 3).setNumberFormat("#,##0").setHorizontalAlignment("right");
  sh.getRange(row, 7, 1, 3).setHorizontalAlignment("center");
  applyBorder_(rng, SHEET_THEME.summaryBorder, true);
}

function formatSummaryBlock_(sh, sumRow, totals, colCount) {
  sh.getRange(sumRow, 1, 1, colCount).merge();
  var titleCell = sh.getRange(sumRow, 1);
  titleCell.setValue("RINGKASAN");
  titleCell
    .setFontWeight("bold")
    .setFontSize(11)
    .setBackground(SHEET_THEME.summaryBg)
    .setFontColor(SHEET_THEME.titleBg)
    .setHorizontalAlignment("left");
  applyBorder_(titleCell, SHEET_THEME.summaryBorder, true);

  setValuesBlock_(sh, sumRow + 1, 1, [
    ["Kas Kecil (Rp)", totals.kasKecil, totals.countKecil + " transaksi", "", ""],
    ["Kas Besar / Bank (Rp)", totals.kasBesar, totals.countBesar + " transaksi", "", ""],
    ["Total (Rp)", totals.total, totals.count + " transaksi", "", ""]
  ]);
  var block = sh.getRange(sumRow + 1, 1, 3, 3);
  block.setFontSize(10).setBackground("#ffffff");
  applyBorder_(block, SHEET_THEME.summaryBorder, false);
  sh.getRange(sumRow + 1, 2, 3, 1)
    .setHorizontalAlignment("right")
    .setNumberFormat("#,##0")
    .setFontWeight("bold");
  sh.getRange(sumRow + 3, 1, 1, 3)
    .setBackground(SHEET_THEME.totalRowBg)
    .setFontWeight("bold");
}

function applyZebra_(sh, startRow, numRows, numCols) {
  for (var i = 0; i < numRows; i++) {
    if (i % 2 === 1) {
      sh.getRange(startRow + i, 1, 1, numCols).setBackground(SHEET_THEME.zebra);
    }
  }
}

function colorJenisKasColumn_(sh, startRow, numRows) {
  var vals = sh.getRange(startRow, COMPILED_COL.jenis, numRows, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var cell = sh.getRange(startRow + i, COMPILED_COL.jenis);
    var v = String(vals[i][0] || "").toUpperCase();
    if (v.indexOf("KECIL") >= 0) {
      cell.setBackground(SHEET_THEME.kecilFill).setFontColor(SHEET_THEME.kecilText).setFontWeight("bold");
    } else if (v.indexOf("BESAR") >= 0) {
      cell.setBackground(SHEET_THEME.besarFill).setFontColor(SHEET_THEME.besarText).setFontWeight("bold");
    }
  }
}

function extractBuktiUrl_(raw) {
  var s = String(raw || "").trim();
  if (!s) return "";
  var m = s.match(/https?:\/\/[^\s,]+/i);
  if (m) return m[0].replace(/[)\]"'>,.;]+$/, "");
  var id = s.match(/(?:\/file\/d\/|id=)([a-zA-Z0-9_-]{10,})/);
  if (id) return "https://drive.google.com/file/d/" + id[1] + "/view";
  return "";
}

/** Rich text link — hindari HYPERLINK() yang sering "Error mengurai formula" jika URL panjang/khusus. */
function applyBuktiLinks_(sh, startRow, numRows) {
  var col = COMPILED_COL.bukti;
  for (var i = 0; i < numRows; i++) {
    var cell = sh.getRange(startRow + i, col);
    var url = extractBuktiUrl_(cell.getValue());
    if (!url) continue;
    try {
      cell.setRichTextValue(
        SpreadsheetApp.newRichTextValue()
          .setText("Buka bukti")
          .setLinkUrl(url)
          .build()
      );
      cell.setFontColor(SHEET_THEME.headerBg);
      cell.setFontWeight("bold");
    } catch (e) {
      cell.setValue(url);
    }
  }
}

function applyBorder_(range, color, outerBold) {
  range.setBorder(
    true, true, true, true, true, true,
    color, outerBold ? SpreadsheetApp.BorderStyle.SOLID_MEDIUM : SpreadsheetApp.BorderStyle.SOLID
  );
}

function createTableFilter_(sh, headerRow, numDataRows) {
  if (numDataRows < 1) return;
  var existing = sh.getFilter();
  if (existing) existing.remove();
  sh.getRange(headerRow, 1, numDataRows + 1, COMPILED_COL.count).createFilter();
}

function createTableFilterMonthly_(sh, headerRow, numDataRows, colCount) {
  if (numDataRows < 1) return;
  var existing = sh.getFilter();
  if (existing) existing.remove();
  sh.getRange(headerRow, 1, numDataRows + 1, colCount).createFilter();
}

function setColumnWidthsCompiled_(sh) {
  var widths = [42, 92, 118, 108, 120, 140, 180, 100, 200, 140, 120, 130, 100, 100];
  for (var c = 0; c < widths.length && c < COMPILED_COL.count; c++) {
    sh.setColumnWidth(c + 1, widths[c]);
  }
}

function setColumnWidthsMonthly_(sh, colCount) {
  var widths = [88, 130, 160, 110, 130, 110, 72, 72, 72];
  for (var c = 0; c < colCount; c++) {
    sh.setColumnWidth(c + 1, widths[c] || 100);
  }
}

function logCompile_(level, message, detail) {
  try {
    var ss = SpreadsheetApp.openById(COMPILE_CONFIG.destinationId);
    var sh = ss.getSheetByName(COMPILE_CONFIG.logSheetName);
    if (!sh) return;
    sh.appendRow([new Date(), level, message, detail]);
  } catch (e) {
    Logger.log(level + " " + message + " " + detail);
  }
}
