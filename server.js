require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const {
  roleConfig,
  permissionsForUser,
  pathAllowedForRole,
  requireRoles,
  requireKasBesarSubmit,
  requireKasKecilSubmit,
  requireKasBesarRead,
  requireKasKecilRead,
  requireKasBesarEdit,
  requireKasKecilEdit
} = require("./lib/auth");
const { findUser, verifyPassword, publicUser } = require("./lib/users");
const { sendMail, verificationEmailText, adminNotifyEmail, newUserNotifyText } = require("./lib/mail");
const {
  findMemberByUsername,
  findMemberByUserId,
  normalizeUsername,
  createMemberUser,
  saveAuthCode,
  consumeAuthCode,
  generateVerificationCode,
  listMembersForAdmin,
  setMemberAccess,
  updateMemberPassword,
  deleteMemberUser,
  registrySpreadsheetUrl,
  registryHelpEmail
} = require("./lib/userRegistry");
const {
  loadCategories,
  sheetsConfigured,
  fetchRows,
  listFromSheet,
  kasKecilRecap,
  kasBesarRecap,
  superAdminCombinedRecap,
  appendTransaction,
  updateTransactionRow,
  getTransactionRow,
  extractAllDriveFileIds,
  driveFileViewUrl,
  hubSheetMode,
  getHubSpreadsheetId,
  parseMoneyValue,
  serviceAccountEmailForHelp
} = require("./lib/sheets");
const { compileAllRecap } = require("./lib/compileRecap");
const { ENTITIES } = require("./config/hubForm");
const { formOptionsForKind, EXPENSE_CATEGORIES, OTHER_CATEGORY } = require("./config/formDefinitions");
const {
  filterFormOptionsForUser,
  validateMemberScopeForSubmit,
  validateMemberScopeForEdit,
  memberEntities,
  accessCatalogForAdmin,
  isUnrestrictedRole
} = require("./lib/memberAccess");
const {
  uploadBuktiFiles,
  inspectUploadFolder,
  peekUploadFolderCache,
  invalidateUploadFolderCache
} = require("./lib/driveUpload");
const { fetchDriveBuktiPreview, fetchDriveBuktiMeta } = require("./lib/driveBuktiExport");
const { renameBuktiFilesForPayload } = require("./lib/driveBuktiRename");
const { syncBuktiFilesToEntityDrive, removeBuktiFromEntityFolder } = require("./lib/driveBuktiEntitySync");
const { trashBuktiDriveFiles } = require("./lib/driveBuktiDelete");
const { entitiesDiffer } = require("./config/entityDriveRoutes");
const {
  buktiDriveFileName,
  tanggalFromTransactionBody,
  resolveTanggalPengeluaran
} = require("./lib/buktiFileName");
const {
  oauthClientConfigured,
  getDriveOAuthUrl,
  exchangeOAuthCode,
  oauthRedirectUri
} = require("./lib/driveOAuth");

const buktiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});
const { geminiConfigured, generateOwnerInsights } = require("./lib/owner-insights");
const { logGeminiStartupHint } = require("./lib/gemini");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "";

function signingReady() {
  return SESSION_SECRET.length >= 24;
}

if (!signingReady()) {
  console.error("Set SESSION_SECRET (min 24 chars) in .env or Vercel Environment Variables.");
  if (!process.env.VERCEL) process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false }));

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const REMEMBER_ME_TTL_MS = Number(process.env.REMEMBER_ME_TTL_MS || 14 * 24 * 60 * 60 * 1000);

function isProductionCookie() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

const HUB_ID = getHubSpreadsheetId();
const HUB_BASE = `https://docs.google.com/spreadsheets/d/${HUB_ID}/edit`;
const HUB_KK_GID = String(process.env.HUB_KAS_KECIL_GID || "1585130450").trim();
const HUB_KB_GID = String(process.env.HUB_KAS_BESAR_GID || "604908609").trim();

function hubTabUrl(gid) {
  return `${HUB_BASE}?gid=${gid}#gid=${gid}`;
}

const EXTERNAL_LINKS = {
  hubSpreadsheet: HUB_BASE,
  kasBesarForm: "",
  kasKecilForm: "",
  kasBesarSheet: hubTabUrl(HUB_KB_GID),
  kasKecilSheet: hubTabUrl(HUB_KK_GID),
  kasBesarTab: process.env.HUB_KAS_BESAR_TAB || "Bank",
  kasKecilTab: process.env.HUB_KAS_KECIL_TAB || "KAS KECIL",
  compiledTab: "compiled table",
  laporanTab: "LAPORAN BULANAN"
};

function normalizeTransactionBody(body) {
  return {
    tanggal: tanggalFromTransactionBody(body),
    entitas: String(body?.entitas || "").trim(),
    category: String(body?.category || body?.kategori || "").trim(),
    categoryOther: String(body?.categoryOther || body?.category_other || "")
      .trim()
      .replace(/\s+/g, " "),
    namaTransaksi: String(body?.namaTransaksi || body?.nama_transaksi || "").trim(),
    amount: body?.amount ?? body?.jumlah,
    keterangan: String(body?.keterangan || "").trim(),
    dibayarkan: String(body?.dibayarkan || "").trim(),
    sumberDana: String(body?.sumberDana || body?.sumber_dana || "").trim(),
    bukti: String(body?.bukti || "").trim(),
    pic: String(body?.pic || "").trim()
  };
}

function validateTransactionPayload(payload, kind, files = [], driveUploadReady = false) {
  if (!payload.tanggal) return "Tanggal pengeluaran wajib diisi.";
  if (!payload.entitas) return "Entitas wajib dipilih.";
  if (!payload.category) return "Kategori wajib dipilih.";
  if (!EXPENSE_CATEGORIES.includes(payload.category)) {
    return "Kategori tidak valid. Ketik lalu pilih dari daftar.";
  }
  if (payload.category === OTHER_CATEGORY && String(payload.categoryOther || "").length < 2) {
    return "Isi nama beban pada kolom Beban apa (minimal 2 karakter).";
  }
  if (!payload.namaTransaksi) return "Nama transaksi wajib diisi.";
  const amount = parseMoneyValue(payload.amount);
  if (!amount || amount <= 0) return "Jumlah pengeluaran (Rp) wajib diisi dan lebih dari 0.";
  if (!payload.dibayarkan) return "Dibayarkan kepada wajib diisi.";
  if (!payload.sumberDana) {
    return kind === "kas_besar"
      ? "Sumber Dana Bank wajib dipilih."
      : "Sumber Dana Kas Kecil wajib dipilih.";
  }
  if (!payload.pic) return "Nama PIC wajib diisi.";
  const hasFiles = files.length > 0;
  const hasLink = Boolean(payload.bukti);
  if (!hasFiles && !hasLink) {
    return "Bukti transaksi wajib: unggah minimal 1 file (maks. 5 × 10 MB) atau lampirkan link Drive.";
  }
  if (hasFiles && !driveUploadReady) {
    return "Upload file dari web tidak tersedia untuk folder Drive ini. Upload bukti manual ke Drive, lalu isi Link bukti di form.";
  }
  return "";
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}
function makeCookie(value, maxAgeMs = SESSION_TTL_MS) {
  const sec = Math.max(60, Math.floor(Number(maxAgeMs) / 1000));
  return `gbc_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sec}` +
    (isProductionCookie() ? "; Secure" : "");
}
function clearCookie() {
  return `gbc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
    (isProductionCookie() ? "; Secure" : "");
}

const OAUTH_STATE_COOKIE = "drive_oauth_state";
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function makeNamedCookie(name, value, maxAgeMs) {
  const sec = Math.max(60, Math.floor(Number(maxAgeMs) / 1000));
  const encoded = encodeURIComponent(String(value || ""));
  return `${name}=${encoded}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sec}` +
    (isProductionCookie() ? "; Secure" : "");
}

function clearNamedCookie(name) {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
    (isProductionCookie() ? "; Secure" : "");
}

/** Cookie bertanda (stateless) — wajib untuk Vercel/serverless (tanpa Map di memori). */
function encodeSessionToken(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSessionToken(token) {
  if (!signingReady() || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!mac || !safeEqual(mac, sign(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.expiresAt || payload.expiresAt < Date.now()) return null;
    return {
      user: payload.user,
      csrf: payload.csrf,
      expiresAt: payload.expiresAt
    };
  } catch {
    return null;
  }
}
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const found = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}
function sessionFor(req) {
  return decodeSessionToken(getCookie(req, "gbc_session"));
}
function createSession(res, user, options = {}) {
  if (!signingReady()) {
    throw new Error("SESSION_SECRET belum dikonfigurasi.");
  }
  const rememberMe = !!options.rememberMe;
  const ttlMs = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
  const csrf = crypto.randomBytes(24).toString("hex");
  const token = encodeSessionToken({
    user: publicUser(user),
    csrf,
    expiresAt: Date.now() + ttlMs,
    rememberMe
  });
  res.setHeader("Set-Cookie", makeCookie(token, ttlMs));
  return {
    csrf,
    home: permissionsForUser(user)?.home || roleConfig(user.role)?.home || "/login",
    sessionExpiresInDays: Math.round(ttlMs / (24 * 60 * 60 * 1000))
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validatePasswordPair(password, confirm) {
  const p = String(password || "");
  const c = String(confirm || "");
  if (p.length < 8) return "Password minimal 8 karakter.";
  if (p !== c) return "Konfirmasi password tidak sama.";
  return "";
}

function validateUsernameField(raw) {
  const username = normalizeUsername(raw);
  if (!username || username.length < 3 || username.length > 32) {
    return { error: "Username wajib 3–32 karakter." };
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return { error: "Username hanya huruf, angka, titik, strip, dan underscore." };
  }
  return { username };
}

function validateRegisterFields(body) {
  const name = String(body?.name || "").trim();
  const usernameCheck = validateUsernameField(body?.username);
  if (usernameCheck.error) return { error: usernameCheck.error };
  const email = normalizeEmail(body?.email);
  const phone = String(body?.phone || "").trim();
  const password = String(body?.password || "");
  const confirm = String(body?.confirmPassword ?? body?.confirm_password ?? "");
  if (!name || name.length < 2) return { error: "Nama wajib diisi (min. 2 karakter)." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (!phone || phone.length < 8) return { error: "Nomor telepon wajib diisi." };
  const pwErr = validatePasswordPair(password, confirm);
  if (pwErr) return { error: pwErr };
  return { name, username: usernameCheck.username, email, phone, password };
}
function requireAuth(req, res, next) {
  const session = sessionFor(req);
  if (!session) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  req.user = session.user;
  req.sessionCsrf = session.csrf;
  next();
}

const MEMBER_FRESH_CACHE_MS = Number(process.env.MEMBER_FRESH_CACHE_MS || 30_000);
const memberFreshCache = new Map();

function invalidateMemberFreshCache(userId) {
  const key = String(userId || "").trim();
  if (key) memberFreshCache.delete(key);
}

async function findMemberFreshById(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  const hit = memberFreshCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_FRESH_CACHE_MS) return hit.user;
  const user = await findMemberByUserId(key);
  if (user) memberFreshCache.set(key, { at: Date.now(), user });
  return user;
}

async function attachFreshMember(req, res, next) {
  if (req.user?.role !== "member") return next();
  try {
    const fresh = await findMemberFreshById(req.user.id);
    if (fresh?.email_verified) req.user = publicUser(fresh);
  } catch {
    /* ignore */
  }
  next();
}
function requireCsrf(req, res, next) {
  const token = req.headers["x-csrf-token"] || req.body?._csrf || "";
  if (!token || !req.sessionCsrf || !safeEqual(token, req.sessionCsrf)) {
    return res.status(403).json({ error: "Token CSRF tidak valid. Muat ulang halaman dan coba lagi." });
  }
  next();
}
async function requireAuthPage(req, res, next) {
  const session = sessionFor(req);
  if (!session) return res.redirect("/login");
  let user = session.user;
  if (user?.role === "member") {
    try {
      const fresh = await findMemberFreshById(user.id);
      if (fresh?.email_verified) user = publicUser(fresh);
    } catch {
      /* keep session user */
    }
  }
  if (!pathAllowedForRole(req.path, user)) {
    return res.status(403).send("Akses ditolak untuk role Anda.");
  }
  req.user = user;
  next();
}

app.get("/login", (req, res) => {
  const session = sessionFor(req);
  if (session) return res.redirect(permissionsForUser(session.user)?.home || "/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register", (req, res) => {
  const session = sessionFor(req);
  if (session) return res.redirect(permissionsForUser(session.user)?.home || "/");
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/forgot-password", (req, res) => {
  const session = sessionFor(req);
  if (session) return res.redirect(permissionsForUser(session.user)?.home || "/");
  res.sendFile(path.join(__dirname, "public", "forgot-password.html"));
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

const appPages = [
  "/admin/kas-kecil/form",
  "/admin/kas-kecil/history",
  "/admin/kas-kecil/dashboard",
  "/admin/kas-besar/form",
  "/admin/kas-besar/history",
  "/admin/kas-besar/dashboard",
  "/super-admin/kas-besar/form",
  "/super-admin/kas-besar/history",
  "/super-admin/kas-besar/dashboard",
  "/super-admin/kas-kecil/form",
  "/super-admin/kas-kecil/history",
  "/super-admin/kas-kecil/dashboard",
  "/owner/dashboard",
  "/owner/business-units",
  "/owner/kas-besar/form",
  "/owner/kas-besar/history",
  "/owner/kas-besar/dashboard",
  "/owner/kas-kecil/form",
  "/owner/kas-kecil/history",
  "/owner/kas-kecil/dashboard",
  "/member/welcome",
  "/member/kas-kecil/form",
  "/member/kas-kecil/history",
  "/member/kas-besar/form",
  "/member/kas-besar/history",
  "/member/kas-besar/dashboard",
  "/member/kas-kecil/dashboard",
  "/admin/kas-kecil/revisi",
  "/admin/kas-besar/revisi",
  "/super-admin/kas-kecil/revisi",
  "/super-admin/kas-besar/revisi",
  "/member/kas-kecil/revisi",
  "/member/kas-besar/revisi",
  "/admin/user-access"
];
for (const route of appPages) {
  app.get(route, requireAuthPage, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "cms.html"));
  });
}

const kasKecilRedirects = [
  "/admin/kas-kecil",
  "/super-admin/kas-kecil",
  "/owner/kas-kecil",
  "/member/kas-kecil"
];
for (const route of kasKecilRedirects) {
  app.get(route, requireAuthPage, (_req, res) => {
    res.redirect(`${route}/form`);
  });
}

const kasBesarRedirects = [
  "/admin/kas-besar",
  "/super-admin/kas-besar",
  "/owner/kas-besar",
  "/member/kas-besar"
];
for (const route of kasBesarRedirects) {
  app.get(route, requireAuthPage, (_req, res) => {
    res.redirect(`${route}/form`);
  });
}

app.get("/admin/kas-kecil/recap", requireAuthPage, (_req, res) => {
  res.redirect("/admin/kas-kecil/dashboard");
});
app.get("/super-admin/recap", requireAuthPage, (_req, res) => {
  res.redirect("/super-admin/kas-besar/dashboard");
});

app.get("/", (req, res) => {
  const session = sessionFor(req);
  if (!session) return res.redirect("/login");
  res.redirect(permissionsForUser(session.user)?.home || "/login");
});

app.get("/api/me", async (req, res) => {
  const session = sessionFor(req);
  const categories = loadCategories();
  if (!session) {
    return res.json({
      authenticated: false,
      user: null,
      sheetsReady: sheetsConfigured(),
      geminiReady: geminiConfigured()
    });
  }

  let user = session.user;
  if (user.role === "admin") {
    user = { ...user, display_name: process.env.ADMIN_DISPLAY_NAME || "Admin" };
  }

  const cachedDrive = peekUploadFolderCache();
  const drivePromise = cachedDrive ? Promise.resolve(cachedDrive) : inspectUploadFolder();
  const memberPromise =
    user.role === "member"
      ? findMemberFreshById(user.id).catch(() => null)
      : Promise.resolve(null);

  const [driveUpload, freshMember] = await Promise.all([drivePromise, memberPromise]);
  if (freshMember?.email_verified) user = publicUser(freshMember);

  res.json({
    authenticated: true,
    user,
    csrf: session.csrf,
    permissions: permissionsForUser(user),
    links: EXTERNAL_LINKS,
    categories,
    entities: ENTITIES,
    formOptions: {
      kas_besar: filterFormOptionsForUser(user, "kas_besar"),
      kas_kecil: filterFormOptionsForUser(user, "kas_kecil")
    },
    driveUpload,
    driveUploadReady: driveUpload.ready,
    driveUploadHint: driveUpload.hint,
    hubSheetMode: hubSheetMode(),
    hubSpreadsheetId: hubSheetMode() ? HUB_ID : "",
    serviceAccountEmail: sheetsConfigured() ? serviceAccountEmailForHelp() : "",
    sheetsReady: sheetsConfigured(),
    geminiReady: geminiConfigured()
  });
});

app.get("/api/drive-upload-status", requireAuth, async (_req, res) => {
  try {
    const driveUpload = await inspectUploadFolder(true);
    res.json({
      driveUpload,
      driveUploadReady: driveUpload.ready,
      driveUploadHint: driveUpload.hint
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Gagal memeriksa Drive." });
  }
});

function signOAuthState() {
  const body = `drive-oauth-${Date.now()}`;
  return `${body}.${sign(body)}`;
}

function verifyOAuthState(state) {
  if (!state || typeof state !== "string") return false;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);
  const m = /^drive-oauth-(\d+)$/.exec(body);
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts) || Date.now() - ts > OAUTH_STATE_TTL_MS) return false;
  return mac && safeEqual(mac, sign(body));
}

/** CSRF OAuth: tanda HMAC atau cookie yang diset saat /connect (stabil di Vercel). */
function oauthStateAccepted(req) {
  const queryState = String(req.query?.state || "");
  if (!queryState) return false;
  const cookieState = getCookie(req, OAUTH_STATE_COOKIE);
  if (cookieState && safeEqual(cookieState, queryState)) return true;
  return verifyOAuthState(queryState);
}

app.get("/api/oauth/drive/connect", requireAuth, requireRoles("super_admin", "admin"), (req, res) => {
  if (!oauthClientConfigured()) {
    return res.status(503).send(
      "OAuth belum siap. Isi GOOGLE_OAUTH_CLIENT_ID dan GOOGLE_OAUTH_CLIENT_SECRET di .env — lihat docs/DRIVE_BUKTI_SETUP.md"
    );
  }
  const state = signOAuthState();
  res.setHeader(
    "Set-Cookie",
    makeNamedCookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL_MS)
  );
  res.redirect(getDriveOAuthUrl(state));
});

app.get("/api/oauth/drive/callback", async (req, res) => {
  if (!oauthStateAccepted(req)) {
    const hint =
      "Mulai ulang dari gbchub → Hubungkan Google Drive (jangan buka URL callback manual). " +
      "Pastikan SESSION_SECRET & GOOGLE_OAUTH_REDIRECT_URI=https://gbchub.vercel.app/api/oauth/drive/callback di Vercel.";
    return res.status(403).send(`OAuth state tidak valid. Ulangi dari tombol Hubungkan Google Drive. ${hint}`);
  }
  res.setHeader("Set-Cookie", clearNamedCookie(OAUTH_STATE_COOKIE));
  const code = String(req.query.code || "");
  if (!code) {
    return res.status(400).send("Kode OAuth tidak ditemukan.");
  }
  try {
    const tokens = await exchangeOAuthCode(code);
    invalidateUploadFolderCache();
    const refresh = tokens.refresh_token;
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Drive terhubung</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px">
<h1>Google Drive terhubung</h1>
<p>Tambahkan baris ini ke file <strong>.env</strong>, lalu restart <code>npm start</code>:</p>
<pre style="background:#f0f4ff;padding:16px;border-radius:8px;overflow:auto">GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${refresh || "TIDAK_ADA_COBA_CONNECT_LAGI"}</pre>
<p>Redirect URI yang dipakai: <code>${oauthRedirectUri()}</code></p>
<p>Setelah restart, refresh form Kas Kecil/Besar — upload file otomatis aktif.</p>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    console.error("oauth drive callback:", e.message);
    res.status(500).send(`Gagal OAuth: ${e.message}`);
  }
});

app.post("/api/auth/login", async (req, res) => {
  const login = String(req.body?.login || "").trim();
  const password = String(req.body?.password || "");
  if (!login || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  try {
    const user = await findUser(login);
    if (!user || !verifyPassword(user, password)) {
      return res.status(401).json({ error: "Kredensial tidak valid." });
    }
    const rememberMe = !!req.body?.rememberMe;
    const sessionInfo = createSession(res, user, { rememberMe });
    res.json({
      ok: true,
      user: publicUser(user),
      csrf: sessionInfo.csrf,
      redirect: sessionInfo.home,
      rememberMe,
      sessionDays: sessionInfo.sessionExpiresInDays
    });
  } catch (e) {
    console.error("login:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal login." });
  }
});

const pendingRegister = new Map();
const AUTH_CODE_RESEND_MS = Number(process.env.AUTH_CODE_RESEND_MS || 60_000);
const authCodeLastSent = new Map();

function authCodeSentKey(loginKey, purpose) {
  return `${purpose}:${normalizeUsername(loginKey)}`;
}

function resendCooldownError(loginKey, purpose) {
  const key = authCodeSentKey(loginKey, purpose);
  const last = authCodeLastSent.get(key);
  if (!last) return null;
  const waitMs = AUTH_CODE_RESEND_MS - (Date.now() - last);
  if (waitMs <= 0) return null;
  const retryAfterSeconds = Math.ceil(waitMs / 1000);
  const err = new Error(`Tunggu ${retryAfterSeconds} detik sebelum kirim ulang kode.`);
  err.status = 429;
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

function markAuthCodeSent(loginKey, purpose) {
  authCodeLastSent.set(authCodeSentKey(loginKey, purpose), Date.now());
}

app.post("/api/auth/register/send-code", async (req, res) => {
  const parsed = validateRegisterFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const cooldown = resendCooldownError(parsed.username, "register");
    if (cooldown) {
      return res.status(429).json({
        error: cooldown.message,
        retryAfterSeconds: cooldown.retryAfterSeconds
      });
    }
    const existing = await findMemberByUsername(parsed.username);
    if (existing) return res.status(409).json({ error: "Username sudah dipakai. Pilih yang lain atau login." });
    const code = generateVerificationCode();
    await saveAuthCode(parsed.username, "register", code);
    await sendMail({
      to: parsed.email,
      subject: "Kode verifikasi pendaftaran GBC Cash Management",
      text: verificationEmailText("register", code, parsed.username)
    });
    markAuthCodeSent(parsed.username, "register");
    pendingRegister.set(parsed.username, {
      name: parsed.name,
      username: parsed.username,
      email: parsed.email,
      phone: parsed.phone,
      password: parsed.password,
      at: Date.now()
    });
    res.json({
      ok: true,
      message: "Kode verifikasi dikirim ke email Anda.",
      retryAfterSeconds: Math.ceil(AUTH_CODE_RESEND_MS / 1000),
      devHint: process.env.MAIL_DEV_LOG === "true" ? "Cek console server untuk kode (MAIL_DEV_LOG)." : undefined
    });
  } catch (e) {
    console.error("register send-code:", e.message);
    res.status(e.status || 500).json({
      error: e.message || "Gagal mengirim kode.",
      registryUrl: registrySpreadsheetUrl(),
      serviceAccount: registryHelpEmail()
    });
  }
});

app.post("/api/auth/register/verify", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const code = String(req.body?.code || "").trim();
  if (!username || !code) return res.status(400).json({ error: "Username dan kode verifikasi wajib diisi." });
  const pending = pendingRegister.get(username);
  if (!pending || Date.now() - pending.at > 30 * 60 * 1000) {
    return res.status(400).json({ error: "Sesi pendaftaran kedaluwarsa. Ulangi dari awal." });
  }
  try {
    const ok = await consumeAuthCode(username, "register", code);
    if (!ok) return res.status(400).json({ error: "Kode verifikasi salah atau kedaluwarsa." });
    await createMemberUser({
      name: pending.name,
      username: pending.username,
      email: pending.email,
      phone: pending.phone,
      password: pending.password
    });
    pendingRegister.delete(username);
    try {
      await sendMail({
        to: adminNotifyEmail(),
        subject: "[GBC Cash Management] User baru terdaftar",
        text: newUserNotifyText({
          name: pending.name,
          username: pending.username,
          email: pending.email,
          phone: pending.phone
        })
      });
    } catch (notifyErr) {
      console.error("notify admin new user:", notifyErr.message);
    }
    res.json({
      ok: true,
      message: "Pendaftaran berhasil. Admin akan memberi akses menu. Silakan login."
    });
  } catch (e) {
    console.error("register verify:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal menyelesaikan pendaftaran." });
  }
});

app.post("/api/auth/forgot-password/send-code", async (req, res) => {
  const usernameCheck = validateUsernameField(req.body?.username);
  if (usernameCheck.error) return res.status(400).json({ error: usernameCheck.error });
  const username = usernameCheck.username;
  try {
    const cooldown = resendCooldownError(username, "reset_password");
    if (cooldown) {
      return res.status(429).json({
        error: cooldown.message,
        retryAfterSeconds: cooldown.retryAfterSeconds
      });
    }
    const user = await findMemberByUsername(username);
    if (!user || !user.email_verified) {
      markAuthCodeSent(username, "reset_password");
      return res.json({
        ok: true,
        message: "Jika username terdaftar, kode verifikasi telah dikirim ke email pada akun tersebut.",
        retryAfterSeconds: Math.ceil(AUTH_CODE_RESEND_MS / 1000)
      });
    }
    const code = generateVerificationCode();
    await saveAuthCode(username, "reset_password", code);
    await sendMail({
      to: user.email,
      subject: "Kode reset password GBC Cash Management",
      text: verificationEmailText("reset_password", code, username)
    });
    markAuthCodeSent(username, "reset_password");
    res.json({
      ok: true,
      message: "Kode verifikasi dikirim ke email Anda.",
      retryAfterSeconds: Math.ceil(AUTH_CODE_RESEND_MS / 1000)
    });
  } catch (e) {
    console.error("forgot send-code:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal mengirim kode." });
  }
});

app.post("/api/auth/forgot-password/reset", async (req, res) => {
  const usernameCheck = validateUsernameField(req.body?.username);
  const code = String(req.body?.code || "").trim();
  const password = String(req.body?.password || "");
  const confirm = String(req.body?.confirmPassword ?? req.body?.confirm_password ?? "");
  const pwErr = validatePasswordPair(password, confirm);
  if (usernameCheck.error) return res.status(400).json({ error: usernameCheck.error });
  if (!code) return res.status(400).json({ error: "Kode verifikasi wajib diisi." });
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const ok = await consumeAuthCode(usernameCheck.username, "reset_password", code);
    if (!ok) return res.status(400).json({ error: "Kode verifikasi salah atau kedaluwarsa." });
    await updateMemberPassword(usernameCheck.username, password);
    res.json({ ok: true, message: "Password diperbarui. Silakan login." });
  } catch (e) {
    console.error("forgot reset:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal reset password." });
  }
});

app.get("/api/admin/users", requireAuth, requireRoles("admin", "super_admin"), async (req, res) => {
  try {
    const users = await listMembersForAdmin();
    res.json({ ok: true, users, catalog: accessCatalogForAdmin(), registryUrl: registrySpreadsheetUrl() });
  } catch (e) {
    console.error("admin users:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat daftar user." });
  }
});

app.delete("/api/admin/users/:userId", requireAuth, requireCsrf, requireRoles("admin", "super_admin"), async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User ID wajib." });
  try {
    const removed = await deleteMemberUser(userId);
    res.json({ ok: true, message: "Akun user dihapus.", user: removed });
  } catch (e) {
    console.error("admin user delete:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal menghapus user." });
  }
});

app.patch("/api/admin/users/:userId/access", requireAuth, requireCsrf, requireRoles("admin", "super_admin"), async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "User ID wajib." });
  try {
    const access = await setMemberAccess(userId, {
      access_kas_kecil: !!req.body?.access_kas_kecil,
      access_kas_besar: !!req.body?.access_kas_besar,
      input_kas_kecil: !!req.body?.input_kas_kecil,
      input_kas_besar: !!req.body?.input_kas_besar,
      edit_kas_kecil: !!req.body?.edit_kas_kecil,
      edit_kas_besar: !!req.body?.edit_kas_besar,
      entities_kas_kecil: req.body?.entities_kas_kecil,
      sumber_dana_kas_kecil: req.body?.sumber_dana_kas_kecil,
      entities_kas_besar: req.body?.entities_kas_besar,
      sumber_dana_kas_besar: req.body?.sumber_dana_kas_besar
    });
    if (access?.user_id) invalidateMemberFreshCache(access.user_id);
    res.json({ ok: true, message: "Akses user diperbarui.", access });
  } catch (e) {
    console.error("admin user access:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memperbarui akses." });
  }
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (req, res) => {
  res.setHeader("Set-Cookie", clearCookie());
  res.json({ ok: true });
});

function entityScopeForRequest(req, kind) {
  const user = req.user;
  if (!user || isUnrestrictedRole(user)) return null;
  const allowed = memberEntities(user, kind);
  return allowed.length ? allowed : [];
}

async function sheetList(kind, req) {
  const categories = loadCategories();
  const allowed = kind === "kas_besar" ? categories.kasBesar : categories.kasKecil;
  const force = req.query.refresh === "1" || req.query.refresh === "true";
  const parsed = await fetchRows(kind, { force });
  const scope = entityScopeForRequest(req, kind);
  const filters = { ...req.query, strictCategory: false };
  if (scope) filters.allowedEntities = scope;
  return listFromSheet(parsed, filters, allowed);
}

app.get("/api/kas-besar/transactions", requireAuth, attachFreshMember, requireKasBesarRead, async (req, res) => {
  try {
    res.json(await sheetList("kas_besar", req));
  } catch (e) {
    console.error("kas-besar read:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal membaca spreadsheet Kas Besar." });
  }
});

app.get("/api/kas-kecil/transactions", requireAuth, attachFreshMember, requireKasKecilRead, async (req, res) => {
  try {
    res.json(await sheetList("kas_kecil", req));
  } catch (e) {
    console.error("kas-kecil read:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal membaca spreadsheet Kas Kecil." });
  }
});

app.get("/api/export/bukti/:fileId", requireAuth, async (req, res) => {
  const fileId = String(req.params.fileId || "").trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return res.status(400).json({ error: "ID bukti tidak valid." });
  }
  try {
    const preview = await fetchDriveBuktiPreview(fileId);
    if (!preview) {
      return res.status(404).json({
        error: "Gambar bukti tidak dapat diambil. Pastikan Drive OAuth aktif dan file masih ada."
      });
    }
    res.setHeader("Content-Type", preview.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Bukti-Name", encodeURIComponent(preview.name));
    res.send(preview.buffer);
  } catch (e) {
    console.error("export bukti:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal mengambil bukti." });
  }
});

app.get("/api/form-options/:kind", requireAuth, (req, res) => {
  const kind = req.params.kind === "kas-besar" ? "kas_besar" : "kas_kecil";
  res.json(filterFormOptionsForUser(req.user, kind));
});

function picFromSessionUser(user) {
  return String(user?.display_name || user?.username || "").trim();
}

async function buktiFilesMetaForPayload(buktiRaw) {
  const ids = extractAllDriveFileIds(buktiRaw);
  const buktiFiles = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const meta = await fetchDriveBuktiMeta(id);
    buktiFiles.push({
      id,
      href: driveFileViewUrl(id),
      name: meta?.name || `Bukti ${i + 1}`,
      mimeType: meta?.mimeType || ""
    });
  }
  return buktiFiles;
}

async function submitTransaction(req, res, kind) {
  const files = req.files || [];
  const driveUpload = await inspectUploadFolder();
  const payload = normalizeTransactionBody(req.body);
  payload.tanggal = resolveTanggalPengeluaran(payload.tanggal);
  payload.pic = picFromSessionUser(req.user) || payload.pic;
  const validationError = validateTransactionPayload(payload, kind, files, driveUpload.ready);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  if (payload.category === OTHER_CATEGORY) {
    payload.category = `${OTHER_CATEGORY} — ${payload.categoryOther}`;
  }
  const scopeError = validateMemberScopeForSubmit(req.user, kind, payload);
  if (scopeError) {
    return res.status(403).json({ error: scopeError });
  }
  try {
    if (files.length) {
      const links = await uploadBuktiFiles(files, {
        nameForFile: (file, index, total) =>
          buktiDriveFileName(kind, payload, file.originalname, index, total)
      });
      payload.bukti = links.join("\n");
    }
    const appendResult = await appendTransaction(kind, payload);
    let compile = null;
    try {
      compile = await compileAllRecap();
    } catch (compileErr) {
      console.error("compile after submit:", compileErr.message);
      compile = { error: compileErr.message };
    }
    res.json({
      ok: true,
      message: "Transaksi tersimpan. Rekap entitas & laporan bulanan diperbarui.",
      append: appendResult,
      compile
    });
  } catch (e) {
    console.error(`${kind} submit:`, e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal menyimpan transaksi." });
  }
}

app.post(
  "/api/kas-kecil/transactions",
  requireAuth,
  attachFreshMember,
  requireCsrf,
  requireKasKecilSubmit,
  buktiUpload.array("buktiFiles", 5),
  (req, res) => submitTransaction(req, res, "kas_kecil")
);

app.post(
  "/api/kas-besar/transactions",
  requireAuth,
  attachFreshMember,
  requireCsrf,
  requireKasBesarSubmit,
  buktiUpload.array("buktiFiles", 5),
  (req, res) => submitTransaction(req, res, "kas_besar")
);

async function reviseTransaction(req, res, kind) {
  const rowNumber = Number(req.params.rowNumber);
  if (!Number.isFinite(rowNumber) || rowNumber < 2) {
    return res.status(400).json({ error: "Nomor baris tidak valid." });
  }
  const files = req.files || [];
  const driveUpload = await inspectUploadFolder();
  let existing;
  try {
    existing = await getTransactionRow(kind, rowNumber);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Baris tidak ditemukan." });
  }
  const payload = normalizeTransactionBody(req.body);
  payload.tanggal = resolveTanggalPengeluaran(payload.tanggal);
  payload.pic = String(payload.pic || existing.payload.pic || picFromSessionUser(req.user)).trim();
  const buktiBaseline = payload.bukti || existing.payload.bukti;
  const validationError = validateTransactionPayload(
    { ...payload, bukti: buktiBaseline },
    kind,
    files,
    driveUpload.ready
  );
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  if (payload.category === OTHER_CATEGORY) {
    payload.category = `${OTHER_CATEGORY} — ${payload.categoryOther}`;
  }
  const scopeError = validateMemberScopeForEdit(req.user, kind, payload);
  if (scopeError) {
    return res.status(403).json({ error: scopeError });
  }
  try {
    if (files.length) {
      if (!driveUpload.ready) {
        return res.status(503).json({ error: "Upload bukti baru tidak tersedia (Drive OAuth belum aktif)." });
      }
      const links = await uploadBuktiFiles(files, {
        nameForFile: (file, index, total) =>
          buktiDriveFileName(kind, payload, file.originalname, index, total)
      });
      const prior = payload.bukti || existing.payload.bukti;
      payload.bukti = [prior, links.join("\n")].filter(Boolean).join("\n");
    } else if (!payload.bukti) {
      payload.bukti = existing.payload.bukti;
    }

    const previousIds = extractAllDriveFileIds(existing.payload.bukti);
    const nextIds = extractAllDriveFileIds(payload.bukti);
    const removedIds = previousIds.filter(id => !nextIds.includes(id));
    let driveBuktiDelete = null;
    let driveEntityRemovedCopies = null;
    if (removedIds.length) {
      if (!driveUpload.ready) {
        return res.status(503).json({
          error:
            "Menghapus bukti membutuhkan Google Drive OAuth aktif. Sisakan semua gambar atau hubungi admin untuk menghubungkan Drive."
        });
      }
      const removedRaw = removedIds.map(id => driveFileViewUrl(id)).join("\n");
      try {
        driveEntityRemovedCopies = await removeBuktiFromEntityFolder(
          kind,
          payload.entitas,
          removedRaw,
          payload
        );
      } catch (removeCopyErr) {
        console.error("revisi drive bukti entity cleanup:", removeCopyErr.message);
        driveEntityRemovedCopies = { removed: 0, errors: [removeCopyErr.message] };
      }
      try {
        driveBuktiDelete = await trashBuktiDriveFiles(removedIds);
      } catch (delErr) {
        console.error("revisi drive bukti trash:", delErr.message);
        return res.status(delErr.status || 500).json({
          error: delErr.message || "Gagal menghapus bukti dari Google Drive."
        });
      }
    }

    let driveRename = null;
    let driveEntityRemove = null;
    let driveEntitySync = null;
    if (entitiesDiffer(existing.payload.entitas, payload.entitas)) {
      try {
        driveEntityRemove = await removeBuktiFromEntityFolder(
          kind,
          existing.payload.entitas,
          existing.payload.bukti,
          existing.payload
        );
      } catch (removeErr) {
        console.error("revisi drive entity remove:", removeErr.message);
        driveEntityRemove = { removed: 0, errors: [removeErr.message] };
      }
    }
    try {
      driveRename = await renameBuktiFilesForPayload(kind, payload.bukti, payload);
    } catch (driveErr) {
      console.error("revisi drive rename:", driveErr.message);
      driveRename = { renamed: 0, errors: [driveErr.message] };
    }
    try {
      driveEntitySync = await syncBuktiFilesToEntityDrive(kind, payload.bukti, payload);
      if (driveEntitySync.buktiLinks?.length) {
        payload.bukti = driveEntitySync.buktiLinks.join("\n");
      }
    } catch (syncErr) {
      console.error("revisi drive entity sync:", syncErr.message);
      driveEntitySync = { copied: 0, errors: [syncErr.message] };
    }
    const updated = await updateTransactionRow(kind, rowNumber, payload, {
      revisedBy: picFromSessionUser(req.user)
    });
    let compile = null;
    try {
      compile = await compileAllRecap();
    } catch (compileErr) {
      console.error("compile after revisi:", compileErr.message);
      compile = { error: compileErr.message };
    }
    const parts = [];
    if (driveEntityRemove?.removed) parts.push(`${driveEntityRemove.removed} salinan lama di folder entitas dihapus`);
    if (driveBuktiDelete?.trashed) parts.push(`${driveBuktiDelete.trashed} bukti dihapus dari Drive`);
    if (driveRename?.renamed) parts.push(`${driveRename.renamed} bukti di-rename`);
    if (driveEntitySync?.copied) parts.push(`${driveEntitySync.copied} bukti disalin ke folder entitas`);
    const warn =
      (driveRename?.errors?.length || 0) +
        (driveEntityRemove?.errors?.length || 0) +
        (driveEntitySync?.errors?.length || 0) +
        (driveBuktiDelete?.errors?.length || 0) +
        (driveEntityRemovedCopies?.errors?.length || 0) >
      0
        ? ` Beberapa langkah Drive gagal — cek log server.`
        : "";
    res.json({
      ok: true,
      message: `Revisi tersimpan (baris ${rowNumber}).${parts.length ? ` ${parts.join("; ")}.` : ""}${warn}`,
      update: updated,
      driveRename,
      driveEntityRemove,
      driveEntitySync,
      driveBuktiDelete,
      driveEntityRemovedCopies,
      compile
    });
  } catch (e) {
    console.error(`${kind} revisi:`, e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal menyimpan revisi." });
  }
}

app.patch(
  "/api/kas-kecil/transactions/:rowNumber",
  requireAuth,
  attachFreshMember,
  requireCsrf,
  requireKasKecilEdit,
  buktiUpload.array("buktiFiles", 5),
  (req, res) => reviseTransaction(req, res, "kas_kecil")
);

app.patch(
  "/api/kas-besar/transactions/:rowNumber",
  requireAuth,
  attachFreshMember,
  requireCsrf,
  requireKasBesarEdit,
  buktiUpload.array("buktiFiles", 5),
  (req, res) => reviseTransaction(req, res, "kas_besar")
);

app.get("/api/kas-kecil/transactions/:rowNumber", requireAuth, attachFreshMember, requireKasKecilEdit, async (req, res) => {
  try {
    const data = await getTransactionRow("kas_kecil", req.params.rowNumber);
    const buktiFiles = await buktiFilesMetaForPayload(data.payload?.bukti);
    res.json({ ok: true, ...data, buktiFiles });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat baris." });
  }
});

app.get("/api/kas-besar/transactions/:rowNumber", requireAuth, attachFreshMember, requireKasBesarEdit, async (req, res) => {
  try {
    const data = await getTransactionRow("kas_besar", req.params.rowNumber);
    const buktiFiles = await buktiFilesMetaForPayload(data.payload?.bukti);
    res.json({ ok: true, ...data, buktiFiles });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat baris." });
  }
});

app.post("/api/hub/compile-recap", requireAuth, requireCsrf, requireRoles("super_admin", "owner"), async (req, res) => {
  try {
    const result = await compileAllRecap();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("compile-recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal compile rekap." });
  }
});

app.get("/api/super-admin/recap", requireAuth, requireRoles("super_admin"), async (req, res) => {
  try {
    const summary = await superAdminCombinedRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    res.json(summary);
  } catch (e) {
    console.error("super-admin recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat recap Super Admin." });
  }
});

app.get("/api/kas-kecil/recap", requireAuth, attachFreshMember, requireKasKecilRead, async (req, res) => {
  try {
    const scope = entityScopeForRequest(req, "kas_kecil");
    const summary = await kasKecilRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      allowedEntities: scope || undefined
    });
    res.json(summary);
  } catch (e) {
    console.error("kas-kecil recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat dashboard Kas Kecil." });
  }
});

app.get("/api/kas-besar/recap", requireAuth, attachFreshMember, requireKasBesarRead, async (req, res) => {
  try {
    const scope = entityScopeForRequest(req, "kas_besar");
    const summary = await kasBesarRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      allowedEntities: scope || undefined
    });
    res.json(summary);
  } catch (e) {
    console.error("kas-besar recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat dashboard Bank." });
  }
});

app.get("/api/admin/kas-kecil/recap", requireAuth, requireRoles("admin"), async (req, res) => {
  try {
    const summary = await kasKecilRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    res.json(summary);
  } catch (e) {
    console.error("admin kas-kecil recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat recap Kas Kecil." });
  }
});

app.get("/api/owner/dashboard", requireAuth, requireRoles("owner"), async (req, res) => {
  try {
    const summary = await superAdminCombinedRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    res.json(summary);
  } catch (e) {
    console.error("dashboard:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat dashboard dari spreadsheet." });
  }
});

app.get("/api/owner/insights", requireAuth, requireRoles("owner"), async (req, res) => {
  try {
    const data = await generateOwnerInsights({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    res.json(data);
  } catch (e) {
    console.error("owner insights:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal menghasilkan insight Gemini." });
  }
});

const cmsHtml = path.join(__dirname, "public", "cms.html");
app.get(/^\/(admin|super-admin|owner|member)(\/.*)?$/, requireAuthPage, (req, res) => {
  res.sendFile(cmsHtml);
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  res.status(404).send("Halaman tidak ditemukan.");
});

function startLocalServer() {
  app.listen(PORT, () => {
    console.log(`GBC Cash Management running on http://localhost:${PORT}`);
    console.log(
      hubSheetMode()
        ? `Input transaksi: Web app → Hub ${HUB_ID} (tab KAS KECIL / KAS BESAR) + compile otomatis`
        : "Input: legacy Google Form sheets (readonly)"
    );
    if (!sheetsConfigured()) {
      console.warn("GOOGLE_SERVICE_ACCOUNT_PATH belum di-set — tabel/dashboard akan error sampai dikonfigurasi.");
    }
    logGeminiStartupHint();
  });
}

module.exports = app;

if (require.main === module) {
  startLocalServer();
}
