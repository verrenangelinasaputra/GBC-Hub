const path = require("path");

function sanitizeFilePart(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100) || "Tanpa"
  );
}

function jenisLabel(kind) {
  return kind === "kas_besar" ? "Bank" : "Kas Kecil";
}

/**
 * Tanggal pengeluaran dari form (bukan timestamp upload).
 * @returns {string} YYYY-MM-DD atau string kosong
 */
function normalizeTanggalPengeluaran(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }

  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`;
  }

  return sanitizeFilePart(s);
}

function tanggalFromTransactionBody(body) {
  const raw =
    body?.tanggal ??
    body?.tanggal_pengeluaran ??
    body?.tanggalPengeluaran ??
    body?.["1. tanggal pengeluaran"] ??
    "";
  return normalizeTanggalPengeluaran(raw);
}

/** Kas Kecil|Bank_TanggalPengeluaran_Entitas_Kategori_PIC */
function buktiBaseName(kind, payload) {
  const tanggal = normalizeTanggalPengeluaran(payload.tanggal);
  const parts = [
    jenisLabel(kind),
    tanggal || "Tanpa-Tanggal",
    sanitizeFilePart(payload.entitas),
    sanitizeFilePart(payload.category),
    sanitizeFilePart(payload.pic)
  ];
  return parts.join("_");
}

function buktiDriveFileName(kind, payload, originalName, index = 0, total = 1) {
  const base = buktiBaseName(kind, payload);
  const ext = path.extname(String(originalName || "")).toLowerCase();
  const suffix = total > 1 ? `_${index + 1}` : "";
  return `${base}${suffix}${ext || ""}`;
}

module.exports = {
  buktiDriveFileName,
  buktiBaseName,
  jenisLabel,
  normalizeTanggalPengeluaran,
  tanggalFromTransactionBody
};
