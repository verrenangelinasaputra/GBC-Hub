const { Readable } = require("stream");
const { google } = require("googleapis");

/** Upload ke folder ID yang sudah ada (Drive pribadi / Shared drive). */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function oauthRedirectUri() {
  const fromEnv = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  if (fromEnv) return fromEnv;
  const vercel = String(process.env.VERCEL_URL || "").trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}/api/oauth/drive/callback`;
  }
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}/api/oauth/drive/callback`;
}

function oauthClientConfigured() {
  return Boolean(
    String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim() &&
      String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim()
  );
}

function userDriveUploadConfigured() {
  return oauthClientConfigured() && Boolean(String(process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN || "").trim());
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    oauthRedirectUri()
  );
}

function getDriveOAuthUrl(state) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
    state
  });
}

async function exchangeOAuthCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

let cachedUserDriveClient = null;

async function getUserDriveClient() {
  if (!userDriveUploadConfigured()) {
    const err = new Error("Google Drive OAuth belum dikonfigurasi (refresh token).");
    err.status = 503;
    throw err;
  }
  if (cachedUserDriveClient) return cachedUserDriveClient;
  const client = createOAuth2Client();
  client.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
  });
  cachedUserDriveClient = google.drive({ version: "v3", auth: client });
  return cachedUserDriveClient;
}

async function inspectUserFolderWrite(folderId) {
  if (!userDriveUploadConfigured() || !folderId) {
    return { ok: false, code: "no_token" };
  }
  try {
    const drive = await getUserDriveClient();
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "id,name,driveId,capabilities/canAddChildren",
      supportsAllDrives: true
    });
    const canAdd = meta.data.capabilities?.canAddChildren;
    if (canAdd === false) {
      return {
        ok: false,
        code: "no_write",
        folderName: meta.data.name || folderId,
        driveId: meta.data.driveId || null
      };
    }
    return {
      ok: true,
      folderName: meta.data.name || folderId,
      driveId: meta.data.driveId || null
    };
  } catch (e) {
    const msg = String(e?.message || e || "");
    const response = e?.response?.data?.error;
    const reason = String(response?.message || response?.errors?.[0]?.reason || "");
    const blob = `${msg} ${reason}`.toLowerCase();
    if (/invalid_grant|token has been expired|revoked|unauthorized_client/i.test(blob)) {
      return { ok: false, code: "token_expired", detail: msg };
    }
    if (/not found|404/.test(blob)) {
      return { ok: false, code: "folder_not_found", detail: msg };
    }
    if (/403|forbidden|insufficient|access_not_configured/.test(blob)) {
      return { ok: false, code: "forbidden", detail: msg };
    }
    return { ok: false, code: "unknown", detail: msg };
  }
}

async function userCanWriteFolder(folderId) {
  return (await inspectUserFolderWrite(folderId)).ok;
}

/**
 * @param {Express.Multer.File[]} files
 * @param {string} folderId
 */
async function uploadBuktiFilesAsUser(files, folderId, nameForFile) {
  if (!files?.length) return [];
  const drive = await getUserDriveClient();
  const links = [];
  const total = files.length;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name =
      typeof nameForFile === "function"
        ? String(nameForFile(file, i, total) || "").trim()
        : "";
    if (!name) {
      const err = new Error(
        "Nama file bukti gagal dibentuk. Pastikan tanggal pengeluaran di form sudah diisi."
      );
      err.status = 400;
      throw err;
    }
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

module.exports = {
  DRIVE_SCOPE,
  oauthRedirectUri,
  oauthClientConfigured,
  userDriveUploadConfigured,
  getDriveOAuthUrl,
  exchangeOAuthCode,
  getUserDriveClient,
  uploadBuktiFilesAsUser,
  userCanWriteFolder,
  inspectUserFolderWrite
};
