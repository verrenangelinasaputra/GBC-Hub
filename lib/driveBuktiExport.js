const { google } = require("googleapis");
const { getUserDriveClient, userDriveUploadConfigured, oauthRedirectUri } = require("./driveOAuth");

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    oauthRedirectUri()
  );
}

async function getOAuthAccessToken() {
  if (!userDriveUploadConfigured()) return null;
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
  const token = await client.getAccessToken();
  return token?.token || null;
}

/**
 * Ambil gambar pratinjau bukti dari Drive (foto langsung, PDF pakai thumbnail Google).
 * @returns {{ buffer: Buffer, mimeType: string, name: string } | null}
 */
async function fetchDriveBuktiPreview(fileId) {
  if (!userDriveUploadConfigured() || !fileId) return null;
  let drive;
  try {
    drive = await getUserDriveClient();
  } catch (e) {
    console.error("fetchDriveBuktiPreview drive client:", e.message);
    return null;
  }
  let meta;
  try {
    const res = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,thumbnailLink",
      supportsAllDrives: true
    });
    meta = res.data;
  } catch (e) {
    console.error("fetchDriveBuktiPreview meta:", fileId, e.message);
    return null;
  }
  const mime = String(meta.mimeType || "");
  const name = String(meta.name || fileId);

  if (mime.startsWith("image/")) {
    try {
      const media = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );
      return {
        buffer: Buffer.from(media.data),
        mimeType: mime,
        name
      };
    } catch (e) {
      console.error("fetchDriveBuktiPreview image media:", fileId, e.message);
    }
  }

  const thumbFallback = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
  if (meta.thumbnailLink || mime === "application/pdf" || mime.startsWith("image/")) {
    try {
      const token = await getOAuthAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const thumbUrl =
        mime === "application/pdf" || !meta.thumbnailLink ? thumbFallback : meta.thumbnailLink;
      const thumbRes = await fetch(thumbUrl, { headers });
      if (!thumbRes.ok) return null;
      const buf = Buffer.from(await thumbRes.arrayBuffer());
      const thumbMime = thumbRes.headers.get("content-type") || "image/jpeg";
      return { buffer: buf, mimeType: thumbMime, name };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Metadata file bukti (nama asli di Drive) tanpa mengunduh isi file.
 * @returns {{ id: string, name: string, mimeType: string, thumbnailLink: string } | null}
 */
async function fetchDriveBuktiMeta(fileId) {
  if (!userDriveUploadConfigured() || !fileId) return null;
  let drive;
  try {
    drive = await getUserDriveClient();
  } catch (e) {
    console.error("fetchDriveBuktiMeta drive client:", e.message);
    return null;
  }
  try {
    const res = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,thumbnailLink",
      supportsAllDrives: true
    });
    const d = res.data;
    return {
      id: String(d.id || fileId),
      name: String(d.name || fileId),
      mimeType: String(d.mimeType || ""),
      thumbnailLink: String(d.thumbnailLink || "")
    };
  } catch (e) {
    console.error("fetchDriveBuktiMeta:", fileId, e.message);
    return null;
  }
}

module.exports = { fetchDriveBuktiPreview, fetchDriveBuktiMeta };
