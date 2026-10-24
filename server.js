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
  requireKasKecilRead
} = require("./lib/auth");
const { findUser, verifyPassword, publicUser } = require("./lib/users");
const { sendMail, verificationEmailText, adminNotifyEmail, newUserNotifyText } = require("./lib/mail");
const {
  findMemberByEmail,
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
  hubSheetMode,
  getHubSpreadsheetId,
  parseMoneyValue,
  serviceAccountEmailForHelp
} = require("./lib/sheets");
const { compileAllRecap } = require("./lib/compileRecap");
const { ENTITIES } = require("./config/hubForm");
const { formOptionsForKind } = require("./config/formDefinitions");
const {
  uploadBuktiFiles,
  inspectUploadFolder,
  peekUploadFolderCache,
  invalidateUploadFolderCache
} = require("./lib/driveUpload");
const { buktiDriveFileName, tanggalFromTransactionBody, normalizeTanggalPengeluaran } = require("./lib/buktiFileName");
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
function makeCookie(value) {
  return `gbc_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` +
    (isProductionCookie() ? "; Secure" : "");
}
function clearCookie() {
  return `gbc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
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
function createSession(res, user) {
  if (!signingReady()) {
    throw new Error("SESSION_SECRET belum dikonfigurasi.");
  }
  const csrf = crypto.randomBytes(24).toString("hex");
  const token = encodeSessionToken({
    user: publicUser(user),
    csrf,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  res.setHeader("Set-Cookie", makeCookie(token));
  return { csrf, home: permissionsForUser(user)?.home || roleConfig(user.role)?.home || "/login" };
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

function validateRegisterFields(body) {
  const name = String(body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const phone = String(body?.phone || "").trim();
  const password = String(body?.password || "");
  const confirm = String(body?.confirmPassword ?? body?.confirm_password ?? "");
  if (!name || name.length < 2) return { error: "Nama wajib diisi (min. 2 karakter)." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (!phone || phone.length < 8) return { error: "Nomor telepon wajib diisi." };
  const pwErr = validatePasswordPair(password, confirm);
  if (pwErr) return { error: pwErr };
  return { name, email, phone, password };
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

function invalidateMemberFreshCache(email) {
  const key = String(email || "")
    .trim()
    .toLowerCase();
  if (key) memberFreshCache.delete(key);
}

async function findMemberByEmailFresh(email) {
  const key = String(email || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const hit = memberFreshCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_FRESH_CACHE_MS) return hit.user;
  const user = await findMemberByEmail(key);
  if (user) memberFreshCache.set(key, { at: Date.now(), user });
  return user;
}

async function attachFreshMember(req, res, next) {
  if (req.user?.role !== "member") return next();
  try {
    const fresh = await findMemberByEmailFresh(req.user.email);
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
      const fresh = await findMemberByEmailFresh(user.email);
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
      ? findMemberByEmailFresh(user.email).catch(() => null)
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
      kas_besar: formOptionsForKind("kas_besar"),
      kas_kecil: formOptionsForKind("kas_kecil")
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
  return mac && safeEqual(mac, sign(body));
}

app.get("/api/oauth/drive/connect", requireAuth, requireRoles("super_admin", "admin"), (req, res) => {
  if (!oauthClientConfigured()) {
    return res.status(503).send(
      "OAuth belum siap. Isi GOOGLE_OAUTH_CLIENT_ID dan GOOGLE_OAUTH_CLIENT_SECRET di .env — lihat docs/DRIVE_BUKTI_SETUP.md"
    );
  }
  res.redirect(getDriveOAuthUrl(signOAuthState()));
});

app.get("/api/oauth/drive/callback", async (req, res) => {
  if (!verifyOAuthState(String(req.query.state || ""))) {
    return res.status(403).send("OAuth state tidak valid. Ulangi dari tombol Hubungkan Google Drive.");
  }
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
    return res.status(400).json({ error: "Username/email dan password wajib diisi." });
  }
  try {
    const user = await findUser(login);
    if (!user || !verifyPassword(user, password)) {
      return res.status(401).json({ error: "Kredensial tidak valid." });
    }
    const sessionInfo = createSession(res, user);
    res.json({
      ok: true,
      user: publicUser(user),
      csrf: sessionInfo.csrf,
      redirect: sessionInfo.home
    });
  } catch (e) {
    console.error("login:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal login." });
  }
});

const pendingRegister = new Map();
const AUTH_CODE_RESEND_MS = Number(process.env.AUTH_CODE_RESEND_MS || 60_000);
const authCodeLastSent = new Map();

function authCodeSentKey(email, purpose) {
  return `${purpose}:${normalizeEmail(email)}`;
}

function resendCooldownError(email, purpose) {
  const key = authCodeSentKey(email, purpose);
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

function markAuthCodeSent(email, purpose) {
  authCodeLastSent.set(authCodeSentKey(email, purpose), Date.now());
}

app.post("/api/auth/register/send-code", async (req, res) => {
  const parsed = validateRegisterFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const cooldown = resendCooldownError(parsed.email, "register");
    if (cooldown) {
      return res.status(429).json({
        error: cooldown.message,
        retryAfterSeconds: cooldown.retryAfterSeconds
      });
    }
    const existing = await findMemberByEmail(parsed.email);
    if (existing) return res.status(409).json({ error: "Email sudah terdaftar. Silakan login." });
    const code = generateVerificationCode();
    await saveAuthCode(parsed.email, "register", code);
    await sendMail({
      to: parsed.email,
      subject: "Kode verifikasi pendaftaran GBC Cash Management",
      text: verificationEmailText("register", code)
    });
    markAuthCodeSent(parsed.email, "register");
    pendingRegister.set(parsed.email, {
      name: parsed.name,
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
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();
  if (!email || !code) return res.status(400).json({ error: "Email dan kode verifikasi wajib diisi." });
  const pending = pendingRegister.get(email);
  if (!pending || Date.now() - pending.at > 30 * 60 * 1000) {
    return res.status(400).json({ error: "Sesi pendaftaran kedaluwarsa. Ulangi dari awal." });
  }
  try {
    const ok = await consumeAuthCode(email, "register", code);
    if (!ok) return res.status(400).json({ error: "Kode verifikasi salah atau kedaluwarsa." });
    await createMemberUser({
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      password: pending.password
    });
    pendingRegister.delete(email);
    try {
      await sendMail({
        to: adminNotifyEmail(),
        subject: "[GBC Cash Management] User baru terdaftar",
        text: newUserNotifyText({
          name: pending.name,
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
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email wajib diisi." });
  try {
    const cooldown = resendCooldownError(email, "reset_password");
    if (cooldown) {
      return res.status(429).json({
        error: cooldown.message,
        retryAfterSeconds: cooldown.retryAfterSeconds
      });
    }
    const user = await findMemberByEmail(email);
    if (!user || !user.email_verified) {
      markAuthCodeSent(email, "reset_password");
      return res.json({
        ok: true,
        message: "Jika email terdaftar, kode verifikasi telah dikirim.",
        retryAfterSeconds: Math.ceil(AUTH_CODE_RESEND_MS / 1000)
      });
    }
    const code = generateVerificationCode();
    await saveAuthCode(email, "reset_password", code);
    await sendMail({
      to: email,
      subject: "Kode reset password GBC Cash Management",
      text: verificationEmailText("reset_password", code)
    });
    markAuthCodeSent(email, "reset_password");
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
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();
  const password = String(req.body?.password || "");
  const confirm = String(req.body?.confirmPassword ?? req.body?.confirm_password ?? "");
  const pwErr = validatePasswordPair(password, confirm);
  if (!email || !code) return res.status(400).json({ error: "Email dan kode wajib diisi." });
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const ok = await consumeAuthCode(email, "reset_password", code);
    if (!ok) return res.status(400).json({ error: "Kode verifikasi salah atau kedaluwarsa." });
    await updateMemberPassword(email, password);
    res.json({ ok: true, message: "Password diperbarui. Silakan login." });
  } catch (e) {
    console.error("forgot reset:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal reset password." });
  }
});

app.get("/api/admin/users", requireAuth, requireRoles("admin", "super_admin"), async (req, res) => {
  try {
    const users = await listMembersForAdmin();
    res.json({ ok: true, users, registryUrl: registrySpreadsheetUrl() });
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
      input_kas_besar: !!req.body?.input_kas_besar
    });
    if (access?.email) invalidateMemberFreshCache(access.email);
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

async function sheetList(kind, req) {
  const categories = loadCategories();
  const allowed = kind === "kas_besar" ? categories.kasBesar : categories.kasKecil;
  const force = req.query.refresh === "1" || req.query.refresh === "true";
  const parsed = await fetchRows(kind, { force });
  return listFromSheet(parsed, { ...req.query, strictCategory: false }, allowed);
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

app.get("/api/form-options/:kind", requireAuth, (req, res) => {
  const kind = req.params.kind === "kas-besar" ? "kas_besar" : "kas_kecil";
  res.json(formOptionsForKind(kind));
});

function picFromSessionUser(user) {
  return String(user?.display_name || user?.username || "").trim();
}

async function submitTransaction(req, res, kind) {
  const files = req.files || [];
  const driveUpload = await inspectUploadFolder();
  const payload = normalizeTransactionBody(req.body);
  payload.tanggal = normalizeTanggalPengeluaran(payload.tanggal);
  payload.pic = picFromSessionUser(req.user) || payload.pic;
  const validationError = validateTransactionPayload(payload, kind, files, driveUpload.ready);
  if (validationError) {
    return res.status(400).json({ error: validationError });
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
    const summary = await kasKecilRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    });
    res.json(summary);
  } catch (e) {
    console.error("kas-kecil recap:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal memuat dashboard Kas Kecil." });
  }
});

app.get("/api/kas-besar/recap", requireAuth, attachFreshMember, requireKasBesarRead, async (req, res) => {
  try {
    const summary = await kasBesarRecap({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
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
