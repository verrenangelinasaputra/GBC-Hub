/**
 * GBC — pindahkan bukti upload Google Form ke folder Drive terstruktur.
 *
 * Struktur: BUKTI PENGELUARAN PERUSAHAAN / {ENTITAS} / KAS KECIL|KAS BESAR / {MM - BULAN YYYY} /
 * Root: https://drive.google.com/drive/folders/1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy
 *
 * PASANG TRIGGER (penting):
 * - Script di spreadsheet respons form → Triggers → From spreadsheet → On form submit
 * - Fungsi: onFormSubmitKasKecil atau onFormSubmitKasBesar
 * - Trigger harus "Installable" (authorize akun pemilik form)
 *
 * Trigger spreadsheet TIDAK punya e.response — hanya e.namedValues + e.range.
 * Versi lama exit di `if (!e.response) return` → tidak error, file tidak pindah.
 *
 * Nama file: {waktu upload} - {Entitas} - {Kategori} - {Nama transaksi}.ext
 *
 * Debug: jalankan debugRunOnLastRowKasKecil() dari editor, cek sheet _GBC_Bukti_Log
 *
 * Script boleh standalone (Extensions → Apps Script terpisah) ATAU bound ke spreadsheet respons.
 * Debug / log pakai ID di bawah — getActiveSpreadsheet() sering null jika run dari editor standalone.
 */

var BUKTI_ROOT_FOLDER_ID = "1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy";
var LOG_SHEET_NAME = "_GBC_Bukti_Log";

/** Spreadsheet respons Google Form */
var RESPONSE_SHEET_KAS_KECIL_ID = "1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM";
var RESPONSE_SHEET_KAS_KECIL_GID = 423968165;

var RESPONSE_SHEET_KAS_BESAR_ID = "1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY";
var RESPONSE_SHEET_KAS_BESAR_GID = 1533749503;

var ENTITY_FOLDER_PREFIX = "BUKTI PENGELUARAN ";

var ENTITY_ALIASES = {
  GBC: "BUKTI PENGELUARAN GBC",
  MJL: "BUKTI PENGELUARAN MJL",
  BKT: "BUKTI PENGELUARAN BKT",
  KEDIRI: "BUKTI PENGELUARAN KEDIRI",
  Kediri: "BUKTI PENGELUARAN KEDIRI",
  "CV ANUGRAH": "BUKTI PENGELUARAN CV ANUGRAH"
};

var MONTH_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
];

function onFormSubmitKasKecil(e) {
  runBuktiPipeline_(e, "KAS KECIL");
}

function onFormSubmitKasBesar(e) {
  runBuktiPipeline_(e, "KAS BESAR");
}

/**
 * Trigger form kadang kirim e tanpa namedValues/range (keys: []).
 * Debug OK karena baca baris langsung dari sheet — pipeline ini selalu hydrate dari sheet.
 */
function runBuktiPipeline_(e, kasType, attempt) {
  attempt = attempt || 0;
  if (!e && attempt === 0) {
    logBukti_("INFO", "Run manual — proses baris terakhir", "", kasType);
    e = buildEventFromLastRow_(kasType);
  }
  var resolved = resolveSubmitEvent_(e, kasType);
  if (!resolved) {
    logBukti_("SKIP", "Tidak bisa baca baris respons spreadsheet", "attempt=" + attempt, kasType);
    return;
  }
  var ok = handleFormSubmit_(resolved, kasType);
  if (ok || attempt >= 5) return;
  Utilities.sleep(attempt === 0 ? 1000 : 2000);
  var row = resolved.range ? resolved.range.getRow() : null;
  var sh = getResponseSheet_(kasType);
  var retryEv = row ? buildEventFromSheetRow_(sh, row) : buildEventFromLastRow_(kasType);
  logBukti_("INFO", "Retry baca bukti (link form belum siap)", "attempt=" + (attempt + 1) + " row=" + row, kasType);
  runBuktiPipeline_(retryEv, kasType, attempt + 1);
}

/** Uji tanpa submit form: proses baris terakhir di sheet respons */
function debugRunOnLastRowKasKecil() {
  simulateRowSubmit_("KAS KECIL");
}

function debugRunOnLastRowKasBesar() {
  simulateRowSubmit_("KAS BESAR");
}

function getSheetConfig_(kasType) {
  if (kasType === "KAS BESAR") {
    return {
      spreadsheetId: RESPONSE_SHEET_KAS_BESAR_ID,
      gid: RESPONSE_SHEET_KAS_BESAR_GID
    };
  }
  return {
    spreadsheetId: RESPONSE_SHEET_KAS_KECIL_ID,
    gid: RESPONSE_SHEET_KAS_KECIL_GID
  };
}

function getResponseSpreadsheet_(kasType) {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var cfg = getSheetConfig_(kasType);
  return SpreadsheetApp.openById(cfg.spreadsheetId);
}

function getResponseSheetByGid_(ss, gid) {
  var target = Number(gid);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === target) return sheets[i];
  }
  return sheets[0];
}

function getResponseSheet_(kasType) {
  var cfg = getSheetConfig_(kasType);
  var ss = getResponseSpreadsheet_(kasType);
  return getResponseSheetByGid_(ss, cfg.gid);
}

function buildEventFromSheetRow_(sheet, row) {
  if (!sheet || row < 2) return null;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, row, lastCol).getValues()[0];
  var namedValues = {};
  headers.forEach(function (h, i) {
    var key = String(h || "").trim();
    if (!key) return;
    namedValues[key] = [values[i] != null ? String(values[i]) : ""];
  });
  return {
    namedValues: namedValues,
    range: sheet.getRange(row, 1, row, lastCol)
  };
}

function buildEventFromLastRow_(kasType) {
  var sh = getResponseSheet_(kasType);
  Logger.log("Baca baris terakhir " + kasType + " | tab=" + sh.getName());
  return buildEventFromSheetRow_(sh, sh.getLastRow());
}

function resolveSubmitEvent_(e, kasType) {
  if (e && e.range) {
    var fromRange = buildEventFromSheetRow_(e.range.getSheet(), e.range.getRow());
    if (e.response) fromRange.response = e.response;
    if (e.namedValues && Object.keys(e.namedValues).length) {
      fromRange.namedValues = mergeNamedValues_(fromRange.namedValues, e.namedValues);
    }
    return fromRange;
  }
  if (e && e.namedValues && Object.keys(e.namedValues).length) {
    var sh = getResponseSheet_(kasType);
    var ev = { namedValues: e.namedValues, response: e.response };
    ev.range = buildEventFromSheetRow_(sh, sh.getLastRow()).range;
    return ev;
  }
  return buildEventFromLastRow_(kasType);
}

function mergeNamedValues_(base, extra) {
  var out = {};
  Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
  Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

function simulateRowSubmit_(kasType) {
  runBuktiPipeline_(null, kasType);
}

function handleFormSubmit_(e, kasType) {
  if (!e) return false;

  var payload = parseSubmitPayload_(e);
  enrichFileIdsFromSheetRow_(e, payload.fileIds);

  if (!payload.fileIds.length) {
    logBukti_("SKIP", "Tidak ada file ID / link bukti terdeteksi", JSON.stringify({
      kasType: kasType,
      row: e.range ? e.range.getRow() : null,
      hasResponse: Boolean(e.response),
      hasNamedValues: Boolean(e.namedValues),
      keys: e.namedValues ? Object.keys(e.namedValues) : []
    }), kasType);
    return false;
  }

  try {
    var destFolder = resolveDestinationFolder_(payload.entity, kasType, payload.tanggalRaw);
    var moved = 0;
    var primaryFileId = null;
    var primaryFileName = null;
    payload.fileIds.forEach(function (id, index) {
      try {
        var file = DriveApp.getFileById(id);
        var newName = buildBuktiFileName_(
          payload.uploadedAt,
          payload.entity,
          payload.category,
          payload.namaTransaksi,
          file
        );
        if (payload.fileIds.length > 1) {
          newName = appendFileIndex_(newName, index + 1);
        }
        newName = uniqueNameInFolder_(destFolder, newName);
        file.setName(newName);
        file.moveTo(destFolder);
        moved++;
        if (!primaryFileId) {
          primaryFileId = id;
          primaryFileName = newName;
        }
      } catch (err) {
        logBukti_("ERROR", "Gagal memindahkan " + id, String(err), kasType);
      }
    });
    if (primaryFileId && e.range) {
      updateBuktiCellInSheet_(e, primaryFileId, primaryFileName);
    }
    logBukti_("OK", moved + " file dipindah ke " + destFolder.getName(), kasType + " | " + payload.fileIds.join(", "), kasType);
    return moved > 0;
  } catch (err) {
    logBukti_("ERROR", "Gagal resolve folder / akses Drive", String(err), kasType);
    return false;
  }
}

function parseSubmitPayload_(e) {
  var payload = {
    fileIds: [],
    entity: "",
    category: "",
    namaTransaksi: "",
    tanggalRaw: "",
    uploadedAt: new Date()
  };

  if (e.response) {
    payload.uploadedAt = e.response.getTimestamp();
    e.response.getItemResponses().forEach(function (ir) {
      var title = ir.getItem().getTitle();
      var val = ir.getResponse();
      applyFieldFromTitle_(payload, title, val);
      try {
        if (ir.getItem().getType() === FormApp.ItemType.FILE_UPLOAD) {
          pushFileIds_(payload.fileIds, val);
        }
      } catch (err) { /* ignore */ }
    });
    return payload;
  }

  var named = e.namedValues || {};
  Object.keys(named).forEach(function (key) {
    var parts = named[key] || [];
    var joined = parts.map(function (p) { return String(p); }).join(", ");
    applyFieldFromTitle_(payload, key, joined);
  });

  if (named.Timestamp && named.Timestamp[0]) {
    var ts = parseTimestampCell_(named.Timestamp[0]);
    if (ts) payload.uploadedAt = ts;
  }

  return payload;
}

function applyFieldFromTitle_(payload, title, val) {
  var t = String(title || "");
  var text = cellText_(val);
  if (/entitas pengeluaran/i.test(t)) payload.entity = text;
  if (/kategori pengeluaran/i.test(t)) payload.category = text;
  if (/nama transaksi/i.test(t)) payload.namaTransaksi = text;
  if (/tanggal pengeluaran/i.test(t)) payload.tanggalRaw = text;
  if (/bukti transaksi/i.test(t) || /file upload/i.test(t)) {
    pushFileIds_(payload.fileIds, val);
  }
  if (/drive\.google\.com/i.test(String(val))) {
    pushFileIds_(payload.fileIds, val);
  }
}

function driveFileViewUrl_(fileId) {
  return "https://drive.google.com/file/d/" + fileId + "/view";
}

/** Tulis ulang kolom bukti di spreadsheet → link preview file setelah rename/pindah */
function updateBuktiCellInSheet_(e, fileId, displayName) {
  if (!e.range || !fileId) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  if (row < 2) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var url = driveFileViewUrl_(fileId);
  var label = String(displayName || "Buka bukti").trim();
  if (label.length > 120) label = label.slice(0, 117) + "...";
  for (var c = 0; c < headers.length; c++) {
    var header = String(headers[c] || "");
    if (!/bukti transaksi/i.test(header) && !/^\d+\.\s*bukti/i.test(header)) continue;
    var cell = sheet.getRange(row, c + 1);
    // URL plain text supaya dashboard (Google Sheets API values.get) tetap baca link preview file
    cell.setValue(url);
    cell.setNote("Nama file: " + label);
    return;
  }
}

function enrichFileIdsFromSheetRow_(e, fileIds) {
  if (!e.range) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  if (row < 2) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    var header = String(headers[c] || "");
    if (!/bukti transaksi/i.test(header) && !/^\d+\.\s*bukti/i.test(header)) continue;
    var cell = sheet.getRange(row, c + 1);
    var rt = cell.getRichTextValue();
    if (rt) {
      var runs = rt.getRuns();
      if (runs && runs.length) {
        runs.forEach(function (run) {
          var url = run.getLinkUrl();
          if (url) pushFileIds_(fileIds, url);
        });
      }
      var link = rt.getLinkUrl();
      if (link) pushFileIds_(fileIds, link);
    }
    pushFileIds_(fileIds, cell.getValue());
    pushFileIds_(fileIds, cell.getDisplayValue());
    pushFileIds_(fileIds, cell.getFormula());
  }

  // Fallback: scan semua sel di baris (link bukti kadang tidak terbaca sebagai RichText)
  for (var c2 = 0; c2 < headers.length; c2++) {
    var v = sheet.getRange(row, c2 + 1).getDisplayValue();
    if (/drive\.google\.com/i.test(String(v))) pushFileIds_(fileIds, v);
  }
}

function cellText_(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return String(val[0] || "").trim();
  return String(val).trim();
}

function parseTimestampCell_(raw) {
  var d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

function extractDriveFileId_(s) {
  s = String(s || "").trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && s.indexOf("http") !== 0) return s;
  var patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = s.match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  return null;
}

function pushFileIds_(fileIds, val) {
  if (val == null || val === "") return;
  if (Array.isArray(val)) {
    val.forEach(function (v) { pushFileIds_(fileIds, v); });
    return;
  }
  String(val).split(/,\s*/).forEach(function (part) {
    var id = extractDriveFileId_(part);
    if (id && fileIds.indexOf(id) === -1) fileIds.push(id);
  });
}

function logBukti_(status, message, detail, kasType) {
  Logger.log(status + ": " + message + (detail ? " | " + detail : ""));
  try {
    var ss = kasType ? getResponseSpreadsheet_(kasType) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sh = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(LOG_SHEET_NAME);
      sh.appendRow(["Waktu", "Status", "Pesan", "Detail"]);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), status, message, detail || ""]);
  } catch (err) {
    Logger.log("Log sheet gagal: " + err);
  }
}

function formatUploadStamp_(date) {
  var tz = Session.getScriptTimeZone() || "Asia/Jakarta";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd_HHmmss");
}

function sanitizeFileNamePart_(value, maxLen) {
  maxLen = maxLen || 80;
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, maxLen)
    .trim() || "Tidak-diisi";
}

function buildBuktiFileName_(uploadedAt, entity, category, namaTransaksi, file) {
  var origName = file.getName();
  var dot = origName.lastIndexOf(".");
  var ext = dot > 0 ? origName.slice(dot) : "";
  var stamp = formatUploadStamp_(uploadedAt);
  var parts = [
    stamp,
    sanitizeFileNamePart_(entity, 40),
    sanitizeFileNamePart_(category, 70),
    sanitizeFileNamePart_(namaTransaksi, 70)
  ];
  return parts.join(" - ") + ext;
}

function appendFileIndex_(fileName, index) {
  if (index <= 1) return fileName;
  var dot = fileName.lastIndexOf(".");
  if (dot > 0) {
    return fileName.slice(0, dot) + " (" + index + ")" + fileName.slice(dot);
  }
  return fileName + " (" + index + ")";
}

function uniqueNameInFolder_(folder, fileName) {
  if (!folder.getFilesByName(fileName).hasNext()) return fileName;
  var dot = fileName.lastIndexOf(".");
  var stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  var ext = dot > 0 ? fileName.slice(dot) : "";
  for (var n = 2; n < 100; n++) {
    var candidate = stem + " (" + n + ")" + ext;
    if (!folder.getFilesByName(candidate).hasNext()) return candidate;
  }
  return stem + " " + new Date().getTime() + ext;
}

function resolveDestinationFolder_(entity, kasType, tanggalRaw) {
  var root = DriveApp.getFolderById(BUKTI_ROOT_FOLDER_ID);
  var entityFolder = getOrCreateSubfolder_(root, entityFolderName_(entity));
  var kasFolder = getOrCreateSubfolder_(entityFolder, kasType);
  return getOrCreateSubfolder_(kasFolder, monthFolderName_(tanggalRaw));
}

function entityFolderName_(entity) {
  var raw = String(entity || "").trim();
  var key = raw.toUpperCase();
  if (ENTITY_ALIASES[key]) return ENTITY_ALIASES[key];
  if (ENTITY_ALIASES[raw]) return ENTITY_ALIASES[raw];
  if (/^BUKTI PENGELUARAN/i.test(raw)) return raw;
  return ENTITY_FOLDER_PREFIX + (raw || "LAINNYA").toUpperCase();
}

function monthFolderName_(tanggalRaw) {
  var d = parseDateId_(tanggalRaw) || new Date();
  var mm = ("0" + (d.getMonth() + 1)).slice(-2);
  return mm + " - " + MONTH_ID[d.getMonth()] + " " + d.getFullYear();
}

function parseDateId_(raw) {
  if (!raw) return null;
  var s = String(raw).trim();
  var m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    var mo = Number(m[2]) - 1;
    var yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return new Date(yr, mo, Number(m[1]));
  }
  var parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}
