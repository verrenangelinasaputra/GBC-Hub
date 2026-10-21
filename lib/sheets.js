const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

const SHEET_KIND = {
  kas_besar: {
    spreadsheetId: process.env.KAS_BESAR_SHEET_ID || "1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY",
    gid: Number(process.env.KAS_BESAR_SHEET_GID || 1533749503),
    range: process.env.KAS_BESAR_SHEET_RANGE || ""
  },
  kas_kecil: {
    spreadsheetId: process.env.KAS_KECIL_SHEET_ID || "1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM",
    gid: Number(process.env.KAS_KECIL_SHEET_GID || 423968165),
    range: process.env.KAS_KECIL_SHEET_RANGE || ""
  }
};

let sheetsApi = null;
let tabCache = {};

function loadCategories() {
  const file = path.join(__dirname, "..", "config", "categories.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { kasBesar: raw.kasBesar || [], kasKecil: raw.kasKecil || [] };
  } catch {
    return { kasBesar: [], kasKecil: [] };
  }
}

function sheetsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

async function getSheetsClient() {
  if (sheetsApi) return sheetsApi;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    const err = new Error(
      "Google Sheets belum dikonfigurasi. Set GOOGLE_SERVICE_ACCOUNT_PATH di .env dan bagikan spreadsheet ke email service account."
    );
    err.status = 503;
    throw err;
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  sheetsApi = google.sheets({ version: "v4", auth });
  return sheetsApi;
}

async function tabTitleForGid(spreadsheetId, gid) {
  const cacheKey = `${spreadsheetId}:${gid}`;
  if (tabCache[cacheKey]) return tabCache[cacheKey];
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = (meta.data.sheets || []).find(s => s.properties.sheetId === gid);
  if (!sheet) {
    const err = new Error(`Tab gid=${gid} tidak ditemukan di spreadsheet.`);
    err.status = 404;
    throw err;
  }
  tabCache[cacheKey] = sheet.properties.title;
  return tabCache[cacheKey];
}

async function fetchRows(kind) {
  const cfg = SHEET_KIND[kind];
  if (!cfg) throw Object.assign(new Error("Jenis kas tidak valid."), { status: 400 });

  const sheets = await getSheetsClient();
  let range = cfg.range;
  if (!range) {
    const title = await tabTitleForGid(cfg.spreadsheetId, cfg.gid);
    range = `'${title.replace(/'/g, "''")}'!A:ZZ`;
  }

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: cfg.spreadsheetId,
    range
  });
  return parseSheetRows(result.data.values || []);
}

function parseSheetRows(values) {
  if (!values || values.length < 2) return { headers: values?.[0] || [], rows: [] };
  const headers = values[0].map((v, i) => String(v || `Kolom ${i + 1}`).trim());
  const rows = values.slice(1).map((row, index) => {
    const obj = { _rowNumber: index + 2, _id: String(index + 2) };
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? "";
    });
    return obj;
  });
  return { headers, rows };
}

function extractDriveFileId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && !/^https?:/i.test(s)) return s;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
}

function driveFileViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Link bukti: tetap file yang sama setelah Apps Script pindah/rename (ID Drive tidak berubah). */
function normalizeDriveLink(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return s;
  const id = extractDriveFileId(s);
  return id ? driveFileViewUrl(id) : s;
}

function normalizeBuktiColumns(row) {
  const next = { ...row };
  for (const k of Object.keys(row)) {
    if (k.startsWith("_")) continue;
    if (/bukti|lampiran|file upload/i.test(k)) {
      next[k] = normalizeDriveLink(row[k]);
    }
  }
  return next;
}

function parseMoneyValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(s)) return 0;
  const cleaned = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function isAmountColumnKey(key) {
  const k = String(key || "").toLowerCase();
  if (/timestamp|tanggal|entitas|kategori|nama transaksi|keterangan|dibayarkan|pic|bukti|sumber dana|email|nomor hp/i.test(k)) {
    return false;
  }
  if (/jumlah uang|jumlah\s*\(rp\)/i.test(k)) return true;
  if (/^\d+\.\s*jumlah/.test(k)) return true;
  if (/\bnominal\b/.test(k)) return true;
  if (/\bjumlah\b/.test(k) && /rp|uang|rupiah|\(rp\)/.test(k)) return true;
  if (/\btotal\b/.test(k) && /rp|uang|amount/.test(k)) return true;
  if (/\bamount\b/.test(k) || /\bbiaya\b/.test(k) || /\bnilai\b/.test(k)) return true;
  return false;
}

function inferAmount(row) {
  const entries = Object.entries(row).filter(([k]) => !k.startsWith("_"));
  const hit = entries.find(([k]) => isAmountColumnKey(k));
  if (!hit) return 0;
  return parseMoneyValue(hit[1]);
}

function isTimestampKey(key) {
  return /^timestamp$/i.test(String(key || "").trim());
}

function inferDate(row) {
  const entries = Object.entries(row).filter(([k]) => !k.startsWith("_"));
  const pick = (pred) => entries.find(([k]) => !isTimestampKey(k) && pred(k));
  const hit =
    pick(k => /tanggal pengeluaran/i.test(k)) ||
    pick(k => /^\d+\.\s*tanggal/i.test(k)) ||
    pick(k => /\btanggal\b/i.test(k)) ||
    entries.find(([k]) => isTimestampKey(k));
  return hit ? String(hit[1] || "").trim() : "";
}

function categoryValuesFromRow(row) {
  const values = new Set();
  Object.entries(row).forEach(([k, v]) => {
    if (k.startsWith("_")) return;
    if (/kategori pengeluaran|kategori|jenis pengeluaran|category|keperluan/i.test(k)) {
      const t = String(v || "").trim();
      if (t) values.add(t);
    }
  });
  return [...values];
}

function inferCategory(row) {
  const vals = categoryValuesFromRow(row);
  return vals[0] || "Belum dikategorikan";
}

function normText(value) {
  return String(value || "").trim().toLowerCase();
}

function inferDescription(row) {
  const entries = Object.entries(row).filter(([k]) => !k.startsWith("_"));
  const hit = entries.find(([k]) => /deskripsi|keterangan|uraian|note|detail/i.test(k));
  if (hit) return String(hit[1] || "").trim();
  const skip = new Set(["timestamp", "tanggal", "nominal", "kategori"]);
  const text = entries.find(([k]) => !skip.has(k.toLowerCase()) && String(row[k]).length > 3);
  return text ? String(text[1]).trim() : "";
}

function normalizeDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      if (!Number.isNaN(utc.getTime())) return utc.toISOString().slice(0, 10);
    }
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function monthKey(value) {
  const n = normalizeDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n.slice(0, 7);
  return "Tanggal tidak terbaca";
}

function listFromSheet(parsed, filters, allowedCategories) {
  let rows = parsed.rows.map(r => ({
    ...r,
    _amount: inferAmount(r),
    _date: normalizeDate(inferDate(r)),
    _category: inferCategory(r),
    _description: inferDescription(r)
  }));

  rows = rows.filter(r => {
    const hasText = Object.entries(r).some(([k, v]) => !k.startsWith("_") && String(v || "").trim());
    return hasText;
  });

  if (filters.search) {
    const q = normText(filters.search);
    rows = rows.filter(r =>
      Object.entries(r).some(([k, v]) => !k.startsWith("_") && normText(v).includes(q))
    );
  }
  if (filters.dateFrom) {
    rows = rows.filter(r => r._date && r._date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    rows = rows.filter(r => r._date && r._date <= filters.dateTo);
  }
  if (filters.category) {
    const fc = normText(filters.category);
    rows = rows.filter(r => categoryValuesFromRow(r).some(c => normText(c) === fc));
  }

  if (allowedCategories?.length && filters.strictCategory) {
    rows = rows.filter(r => allowedCategories.includes(r._category));
  }

  const sortMap = {
    transaction_date: "_date",
    amount: "_amount",
    category: "_category",
    transaction_number: "_rowNumber"
  };
  const sortCol = sortMap[filters.sort] || "_date";
  const dir = filters.order === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortCol] ?? a._date ?? "";
    const bv = b[sortCol] ?? b._date ?? "";
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const total = rows.length;
  const page = Math.max(1, Number(filters.page) || 1);
  const perPage = Math.min(100, Math.max(5, Number(filters.perPage) || 20));
  const offset = (page - 1) * perPage;
  const pageRows = rows.slice(offset, offset + perPage).map(normalizeBuktiColumns);

  return {
    headers: parsed.headers,
    rows: pageRows,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage) || 1
  };
}

async function dashboardFromSheets(filters) {
  const [besar, kecil] = await Promise.all([
    fetchRows("kas_besar"),
    fetchRows("kas_kecil")
  ]);

  function aggregate(parsed, source) {
    let rows = parsed.rows.map(r => ({
      amount: inferAmount(r),
      date: normalizeDate(inferDate(r)),
      category: inferCategory(r),
      description: inferDescription(r),
      raw: r
    }));
    if (filters.dateFrom) rows = rows.filter(r => r.date && r.date >= filters.dateFrom);
    if (filters.dateTo) rows = rows.filter(r => r.date && r.date <= filters.dateTo);

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const byMonth = {};
    const byCategory = {};
    rows.forEach(r => {
      const m = r.date ? monthKey(r.date) : "Tanggal tidak terbaca";
      byMonth[m] = (byMonth[m] || 0) + r.amount;
      byCategory[r.category] = byCategory[r.category] || { amount: 0, count: 0 };
      byCategory[r.category].amount += r.amount;
      byCategory[r.category].count += 1;
    });

    const recent = rows
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 10)
      .map(r => ({
        source,
        transaction_date: r.date,
        category: r.category,
        description: r.description,
        amount: r.amount
      }));

    return { count: rows.length, total, byMonth, byCategory, recent };
  }

  const kb = aggregate(besar, "kas_besar");
  const kk = aggregate(kecil, "kas_kecil");

  const monthMap = {};
  Object.entries(kb.byMonth).forEach(([m, a]) => {
    monthMap[m] = monthMap[m] || { month: m, kasBesar: 0, kasKecil: 0 };
    monthMap[m].kasBesar = a;
  });
  Object.entries(kk.byMonth).forEach(([m, a]) => {
    monthMap[m] = monthMap[m] || { month: m, kasBesar: 0, kasKecil: 0 };
    monthMap[m].kasKecil = a;
  });
  const trend = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

  function topCategories(byCategory) {
    return Object.entries(byCategory)
      .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }

  const recent = [...kb.recent, ...kk.recent]
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)))
    .slice(0, 15);

  return {
    kasBesar: { count: kb.count, total: kb.total },
    kasKecil: { count: kk.count, total: kk.total },
    combinedTotal: kb.total + kk.total,
    combinedCount: kb.count + kk.count,
    trend,
    categories: { kasBesar: topCategories(kb.byCategory), kasKecil: topCategories(kk.byCategory) },
    recent
  };
}

function valueByHeader(row, pattern) {
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue;
    const key = String(k);
    const ok = typeof pattern === "string"
      ? key.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(key);
    if (ok) return String(v ?? "").trim();
  }
  return "";
}

function enrichKasKecilRow(row) {
  const amountFromHeader = parseMoneyValue(valueByHeader(row, /jumlah uang|jumlah\s*\(rp\)/i));
  return {
    raw: row,
    amount: amountFromHeader || inferAmount(row),
    date: normalizeDate(inferDate(row)),
    category: inferCategory(row),
    timestamp: valueByHeader(row, /^timestamp$/i),
    tanggal: valueByHeader(row, /tanggal pengeluaran/i),
    entitas: valueByHeader(row, /entitas pengeluaran/i),
    namaTransaksi: valueByHeader(row, /nama transaksi/i),
    keterangan: valueByHeader(row, /^6\.|keterangan/i) || inferDescription(row),
    dibayarkan: valueByHeader(row, /dibayarkan/i),
    sumberDana: valueByHeader(row, /sumber dana/i),
    bukti: normalizeDriveLink(valueByHeader(row, /bukti transaksi/i)),
    pic: valueByHeader(row, /nama pic|\bpic\b/i)
  };
}

function bumpGroup(map, key, amount) {
  const label = String(key || "").trim() || "Tidak diisi";
  map[label] = map[label] || { amount: 0, count: 0 };
  map[label].amount += amount;
  map[label].count += 1;
}

function topGroups(map, limit = 8) {
  return Object.entries(map)
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

async function kasKecilRecap(filters = {}) {
  const parsed = await fetchRows("kas_kecil");
  let rows = parsed.rows
    .map(enrichKasKecilRow)
    .filter(r => Object.entries(r.raw).some(([k, v]) => !k.startsWith("_") && String(v || "").trim()));

  if (filters.dateFrom) rows = rows.filter(r => r.date && r.date >= filters.dateFrom);
  if (filters.dateTo) rows = rows.filter(r => r.date && r.date <= filters.dateTo);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCategory = {};
  const byEntity = {};
  const byPic = {};
  const bySumberDana = {};
  const byPayee = {};
  const byMonth = {};

  rows.forEach(r => {
    bumpGroup(byCategory, r.category, r.amount);
    bumpGroup(byEntity, r.entitas, r.amount);
    bumpGroup(byPic, r.pic, r.amount);
    bumpGroup(bySumberDana, r.sumberDana, r.amount);
    bumpGroup(byPayee, r.dibayarkan, r.amount);
    const m = r.date ? monthKey(r.date) : "Tanggal tidak terbaca";
    byMonth[m] = (byMonth[m] || 0) + r.amount;
  });

  const trend = Object.entries(byMonth)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  const recent = rows
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 25)
    .map((r, i) => ({
      no: i + 1,
      timestamp: r.timestamp,
      tanggal: r.tanggal || r.date,
      entitas: r.entitas,
      category: r.category,
      namaTransaksi: r.namaTransaksi,
      amount: r.amount,
      keterangan: r.keterangan,
      dibayarkan: r.dibayarkan,
      sumberDana: r.sumberDana,
      bukti: r.bukti,
      pic: r.pic
    }));

  return {
    count: rows.length,
    total,
    average: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    trend,
    byCategory: topGroups(byCategory),
    byEntity: topGroups(byEntity, 20),
    byPic: topGroups(byPic),
    bySumberDana: topGroups(bySumberDana),
    byPayee: topGroups(byPayee),
    recent
  };
}

function rowHasData(row) {
  return Object.entries(row).some(([k, v]) => !k.startsWith("_") && String(v || "").trim());
}

function enrichTransactionRow(row, sourceKind) {
  const base = enrichKasKecilRow(row);
  return {
    ...base,
    sourceKind,
    jenis: sourceKind === "kas_besar" ? "Kas Besar" : "Kas Kecil"
  };
}

async function superAdminCombinedRecap(filters = {}) {
  const [besarParsed, kecilParsed] = await Promise.all([
    fetchRows("kas_besar"),
    fetchRows("kas_kecil")
  ]);

  let rows = [
    ...besarParsed.rows.map(r => enrichTransactionRow(r, "kas_besar")),
    ...kecilParsed.rows.map(r => enrichTransactionRow(r, "kas_kecil"))
  ].filter(r => rowHasData(r.raw));

  if (filters.dateFrom) rows = rows.filter(r => r.date && r.date >= filters.dateFrom);
  if (filters.dateTo) rows = rows.filter(r => r.date && r.date <= filters.dateTo);

  const kbRows = rows.filter(r => r.sourceKind === "kas_besar");
  const kkRows = rows.filter(r => r.sourceKind === "kas_kecil");
  const totalKb = kbRows.reduce((s, r) => s + r.amount, 0);
  const totalKk = kkRows.reduce((s, r) => s + r.amount, 0);
  const total = totalKb + totalKk;

  const byCategory = {};
  const byEntity = {};
  const byPic = {};
  const bySumberDana = {};
  const byPayee = {};
  const byEntitySplit = {};
  const byMonth = {};

  rows.forEach(r => {
    bumpGroup(byCategory, r.category, r.amount);
    bumpGroup(byEntity, r.entitas, r.amount);
    bumpGroup(byPic, r.pic, r.amount);
    bumpGroup(bySumberDana, r.sumberDana, r.amount);
    bumpGroup(byPayee, r.dibayarkan, r.amount);
    const entLabel = String(r.entitas || "").trim() || "Tidak diisi";
    if (!byEntitySplit[entLabel]) {
      byEntitySplit[entLabel] = { name: entLabel, kasBesar: 0, kasKecil: 0, count: 0 };
    }
    if (r.sourceKind === "kas_besar") byEntitySplit[entLabel].kasBesar += r.amount;
    else byEntitySplit[entLabel].kasKecil += r.amount;
    byEntitySplit[entLabel].count += 1;

    const m = r.date ? monthKey(r.date) : "Tanggal tidak terbaca";
    if (!byMonth[m]) {
      byMonth[m] = { month: m, kasBesar: 0, kasKecil: 0, countKb: 0, countKk: 0 };
    }
    if (r.sourceKind === "kas_besar") {
      byMonth[m].kasBesar += r.amount;
      byMonth[m].countKb += 1;
    } else {
      byMonth[m].kasKecil += r.amount;
      byMonth[m].countKk += 1;
    }
  });

  const trend = Object.values(byMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  const trendVolume = trend.map(t => ({
    month: t.month,
    kasBesar: t.countKb,
    kasKecil: t.countKk
  }));

  const byEntityKasSplit = Object.values(byEntitySplit)
    .sort((a, b) => (b.kasBesar + b.kasKecil) - (a.kasBesar + a.kasKecil))
    .slice(0, 8);

  const byCategoryAvg = topGroups(byCategory).map(item => ({
    name: item.name,
    amount: item.count ? Math.round(item.amount / item.count) : 0,
    count: item.count,
    total: item.amount
  }));

  const recent = rows
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30)
    .map((r, i) => ({
      no: i + 1,
      jenis: r.jenis,
      timestamp: r.timestamp,
      tanggal: r.tanggal || r.date,
      entitas: r.entitas,
      category: r.category,
      namaTransaksi: r.namaTransaksi,
      amount: r.amount,
      keterangan: r.keterangan,
      dibayarkan: r.dibayarkan,
      sumberDana: r.sumberDana,
      bukti: r.bukti,
      pic: r.pic
    }));

  return {
    kasBesar: { count: kbRows.length, total: totalKb },
    kasKecil: { count: kkRows.length, total: totalKk },
    count: rows.length,
    total,
    average: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    trend,
    byJenis: [
      { name: "Kas Besar (Bank)", amount: totalKb, count: kbRows.length },
      { name: "Kas Kecil", amount: totalKk, count: kkRows.length }
    ].filter(x => x.count > 0 || x.amount > 0),
    byCategory: topGroups(byCategory),
    byEntity: topGroups(byEntity, 20),
    byPic: topGroups(byPic),
    bySumberDana: topGroups(bySumberDana),
    byPayee: topGroups(byPayee),
    byEntityKasSplit,
    byCategoryAvg,
    trendVolume,
    recent
  };
}

module.exports = {
  loadCategories,
  sheetsConfigured,
  fetchRows,
  listFromSheet,
  dashboardFromSheets,
  kasKecilRecap,
  superAdminCombinedRecap,
  SHEET_KIND
};
