const path = require("path");

function sanitizeFilePart(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
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

function normalizeAmountForFile(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "0";
  const n = Number(
    s
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );
  if (Number.isFinite(n)) return String(Math.round(Math.abs(n)));
  const digits = s.replace(/[^\d]/g, "");
  return digits || "0";
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

/** tanggal_entitas_namaTransaksi_jumlah */
function buktiBaseName(kind, payload) {
  void kind;
  const tanggal = normalizeTanggalPengeluaran(payload.tanggal);
  const nama =
    payload.namaTransaksi ??
    payload.nama_transaksi ??
    payload.nama ??
    "Tanpa-Nama";
  const amount = normalizeAmountForFile(payload.amount ?? payload.jumlah);
  const parts = [
    tanggal || "Tanpa-Tanggal",
    sanitizeFilePart(payload.entitas),
    sanitizeFilePart(nama),
    amount
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
  normalizeAmountForFile,
  tanggalFromTransactionBody
};
