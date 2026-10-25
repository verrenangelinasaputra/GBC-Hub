/**
 * GBC Cash Management — Weekly recap email (Senin–Minggu, kirim hari Minggu).
 *
 * Pasang: tempel di project Apps Script (spreadsheet hub atau standalone).
 * Jalankan installWeeklyRecapTrigger() sekali, authorize Gmail.
 */

const WEEKLY_RECAP_CONFIG = {
  HUB_SPREADSHEET_ID: "1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY",
  /** Baca tab compiled dulu; jika kosong, gabung Bank + KAS KECIL */
  COMPILED_TAB: "compiled table",
  TAB_BANK: "Bank",
  TAB_KAS_KECIL: "KAS KECIL",
  TIMEZONE: "Asia/Jakarta",
  /** Minggu 23 = Senin–Minggu; dikirim hari Minggu jam 09:00 WIB */
  SEND_WEEKDAY: ScriptApp.WeekDay.SUNDAY,
  SEND_HOUR: 9,
  SEND_MINUTE: 0,
  /** Pisahkan koma untuk tambah penerima */
  RECIPIENTS: "verren.angelinas@gmail.com, verren62@gmail.com",
  /** Opsional: CC/BCC */
  CC: "",
  BCC: "",
  HUB_URL: "https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit",
  APP_URL: "http://localhost:3000",
  MAX_DETAIL_ROWS: 20,
  TOP_CATEGORIES: 5,
  TOP_PIC: 5
};

// ——— Menu ———

function onOpenWeeklyRecapMenu() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Weekly Recap")
    .addItem("Kirim recap minggu ini (test)", "testSendWeeklyRecap")
    .addItem("Pasang trigger Minggu 09:00", "installWeeklyRecapTrigger")
    .addItem("Hapus trigger recap", "removeWeeklyRecapTriggers")
    .addToUi();
}

// Di project yang sudah punya onOpen (mis. BuktiDriveSorter), tambahkan:
//   onOpenWeeklyRecapMenu();

// ——— Trigger ———

function installWeeklyRecapTrigger() {
  removeWeeklyRecapTriggers();
  ScriptApp.newTrigger("sendWeeklyRecapEmail")
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(WEEKLY_RECAP_CONFIG.SEND_WEEKDAY)
    .atHour(WEEKLY_RECAP_CONFIG.SEND_HOUR)
    .nearMinute(WEEKLY_RECAP_CONFIG.SEND_MINUTE)
    .inTimezone(WEEKLY_RECAP_CONFIG.TIMEZONE)
    .create();
  SpreadsheetApp.getActive()?.toast(
    "Weekly recap: setiap Minggu ~09:00 WIB → " + parseRecipients_().join(", "),
    "GBC Weekly Recap",
    8
  );
}

function removeWeeklyRecapTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendWeeklyRecapEmail") ScriptApp.deleteTrigger(t);
  });
}

// ——— Entry ———

/**
 * Dipanggil trigger Minggu 08:40. Manual test: testSendWeeklyRecap().
 */
function sendWeeklyRecapEmail() {
  sendWeeklyRecapCore_({ respectSchedule: true });
}

function testSendWeeklyRecap() {
  sendWeeklyRecapCore_({ respectSchedule: false });
}

function sendWeeklyRecapCore_(options) {
  const tz = WEEKLY_RECAP_CONFIG.TIMEZONE;
  const now = new Date();
  if (options.respectSchedule) {
    const dow = Number(Utilities.formatDate(now, tz, "u")); // 1=Mon … 7=Sun
    if (dow !== 7) {
      Logger.log("Weekly recap dilewati (bukan Minggu, hari=" + dow + ").");
      return;
    }
  }

  const range = getRecapWeekRange_(now, tz);
  const rows = loadHubTransactions_();
  const inWeek = rows.filter(r => r.dateIso && r.dateIso >= range.startIso && r.dateIso <= range.endIso);
  const prevRange = getPreviousWeekRange_(range);
  const prevRows = rows.filter(
    r => r.dateIso && r.dateIso >= prevRange.startIso && r.dateIso <= prevRange.endIso
  );

  const summary = buildSummary_(inWeek, prevRows);
  const subject =
    "[GBC Weekly Recap] " +
    range.label +
    " — Total " +
    formatRp_(summary.combined.total);
  const html = buildWeeklyRecapHtml_(range, prevRange, summary, inWeek);
  const recipients = parseRecipients_();
  if (!recipients.length) throw new Error("RECIPIENTS kosong di WEEKLY_RECAP_CONFIG.");

  GmailApp.sendEmail(recipients.join(","), subject, stripHtml_(html), {
    htmlBody: html,
    name: "GBC Cash Management",
    cc: WEEKLY_RECAP_CONFIG.CC || undefined,
    bcc: WEEKLY_RECAP_CONFIG.BCC || undefined
  });

  Logger.log("Weekly recap terkirim ke " + recipients.join(", ") + " (" + inWeek.length + " transaksi).");
}

// ——— Periode Senin–Minggu ———

function getRecapWeekRange_(asOf, tz) {
  const dow = Number(Utilities.formatDate(asOf, tz, "u"));
  const ymd = Utilities.formatDate(asOf, tz, "yyyy-MM-dd");
  const parts = ymd.split("-").map(Number);
  const noon = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);

  let end = new Date(noon);
  if (dow === 7) {
    /* Minggu: minggu berjalan Mon–Sun (Sun = hari terakhir) */
  } else {
    end.setDate(end.getDate() - dow);
  }

  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const startIso = formatIsoDate_(start);
  const endIso = formatIsoDate_(end);
  const label =
    formatDisplayDate_(start, tz) + " – " + formatDisplayDate_(end, tz) + " (Senin–Minggu)";

  return { start, end, startIso, endIso, label, weekNumber: getIsoWeekNumber_(end, tz) };
}

function getPreviousWeekRange_(current) {
  const end = new Date(current.start);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    startIso: formatIsoDate_(start),
    endIso: formatIsoDate_(end),
    label: formatDisplayDate_(start, WEEKLY_RECAP_CONFIG.TIMEZONE) + " – " + formatDisplayDate_(end, WEEKLY_RECAP_CONFIG.TIMEZONE)
  };
}

function getIsoWeekNumber_(date, tz) {
  const thursday = new Date(date);
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
  const yearStart = new Date(thursday.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((thursday.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7
    )
  );
}

// ——— Data hub ———

function loadHubTransactions_() {
  const ss = SpreadsheetApp.openById(WEEKLY_RECAP_CONFIG.HUB_SPREADSHEET_ID);
  let rows = readCompiledTable_(ss);
  if (!rows.length) {
    rows = readInputTab_(ss, WEEKLY_RECAP_CONFIG.TAB_BANK, "Bank").concat(
      readInputTab_(ss, WEEKLY_RECAP_CONFIG.TAB_KAS_KECIL, "Kas Kecil")
    );
  }
  return rows;
}

function readCompiledTable_(ss) {
  const sh = ss.getSheetByName(WEEKLY_RECAP_CONFIG.COMPILED_TAB);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h || "").trim().toLowerCase());
  const idx = name => headers.findIndex(h => h === name || name.test(h));
  const iJenis = headers.indexOf("jenis kas") >= 0 ? headers.indexOf("jenis kas") : idx(/^jenis/);
  const iTanggal = headers.findIndex(h => /tanggal pengeluaran/i.test(h));
  const iEntitas = headers.findIndex(h => /entitas/i.test(h));
  const iKat = headers.findIndex(h => /kategori/i.test(h));
  const iNama = headers.findIndex(h => /nama transaksi/i.test(h));
  const iJumlah = headers.findIndex(h => /jumlah/i.test(h));
  const iPic = headers.findIndex(h => /pic/i.test(h));
  const iBukti = headers.findIndex(h => /bukti/i.test(h));

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || !row.some(c => String(c || "").trim())) continue;
    const rec = rowToRecord_(row, {
      jenis: iJenis >= 0 ? row[iJenis] : "",
      tanggal: iTanggal >= 0 ? row[iTanggal] : "",
      entitas: iEntitas >= 0 ? row[iEntitas] : "",
      category: iKat >= 0 ? row[iKat] : "",
      nama: iNama >= 0 ? row[iNama] : "",
      amount: iJumlah >= 0 ? row[iJumlah] : 0,
      pic: iPic >= 0 ? row[iPic] : "",
      bukti: iBukti >= 0 ? row[iBukti] : ""
    });
    if (rec) out.push(rec);
  }
  return out;
}

function readInputTab_(ss, tabName, jenisLabel) {
  const sh = ss.getSheetByName(tabName);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h || "").trim().toLowerCase());
  const find = re => headers.findIndex(h => re.test(h));

  const iTanggal = find(/tanggal pengeluaran/i);
  const iEntitas = find(/entitas/i);
  const iKat = find(/kategori/i);
  const iNama = find(/nama transaksi/i);
  const iJumlah = find(/jumlah/i);
  const iPic = find(/nama pic|\bpic\b/i);
  const iBukti = find(/bukti/i);

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row || !row.some(c => String(c || "").trim())) continue;
    const rec = rowToRecord_(row, {
      jenis: jenisLabel,
      tanggal: iTanggal >= 0 ? row[iTanggal] : "",
      entitas: iEntitas >= 0 ? row[iEntitas] : "",
      category: iKat >= 0 ? row[iKat] : "",
      nama: iNama >= 0 ? row[iNama] : "",
      amount: iJumlah >= 0 ? row[iJumlah] : 0,
      pic: iPic >= 0 ? row[iPic] : "",
      bukti: iBukti >= 0 ? row[iBukti] : ""
    });
    if (rec) out.push(rec);
  }
  return out;
}

function rowToRecord_(row, raw) {
  const dateIso = parseDateIso_(raw.tanggal);
  const amount = parseMoney_(raw.amount);
  if (!dateIso && !amount && !String(raw.nama || "").trim()) return null;
  return {
    jenis: normalizeJenis_(raw.jenis),
    tanggal: String(raw.tanggal || "").trim(),
    dateIso: dateIso,
    entitas: String(raw.entitas || "").trim() || "—",
    category: String(raw.category || "").trim() || "—",
    namaTransaksi: String(raw.nama || "").trim() || "—",
    amount: amount,
    pic: String(raw.pic || "").trim() || "—",
    bukti: String(raw.bukti || "").trim()
  };
}

function normalizeJenis_(j) {
  const s = String(j || "").toLowerCase();
  if (s.indexOf("kecil") >= 0) return "Kas Kecil";
  if (s.indexOf("bank") >= 0 || s.indexOf("besar") >= 0) return "Bank";
  return String(j || "").trim() || "—";
}

// ——— Agregasi ———

function buildSummary_(rows, prevRows) {
  const combined = sumSplit_(rows);
  const prevCombined = sumSplit_(prevRows);
  const delta = combined.total - prevCombined.total;
  const deltaPct = prevCombined.total > 0 ? (delta / prevCombined.total) * 100 : null;

  const byEntity = groupSum_(rows, r => r.entitas);
  const byCategory = groupSum_(rows, r => r.category)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, WEEKLY_RECAP_CONFIG.TOP_CATEGORIES);
  const byPic = groupSum_(rows, r => r.pic)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, WEEKLY_RECAP_CONFIG.TOP_PIC);

  const largest = rows.slice().sort((a, b) => b.amount - a.amount)[0] || null;

  return {
    combined,
    prevCombined,
    delta,
    deltaPct,
    byEntity: byEntity.sort((a, b) => b.total - a.total),
    byCategory,
    byPic,
    count: rows.length,
    largest
  };
}

function sumSplit_(rows) {
  let bank = 0;
  let kecil = 0;
  let bankN = 0;
  let kecilN = 0;
  rows.forEach(r => {
    if (r.jenis === "Kas Kecil") {
      kecil += r.amount;
      kecilN++;
    } else {
      bank += r.amount;
      bankN++;
    }
  });
  return {
    bank,
    kecil,
    total: bank + kecil,
    bankN,
    kecilN,
    count: rows.length
  };
}

function groupSum_(rows, keyFn) {
  const map = {};
  rows.forEach(r => {
    const k = keyFn(r);
    if (!map[k]) map[k] = { name: k, amount: 0, count: 0, bank: 0, kecil: 0 };
    map[k].amount += r.amount;
    map[k].count++;
    if (r.jenis === "Kas Kecil") map[k].kecil += r.amount;
    else map[k].bank += r.amount;
  });
  return Object.keys(map).map(k => {
    const v = map[k];
    return { name: k, total: v.amount, count: v.count, bank: v.bank, kecil: v.kecil };
  });
}

// ——— HTML email ———

function buildWeeklyRecapHtml_(range, prevRange, summary, rows) {
  const cfg = WEEKLY_RECAP_CONFIG;
  const deltaStr = formatDelta_(summary.delta, summary.deltaPct);
  const entityRows = summary.byEntity
    .map(
      e =>
        "<tr><td>" +
        esc_(e.name) +
        "</td><td align=\"right\">" +
        formatRp_(e.bank) +
        "</td><td align=\"right\">" +
        formatRp_(e.kecil) +
        "</td><td align=\"right\"><b>" +
        formatRp_(e.total) +
        "</b></td><td align=\"center\">" +
        e.count +
        "</td></tr>"
    )
    .join("");

  const catRows = summary.byCategory
    .map(
      (c, i) =>
        "<tr><td>" +
        (i + 1) +
        "</td><td>" +
        esc_(c.name) +
        "</td><td align=\"right\">" +
        formatRp_(c.amount) +
        "</td><td align=\"center\">" +
        c.count +
        "</td></tr>"
    )
    .join("");

  const picRows = summary.byPic
    .map(
      (p, i) =>
        "<tr><td>" +
        (i + 1) +
        "</td><td>" +
        esc_(p.name) +
        "</td><td align=\"right\">" +
        formatRp_(p.amount) +
        "</td></tr>"
    )
    .join("");

  const detail = rows
    .slice()
    .sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)))
    .slice(0, cfg.MAX_DETAIL_ROWS)
    .map(
      r =>
        "<tr><td>" +
        esc_(r.tanggal || r.dateIso) +
        "</td><td>" +
        esc_(r.jenis) +
        "</td><td>" +
        esc_(r.entitas) +
        "</td><td>" +
        esc_(r.category) +
        "</td><td>" +
        esc_(r.namaTransaksi) +
        "</td><td align=\"right\">" +
        formatRp_(r.amount) +
        "</td><td>" +
        esc_(r.pic) +
        "</td><td>" +
        (r.bukti ? "<a href=\"" + escAttr_(r.bukti) + "\">Bukti</a>" : "—") +
        "</td></tr>"
    )
    .join("");

  const highlight = summary.largest
    ? "<p style=\"margin:12px 0;padding:12px;background:#f0f4ff;border-radius:8px;font-size:14px\"><b>Transaksi terbesar:</b> " +
      esc_(summary.largest.namaTransaksi) +
      " — " +
      formatRp_(summary.largest.amount) +
      " (" +
      esc_(summary.largest.entitas) +
      ", " +
      esc_(summary.largest.tanggal || summary.largest.dateIso) +
      ")</p>"
    : "";

  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6fb;margin:0;padding:24px;color:#18243b\">" +
    "<div style=\"max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(24,36,59,.08)\">" +
    "<div style=\"background:linear-gradient(135deg,#172554,#3458d4);color:#fff;padding:24px 28px\">" +
    "<div style=\"font-size:12px;opacity:.85;letter-spacing:.5px\">GBC CASH MANAGEMENT</div>" +
    "<h1 style=\"margin:8px 0 4px;font-size:22px\">Weekly Recap</h1>" +
    "<p style=\"margin:0;font-size:14px;opacity:.95\">Minggu ke-" +
    range.weekNumber +
    " · " +
    esc_(range.label) +
    "</p></div>" +
    "<div style=\"padding:24px 28px\">" +
    "<p style=\"font-size:13px;color:#6f7c93;margin:0 0 16px\">Berdasarkan <b>Tanggal Pengeluaran</b> (bukan waktu upload). Periode sebelumnya: " +
    esc_(prevRange.label) +
    ".</p>" +
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"8\" style=\"margin-bottom:20px\"><tr>" +
    metricCell_("Total minggu ini", formatRp_(summary.combined.total), deltaStr) +
    metricCell_("Bank", formatRp_(summary.combined.bank), summary.combined.bankN + " trx") +
    metricCell_("Kas Kecil", formatRp_(summary.combined.kecil), summary.combined.kecilN + " trx") +
    "</tr></table>" +
    highlight +
    "<h2 style=\"font-size:16px;margin:24px 0 8px\">Per entitas</h2>" +
    "<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;font-size:13px;border:1px solid #e7ebf3\">" +
    "<thead><tr style=\"background:#f7f8fc\"><th align=\"left\">Entitas</th><th align=\"right\">Bank</th><th align=\"right\">Kas Kecil</th><th align=\"right\">Total</th><th>#</th></tr></thead>" +
    "<tbody>" +
    (entityRows || "<tr><td colspan=\"5\">Tidak ada transaksi minggu ini.</td></tr>") +
    "</tbody></table>" +
    "<h2 style=\"font-size:16px;margin:24px 0 8px\">Top kategori</h2>" +
    "<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;font-size:13px;border:1px solid #e7ebf3\">" +
    "<thead><tr style=\"background:#f7f8fc\"><th>#</th><th align=\"left\">Kategori</th><th align=\"right\">Nominal</th><th># trx</th></tr></thead><tbody>" +
    (catRows || "<tr><td colspan=\"4\">—</td></tr>") +
    "</tbody></table>" +
    "<h2 style=\"font-size:16px;margin:24px 0 8px\">Top PIC</h2>" +
    "<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;font-size:13px;border:1px solid #e7ebf3\">" +
    "<thead><tr style=\"background:#f7f8fc\"><th>#</th><th align=\"left\">PIC</th><th align=\"right\">Nominal</th></tr></thead><tbody>" +
    (picRows || "<tr><td colspan=\"3\">—</td></tr>") +
    "</tbody></table>" +
    "<h2 style=\"font-size:16px;margin:24px 0 8px\">Detail (max " +
    cfg.MAX_DETAIL_ROWS +
    ")</h2>" +
    "<table width=\"100%\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;font-size:12px;border:1px solid #e7ebf3\">" +
    "<thead><tr style=\"background:#f7f8fc\"><th>Tanggal</th><th>Jenis</th><th>Entitas</th><th>Kategori</th><th>Nama</th><th align=\"right\">Jumlah</th><th>PIC</th><th>Bukti</th></tr></thead><tbody>" +
    (detail || "<tr><td colspan=\"8\">Tidak ada data.</td></tr>") +
    "</tbody></table>" +
    "<p style=\"margin:24px 0 0;font-size:13px\">" +
    "<a href=\"" +
    escAttr_(cfg.HUB_URL) +
    "\" style=\"color:#3458d4\">Buka spreadsheet hub</a>" +
    (cfg.APP_URL ? " · <a href=\"" + escAttr_(cfg.APP_URL) + "\" style=\"color:#3458d4\">Web app</a>" : "") +
    "</p></div></div>" +
    "<p style=\"text-align:center;font-size:11px;color:#8792a6;margin-top:16px\">Email otomatis · " +
    esc_(Utilities.formatDate(new Date(), cfg.TIMEZONE, "dd MMM yyyy HH:mm z")) +
    "</p></body></html>"
  );
}

function metricCell_(label, value, sub) {
  return (
    "<td width=\"33%\" style=\"background:#f7f8fc;border-radius:8px;padding:14px;vertical-align:top\">" +
    "<div style=\"font-size:11px;color:#8792a6;text-transform:uppercase\">" +
    esc_(label) +
    "</div>" +
    "<div style=\"font-size:18px;font-weight:700;margin:4px 0\">" +
    esc_(value) +
    "</div>" +
    "<div style=\"font-size:12px;color:#53617a\">" +
    esc_(sub) +
    "</div></td>"
  );
}

// ——— Utils ———

function parseRecipients_() {
  return String(WEEKLY_RECAP_CONFIG.RECIPIENTS || "")
    .split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseDateIso_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, WEEKLY_RECAP_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }
  const s = String(raw || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}

function parseMoney_(v) {
  if (typeof v === "number" && !isNaN(v)) return v;
  const s = String(v || "")
    .replace(/[^\d,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatIsoDate_(d) {
  return Utilities.formatDate(d, WEEKLY_RECAP_CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function formatDisplayDate_(d, tz) {
  return Utilities.formatDate(d, tz, "dd MMM yyyy");
}

function formatRp_(n) {
  const x = Math.round(Number(n) || 0);
  return "Rp " + x.toLocaleString("id-ID");
}

function formatDelta_(delta, pct) {
  if (pct === null) return "— vs minggu lalu";
  const sign = delta >= 0 ? "▲" : "▼";
  return sign + " " + Math.abs(pct).toFixed(1) + "% vs minggu lalu (" + formatRp_(Math.abs(delta)) + ")";
}

function esc_(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr_(s) {
  return esc_(s).replace(/'/g, "&#39;");
}

function stripHtml_(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
