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
  const drive = await getUserDriveClient();
  let meta;
  try {
    const res = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,thumbnailLink",
      supportsAllDrives: true
    });
    meta = res.data;
  } catch {
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
    } catch {
      return null;
    }
  }

  if (meta.thumbnailLink || mime === "application/pdf") {
    try {
      const token = await getOAuthAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const thumbUrl =
        mime === "application/pdf"
          ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`
          : meta.thumbnailLink;
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

module.exports = { fetchDriveBuktiPreview };
