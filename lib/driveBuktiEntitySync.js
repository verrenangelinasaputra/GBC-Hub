const { getUserDriveClient, userDriveUploadConfigured } = require("./driveOAuth");
const { buktiDriveFileName } = require("./buktiFileName");
const { extractAllDriveFileIds } = require("./sheets");
const {
  matchEntityRoute,
  effectiveDriveRootId,
  jenisFolderNames
} = require("../config/entityDriveRoutes");

function escapeDriveQueryString(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listChildFolderByName(drive, parentId, name) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryString(
    name
  )}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return res.data.files?.[0]?.id || "";
}

async function findChildFolderByNames(drive, parentId, names) {
  for (const name of names) {
    const id = await listChildFolderByName(drive, parentId, name);
    if (id) return id;
  }
  return "";
}

async function getOrCreateSubfolder(drive, parentId, name) {
  const existing = await listChildFolderByName(drive, parentId, name);
  if (existing) return existing;
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    fields: "id",
    supportsAllDrives: true
  });
  return res.data.id;
}

async function resolveEntityDriveFolderId(drive, route, kind, rootId) {
  const buktiRootId = await getOrCreateSubfolder(drive, rootId, route.buktiRootName);
  let parentId = buktiRootId;
  if (route.layout === "gbc_kediri") {
    parentId = await getOrCreateSubfolder(drive, buktiRootId, route.entitySubfolder);
  }
  const jenisNames = jenisFolderNames(kind);
  let jenisId = await findChildFolderByNames(drive, parentId, jenisNames);
  if (!jenisId) jenisId = await getOrCreateSubfolder(drive, parentId, jenisNames[0]);
  return jenisId;
}

async function findFileIdByNameInFolder(drive, folderId, name) {
  const q = `'${folderId}' in parents and name = '${escapeDriveQueryString(name)}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id, webViewLink)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return res.data.files?.[0] || null;
}

function buktiNameBaseAndExt(fileName) {
  const dot = String(fileName || "").lastIndexOf(".");
  const ext = dot > 0 ? String(fileName).slice(dot) : "";
  let base = dot > 0 ? String(fileName).slice(0, dot) : String(fileName || "");
  base = base.replace(/_salinan$/i, "").replace(/ \(\d+\)$/i, "").trim();
  return { base, ext };
}

/** Nama salinan Drive: `file (2).png`, `file_salinan.jpeg`, dll. */
function buktiFileNameMatchesVariant(actualName, canonicalName) {
  const actual = String(actualName || "").trim();
  const canonical = String(canonicalName || "").trim();
  if (!actual || !canonical) return false;
  if (actual === canonical) return true;
  const a = buktiNameBaseAndExt(actual);
  const c = buktiNameBaseAndExt(canonical);
  if (a.base !== c.base) return false;
  if (!a.ext || !c.ext) return true;
  return a.ext.toLowerCase() === c.ext.toLowerCase();
}

/** Hapus semua file di folder yang cocok nama standar + varian (2), _salinan, … */
async function trashBuktiNameVariantsInFolder(drive, folderId, canonicalName, tryTrash) {
  const { base, ext } = buktiNameBaseAndExt(canonicalName);
  if (!base) return;
  const canonicalWithExt = ext ? `${base}${ext}` : canonicalName;
  const q = `'${folderId}' in parents and name contains '${escapeDriveQueryString(
    base
  )}' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 30,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  for (const f of res.data.files || []) {
    if (buktiFileNameMatchesVariant(f.name, canonicalWithExt) && f.id) {
      await tryTrash(f.id);
    }
  }
}

async function pickUniqueNameInFolder(drive, folderId, desiredName) {
  const hit = await findFileIdByNameInFolder(drive, folderId, desiredName);
  if (!hit) return { name: desiredName, existing: null };
  const dot = desiredName.lastIndexOf(".");
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : "";
  return { name: `${base}_salinan${ext}`, existing: hit };
}

async function fileAlreadyInFolder(drive, fileId, folderId) {
  const meta = await drive.files.get({
    fileId,
    fields: "parents",
    supportsAllDrives: true
  });
  const parents = meta.data.parents || [];
  return parents.includes(folderId);
}

/**
 * Salin (atau pastikan ada salinan) bukti ke folder Drive entitas — polanya sama dengan GAS Multi Drive.
 * File sumber di folder upload tetap ada; salinan masuk ke mis. CV Anugerah / Bank.
 */
async function syncBuktiFilesToEntityDrive(kind, buktiRaw, payload) {
  if (!userDriveUploadConfigured()) {
    return { copied: 0, buktiLinks: [], errors: ["Drive OAuth tidak aktif."] };
  }
  const route = matchEntityRoute(payload.entitas);
  if (!route) {
    return { copied: 0, buktiLinks: [], errors: [`Entitas tidak dikenali untuk folder Drive: ${payload.entitas}`] };
  }
  const rootId = effectiveDriveRootId(route);
  if (!rootId) {
    return {
      copied: 0,
      buktiLinks: [],
      errors: ["Folder root Drive entitas belum dikonfigurasi (CV_ANUGERAH_DRIVE_ROOT_ID)."]
    };
  }
  const ids = extractAllDriveFileIds(buktiRaw);
  if (!ids.length) return { copied: 0, buktiLinks: [], errors: [] };

  const drive = await getUserDriveClient();
  let entityFolderId;
  try {
    entityFolderId = await resolveEntityDriveFolderId(drive, route, kind, rootId);
  } catch (e) {
    return { copied: 0, buktiLinks: [], errors: [e.message || "Gagal membuka folder entitas."] };
  }

  const total = ids.length;
  const buktiLinks = [];
  const errors = [];
  let copied = 0;

  for (let i = 0; i < ids.length; i++) {
    const sourceId = ids[i];
    try {
      if (await fileAlreadyInFolder(drive, sourceId, entityFolderId)) {
        buktiLinks.push(`https://drive.google.com/file/d/${sourceId}/view`);
        continue;
      }
      const meta = await drive.files.get({
        fileId: sourceId,
        fields: "name",
        supportsAllDrives: true
      });
      const oldName = String(meta.data.name || `bukti_${sourceId}`);
      const targetName = buktiDriveFileName(kind, payload, oldName, i, total);
      const { name: destName, existing } = await pickUniqueNameInFolder(
        drive,
        entityFolderId,
        targetName
      );
      if (existing && destName === targetName) {
        buktiLinks.push(
          existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`
        );
        continue;
      }
      const copyRes = await drive.files.copy({
        fileId: sourceId,
        requestBody: { name: destName, parents: [entityFolderId] },
        fields: "id, webViewLink",
        supportsAllDrives: true
      });
      const newId = copyRes.data.id;
      buktiLinks.push(
        copyRes.data.webViewLink || `https://drive.google.com/file/d/${newId}/view`
      );
      copied += 1;
    } catch (e) {
      errors.push(`${sourceId}: ${e.message || "gagal salin ke folder entitas"}`);
      buktiLinks.push(`https://drive.google.com/file/d/${sourceId}/view`);
    }
  }

  return { copied, buktiLinks, errors, entityFolderId, route: route.buktiRootName };
}

/**
 * Buang salinan bukti di folder Drive entitas lama (saat revisi ganti entitas, mis. GBC → CV Anugerah).
 * File di folder upload/inbox tidak dihapus.
 */
async function removeBuktiFromEntityFolder(kind, entityRaw, buktiRaw, namePayload) {
  if (!userDriveUploadConfigured()) {
    return { removed: 0, errors: ["Drive OAuth tidak aktif."] };
  }
  if (!String(entityRaw || "").trim() || !String(buktiRaw || "").trim()) {
    return { removed: 0, errors: [] };
  }
  const route = matchEntityRoute(entityRaw);
  if (!route) {
    return { removed: 0, errors: [`Entitas lama tidak dikenali: ${entityRaw}`] };
  }
  const rootId = effectiveDriveRootId(route);
  if (!rootId) return { removed: 0, errors: [] };

  const drive = await getUserDriveClient();
  let entityFolderId;
  try {
    entityFolderId = await resolveEntityDriveFolderId(drive, route, kind, rootId);
  } catch (e) {
    return { removed: 0, errors: [e.message || "Gagal membuka folder entitas lama."] };
  }

  const ids = extractAllDriveFileIds(buktiRaw);
  if (!ids.length) return { removed: 0, errors: [], entityFolderId };

  const trashed = new Set();
  const errors = [];
  let removed = 0;

  const tryTrash = async fileId => {
    if (!fileId || trashed.has(fileId)) return;
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true
    });
    trashed.add(fileId);
    removed += 1;
  };

  const total = ids.length;
  for (let i = 0; i < ids.length; i++) {
    const fileId = ids[i];
    try {
      if (await fileAlreadyInFolder(drive, fileId, entityFolderId)) {
        await tryTrash(fileId);
        continue;
      }
      let refName = "bukti.jpg";
      try {
        const meta = await drive.files.get({
          fileId,
          fields: "name",
          supportsAllDrives: true
        });
        refName = String(meta.data.name || refName);
      } catch {
        /* pakai ref default */
      }
      const targetName = buktiDriveFileName(kind, namePayload, refName, i, total);
      await trashBuktiNameVariantsInFolder(drive, entityFolderId, targetName, tryTrash);
      if (refName !== targetName) {
        await trashBuktiNameVariantsInFolder(drive, entityFolderId, refName, tryTrash);
      }
    } catch (e) {
      errors.push(`${fileId}: ${e.message || "gagal hapus salinan lama"}`);
    }
  }

  return { removed, errors, entityFolderId };
}

module.exports = { syncBuktiFilesToEntityDrive, removeBuktiFromEntityFolder };
