const {
  COMPILED_HEADERS,
  ENTITY_TAB_DEFS
} = require("../config/hubForm");
const {
  getHubSpreadsheetId,
  getInputTabName,
  getSheetsClient,
  ensureHubTab,
  fetchRowsFromTab,
  parseMoneyValue,
  normalizeDate,
  a1RangeForTab
} = require("./sheets");

const MONTH_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
];

function normalizeEntityText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
}

function headerMap(headers) {
  return headers.map((h, index) => ({
    index,
    key: String(h || "").trim().toLowerCase()
  }));
}

function pickFromRow(row, map, pattern) {
  for (const col of map) {
    if (pattern.test(col.key)) {
      const v = row[col.index];
      return v === null || v === undefined ? "" : String(v).trim();
    }
  }
  return "";
}

function rowHasDataArray(row) {
  return row.some(v => v !== "" && v !== null && v !== undefined);
}

function rowToRecord(headers, row, jenisKas, sheetName, rowNumber) {
  const map = headerMap(headers);
  let amount = parseMoneyValue(pickFromRow(row, map, /jumlah uang|jumlah pengeluaran|jumlah\s*\(rp\)/i));
  const tanggalRaw = pickFromRow(row, map, /tanggal pengeluaran/i);
  const dateIso = normalizeDate(tanggalRaw);
  const entitas = pickFromRow(row, map, /entitas pengeluaran/i);

  return {
    jenisKas,
    timestamp: pickFromRow(row, map, /^timestamp$/i),
    tanggal: tanggalRaw,
    dateIso,
    monthKey: dateIso ? dateIso.slice(0, 7) : "TANPA-TANGGAL",
    entitas,
    entitasNorm: normalizeEntityText(entitas),
    category: pickFromRow(row, map, /kategori pengeluaran/i),
    namaTransaksi: pickFromRow(row, map, /nama transaksi/i),
    amount,
    keterangan: pickFromRow(row, map, /keterangan/i),
    dibayarkan: pickFromRow(row, map, /dibayarkan/i),
    sumberDana: pickFromRow(row, map, /sumber dana/i),
    bukti: pickFromRow(row, map, /bukti transaksi/i),
    pic: pickFromRow(row, map, /nama pic|\bpic\b/i),
    sourceRef: `${sheetName}!${rowNumber}`
  };
}

function loadRawTabRows(spreadsheetId, tabName, jenisKas) {
  return fetchRowsFromTab(spreadsheetId, tabName).then(parsed => {
    const out = [];
    parsed.rawValues.slice(1).forEach((row, i) => {
      if (!rowHasDataArray(row)) return;
      out.push(rowToRecord(parsed.headers, row, jenisKas, tabName, i + 2));
    });
    return out;
  });
}

function compareCompiledRows(a, b) {
  const da = a.dateIso || "";
  const db = b.dateIso || "";
  if (da !== db) return da < db ? -1 : 1;
  return String(a.sourceRef).localeCompare(String(b.sourceRef));
}

function entityKeyForRow(rec) {
  const norm = rec.entitasNorm;
  if (!norm) return "";
  for (const def of ENTITY_TAB_DEFS) {
    if (def.match(norm)) return def.sheetName;
  }
  return "";
}

function entityLabelForKey(key, fallback) {
  const hit = ENTITY_TAB_DEFS.find(e => e.sheetName === key);
  return hit ? hit.displayName : fallback || key || "Lainnya";
}

function recordToCompiledRow(no, rec) {
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

function monthLabelFromKey(monthKey) {
  if (!monthKey || monthKey === "TANPA-TANGGAL") return monthKey;
  const p = monthKey.split("-");
  if (p.length < 2) return monthKey;
  const y = p[0];
  const m = parseInt(p[1], 10);
  if (m >= 1 && m <= 12) return `${MONTH_ID[m - 1]} ${y}`;
  return monthKey;
}

function buildLaporanBulananRows(allRows) {
  const headers = [
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
  const bucket = {};
  allRows.forEach(r => {
    const entKey = entityKeyForRow(r) || "LAINNYA / TIDAK DIISI";
    const entLabel = entityLabelForKey(entKey, r.entitas);
    const mk = r.monthKey || "TANPA-TANGGAL";
    const key = `${mk}|${entKey}`;
    if (!bucket[key]) {
      bucket[key] = { monthKey: mk, entLabel, kk: 0, kb: 0, cKk: 0, cKb: 0 };
    }
    const b = bucket[key];
    if (r.jenisKas === "KAS KECIL") {
      b.kk += r.amount;
      b.cKk += 1;
    } else {
      b.kb += r.amount;
      b.cKb += 1;
    }
  });
  const out = Object.keys(bucket)
    .sort()
    .map(k => {
      const b = bucket[k];
      return [
        b.monthKey,
        monthLabelFromKey(b.monthKey),
        b.entLabel,
        b.kk,
        b.kb,
        b.kk + b.kb,
        b.cKk,
        b.cKb,
        b.cKk + b.cKb
      ];
    });
  return { headers, rows: out };
}

async function writeSheetValues(spreadsheetId, tabName, values) {
  await ensureHubTab(tabName);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: a1RangeForTab(tabName)
  });
  if (!values.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1RangeForTab(tabName, "A1"),
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

async function compileAllRecap() {
  const spreadsheetId = getHubSpreadsheetId();
  const kkTab = getInputTabName("kas_kecil");
  const kbTab = getInputTabName("kas_besar");

  await ensureHubTab(kkTab);
  await ensureHubTab(kbTab);
  await ensureHubTab("compiled table");
  for (const def of ENTITY_TAB_DEFS) await ensureHubTab(def.sheetName);
  await ensureHubTab("LAPORAN BULANAN");

  const [kkRows, kbRows] = await Promise.all([
    loadRawTabRows(spreadsheetId, kkTab, "KAS KECIL"),
    loadRawTabRows(spreadsheetId, kbTab, "Bank")
  ]);
  const all = [...kkRows, ...kbRows].sort(compareCompiledRows);

  const compiledValues = [
    COMPILED_HEADERS,
    ...all.map((r, i) => recordToCompiledRow(i + 1, r))
  ];
  await writeSheetValues(spreadsheetId, "compiled table", compiledValues);

  for (const def of ENTITY_TAB_DEFS) {
    const subset = all.filter(r => entityKeyForRow(r) === def.sheetName);
    const values = [
      COMPILED_HEADERS,
      ...subset.map((r, i) => recordToCompiledRow(i + 1, r))
    ];
    await writeSheetValues(spreadsheetId, def.sheetName, values);
  }

  const lap = buildLaporanBulananRows(all);
  await writeSheetValues(spreadsheetId, "LAPORAN BULANAN", [lap.headers, ...lap.rows]);

  return {
    total: all.length,
    kasKecil: kkRows.length,
    kasBesar: kbRows.length
  };
}

module.exports = { compileAllRecap };
