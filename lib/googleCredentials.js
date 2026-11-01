const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

function parseServiceAccountJsonEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(String(raw).trim());
  } catch {
    const err = new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak valid (harus JSON service account satu baris).");
    err.status = 503;
    throw err;
  }
}

function resolveKeyFilePath() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile || !String(keyFile).trim()) return null;
  const resolved = path.resolve(String(keyFile).trim());
  if (fs.existsSync(resolved)) return resolved;
  return null;
}

function serviceAccountConfigured() {
  return Boolean(parseServiceAccountJsonEnv() || resolveKeyFilePath());
}

function serviceAccountEmailFromEnv() {
  const cred = parseServiceAccountJsonEnv();
  if (cred?.client_email) return cred.client_email;
  const keyFile = resolveKeyFilePath();
  if (!keyFile) return "";
  try {
    const json = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    return json.client_email || "";
  } catch {
    return "";
  }
}

function createGoogleAuth(scopes) {
  const credentials = parseServiceAccountJsonEnv();
  if (credentials) {
    return new google.auth.GoogleAuth({ credentials, scopes });
  }

  const keyFile = resolveKeyFilePath();
  if (keyFile) {
    return new google.auth.GoogleAuth({ keyFile, scopes });
  }

  const pathHint = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (pathHint && (process.env.VERCEL === "1" || process.env.VERCEL === "true")) {
    const err = new Error(
      "File service account tidak ada di Vercel (folder secrets/ tidak ikut deploy). " +
        "Hapus GOOGLE_SERVICE_ACCOUNT_PATH di Vercel → Settings → Environment Variables. " +
        "Tambahkan GOOGLE_SERVICE_ACCOUNT_JSON = isi penuh file JSON service account (satu baris)."
    );
    err.status = 503;
    throw err;
  }

  if (pathHint) {
    const err = new Error(
      `File service account tidak ditemukan: ${path.resolve(String(pathHint))}. ` +
        "Periksa GOOGLE_SERVICE_ACCOUNT_PATH lokal, atau set GOOGLE_SERVICE_ACCOUNT_JSON."
    );
    err.status = 503;
    throw err;
  }

  const err = new Error(
    "Google belum dikonfigurasi. Lokal: GOOGLE_SERVICE_ACCOUNT_PATH. Vercel: GOOGLE_SERVICE_ACCOUNT_JSON."
  );
  err.status = 503;
  throw err;
}

module.exports = {
  parseServiceAccountJsonEnv,
  resolveKeyFilePath,
  serviceAccountConfigured,
  serviceAccountEmailFromEnv,
  createGoogleAuth
};
