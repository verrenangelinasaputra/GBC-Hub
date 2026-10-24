const { Readable } = require("stream");
const { google } = require("googleapis");
const {
  oauthClientConfigured,
  userDriveUploadConfigured,
  uploadBuktiFilesAsUser,
  userCanWriteFolder
} = require("./driveOAuth");

let driveApi = null;
let folderInspectCache = null;
const FOLDER_INSPECT_TTL_MS = Number(process.env.DRIVE_INSPECT_CACHE_MS || 300_000);

function parseServiceAccountCredentials_() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(String(raw).trim());
  } catch {
    return null;
  }
}

async function getServiceAccountDriveClient() {
  if (driveApi) return driveApi;
  const scopes = ["https://www.googleapis.com/auth/drive"];
  const credentials = parseServiceAccountCredentials_();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentials && !keyFile) {
    const err = new Error("Google credentials belum dikonfigurasi.");
    err.status = 503;
    throw err;
  }
  const auth = credentials
    ? new google.auth.GoogleAuth({ credentials, scopes })
    : new google.auth.GoogleAuth({ keyFile, scopes });
  driveApi = google.drive({ version: "v3", auth });
  return driveApi;
}

function uploadFolderId() {
  return String(process.env.GOOGLE_DRIVE_BUKTI_FOLDER_ID || "").trim();
}

function driveConfigured() {
  return Boolean(uploadFolderId());
}

function invalidateUploadFolderCache() {
  folderInspectCache = null;
}

/** Status upload terakhir (tanpa panggilan Google) — untuk mempercepat /api/me. */
function peekUploadFolderCache() {
  if (!folderInspectCache) return null;
  if (Date.now() - folderInspectCache.at >= FOLDER_INSPECT_TTL_MS) return null;
  return folderInspectCache.value;
}

async function inspectUploadFolder(force = false) {
  const folderId = uploadFolderId();
  if (!folderId) {
    return {
      ready: false,
      reason: "missing_env",
      hint: "Set GOOGLE_DRIVE_BUKTI_FOLDER_ID di .env (folder tujuan bukti).",
      oauthConnectUrl: null
    };
  }
  const now = Date.now();
  if (!force && folderInspectCache && now - folderInspectCache.at < FOLDER_INSPECT_TTL_MS) {
    return folderInspectCache.value;
  }

  let value;

  if (userDriveUploadConfigured()) {
    const ok = await userCanWriteFolder(folderId);
    value = ok
      ? {
          ready: true,
          reason: "oauth_user",
          folderName: folderId,
          hint: "Upload file dari form aktif (akun Google Anda via OAuth)."
        }
      : {
          ready: false,
          reason: "oauth_folder",
          hint:
            "OAuth sudah terhubung, tapi akun Google tidak bisa menulis ke folder ini. Pastikan folder milik akun yang sama saat login OAuth, atau pindahkan folder ke akun tersebut."
        };
  } else if (oauthClientConfigured()) {
    value = {
      ready: false,
      reason: "oauth_needed",
      hint:
        "Upload otomatis butuh hubungkan Google Drive sekali (super admin). Klik tombol di form atau buka menu hubungkan Drive.",
      oauthConnectUrl: "/api/oauth/drive/connect"
    };
  } else {
    try {
      const drive = await getServiceAccountDriveClient();
      const meta = await drive.files.get({
        fileId: folderId,
        fields: "id,name,driveId",
        supportsAllDrives: true
      });
      const name = meta.data.name || folderId;
      if (meta.data.driveId) {
        value = {
          ready: true,
          reason: "shared_drive",
          folderName: name,
          hint: "Upload file aktif (Shared drive + service account)."
        };
      } else {
        value = {
          ready: false,
          reason: "personal_drive",
          folderName: name,
          hint:
            "Folder Drive pribadi: set GOOGLE_OAUTH_CLIENT_ID/SECRET di .env lalu hubungkan Google Drive (super admin) untuk upload otomatis. Lihat docs/DRIVE_BUKTI_SETUP.md",
          oauthConnectUrl: null
        };
      }
    } catch {
      value = {
        ready: false,
        reason: "access",
        hint:
          "Folder tidak terbaca. Untuk upload otomatis Gmail: setup OAuth. Untuk sheet tetap: share spreadsheet ke service account.",
        oauthConnectUrl: oauthClientConfigured() ? "/api/oauth/drive/connect" : null
      };
    }
  }

  folderInspectCache = { at: now, value };
  return value;
}

async function isDriveUploadReady() {
  return (await inspectUploadFolder()).ready;
}

function resolveBuktiUploadName_(nameForFile, file, index, total) {
  if (typeof nameForFile === "function") {
    const custom = String(nameForFile(file, index, total) || "").trim();
    if (custom) return custom;
  }
  const err = new Error(
    "Nama file bukti gagal dibentuk. Pastikan tanggal pengeluaran di form sudah diisi."
  );
  err.status = 400;
  throw err;
}

async function uploadBuktiFilesServiceAccount(files, folderId, nameForFile) {
  const drive = await getServiceAccountDriveClient();
  const links = [];
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = resolveBuktiUploadName_(nameForFile, file, i, total);
    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId]
      },
      media: {
        mimeType: file.mimetype || "application/octet-stream",
        body: Readable.from(file.buffer)
      },
      fields: "id, webViewLink",
      supportsAllDrives: true
    });
    const id = res.data.id;
    links.push(res.data.webViewLink || `https://drive.google.com/file/d/${id}/view`);
  }
  return links;
}

async function uploadBuktiFiles(files, options = {}) {
  const folderId = uploadFolderId();
  if (!folderId) {
    const err = new Error("GOOGLE_DRIVE_BUKTI_FOLDER_ID belum di-set.");
    err.status = 503;
    throw err;
  }
  if (!files?.length) return [];

  const nameForFile = options.nameForFile || null;

  const inspect = await inspectUploadFolder(true);
  if (!inspect.ready) {
    const err = new Error(inspect.hint);
    err.status = 503;
    throw err;
  }

  if (inspect.reason === "oauth_user") {
    return uploadBuktiFilesAsUser(files, folderId, nameForFile);
  }

  try {
    return await uploadBuktiFilesServiceAccount(files, folderId, nameForFile);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/storage quota|shared drives|shared drive/i.test(msg)) {
      const err = new Error(
        "Upload service account gagal (kuota). Gunakan OAuth: docs/DRIVE_BUKTI_SETUP.md"
      );
      err.status = 503;
      throw err;
    }
    throw e;
  }
}

module.exports = {
  driveConfigured,
  inspectUploadFolder,
  peekUploadFolderCache,
  invalidateUploadFolderCache,
  isDriveUploadReady,
  uploadBuktiFiles,
  uploadFolderId
};
