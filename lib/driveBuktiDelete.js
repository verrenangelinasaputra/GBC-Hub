const { getUserDriveClient, userDriveUploadConfigured } = require("./driveOAuth");

/**
 * Pindahkan file bukti ke sampah Drive (hapus dari folder aktif).
 * @returns {{ trashed: number, errors: string[] }}
 */
async function trashBuktiDriveFiles(fileIds) {
  if (!userDriveUploadConfigured()) {
    const err = new Error("Google Drive OAuth belum aktif — tidak bisa menghapus file bukti.");
    err.status = 503;
    throw err;
  }
  const unique = [...new Set((fileIds || []).map(id => String(id || "").trim()).filter(Boolean))];
  if (!unique.length) return { trashed: 0, errors: [] };

  const drive = await getUserDriveClient();
  const errors = [];
  let trashed = 0;

  for (const fileId of unique) {
    try {
      await drive.files.update({
        fileId,
        requestBody: { trashed: true },
        supportsAllDrives: true
      });
      trashed += 1;
    } catch (e) {
      errors.push(`${fileId}: ${e.message || "gagal hapus"}`);
    }
  }

  return { trashed, errors };
}

module.exports = { trashBuktiDriveFiles };
