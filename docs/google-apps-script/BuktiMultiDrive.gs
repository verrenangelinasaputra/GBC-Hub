/**
 * GBC — Salin bukti Google Form ke folder shared + Drive per entitas (bukan pindah).
 *
 * Alur:
 * 1. File upload form (atau inbox lama) → SALIN ke arsip shared (tetap utuh di shared).
 * 2. SALIN lagi ke Drive entitas sesuai entitas + jenis (Bank / Kas Kecil).
 *
 * Compiled bukti (sumber salin ke entitas): https://drive.google.com/drive/folders/1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM
 * Shared arsip opsional: 1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy
 *
 * PASANG:
 * - Bound ke spreadsheet respons Form Kas Kecil / Kas Besar (satu project, dua trigger),
 *   ATAU standalone + isi RESPONSE_SHEET_* di bawah.
 * - Trigger: From spreadsheet → On form submit → onFormSubmitKasKecil / onFormSubmitKasBesar
 * - Matikan trigger lama `google-apps-script-organize-bukti.gs` jika masih memindahkan (moveTo).
 *
 * Backfill: menu → "Salin compiled → drive entitas" (folder 1MQK5…)
 *
 * Nama file di Drive (web app): tanggal_jenis_entitas_namaTransaksi_jumlah.ext
 * Contoh: 2026-10-14_Bank_GBC_test_120000.pdf  (jenis = Bank | Kas_Kecil)
 *
 * Manifest: butuh scope https://www.googleapis.com/auth/spreadsheets (openById untuk debug dari editor).
 */

var MULTI_DRIVE_CONFIG = {
  /**
   * true = setiap submit form: salin ke shared + salin ke drive entitas (dua salinan dari file form).
   * false = hanya salin langsung ke drive entitas (tanpa salinan arsip shared).
   */
  COPY_TO_SHARED_ON_SUBMIT: true,
  /**
   * Folder compiled bukti pengeluaran — salin ke drive entitas (file tetap di folder ini).
   * https://drive.google.com/drive/folders/1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM
   */
  COMPILED_BUKTI_ROOT_ID: "1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM",
  /** Folder arsip shared lama (opsional; menu terpisah) */
  SHARED_ARCHIVE_ROOT_ID: "1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy",
  /** Alias legacy = sama dengan compiled */
  FORM_INBOX_FOLDER_ID: "1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM",
  PROCESS_FORM_INBOX: false,
  /** Buat subfolder bulan di shared (selaras organize-bukti) */
  CREATE_MONTH_FOLDER_IN_SHARED: true,
  /** Buat subfolder yang belum ada di drive entitas (GBC/Kediri/MJL/…) */
  CREATE_ENTITY_SUBFOLDERS: true,
  TRACK_COPIES_IN_PROPERTIES: true,
  LOG_SHEET_NAME: "_GBC_MultiDrive_Log",
  /** Lookup jenis (Bank/Kas Kecil) untuk file lama tanpa jenis di nama — tab hub web app */
  HUB_SPREADSHEET_ID: "1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY",
  HUB_TAB_KAS_BESAR: "Bank",
  HUB_TAB_KAS_KECIL: "KAS KECIL"
};

/** Folder Drive CV Anugerah: https://drive.google.com/drive/folders/1e9ZC8iYcAfG43cG9V1Rmmv-5rUutO5Yk */
var CV_ANUGERAH_DRIVE_ROOT_ID = "1e9ZC8iYcAfG43cG9V1Rmmv-5rUutO5Yk";

var RESPONSE_SHEET_KAS_KECIL_ID = "1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM";
var RESPONSE_SHEET_KAS_KECIL_GID = 423968165;
var RESPONSE_SHEET_KAS_BESAR_ID = "1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY";
var RESPONSE_SHEET_KAS_BESAR_GID = 1533749503;

var SHARED_ENTITY_FOLDER_PREFIX = "BUKTI PENGELUARAN ";

var SHARED_ENTITY_ALIASES = {
  GBC: "BUKTI PENGELUARAN GBC",
  KEDIRI: "BUKTI PENGELUARAN KEDIRI",
  Kediri: "BUKTI PENGELUARAN KEDIRI",
  MJL: "BUKTI PENGELUARAN MJL",
  BKT: "BUKTI PENGELUARAN BKT",
  "CV ANUGRAH": "BUKTI PENGELUARAN CV ANUGRAH",
  "CV LEMBAYUNG": "BUKTI PENGELUARAN CV LEMBAYUNG",
  LIGHT: "BUKTI PENGELUARAN CV LEMBAYUNG"
};

var MONTH_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
];

/**
 * driveRootId: folder Drive akun entitas (bukan shared).
 * layout:
 *   flat — root / buktiRootName / Bank|Kas Kecil
 *   gbc_kediri — root / buktiRootName / GBC|Kediri / Bank|Kas Kecil
 */
var ENTITY_DRIVE_ROUTES = [
  {
    entityKeys: ["gbc"],
    driveRootId: "1MbHGqMqTsgUu4zVxzsA4frVJW-bGpRMH",
    layout: "gbc_kediri",
    buktiRootName: "Bukti Pengeluaran Perusahaan GBC dan Kediri",
    entitySubfolder: "GBC"
  },
  {
    entityKeys: ["kediri", "kdr"],
    driveRootId: "1MbHGqMqTsgUu4zVxzsA4frVJW-bGpRMH",
    layout: "gbc_kediri",
    buktiRootName: "Bukti Pengeluaran Perusahaan GBC dan Kediri",
    entitySubfolder: "Kediri"
  },
  {
    entityKeys: ["mjl", "mata jendela", "jendela langit"],
    driveRootId: "1LxJer5eBJ8YXDqwurZBsVfEjgju6y3Fe",
    layout: "flat",
    buktiRootName: "BUKTI PENGELUARAN MJL"
  },
  {
    entityKeys: ["bkt", "bersama karunia", "karunia terang", "pt bkt"],
    driveRootId: "1ztj4N_ldNG1j857Al0GOy203NHHGO90p",
    layout: "flat",
    buktiRootName: "BUKTI PENGELUARAN BKT"
  },
  {
    entityKeys: ["lembayung", "cv lembayung", "light", "cv lembayung indah terbentang"],
    driveRootId: "1NIxnDIW8J_Twv3VmGjgvJwOoh6U8FTbp",
    layout: "flat",
    buktiRootName: "BUKTI PENGELUARAN CV LEMBAYUNG"
  },
  {
    entityKeys: ["anugrah", "cv anugerah", "aim", "cv anugerah impian"],
    driveRootId: "",
    layout: "flat",
    buktiRootName: "BUKTI PENGELUARAN CV ANUGRAH",
    useAnugerahConfigVar: true
  }
];

var PROCESSED_COPY_KEY = "MULTI_DRIVE_COPY_V1";

function toastMultiDrive_(message, title, durationSec) {
  title = title || "GBC Multi Drive";
  durationSec = durationSec || 5;
  Logger.log(String(message));
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(String(message), title, durationSec);
  } catch (e) {
    Logger.log("toast: " + e);
  }
}

// ——— Menu ———

function onOpenMultiDriveBuktiMenu() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Multi Drive Bukti")
    .addItem("Salin compiled → drive entitas (semua file)", "distributeAllFromCompiledBukti")
    .addItem("Salin shared lama → drive entitas", "distributeAllFromSharedArchive")
    .addItem("Salin inbox (hanya file di root) → shared + entitas", "copyAllFromFormInbox")
    .addSeparator()
    .addItem("Debug: baris terakhir Kas Kecil", "debugMultiDriveLastRowKecil")
    .addItem("Debug: baris terakhir Kas Besar", "debugMultiDriveLastRowBesar")
    .addItem("Pasang trigger jam (compiled → entitas)", "installMultiDriveHourlyTrigger")
    .addItem("Hapus trigger jam", "removeMultiDriveHourlyTriggers")
    .addToUi();
}

/** Jika digabung dengan script lain, panggil onOpenMultiDriveBuktiMenu() dari onOpen Anda. */

function installMultiDriveHourlyTrigger() {
  removeMultiDriveHourlyTriggers();
  ScriptApp.newTrigger("distributeAllFromCompiledBukti").timeBased().everyHours(1).create();
  toastMultiDrive_("Trigger hourly: compiled → drive entitas aktif.", "GBC Multi Drive", 5);
  return "Trigger hourly aktif (distributeAllFromCompiledBukti setiap 1 jam).";
}

function removeMultiDriveHourlyTriggers() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === "distributeAllFromCompiledBukti" || fn === "distributeAllFromSharedArchive") {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  toastMultiDrive_(removed ? "Trigger hourly dihapus (" + removed + ")." : "Tidak ada trigger hourly.", "GBC Multi Drive", 5);
  return removed;
}

// ——— Form submit ———

function onFormSubmitKasKecil(e) {
  runMultiDrivePipeline_(e, "KAS KECIL");
}

function onFormSubmitKasBesar(e) {
  runMultiDrivePipeline_(e, "KAS BESAR");
}

function debugMultiDriveLastRowKecil() {
  runMultiDrivePipeline_(null, "KAS KECIL");
}

function debugMultiDriveLastRowBesar() {
  runMultiDrivePipeline_(null, "KAS BESAR");
}

function runMultiDrivePipeline_(e, kasType, attempt) {
  attempt = attempt || 0;
  if (!e && attempt === 0) {
    logMultiDrive_("INFO", "Run manual — baris terakhir", "", kasType);
    e = buildEventFromLastRow_(kasType);
  }
  var resolved = resolveSubmitEvent_(e, kasType);
  if (!resolved) {
    logMultiDrive_("SKIP", "Tidak bisa baca baris respons", "attempt=" + attempt, kasType);
    return;
  }
  var ok = handleMultiDriveSubmit_(resolved, kasType);
  if (ok || attempt >= 5) return;
  Utilities.sleep(attempt === 0 ? 1000 : 2000);
  var row = resolved.range ? resolved.range.getRow() : null;
  var sh = getResponseSheet_(kasType);
  var retryEv = row ? buildEventFromSheetRow_(sh, row) : buildEventFromLastRow_(kasType);
  runMultiDrivePipeline_(retryEv, kasType, attempt + 1);
}

function handleMultiDriveSubmit_(e, kasType) {
  var payload = parseSubmitPayload_(e);
  enrichPayloadFromSheetRow_(e, payload);
  enrichFileIdsFromSheetRow_(e, payload.fileIds);
  if (!payload.fileIds.length) {
    logMultiDrive_("SKIP", "Tidak ada file bukti", JSON.stringify({ kasType: kasType }), kasType);
    return false;
  }

  var entityRoute = matchEntityRoute_(payload.entity);
  if (!entityRoute) {
    logMultiDrive_("ERROR", "Entitas tidak dikenali", payload.entity, kasType);
    return false;
  }
  var entityRootId = effectiveDriveRootId_(entityRoute);
  if (!entityRootId) {
    logMultiDrive_("SKIP", "Drive entitas belum dikonfigurasi (isi CV_ANUGERAH_DRIVE_ROOT_ID jika CV Anugerah)", payload.entity, kasType);
  }

  var jenisLabel = jenisFolderLabel_(kasType);
  var archiveKasFolderName = archiveKasFolderName_(kasType);
  var copied = 0;

  payload.fileIds.forEach(function (sourceId, index) {
    try {
      var source = DriveApp.getFileById(sourceId);
      var fileName = buildBuktiFileName_(
        payload.tanggalRaw,
        payload.entity,
        payload.namaTransaksi,
        payload.amountRaw,
        source
      );
      if (payload.fileIds.length > 1) fileName = appendFileIndex_(fileName, index + 1);

      if (MULTI_DRIVE_CONFIG.COPY_TO_SHARED_ON_SUBMIT) {
        var sharedFolder = resolveSharedArchiveFolder_(payload.entity, archiveKasFolderName, payload.tanggalRaw);
        var sharedName = uniqueNameInFolder_(sharedFolder, fileName);
        var sharedCopy = source.makeCopy(sharedName, sharedFolder);
        markCopyDone_(sourceId, MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId(), sharedCopy.getId());
      }

      if (entityRootId) {
        var entityFolder = resolveEntityDriveFolder_(entityRoute, jenisLabel, entityRootId);
        var entityName = uniqueNameInFolder_(entityFolder, fileName);
        if (!wasCopiedBefore_(sourceId, entityRootId, entityFolder.getId())) {
          var entityCopy = source.makeCopy(entityName, entityFolder);
          markCopyDone_(sourceId, entityRootId, entityFolder.getId(), entityCopy.getId());
        }
      }
      copied++;
    } catch (err) {
      logMultiDrive_("ERROR", "Gagal salin file " + sourceId, String(err), kasType);
    }
  });

  if (copied > 0 && e.range) {
    try {
      var firstId = payload.fileIds[0];
      var displayName = buildBuktiFileName_(
        payload.tanggalRaw,
        payload.entity,
        payload.namaTransaksi,
        payload.amountRaw,
        DriveApp.getFileById(firstId)
      );
      updateBuktiCellInSheet_(e, firstId, displayName);
    } catch (ignore) {}
  }

  logMultiDrive_("OK", copied + " file → shared + drive entitas", payload.entity + " | " + jenisLabel, kasType);
  return copied > 0;
}

// ——— Compiled / arsip → drive entitas (salin, file sumber tetap) ———

function compiledBuktiRootId_() {
  return (
    MULTI_DRIVE_CONFIG.COMPILED_BUKTI_ROOT_ID ||
    MULTI_DRIVE_CONFIG.FORM_INBOX_FOLDER_ID ||
    ""
  ).trim();
}

/** Salin semua bukti dari folder compiled ke drive masing-masing entitas. */
function distributeAllFromCompiledBukti() {
  var rootId = compiledBuktiRootId_();
  if (!rootId) throw new Error("COMPILED_BUKTI_ROOT_ID belum di-set.");
  return distributeFromArchiveRoot_(rootId, "Compiled");
}

function distributeAllFromSharedArchive() {
  var rootId = MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID;
  if (!rootId) throw new Error("SHARED_ARCHIVE_ROOT_ID belum di-set.");
  return distributeFromArchiveRoot_(rootId, "Shared");
}

function distributeFromArchiveRoot_(folderId, label) {
  var root = DriveApp.getFolderById(folderId);
  var stats = { ok: 0, skip: 0, fail: 0, errors: [] };
  walkArchiveTreeForEntityCopy_(root, [], stats);
  var msg = label + "→entitas: OK=" + stats.ok + " skip=" + stats.skip + " fail=" + stats.fail;
  Logger.log(msg);
  if (stats.errors.length) Logger.log(stats.errors.join("\n"));
  toastMultiDrive_(msg, "GBC Multi Drive", 8);
  return stats;
}

function walkArchiveTreeForEntityCopy_(folder, pathNames, stats) {
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    walkArchiveTreeForEntityCopy_(sub, pathNames.concat([sub.getName()]), stats);
  }
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_APPS_SCRIPT) continue;
    try {
      distributeOneSharedFile_(file, pathNames, stats);
    } catch (err) {
      stats.fail++;
      stats.errors.push(file.getName() + ": " + err);
    }
  }
}

function distributeOneSharedFile_(file, pathNames, stats) {
  var parsed = inferFromArchivePath_(pathNames, file.getName(), file);
  if (!parsed) {
    stats.skip++;
    Logger.log("SKIP (entitas/jenis tidak dikenali): " + file.getName() + " path=" + pathNames.join(" / "));
    return;
  }
  var route = matchEntityRoute_(parsed.entityLabel);
  var rootId = route ? effectiveDriveRootId_(route) : "";
  if (!route || !rootId) {
    stats.skip++;
    return;
  }
  var entityFolder = resolveEntityDriveFolder_(route, parsed.jenisLabel, rootId);
  var sourceId = file.getId();
  if (wasCopiedBefore_(sourceId, rootId, entityFolder.getId())) {
    stats.skip++;
    Logger.log("SKIP (sudah pernah disalin): " + file.getName());
    return;
  }
  var destName = entityCopyFileName_(file, parsed, entityFolder);
  var copy = file.makeCopy(destName, entityFolder);
  markCopyDone_(sourceId, rootId, entityFolder.getId(), copy.getId());
  stats.ok++;
}

function normalizeEntityLabel_(raw) {
  var entityLabel = String(raw || "").trim();
  if (!entityLabel) return "";
  if (/^gbc$/i.test(entityLabel)) return "GBC";
  if (/^kediri$/i.test(entityLabel)) return "Kediri";
  if (/cv anugrah/i.test(entityLabel)) return "CV Anugerah";
  if (/cv lembayung/i.test(entityLabel)) return "CV Lembayung";
  if (/^mjl$/i.test(entityLabel)) return "MJL";
  if (/^bkt$/i.test(entityLabel)) return "BKT";
  return entityLabel;
}

function parseWebAppUploadFileName_(fileName) {
  var base = String(fileName || "").replace(/\.[^.]+$/i, "");
  var parts = base.split("_");
  if (parts.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null;
  var seg1 = String(parts[1] || "");
  if (/^bank$/i.test(seg1)) {
    return {
      entityLabel: normalizeEntityLabel_(parts[2]),
      jenisLabel: "Bank"
    };
  }
  if (/^kas[-_]?kecil$/i.test(seg1.replace(/\s+/g, ""))) {
    return {
      entityLabel: normalizeEntityLabel_(parts[2]),
      jenisLabel: "Kas Kecil"
    };
  }
  return {
    entityLabel: normalizeEntityLabel_(parts[1]),
    jenisLabel: ""
  };
}

function inferFromArchivePath_(pathNames, fileName, file) {
  var entityLabel = "";
  var jenisLabel = "";
  var i;
  for (i = 0; i < pathNames.length; i++) {
    var p = pathNames[i];
    if (/^BUKTI PENGELUARAN/i.test(p) || /^bukti pengeluaran/i.test(p)) {
      entityLabel = normalizeEntityLabel_(
        p.replace(/^BUKTI PENGELUARAN\s+/i, "").replace(/^bukti pengeluaran\s+/i, "")
      );
    }
    var j = normalizeJenisFromFolderName_(p);
    if (j) jenisLabel = j;
  }
  var web = parseWebAppUploadFileName_(fileName);
  if (web) {
    if (!entityLabel && web.entityLabel) entityLabel = web.entityLabel;
    if (!jenisLabel && web.jenisLabel) jenisLabel = web.jenisLabel;
  }
  if (!entityLabel) {
    var fromName = parseEntityFromFileName_(fileName);
    if (fromName) entityLabel = normalizeEntityLabel_(fromName);
  }
  if (!jenisLabel) {
    var j2 = parseJenisFromFileName_(fileName);
    if (j2) jenisLabel = j2;
  }
  if (!jenisLabel && file) {
    jenisLabel = inferJenisFromHubByFile_(file, entityLabel);
  }
  if (!entityLabel || !jenisLabel) return null;
  return { entityLabel: entityLabel, jenisLabel: jenisLabel };
}

function inferJenisFromHubByFile_(file, entityHint) {
  var hubId = String(MULTI_DRIVE_CONFIG.HUB_SPREADSHEET_ID || "").trim();
  if (!hubId) return "";
  var fileId = file.getId();
  var fileName = file.getName();
  var tabs = [
    { name: MULTI_DRIVE_CONFIG.HUB_TAB_KAS_BESAR || "Bank", jenis: "Bank" },
    { name: MULTI_DRIVE_CONFIG.HUB_TAB_KAS_KECIL || "KAS KECIL", jenis: "Kas Kecil" }
  ];
  try {
    var ss = SpreadsheetApp.openById(hubId);
    var t;
    for (t = 0; t < tabs.length; t++) {
      var sh = ss.getSheetByName(tabs[t].name);
      if (!sh) continue;
      var data = sh.getDataRange().getValues();
      if (data.length < 2) continue;
      var headers = data[0];
      var buktiCol = findHeaderColumnIndex_(headers, /bukti transaksi/i);
      var entCol = findHeaderColumnIndex_(headers, /entitas pengeluaran/i);
      var r;
      for (r = 1; r < data.length; r++) {
        var bukti = String(buktiCol >= 0 ? data[r][buktiCol] : "");
        if (bukti.indexOf(fileId) >= 0 || bukti.indexOf(fileName) >= 0) {
          return tabs[t].jenis;
        }
        if (entityHint && entCol >= 0) {
          var ent = String(data[r][entCol] || "").trim();
          if (ent && normalizeText_(ent) === normalizeText_(entityHint) && bukti.indexOf(fileId) >= 0) {
            return tabs[t].jenis;
          }
        }
      }
    }
    var legacy = parseLegacyWebAppAmountParts_(fileName);
    if (legacy && legacy.entityLabel) {
      for (t = 0; t < tabs.length; t++) {
        if (hubRowMatchesLegacyParts_(ss, tabs[t].name, legacy)) return tabs[t].jenis;
      }
    }
  } catch (e) {
    Logger.log("inferJenisFromHub: " + e);
  }
  return "";
}

function findHeaderColumnIndex_(headers, pattern) {
  var c;
  for (c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "");
    if (pattern.test(h)) return c;
  }
  return -1;
}

function parseLegacyWebAppAmountParts_(fileName) {
  var base = String(fileName || "").replace(/\.[^.]+$/i, "");
  var parts = base.split("_");
  if (parts.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null;
  if (/^bank$/i.test(parts[1]) || /^kas[-_]?kecil$/i.test(String(parts[1] || "").replace(/\s+/g, ""))) {
    return null;
  }
  var amount = parts[parts.length - 1];
  if (!/^\d+$/.test(amount)) return null;
  return {
    tanggal: parts[0],
    entityLabel: normalizeEntityLabel_(parts[1]),
    amount: amount
  };
}

function hubRowMatchesLegacyParts_(ss, tabName, legacy) {
  var sh = ss.getSheetByName(tabName);
  if (!sh) return false;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers = data[0];
  var tanggalCol = findHeaderColumnIndex_(headers, /tanggal pengeluaran/i);
  var entCol = findHeaderColumnIndex_(headers, /entitas pengeluaran/i);
  var amtCol = findHeaderColumnIndex_(headers, /jumlah pengeluaran|jumlah uang|jumlah\s*\(rp\)/i);
  var r;
  for (r = 1; r < data.length; r++) {
    var ent = entCol >= 0 ? String(data[r][entCol] || "").trim() : "";
    if (normalizeText_(ent) !== normalizeText_(legacy.entityLabel)) continue;
    var tanggal = tanggalCol >= 0 ? normalizeDateCell_(data[r][tanggalCol]) : "";
    if (tanggal && tanggal !== legacy.tanggal) continue;
    var amtRaw = amtCol >= 0 ? data[r][amtCol] : "";
    if (!amountsRoughlyMatch_(amtRaw, legacy.amount)) continue;
    return true;
  }
  return false;
}

function normalizeDateCell_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Jakarta", "yyyy-MM-dd");
  }
  var s = String(val || "").trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  return s;
}

function amountsRoughlyMatch_(sheetVal, fileAmount) {
  var digitsSheet = String(sheetVal ?? "").replace(/[^\d]/g, "");
  var digitsFile = String(fileAmount ?? "").replace(/[^\d]/g, "");
  if (!digitsFile) return false;
  if (digitsSheet === digitsFile) return true;
  if (digitsSheet.slice(-digitsFile.length) === digitsFile) return true;
  return false;
}

function normalizeJenisFromFolderName_(name) {
  var n = normalizeText_(name);
  if (/kas kecil|kas_kecil|kaskecil/.test(n)) return "Kas Kecil";
  if (/kas besar|kas_besar|bank/.test(n)) return "Bank";
  return "";
}

function parseEntityFromFileName_(fileName) {
  var web = parseWebAppUploadFileName_(fileName);
  if (web && web.entityLabel) return web.entityLabel;
  var s = String(fileName);
  var std = s.match(/^\d{4}-\d{2}-\d{2}_([^_]+)_/i);
  if (std) return std[1];
  var dash = s.match(/\s-\s(GBC|Kediri|MJL|BKT|CV Anugerah|CV Lembayung)\s-/i);
  if (dash) return dash[1];
  var m = s.match(/(?:^|[-_\s])(GBC|Kediri|MJL|BKT|CV Anugerah|CV Lembayung)(?:[-_\s]|$)/i);
  return m ? m[1] : "";
}

function parseJenisFromFileName_(fileName) {
  var s = String(fileName);
  if (/^Bank_/i.test(s) || /[-\s]Bank[-\s]/i.test(s)) return "Bank";
  if (/Kas Kecil/i.test(s) || /^KAS KECIL/i.test(s)) return "Kas Kecil";
  if (/KAS BESAR/i.test(s)) return "Bank";
  return "";
}

// ——— Inbox (opsional) ———

function copyAllFromFormInbox() {
  if (!MULTI_DRIVE_CONFIG.FORM_INBOX_FOLDER_ID) return;
  var inbox = DriveApp.getFolderById(MULTI_DRIVE_CONFIG.FORM_INBOX_FOLDER_ID);
  var files = inbox.getFiles();
  var ok = 0;
  var fail = 0;
  while (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_APPS_SCRIPT) continue;
    var parsed = parseWebAppStyleFileName_(file.getName());
    if (!parsed) {
      fail++;
      continue;
    }
    try {
      copyInboxFileToSharedAndEntity_(file, parsed);
      ok++;
    } catch (e) {
      fail++;
      Logger.log(file.getName() + ": " + e);
    }
  }
  toastMultiDrive_("Inbox: OK=" + ok + " fail=" + fail, "GBC Multi Drive", 8);
}

function parseWebAppStyleFileName_(fileName) {
  var extMatch = String(fileName).match(/(\.[^.]+)$/);
  var ext = extMatch ? extMatch[1] : "";
  var base = String(fileName).slice(0, fileName.length - ext.length).replace(/_(\d+)$/, "");
  var mNew = base.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)_(\d+)$/);
  if (mNew) {
    return {
      entity: mNew[2],
      tanggalRaw: mNew[1],
      namaTransaksi: mNew[3],
      amountRaw: mNew[4],
      jenisLabel: "Bank",
      archiveKas: "KAS BESAR"
    };
  }
  var parts = base.split("_");
  if (parts.length < 5) return null;
  var jenis = parts[0].trim();
  var tanggalRaw = parts[1].trim();
  var entitas = parts[2].trim();
  var jenisLabel = normalizeJenisFromFolderName_(jenis) || (normalizeText_(jenis).indexOf("bank") >= 0 ? "Bank" : "Kas Kecil");
  return {
    entity: entitas,
    tanggalRaw: tanggalRaw,
    namaTransaksi: parts.slice(3, -1).join("_") || parts[3],
    amountRaw: "0",
    jenisLabel: jenisLabel,
    archiveKas: jenisLabel === "Bank" ? "KAS BESAR" : "KAS KECIL"
  };
}

function copyInboxFileToSharedAndEntity_(file, parsed) {
  var route = matchEntityRoute_(parsed.entity);
  if (!route) throw new Error("Entitas tidak dikenali");
  var built = buildBuktiFileName_(
    parsed.tanggalRaw,
    parsed.entity,
    parsed.namaTransaksi || "bukti",
    parsed.amountRaw || "0",
    file
  );
  var sharedFolder = resolveSharedArchiveFolder_(parsed.entity, parsed.archiveKas, parsed.tanggalRaw);
  var sharedName = uniqueNameInFolder_(sharedFolder, built);
  if (!wasCopiedBefore_(file.getId(), MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId())) {
    file.makeCopy(sharedName, sharedFolder);
    markCopyDone_(file.getId(), MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId(), "inbox");
  }
  var rootId = effectiveDriveRootId_(route);
  if (rootId) {
    var entityFolder = resolveEntityDriveFolder_(route, parsed.jenisLabel, rootId);
    if (!wasCopiedBefore_(file.getId(), rootId, entityFolder.getId())) {
      file.makeCopy(uniqueNameInFolder_(entityFolder, built), entityFolder);
      markCopyDone_(file.getId(), rootId, entityFolder.getId(), "inbox");
    }
  }
}

// ——— Folder resolution ———

function resolveSharedArchiveFolder_(entity, archiveKasFolderName, tanggalRaw) {
  var root = DriveApp.getFolderById(MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID);
  var entityFolderName = sharedEntityFolderName_(entity);
  var entityFolder = getOrCreateSubfolder_(root, entityFolderName);
  var kasFolder = findChildFolderByNames_(entityFolder, [archiveKasFolderName, jenisFolderLabel_(archiveKasFolderName)], MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS);
  if (!kasFolder) kasFolder = getOrCreateSubfolder_(entityFolder, archiveKasFolderName);
  if (!MULTI_DRIVE_CONFIG.CREATE_MONTH_FOLDER_IN_SHARED) return kasFolder;
  return getOrCreateSubfolder_(kasFolder, monthFolderName_(tanggalRaw));
}

function effectiveDriveRootId_(route) {
  if (!route) return "";
  if (route.useAnugerahConfigVar) return String(CV_ANUGERAH_DRIVE_ROOT_ID || "").trim();
  return String(route.driveRootId || "").trim();
}

function resolveEntityDriveFolder_(route, jenisLabel, driveRootId) {
  var rootId = driveRootId || effectiveDriveRootId_(route);
  var root = DriveApp.getFolderById(rootId);
  var buktiRoot = findChildFolderByNames_(root, [route.buktiRootName], MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS);
  if (!buktiRoot && MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS) {
    buktiRoot = getOrCreateSubfolder_(root, route.buktiRootName);
  }
  if (!buktiRoot) throw new Error("Folder tidak ditemukan: " + route.buktiRootName);

  var parent = buktiRoot;
  if (route.layout === "gbc_kediri") {
    parent = findChildFolderByNames_(buktiRoot, [route.entitySubfolder], MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS);
    if (!parent && MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS) {
      parent = getOrCreateSubfolder_(buktiRoot, route.entitySubfolder);
    }
    if (!parent) throw new Error("Subfolder entitas tidak ditemukan: " + route.entitySubfolder);
  }

  var jenisNames = jenisLabel === "Bank"
    ? ["Bank", "KAS BESAR", "Kas Besar"]
    : ["Kas Kecil", "KAS KECIL"];
  var jenisFolder = findChildFolderByNames_(parent, jenisNames, MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS);
  if (!jenisFolder && MULTI_DRIVE_CONFIG.CREATE_ENTITY_SUBFOLDERS) {
    jenisFolder = getOrCreateSubfolder_(parent, jenisLabel);
  }
  if (!jenisFolder) throw new Error("Folder jenis tidak ditemukan: " + jenisLabel);
  return jenisFolder;
}

function matchEntityRoute_(entityRaw) {
  var n = normalizeText_(entityRaw);
  if (!n) return null;
  for (var i = 0; i < ENTITY_DRIVE_ROUTES.length; i++) {
    var route = ENTITY_DRIVE_ROUTES[i];
    for (var k = 0; k < route.entityKeys.length; k++) {
      var key = route.entityKeys[k];
      if (n === key || n.indexOf(key) >= 0 || key.indexOf(n) >= 0) {
        return route;
      }
    }
  }
  return null;
}

function sharedEntityFolderName_(entity) {
  var raw = String(entity || "").trim();
  var key = raw.toUpperCase();
  if (SHARED_ENTITY_ALIASES[key]) return SHARED_ENTITY_ALIASES[key];
  if (SHARED_ENTITY_ALIASES[raw]) return SHARED_ENTITY_ALIASES[raw];
  return SHARED_ENTITY_FOLDER_PREFIX + (raw || "LAINNYA").toUpperCase();
}

function jenisFolderLabel_(kasType) {
  return kasType === "KAS BESAR" || normalizeText_(kasType).indexOf("besar") >= 0 || normalizeText_(kasType) === "bank"
    ? "Bank"
    : "Kas Kecil";
}

function archiveKasFolderName_(kasType) {
  return kasType === "KAS BESAR" ? "KAS BESAR" : "KAS KECIL";
}

function findChildFolderByNames_(parent, names, createIfMissing) {
  for (var i = 0; i < names.length; i++) {
    var it = parent.getFoldersByName(names[i]);
    if (it.hasNext()) return it.next();
  }
  if (createIfMissing && names.length) return getOrCreateSubfolder_(parent, names[0]);
  return null;
}

// ——— Copy tracking ———

function loadCopyMap_() {
  if (!MULTI_DRIVE_CONFIG.TRACK_COPIES_IN_PROPERTIES) return {};
  var raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_COPY_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveCopyMap_(map) {
  if (!MULTI_DRIVE_CONFIG.TRACK_COPIES_IN_PROPERTIES) return;
  PropertiesService.getScriptProperties().setProperty(PROCESSED_COPY_KEY, JSON.stringify(map));
}

function copyTrackKey_(sourceId, driveRootId, destFolderId) {
  return sourceId + "|" + driveRootId + "|" + destFolderId;
}

function wasCopiedBefore_(sourceId, driveRootId, destFolderId) {
  var map = loadCopyMap_();
  return Boolean(map[copyTrackKey_(sourceId, driveRootId, destFolderId)]);
}

function markCopyDone_(sourceId, driveRootId, destFolderId, copyId) {
  var map = loadCopyMap_();
  map[copyTrackKey_(sourceId, driveRootId, destFolderId)] = copyId || new Date().toISOString();
  saveCopyMap_(map);
}

// ——— Shared helpers (selaras organize-bukti) ———

function getSheetConfig_(kasType) {
  if (kasType === "KAS BESAR") {
    return { spreadsheetId: RESPONSE_SHEET_KAS_BESAR_ID, gid: RESPONSE_SHEET_KAS_BESAR_GID };
  }
  return { spreadsheetId: RESPONSE_SHEET_KAS_KECIL_ID, gid: RESPONSE_SHEET_KAS_KECIL_GID };
}

function getResponseSpreadsheet_(kasType) {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(getSheetConfig_(kasType).spreadsheetId);
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
  return getResponseSheetByGid_(getResponseSpreadsheet_(kasType), cfg.gid);
}

function buildEventFromSheetRow_(sheet, row) {
  if (!sheet || row < 2) return null;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, row, lastCol).getValues()[0];
  var namedValues = {};
  headers.forEach(function (h, idx) {
    var key = String(h || "").trim();
    if (!key) return;
    namedValues[key] = [values[idx] != null ? String(values[idx]) : ""];
  });
  return { namedValues: namedValues, range: sheet.getRange(row, 1, row, lastCol) };
}

function buildEventFromLastRow_(kasType) {
  var sh = getResponseSheet_(kasType);
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

function parseSubmitPayload_(e) {
  var payload = {
    fileIds: [],
    entity: "",
    category: "",
    namaTransaksi: "",
    tanggalRaw: "",
    amountRaw: "",
    uploadedAt: new Date()
  };
  if (e.response) {
    payload.uploadedAt = e.response.getTimestamp();
    e.response.getItemResponses().forEach(function (ir) {
      applyFieldFromTitle_(payload, ir.getItem().getTitle(), ir.getResponse());
      try {
        if (ir.getItem().getType() === FormApp.ItemType.FILE_UPLOAD) {
          pushFileIds_(payload.fileIds, ir.getResponse());
        }
      } catch (err) {}
    });
    return payload;
  }
  var named = e.namedValues || {};
  Object.keys(named).forEach(function (key) {
    applyFieldFromTitle_(payload, key, named[key].join(", "));
  });
  if (named.Timestamp && named.Timestamp[0]) {
    var ts = new Date(String(named.Timestamp[0]));
    if (!isNaN(ts.getTime())) payload.uploadedAt = ts;
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
  if (/jumlah pengeluaran|jumlah uang|\bjumlah\b.*\(rp\)/i.test(t)) payload.amountRaw = text;
  if (/bukti transaksi/i.test(t)) pushFileIds_(payload.fileIds, val);
  if (/drive\.google\.com/i.test(String(val))) pushFileIds_(payload.fileIds, val);
}

function enrichPayloadFromSheetRow_(e, payload) {
  if (!e.range || !payload) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, row, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "");
    var v = values[c] != null ? String(values[c]) : "";
    applyFieldFromTitle_(payload, h, v);
  }
}

function enrichFileIdsFromSheetRow_(e, fileIds) {
  if (!e.range) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (!/bukti transaksi/i.test(String(headers[c]))) continue;
    var cell = sheet.getRange(row, c + 1);
    pushFileIds_(fileIds, cell.getValue());
    pushFileIds_(fileIds, cell.getDisplayValue());
  }
}

function cellText_(val) {
  if (val == null) return "";
  if (Array.isArray(val)) return String(val[0] || "").trim();
  return String(val).trim();
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

function extractDriveFileId_(s) {
  s = String(s || "").trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && s.indexOf("http") !== 0) return s;
  var patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (var i = 0; i < patterns.length; i++) {
    var m = s.match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  return null;
}

function updateBuktiCellInSheet_(e, fileId, displayName) {
  if (!e.range || !fileId) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var url = "https://drive.google.com/file/d/" + fileId + "/view";
  for (var c = 0; c < headers.length; c++) {
    if (!/bukti transaksi/i.test(String(headers[c]))) continue;
    sheet.getRange(row, c + 1).setValue(url);
    sheet.getRange(row, c + 1).setNote("Nama file: " + String(displayName).slice(0, 120));
    return;
  }
}

function normalizeText_(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
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
    var yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return new Date(yr, Number(m[2]) - 1, Number(m[1]));
  }
  var parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatUploadStamp_(date) {
  var tz = Session.getScriptTimeZone() || "Asia/Jakarta";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd_HHmmss");
}

function sanitizeUnderscorePart_(value, maxLen) {
  maxLen = maxLen || 80;
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, maxLen)
    .trim() || "Tidak-diisi";
}

function normalizeAmountForFile_(raw) {
  var s = String(raw || "").trim();
  if (!s) return "0";
  var n = Number(
    s
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );
  if (isFinite(n)) return String(Math.round(Math.abs(n)));
  var digits = s.replace(/[^\d]/g, "");
  return digits || "0";
}

function formatTanggalForFileName_(tanggalRaw) {
  var d = parseDateId_(tanggalRaw);
  if (!d || isNaN(d.getTime())) return sanitizeUnderscorePart_(tanggalRaw || "Tanpa-Tanggal", 20);
  var y = d.getFullYear();
  var m = ("0" + (d.getMonth() + 1)).slice(-2);
  var day = ("0" + d.getDate()).slice(-2);
  return y + "-" + m + "-" + day;
}

/** Format: tanggal_entitas_namaTransaksi_jumlah.ext */
function buildBuktiFileName_(tanggalRaw, entity, namaTransaksi, amountRaw, file) {
  var origName = file.getName();
  var dot = origName.lastIndexOf(".");
  var ext = dot > 0 ? origName.slice(dot) : "";
  return [
    formatTanggalForFileName_(tanggalRaw),
    sanitizeUnderscorePart_(entity, 40),
    sanitizeUnderscorePart_(namaTransaksi, 80),
    normalizeAmountForFile_(amountRaw)
  ].join("_") + ext;
}

function parseFileMetaForRename_(fileName, pathParsed) {
  var s = String(fileName || "");
  var extMatch = s.match(/(\.[^.]+)$/);
  var base = extMatch ? s.slice(0, s.length - extMatch[1].length) : s;
  base = base.replace(/_\(\d+\)$/, "").replace(/_(\d+)$/, function (m, n) {
    return Number(n) <= 5 ? "" : m;
  });

  var mNew = base.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_([^_]+)_(\d+)$/);
  if (mNew) {
    return {
      tanggalRaw: mNew[1],
      entity: mNew[2],
      namaTransaksi: mNew[3],
      amountRaw: mNew[4]
    };
  }

  var dashParts = base.split(/\s-\s/);
  if (dashParts.length >= 4) {
    var d0 = dashParts[0].match(/(\d{4}-\d{2}-\d{2})/);
    return {
      tanggalRaw: d0 ? d0[1] : dashParts[0],
      entity: dashParts[1],
      namaTransaksi: dashParts[dashParts.length - 1],
      amountRaw: "0"
    };
  }

  var parts = base.split("_");
  if (parts.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
    return {
      tanggalRaw: parts[1],
      entity: parts[2],
      namaTransaksi: parts.slice(3, -1).join("_") || parts[3],
      amountRaw: "0"
    };
  }

  if (pathParsed && pathParsed.entityLabel) {
    return {
      tanggalRaw: "",
      entity: pathParsed.entityLabel,
      namaTransaksi: base,
      amountRaw: "0"
    };
  }
  return null;
}

function entityCopyFileName_(file, pathParsed, entityFolder) {
  var meta = parseFileMetaForRename_(file.getName(), pathParsed);
  if (!meta) return uniqueNameInFolder_(entityFolder, file.getName());
  var built = buildBuktiFileName_(
    meta.tanggalRaw,
    meta.entity,
    meta.namaTransaksi,
    meta.amountRaw,
    file
  );
  return uniqueNameInFolder_(entityFolder, built);
}

function appendFileIndex_(fileName, index) {
  if (index <= 1) return fileName;
  var dot = fileName.lastIndexOf(".");
  if (dot > 0) return fileName.slice(0, dot) + " (" + index + ")" + fileName.slice(dot);
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

function logMultiDrive_(status, message, detail, kasType) {
  Logger.log(status + ": " + message + (detail ? " | " + detail : ""));
  try {
    var ss = kasType ? getResponseSpreadsheet_(kasType) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sh = ss.getSheetByName(MULTI_DRIVE_CONFIG.LOG_SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(MULTI_DRIVE_CONFIG.LOG_SHEET_NAME);
      sh.appendRow(["Waktu", "Status", "Pesan", "Detail"]);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), status, message, detail || ""]);
  } catch (err) {
    Logger.log("Log sheet gagal: " + err);
  }
}
