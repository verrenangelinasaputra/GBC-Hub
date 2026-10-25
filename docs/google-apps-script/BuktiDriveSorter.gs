/**
 * GBC — Sortir bukti dari folder inbox ke struktur arsip entitas / jenis kas / bulan.
 *
 * Format nama file (dari web app):
 *   Jenis_TanggalPengeluaran_Entitas_Kategori_Nama PIC.ext
 *   (tanggal = field "Tanggal Pengeluaran" di form, bukan waktu upload)
 *   Jenis = "Bank" | "Kas Kecil"
 *   Contoh: Bank_2026-03-15_GBC_Beban Listrik_Budi Santoso.pdf
 *
 * Struktur tujuan (di bawah ROOT_ARCHIVE_FOLDER_ID):
 *   bukti pengeluaran {Entitas} / Bank|Kas Kecil / 03 - Maret 2026 / file
 */

const CONFIG = {
  /** Folder staging — upload OAuth / drop manual */
  INBOX_FOLDER_ID: "1MQK5uTPlCByC6a7gMmYQJsDCU88sXfNM",
  /** Root arsip (berisi folder bukti pengeluaran …) */
  ROOT_ARCHIVE_FOLDER_ID: "1notJAqUCTWvfSn_Hy5C3uXcp86MdJNEy",
  /** true = pindah dari inbox; false = salin (inbox tetap) */
  MOVE_FROM_INBOX: true,
  /** Lewati file yang namanya sudah pernah diproses (ID disimpan di Properties) */
  TRACK_PROCESSED_IDS: true,
  /** Buat subfolder bulan jika belum ada (format 03 - Maret 2026) */
  CREATE_MONTH_FOLDER_IF_MISSING: false
};

/** Map token entitas (dari nama file) → nama folder entitas di Drive */
const ENTITY_ROOT_FOLDERS = [
  { keys: ["bkt", "bersama karunia", "karunia terang", "pt bkt"], folder: "bukti pengeluaran BKT" },
  {
    keys: ["cv anugrah", "anugrah", "aim", "cv anugerah impian"],
    folder: "bukti pengeluaran CV Anugrah"
  },
  { keys: ["gbc"], folder: "bukti pengeluaran GBC" },
  { keys: ["kediri", "kdr"], folder: "bukti pengeluaran Kediri" },
  { keys: ["mjl", "mata jendela", "jendela langit"], folder: "bukti pengeluaran MJL" }
];

const JENIS_BANK_ALIASES = ["bank", "kas besar", "kas_besar"];
const JENIS_KECIL_ALIASES = ["kas kecil", "kas_kecil", "kaskecil"];

const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

const PROCESSED_KEY = "BUktiSorter_PROCESSED_IDS_V1";

// ——— Menu ———

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Bukti Drive")
    .addItem("Sortir file dari inbox", "sortBuktiFromInbox")
    .addItem("Pasang trigger jam (inbox)", "installHourlyTrigger")
    .addItem("Hapus trigger jam", "removeHourlyTriggers")
    .addToUi();
  try {
    if (typeof onOpenWeeklyRecapMenu === "function") onOpenWeeklyRecapMenu();
  } catch (e) {
    /* WeeklyRecapEmail.gs belum dipasang */
  }
}

function installHourlyTrigger() {
  removeHourlyTriggers();
  ScriptApp.newTrigger("sortBuktiFromInbox").timeBased().everyHours(1).create();
  SpreadsheetApp.getActive()?.toast("Trigger setiap 1 jam aktif.", "GBC Bukti Drive", 5);
}

function removeHourlyTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sortBuktiFromInbox") ScriptApp.deleteTrigger(t);
  });
}

// ——— Entry ———

function sortBuktiFromInbox() {
  const inbox = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
  const archiveRoot = DriveApp.getFolderById(CONFIG.ROOT_ARCHIVE_FOLDER_ID);
  const processed = loadProcessedIds_();
  const files = inbox.getFiles();
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const errors = [];

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_APPS_SCRIPT) continue;
    const id = file.getId();
    if (CONFIG.TRACK_PROCESSED_IDS && processed[id]) {
      skip++;
      continue;
    }

    const parsed = parseBuktiFileName_(file.getName());
    if (parsed.error) {
      fail++;
      errors.push(file.getName() + ": " + parsed.error);
      continue;
    }

    try {
      const destFolder = resolveDestinationFolder_(archiveRoot, parsed);
      if (!destFolder) {
        fail++;
        errors.push(file.getName() + ": folder tujuan tidak ditemukan (entitas/jenis/bulan).");
        continue;
      }

      const destName = uniqueNameInFolder_(destFolder, file.getName());
      if (CONFIG.MOVE_FROM_INBOX) {
        relocateFileToFolder_(file, destFolder, destName);
      } else {
        file.makeCopy(destName, destFolder);
      }

      processed[id] = new Date().toISOString();
      ok++;
    } catch (e) {
      fail++;
      errors.push(file.getName() + ": " + e.message);
    }
  }

  if (CONFIG.TRACK_PROCESSED_IDS) saveProcessedIds_(processed);

  const summary = "Selesai. Berhasil: " + ok + ", dilewati: " + skip + ", gagal: " + fail;
  Logger.log(summary);
  if (errors.length) Logger.log(errors.join("\n"));
  try {
    SpreadsheetApp.getActive()?.toast(summary, "GBC Bukti Drive", 8);
  } catch (_) {
    /* standalone script */
  }
  return { ok, skip, fail, errors };
}

// ——— Parse nama file ———

function parseBuktiFileName_(fileName) {
  const extMatch = String(fileName).match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  let base = String(fileName).slice(0, fileName.length - ext.length);
  base = base.replace(/_(\d+)$/, ""); // _2 untuk file ke-2

  const parts = base.split("_");
  if (parts.length < 5) {
    return { error: "Butuh minimal 5 bagian: Jenis_Tanggal_Entitas_Kategori_PIC" };
  }

  const jenis = parts[0].trim();
  const tanggalRaw = parts[1].trim();
  const entitas = parts[2].trim();
  const pic = parts[parts.length - 1].trim();
  const kategori = parts.slice(3, -1).join("_").trim();

  const tanggal = parseTanggal_(tanggalRaw);
  if (!tanggal) {
    return { error: "Tanggal tidak dikenali: " + tanggalRaw };
  }

  const entityFolderName = matchEntityFolder_(entitas);
  if (!entityFolderName) {
    return { error: "Entitas tidak cocok folder arsip: " + entitas };
  }

  const jenisKind = normalizeJenis_(jenis);
  if (!jenisKind) {
    return { error: "Jenis kas tidak dikenali (harus Bank atau Kas Kecil): " + jenis };
  }

  return {
    jenis,
    jenisKind,
    tanggal,
    tanggalRaw,
    entitas,
    kategori,
    pic,
    ext,
    entityFolderName
  };
}

function parseTanggal_(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

function normalize_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchEntityFolder_(entitasToken) {
  const n = normalize_(entitasToken);
  for (let i = 0; i < ENTITY_ROOT_FOLDERS.length; i++) {
    const def = ENTITY_ROOT_FOLDERS[i];
    for (let k = 0; k < def.keys.length; k++) {
      const key = def.keys[k];
      if (n === key || n.indexOf(key) >= 0 || key.indexOf(n) >= 0) return def.folder;
    }
  }
  return null;
}

function normalizeJenis_(jenis) {
  const j = normalize_(jenis);
  for (let i = 0; i < JENIS_BANK_ALIASES.length; i++) {
    if (j === JENIS_BANK_ALIASES[i] || j.indexOf(JENIS_BANK_ALIASES[i]) >= 0) return "bank";
  }
  for (let i = 0; i < JENIS_KECIL_ALIASES.length; i++) {
    if (j === JENIS_KECIL_ALIASES[i] || j.indexOf(JENIS_KECIL_ALIASES[i]) >= 0) return "kecil";
  }
  if (j === "bank") return "bank";
  return null;
}

// ——— Resolve folder ———

function resolveDestinationFolder_(archiveRoot, parsed) {
  const entityFolder = findChildFolderByName_(archiveRoot, parsed.entityFolderName, false);
  if (!entityFolder) return null;

  const jenisNames =
    parsed.jenisKind === "bank"
      ? ["Bank", "Kas Besar", "KAS BESAR", "kas besar"]
      : ["Kas Kecil", "KAS KECIL", "kas kecil"];

  const jenisFolder = findChildFolderByNames_(entityFolder, jenisNames, false);
  if (!jenisFolder) return null;

  const monthFolder = findMonthFolder_(jenisFolder, parsed.tanggal);
  if (monthFolder) return monthFolder;

  if (CONFIG.CREATE_MONTH_FOLDER_IF_MISSING) {
    const label = formatMonthFolderName_(parsed.tanggal);
    return jenisFolder.createFolder(label);
  }
  return null;
}

function formatMonthFolderName_(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const nama = BULAN_ID[date.getMonth()];
  return mm + " - " + nama + " " + yyyy;
}

function findMonthFolder_(parent, date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const prefix = mm + " -";
  const folders = parent.getFolders();
  let fuzzy = null;
  while (folders.hasNext()) {
    const f = folders.next();
    const name = f.getName();
    if (name.indexOf(prefix) === 0 && name.indexOf(String(yyyy)) >= 0) return f;
    if (name.indexOf(prefix) === 0 && !fuzzy) fuzzy = f;
  }
  return fuzzy;
}

function findChildFolderByName_(parent, exactName, create) {
  return findChildFolderByNames_(parent, [exactName], create);
}

function findChildFolderByNames_(parent, names, create) {
  const want = names.map(normalize_);
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    const n = normalize_(f.getName());
    for (let i = 0; i < want.length; i++) {
      if (n === want[i]) return f;
    }
  }
  if (create && names.length) return parent.createFolder(names[0]);
  return null;
}

/**
 * Pindahkan file ke folder lain. Butuh scope Drive penuh (lihat appsscript.json).
 * Fallback: salin + buang ke trash jika moveTo ditolak.
 */
function relocateFileToFolder_(file, destFolder, destName) {
  const name = destName || file.getName();
  try {
    const moved = file.moveTo(destFolder);
    if (name !== moved.getName()) moved.setName(name);
    return moved;
  } catch (e1) {
    const msg = String(e1.message || e1);
    if (msg.indexOf("auth/drive") >= 0 || msg.indexOf("moveTo") >= 0) {
      throw new Error(
        "Izin Drive belum lengkap. Aktifkan appsscript.json (scope drive), " +
          "jalankan ulang sortBuktiFromInbox, lalu setujui izin baru. " +
          "Detail: " +
          msg
      );
    }
    const copy = file.makeCopy(name, destFolder);
    try {
      file.setTrashed(true);
    } catch (e2) {
      /* salinan sudah ada di tujuan */
    }
    return copy;
  }
}

function uniqueNameInFolder_(folder, name) {
  if (!folder.getFilesByName(name).hasNext()) return name;
  const extMatch = name.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let n = 1;
  let candidate = base + " (" + n + ")" + ext;
  while (folder.getFilesByName(candidate).hasNext()) {
    n++;
    candidate = base + " (" + n + ")" + ext;
  }
  return candidate;
}

// ——— Processed IDs (append / idempotent) ———

function loadProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveProcessedIds_(map) {
  const keys = Object.keys(map);
  if (keys.length > 5000) {
    keys.sort();
    const trimmed = {};
    keys.slice(-4000).forEach(k => {
      trimmed[k] = map[k];
    });
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(trimmed));
  } else {
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(map));
  }
}

/** Uji parse tanpa memindahkan file */
function testParseFileName() {
  const samples = [
    "Bank_2026-03-15_GBC_Beban Listrik_Budi Santoso.pdf",
    "Kas Kecil_15/03/2026_Kediri_Beban ATK_Andi.pdf"
  ];
  samples.forEach(s => Logger.log(JSON.stringify(parseBuktiFileName_(s), null, 2)));
}
