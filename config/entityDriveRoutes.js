/** Selaras `ENTITY_DRIVE_ROUTES` di google-apps-script-bukti-multi-drive.gs */

const CV_ANUGERAH_DRIVE_ROOT_ID = String(
  process.env.CV_ANUGERAH_DRIVE_ROOT_ID || "1e9ZC8iYcAfG43cG9V1Rmmv-5rUutO5Yk"
).trim();

const ENTITY_DRIVE_ROUTES = [
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

function normalizeEntityText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchEntityRoute(entityRaw) {
  const n = normalizeEntityText(entityRaw);
  if (!n) return null;
  for (const route of ENTITY_DRIVE_ROUTES) {
    for (const key of route.entityKeys) {
      if (n === key || n.includes(key) || key.includes(n)) return route;
    }
  }
  return null;
}

function effectiveDriveRootId(route) {
  if (!route) return "";
  if (route.useAnugerahConfigVar) return CV_ANUGERAH_DRIVE_ROOT_ID;
  return String(route.driveRootId || "").trim();
}

function jenisLabelFromKind(kind) {
  return kind === "kas_besar" ? "Bank" : "Kas Kecil";
}

function jenisFolderNames(kind) {
  return kind === "kas_besar"
    ? ["Bank", "KAS BESAR", "Kas Besar"]
    : ["Kas Kecil", "KAS KECIL"];
}

function entitiesDiffer(a, b) {
  return normalizeEntityText(a) !== normalizeEntityText(b);
}

module.exports = {
  ENTITY_DRIVE_ROUTES,
  CV_ANUGERAH_DRIVE_ROOT_ID,
  matchEntityRoute,
  effectiveDriveRootId,
  jenisLabelFromKind,
  jenisFolderNames,
  normalizeEntityText,
  entitiesDiffer
};
