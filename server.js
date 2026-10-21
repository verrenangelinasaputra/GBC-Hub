require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { roleConfig, pathAllowedForRole, requireRoles } = require("./lib/auth");
const { findUser, verifyPassword, publicUser } = require("./lib/users");
const {
  loadCategories,
  sheetsConfigured,
  fetchRows,
  listFromSheet,
  kasKecilRecap,
  superAdminCombinedRecap
} = require("./lib/sheets");
const { geminiConfigured, generateOwnerInsights } = require("./lib/owner-insights");
const { logGeminiStartupHint } = require("./lib/gemini");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 24) {
  console.error("Set SESSION_SECRET in .env to a random value at least 24 characters long.");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false }));

const sessions = new Map();
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);

const EXTERNAL_LINKS = {
  kasBesarForm: "https://forms.gle/n3kfDNSQ9j18dPKMA",
  kasKecilForm: "https://forms.gle/jN6rXf3oCJK9eyZx7",
  kasBesarSheet: "https://docs.google.com/spreadsheets/d/1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY/edit?gid=1533749503#gid=1533749503",
  kasKecilSheet: "https://docs.google.com/spreadsheets/d/1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM/edit?gid=423968165#gid=423968165"
};

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
    (process.env.NODE_ENV === "production" ? "; Secure" : "");
}
function clearCookie() {
  return `gbc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
    (process.env.NODE_ENV === "production" ? "; Secure" : "");
}
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const found = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}
function sessionFor(req) {
  const token = getCookie(req, "gbc_session");
  if (!token) return null;
  const [sid, mac] = token.split(".");
  if (!sid || !mac || !safeEqual(mac, sign(sid))) return null;
  const session = sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}
function createSession(res, user) {
  const sid = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, {
    user: publicUser(user),
    csrf,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  res.setHeader("Set-Cookie", makeCookie(`${sid}.${sign(sid)}`));
  return { csrf, home: roleConfig(user.role)?.home || "/login" };
}
function requireAuth(req, res, next) {
  const session = sessionFor(req);
  if (!session) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  req.user = session.user;
  req.sessionCsrf = session.csrf;
  next();
}
function requireCsrf(req, res, next) {
  const token = req.headers["x-csrf-token"] || req.body?._csrf || "";
  if (!token || !req.sessionCsrf || !safeEqual(token, req.sessionCsrf)) {
    return res.status(403).json({ error: "Token CSRF tidak valid. Muat ulang halaman dan coba lagi." });
  }
  next();
}
function requireAuthPage(req, res, next) {
  const session = sessionFor(req);
  if (!session) return res.redirect("/login");
  if (!pathAllowedForRole(req.path, session.user.role)) {
    return res.status(403).send("Akses ditolak untuk role Anda.");
  }
  req.user = session.user;
  next();
}

app.get("/login", (req, res) => {
  const session = sessionFor(req);
  if (session) return res.redirect(roleConfig(session.user.role)?.home || "/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

const appPages = [
  "/admin/kas-kecil",
  "/admin/kas-kecil/recap",
  "/super-admin/kas-besar",
  "/super-admin/kas-kecil",
  "/super-admin/recap",
  "/owner/dashboard",
  "/owner/business-units",
  "/owner/kas-besar",
  "/owner/kas-kecil"
];
for (const route of appPages) {
  app.get(route, requireAuthPage, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "cms.html"));
  });
}

app.get("/", (req, res) => {
  const session = sessionFor(req);
  if (!session) return res.redirect("/login");
  res.redirect(roleConfig(session.user.role)?.home || "/login");
});

app.get("/api/me", (req, res) => {
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
  res.json({
    authenticated: true,
    user: session.user,
    csrf: session.csrf,
    permissions: roleConfig(session.user.role),
    links: EXTERNAL_LINKS,
    categories,
    sheetsReady: sheetsConfigured(),
    geminiReady: geminiConfigured()
  });
});

app.post("/api/auth/login", (req, res) => {
  const login = String(req.body?.login || "").trim();
  const password = String(req.body?.password || "");
  if (!login || !password) {
    return res.status(400).json({ error: "Username/email dan password wajib diisi." });
  }
  const user = findUser(login);
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
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (req, res) => {
  const token = getCookie(req, "gbc_session");
  const [sid] = token.split(".");
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", clearCookie());
  res.json({ ok: true });
});

async function sheetList(kind, req) {
  const categories = loadCategories();
  const allowed = kind === "kas_besar" ? categories.kasBesar : categories.kasKecil;
  const parsed = await fetchRows(kind);
  return listFromSheet(parsed, { ...req.query, strictCategory: false }, allowed);
}

app.get("/api/kas-besar/transactions", requireAuth, requireRoles("super_admin", "owner"), async (req, res) => {
  try {
    res.json(await sheetList("kas_besar", req));
  } catch (e) {
    console.error("kas-besar read:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal membaca spreadsheet Kas Besar." });
  }
});

app.get("/api/kas-kecil/transactions", requireAuth, requireRoles("admin", "super_admin", "owner"), async (req, res) => {
  try {
    res.json(await sheetList("kas_kecil", req));
  } catch (e) {
    console.error("kas-kecil read:", e.message);
    res.status(e.status || 500).json({ error: e.message || "Gagal membaca spreadsheet Kas Kecil." });
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

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  res.status(404).send("Halaman tidak ditemukan.");
});

app.listen(PORT, () => {
  console.log(`GBC Cash Management running on http://localhost:${PORT}`);
  console.log("Input transaksi: Google Form · Data: Google Spreadsheet (readonly API)");
  if (!sheetsConfigured()) {
    console.warn("GOOGLE_SERVICE_ACCOUNT_PATH belum di-set — tabel/dashboard akan error sampai dikonfigurasi.");
  }
  logGeminiStartupHint();
});
