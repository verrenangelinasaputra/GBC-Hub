const path = require("path");

/** Bagian nama file: spasi dipertahankan (contoh: Main Timezone), hanya karakter terlarang Drive yang dihapus. */
function sanitizeFilePart(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100) || "Tanpa"
  );
}

function jenisFileToken(kind) {
  return kind === "kas_besar" ? "Bank" : "Kas_Kecil";
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

/** tanggal_jenis_entitas_namaTransaksi_jumlah — jenis = Bank | Kas_Kecil (untuk Apps Script salin ke folder entitas) */
function buktiBaseName(kind, payload) {
  const tanggal = normalizeTanggalPengeluaran(payload.tanggal);
  const nama =
    payload.namaTransaksi ??
    payload.nama_transaksi ??
    payload.nama ??
    "Tanpa-Nama";
  const amount = normalizeAmountForFile(payload.amount ?? payload.jumlah);
  const parts = [
    tanggal || "Tanpa-Tanggal",
    jenisFileToken(kind),
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
  jenisFileToken,
  sanitizeFilePart,
  normalizeTanggalPengeluaran,
  normalizeAmountForFile,
  tanggalFromTransactionBody
};
