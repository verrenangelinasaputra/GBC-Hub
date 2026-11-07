const path = require("path");
const { getUserDriveClient, userDriveUploadConfigured } = require("./driveOAuth");
const { buktiDriveFileName } = require("./buktiFileName");
const { extractAllDriveFileIds } = require("./sheets");

/**
 * Rename file bukti di Drive (ID tetap — link di sheet tidak berubah).
 * @returns {{ renamed: number, errors: string[] }}
 */
async function renameBuktiFilesForPayload(kind, buktiRaw, payload) {
  if (!userDriveUploadConfigured()) {
    const err = new Error("Google Drive OAuth belum aktif — tidak bisa mengubah nama file bukti.");
    err.status = 503;
    throw err;
  }
  const ids = extractAllDriveFileIds(buktiRaw);
  if (!ids.length) return { renamed: 0, errors: [] };
  const drive = await getUserDriveClient();
  const total = ids.length;
  const errors = [];
  let renamed = 0;
  for (let i = 0; i < ids.length; i++) {
    const fileId = ids[i];
    try {
      const meta = await drive.files.get({
        fileId,
        fields: "name",
        supportsAllDrives: true
      });
      const oldName = String(meta.data.name || "");
      const newName = buktiDriveFileName(kind, payload, oldName || "bukti.jpg", i, total);
      if (newName && newName !== oldName) {
        await drive.files.update({
          fileId,
          requestBody: { name: newName },
          supportsAllDrives: true
        });
        renamed += 1;
      }
    } catch (e) {
      errors.push(`${fileId}: ${e.message || "gagal rename"}`);
    }
  }
  return { renamed, errors };
}

module.exports = { renameBuktiFilesForPayload };
