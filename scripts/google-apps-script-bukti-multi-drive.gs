/**
 * GBC — Salin bukti Google Form ke folder shared + Drive per entitas (bukan pindah).
 *
 * Alur:
 * 1. File upload form (atau inbox lama) → SALIN ke arsip shared (tetap utuh di shared).
 * 2. SALIN lagi ke Drive entitas sesuai entitas + jenis (Bank / Kas Kecil).
 *
 * Shared arsip: https://drive.google.com/drive/folders/1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy
 * Inbox form (legacy OAuth): 1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM
 *
 * PASANG:
 * - Bound ke spreadsheet respons Form Kas Kecil / Kas Besar (satu project, dua trigger),
 *   ATAU standalone + isi RESPONSE_SHEET_* di bawah.
 * - Trigger: From spreadsheet → On form submit → onFormSubmitKasKecil / onFormSubmitKasBesar
 * - Matikan trigger lama `google-apps-script-organize-bukti.gs` jika masih memindahkan (moveTo).
 *
 * Backfill file yang sudah ada di shared: menu → "Salin dari shared ke drive entitas"
 *
 * Manifest: butuh scope https://www.googleapis.com/auth/spreadsheets (openById untuk debug dari editor).
 */

var MULTI_DRIVE_CONFIG = {
  /** Folder arsip pusat (file tetap di sini; entitas dapat salinan) */
  SHARED_ARCHIVE_ROOT_ID: "1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy",
  /** Opsional: salin dari inbox (GForm default / OAuth) — tidak memindahkan */
  FORM_INBOX_FOLDER_ID: "1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM",
  PROCESS_FORM_INBOX: false,
  /** Buat subfolder bulan di shared (selaras organize-bukti) */
  CREATE_MONTH_FOLDER_IN_SHARED: true,
  /** Buat subfolder yang belum ada di drive entitas (GBC/Kediri/MJL/…) */
  CREATE_ENTITY_SUBFOLDERS: true,
  TRACK_COPIES_IN_PROPERTIES: true,
  LOG_SHEET_NAME: "_GBC_MultiDrive_Log"
};

/** Isi saat folder CV Anugerah sudah siap (kosong = lewati salinan ke drive Anugerah) */
var CV_ANUGERAH_DRIVE_ROOT_ID = "";

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

// ——— Menu ———

function onOpenMultiDriveBuktiMenu() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Multi Drive Bukti")
    .addItem("Salin dari shared → drive entitas (semua file)", "distributeAllFromSharedArchive")
    .addItem("Salin inbox form → shared + entitas", "copyAllFromFormInbox")
    .addSeparator()
    .addItem("Debug: baris terakhir Kas Kecil", "debugMultiDriveLastRowKecil")
    .addItem("Debug: baris terakhir Kas Besar", "debugMultiDriveLastRowBesar")
    .addItem("Pasang trigger jam (shared → entitas)", "installMultiDriveHourlyTrigger")
    .addItem("Hapus trigger jam", "removeMultiDriveHourlyTriggers")
    .addToUi();
}

/** Jika digabung dengan script lain, panggil onOpenMultiDriveBuktiMenu() dari onOpen Anda. */

function installMultiDriveHourlyTrigger() {
  removeMultiDriveHourlyTriggers();
  ScriptApp.newTrigger("distributeAllFromSharedArchive").timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast("Trigger hourly: shared → drive entitas aktif.", "GBC Multi Drive", 5);
}

function removeMultiDriveHourlyTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "distributeAllFromSharedArchive") {
      ScriptApp.deleteTrigger(t);
    }
  });
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
        payload.uploadedAt,
        payload.entity,
        payload.category,
        payload.namaTransaksi,
        source
      );
      if (payload.fileIds.length > 1) fileName = appendFileIndex_(fileName, index + 1);

      var sharedFolder = resolveSharedArchiveFolder_(payload.entity, archiveKasFolderName, payload.tanggalRaw);
      var sharedName = uniqueNameInFolder_(sharedFolder, fileName);
      var sharedCopy = source.makeCopy(sharedName, sharedFolder);
      markCopyDone_(sourceId, MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId(), sharedCopy.getId());

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
        payload.uploadedAt,
        payload.entity,
        payload.category,
        payload.namaTransaksi,
        DriveApp.getFileById(firstId)
      );
      updateBuktiCellInSheet_(e, firstId, displayName);
    } catch (ignore) {}
  }

  logMultiDrive_("OK", copied + " file → shared + drive entitas", payload.entity + " | " + jenisLabel, kasType);
  return copied > 0;
}

// ——— Backfill shared → entity drives ———

function distributeAllFromSharedArchive() {
  var root = DriveApp.getFolderById(MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID);
  var stats = { ok: 0, skip: 0, fail: 0, errors: [] };
  walkSharedArchive_(root, [], stats);
  var msg = "Shared→entitas: OK=" + stats.ok + " skip=" + stats.skip + " fail=" + stats.fail;
  Logger.log(msg);
  if (stats.errors.length) Logger.log(stats.errors.join("\n"));
  try {
    SpreadsheetApp.getActive().toast(msg, "GBC Multi Drive", 8);
  } catch (e) {}
  return stats;
}

function walkSharedArchive_(folder, pathNames, stats) {
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    walkSharedArchive_(sub, pathNames.concat([sub.getName()]), stats);
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
  var parsed = inferFromArchivePath_(pathNames, file.getName());
  if (!parsed) {
    stats.skip++;
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
    return;
  }
  var destName = uniqueNameInFolder_(entityFolder, file.getName());
  var copy = file.makeCopy(destName, entityFolder);
  markCopyDone_(sourceId, rootId, entityFolder.getId(), copy.getId());
  stats.ok++;
}

function inferFromArchivePath_(pathNames, fileName) {
  var entityLabel = "";
  var jenisLabel = "";
  var i;
  for (i = 0; i < pathNames.length; i++) {
    var p = pathNames[i];
    if (/^BUKTI PENGELUARAN/i.test(p) || /^bukti pengeluaran/i.test(p)) {
      entityLabel = p.replace(/^BUKTI PENGELUARAN\s+/i, "").replace(/^bukti pengeluaran\s+/i, "");
      if (/^gbc$/i.test(entityLabel)) entityLabel = "GBC";
      if (/^kediri$/i.test(entityLabel)) entityLabel = "Kediri";
      if (/cv anugrah/i.test(entityLabel)) entityLabel = "CV Anugerah";
      if (/cv lembayung/i.test(entityLabel)) entityLabel = "CV Lembayung";
      if (/^mjl$/i.test(entityLabel)) entityLabel = "MJL";
      if (/^bkt$/i.test(entityLabel)) entityLabel = "BKT";
    }
    var j = normalizeJenisFromFolderName_(p);
    if (j) jenisLabel = j;
  }
  if (!entityLabel) {
    var fromName = parseEntityFromFileName_(fileName);
    if (fromName) entityLabel = fromName;
  }
  if (!jenisLabel) {
    var j2 = parseJenisFromFileName_(fileName);
    if (j2) jenisLabel = j2;
  }
  if (!entityLabel || !jenisLabel) return null;
  return { entityLabel: entityLabel, jenisLabel: jenisLabel };
}

function normalizeJenisFromFolderName_(name) {
  var n = normalizeText_(name);
  if (/kas kecil|kas_kecil|kaskecil/.test(n)) return "Kas Kecil";
  if (/kas besar|kas_besar|bank/.test(n)) return "Bank";
  return "";
}

function parseEntityFromFileName_(fileName) {
  var m = String(fileName).match(/(?:^|[-_\s])(GBC|Kediri|MJL|BKT|CV Anugerah|CV Lembayung)(?:[-_\s]|$)/i);
  return m ? m[1] : "";
}

function parseJenisFromFileName_(fileName) {
  if (/^Bank_/i.test(fileName) || /[-\s]Bank[-\s]/i.test(fileName)) return "Bank";
  if (/Kas Kecil/i.test(fileName) || /^KAS KECIL/i.test(fileName)) return "Kas Kecil";
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
  SpreadsheetApp.getActive().toast("Inbox: OK=" + ok + " fail=" + fail, "GBC Multi Drive", 8);
}

function parseWebAppStyleFileName_(fileName) {
  var extMatch = String(fileName).match(/(\.[^.]+)$/);
  var ext = extMatch ? extMatch[1] : "";
  var base = String(fileName).slice(0, fileName.length - ext.length).replace(/_(\d+)$/, "");
  var parts = base.split("_");
  if (parts.length < 5) return null;
  var jenis = parts[0].trim();
  var tanggalRaw = parts[1].trim();
  var entitas = parts[2].trim();
  var jenisLabel = normalizeJenisFromFolderName_(jenis) || (normalizeText_(jenis).indexOf("bank") >= 0 ? "Bank" : "Kas Kecil");
  return {
    entity: entitas,
    tanggalRaw: tanggalRaw,
    jenisLabel: jenisLabel,
    archiveKas: jenisLabel === "Bank" ? "KAS BESAR" : "KAS KECIL",
    uploadedAt: new Date()
  };
}

function copyInboxFileToSharedAndEntity_(file, parsed) {
  var route = matchEntityRoute_(parsed.entity);
  if (!route) throw new Error("Entitas tidak dikenali");
  var sharedFolder = resolveSharedArchiveFolder_(parsed.entity, parsed.archiveKas, parsed.tanggalRaw);
  var sharedName = uniqueNameInFolder_(sharedFolder, file.getName());
  if (!wasCopiedBefore_(file.getId(), MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId())) {
    file.makeCopy(sharedName, sharedFolder);
    markCopyDone_(file.getId(), MULTI_DRIVE_CONFIG.SHARED_ARCHIVE_ROOT_ID, sharedFolder.getId(), "inbox");
  }
  var rootId = effectiveDriveRootId_(route);
  if (rootId) {
    var entityFolder = resolveEntityDriveFolder_(route, parsed.jenisLabel, rootId);
    if (!wasCopiedBefore_(file.getId(), rootId, entityFolder.getId())) {
      file.makeCopy(uniqueNameInFolder_(entityFolder, file.getName()), entityFolder);
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
  if (/bukti transaksi/i.test(t)) pushFileIds_(payload.fileIds, val);
  if (/drive\.google\.com/i.test(String(val))) pushFileIds_(payload.fileIds, val);
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
  return [stamp, sanitizeFileNamePart_(entity, 40), sanitizeFileNamePart_(category, 70), sanitizeFileNamePart_(namaTransaksi, 70)].join(" - ") + ext;
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
