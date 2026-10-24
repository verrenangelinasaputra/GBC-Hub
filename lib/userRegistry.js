const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { google } = require("googleapis");
const { sheetsConfigured, serviceAccountEmailForHelp } = require("./sheets");

const USERS_SHEET_ID =
  process.env.USERS_REGISTRY_SPREADSHEET_ID || "1MRM3lQ37fKHezJ7QW8IdTTuvXRhIvUBjA2cVjZJ3CqE";
const TAB_USERS = process.env.USERS_REGISTRY_TAB || "Users";
const TAB_CODES = process.env.USERS_AUTH_CODES_TAB || "AuthCodes";

const USER_HEADERS = [
  "user_id",
  "name",
  "email",
  "phone",
  "password_hash",
  "email_verified",
  "access_kas_kecil",
  "access_kas_besar",
  "input_kas_kecil",
  "input_kas_besar",
  "created_at",
  "updated_at"
];

const CODE_HEADERS = ["email", "purpose", "code_hash", "expires_at", "created_at"];

const CACHE_MS = Number(process.env.USERS_REGISTRY_CACHE_MS || 30_000);
let usersCache = { at: 0, rows: [] };
let sheetsApi = null;

function parseServiceAccountCredentials_() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(String(raw).trim());
  } catch {
    const err = new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak valid.");
    err.status = 503;
    throw err;
  }
}

async function getRegistrySheetsClient() {
  if (sheetsApi) return sheetsApi;
  if (!sheetsConfigured()) {
    const err = new Error("Google Sheets belum dikonfigurasi untuk registry user.");
    err.status = 503;
    throw err;
  }
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const credentials = parseServiceAccountCredentials_();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const auth = credentials
    ? new google.auth.GoogleAuth({ credentials, scopes })
    : new google.auth.GoogleAuth({ keyFile, scopes });
  sheetsApi = google.sheets({ version: "v4", auth });
  return sheetsApi;
}

function a1Tab(tabName, cells = "A1:ZZ5000") {
  const safe = String(tabName).replace(/'/g, "''");
  return `'${safe}'!${cells}`;
}

/** 1-based column index → A, B, …, Z, AA, … */
function columnLetter1Based(col) {
  let n = col;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s || "A";
}

function truthyCell(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function rowToUser(headers, row) {
  const map = {};
  headers.forEach((h, i) => {
    map[String(h).trim().toLowerCase()] = row[i] ?? "";
  });
  const email = String(map.email || "").trim().toLowerCase();
  if (!email) return null;
  return {
    user_id: String(map.user_id || email).trim(),
    username: email,
    email,
    phone: String(map.phone || "").trim(),
    display_name: String(map.name || email).trim(),
    password_hash: String(map.password_hash || ""),
    email_verified: truthyCell(map.email_verified),
    access_kas_kecil: truthyCell(map.access_kas_kecil),
    access_kas_besar: truthyCell(map.access_kas_besar),
    input_kas_kecil: truthyCell(map.input_kas_kecil),
    input_kas_besar: truthyCell(map.input_kas_besar),
    role: "member",
    created_at: String(map.created_at || ""),
    updated_at: String(map.updated_at || "")
  };
}

async function readUsersTabValues() {
  const sheets = await getRegistrySheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_USERS)
  });
  return res.data.values || [];
}

/** Pastikan header Users punya kolom input_kas_* (sheet lama sering belum punya). */
async function ensureUserSheetColumns() {
  const sheetId = await ensureTab(USERS_SHEET_ID, TAB_USERS, USER_HEADERS);
  const sheets = await getRegistrySheetsClient();
  let values = await readUsersTabValues();
  if (!values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: USERS_SHEET_ID,
      range: a1Tab(TAB_USERS, "A1"),
      valueInputOption: "RAW",
      requestBody: { values: [USER_HEADERS] }
    });
    invalidateUsersCache();
    return;
  }

  let headers = values[0].map(h => String(h).trim().toLowerCase());
  const expected = USER_HEADERS.map(h => h.toLowerCase());
  const missing = expected.filter(h => !headers.includes(h));
  if (!missing.length) return;

  const legacyInputMissing =
    headers.includes("access_kas_besar") &&
    !headers.includes("input_kas_kecil") &&
    headers.includes("created_at");

  if (legacyInputMissing && sheetId != null) {
    const insertAt = headers.indexOf("created_at");
    if (insertAt >= 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: USERS_SHEET_ID,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId,
                  dimension: "COLUMNS",
                  startIndex: insertAt,
                  endIndex: insertAt + 2
                },
                inheritFromBefore: false
              }
            }
          ]
        }
      });
      values = await readUsersTabValues();
      headers = values[0].map(h => String(h).trim().toLowerCase());
      const headerRow = [...values[0]];
      while (headerRow.length < insertAt + 2) headerRow.push("");
      headerRow[insertAt] = "input_kas_kecil";
      headerRow[insertAt + 1] = "input_kas_besar";
      await sheets.spreadsheets.values.update({
        spreadsheetId: USERS_SHEET_ID,
        range: a1Tab(TAB_USERS, "A1"),
        valueInputOption: "RAW",
        requestBody: { values: [headerRow] }
      });
      if (values.length > 1) {
        const dataUpdates = [];
        for (let i = 1; i < values.length; i++) {
          const col = String.fromCharCode(65 + insertAt);
          const col2 = String.fromCharCode(65 + insertAt + 1);
          const rowNum = i + 1;
          dataUpdates.push({
            range: a1Tab(TAB_USERS, `${col}${rowNum}:${col2}${rowNum}`),
            values: [["FALSE", "FALSE"]]
          });
        }
        if (dataUpdates.length) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: USERS_SHEET_ID,
            requestBody: { valueInputOption: "RAW", data: dataUpdates }
          });
        }
      }
      invalidateUsersCache();
      return;
    }
  }

  const headerRow = [...USER_HEADERS];
  await sheets.spreadsheets.values.update({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_USERS, "A1"),
    valueInputOption: "RAW",
    requestBody: { values: [headerRow] }
  });
  invalidateUsersCache();
}

async function ensureTab(spreadsheetId, tabName, headers) {
  const sheets = await getRegistrySheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  let sheetId = null;
  for (const s of meta.data.sheets || []) {
    if (s.properties.title === tabName) sheetId = s.properties.sheetId;
  }
  if (sheetId == null) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
    sheetId = add.data.replies?.[0]?.addSheet?.properties?.sheetId;
  }
  const range = a1Tab(tabName, "A1:Z1");
  const head = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const first = (head.data.values || [])[0];
  if (!first || !first.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
  }
  return sheetId;
}

async function readTabRaw(tabName) {
  await ensureTab(USERS_SHEET_ID, TAB_USERS, USER_HEADERS);
  await ensureTab(USERS_SHEET_ID, TAB_CODES, CODE_HEADERS);
  const sheets = await getRegistrySheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(tabName)
  });
  return res.data.values || [];
}

function invalidateUsersCache() {
  usersCache = { at: 0, rows: [] };
}

async function loadSheetUsers(force = false) {
  if (!force && usersCache.rows.length && Date.now() - usersCache.at < CACHE_MS) {
    return usersCache.rows;
  }
  const values = await readTabRaw(TAB_USERS);
  if (!values.length) {
    usersCache = { at: Date.now(), rows: [] };
    return [];
  }
  const headers = values[0].map(h => String(h).trim());
  const users = [];
  for (let i = 1; i < values.length; i++) {
    const u = rowToUser(headers, values[i]);
    if (u) users.push({ ...u, _rowIndex: i + 1 });
  }
  usersCache = { at: Date.now(), rows: users };
  return users;
}

async function findMemberByLogin(login) {
  const key = String(login || "").trim().toLowerCase();
  const users = await loadSheetUsers();
  return users.find(u => u.email === key || u.username === key) || null;
}

async function findMemberByEmail(email) {
  const key = String(email || "").trim().toLowerCase();
  const users = await loadSheetUsers();
  return users.find(u => u.email === key) || null;
}

async function appendUserRow(userRow) {
  const sheets = await getRegistrySheetsClient();
  await ensureTab(USERS_SHEET_ID, TAB_USERS, USER_HEADERS);
  const now = new Date().toISOString();
  const values = [
    userRow.user_id,
    userRow.display_name,
    userRow.email,
    userRow.phone,
    userRow.password_hash,
    userRow.email_verified ? "TRUE" : "FALSE",
    userRow.access_kas_kecil ? "TRUE" : "FALSE",
    userRow.access_kas_besar ? "TRUE" : "FALSE",
    userRow.input_kas_kecil ? "TRUE" : "FALSE",
    userRow.input_kas_besar ? "TRUE" : "FALSE",
    userRow.created_at || now,
    userRow.updated_at || now
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_USERS, "A:L"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] }
  });
  invalidateUsersCache();
}

async function updateUserRow(rowIndex, patch) {
  await ensureUserSheetColumns();
  const sheets = await getRegistrySheetsClient();
  const values = await readTabRaw(TAB_USERS);
  const headers = (values[0] || USER_HEADERS).map(h => String(h).trim().toLowerCase());
  const row = values[rowIndex - 1] ? [...values[rowIndex - 1]] : [];
  while (row.length < headers.length) row.push("");
  const set = (col, val) => {
    const idx = headers.indexOf(col);
    if (idx < 0) {
      const err = new Error(
        `Kolom "${col}" tidak ditemukan di tab Users. Buka User Access sekali lagi atau samakan header dengan: ${USER_HEADERS.join(", ")}`
      );
      err.status = 503;
      throw err;
    }
    row[idx] = val;
  };
  if (patch.display_name != null) set("name", patch.display_name);
  if (patch.phone != null) set("phone", patch.phone);
  if (patch.password_hash != null) set("password_hash", patch.password_hash);
  if (patch.email_verified != null) set("email_verified", patch.email_verified ? "TRUE" : "FALSE");
  if (patch.access_kas_kecil != null) set("access_kas_kecil", patch.access_kas_kecil ? "TRUE" : "FALSE");
  if (patch.access_kas_besar != null) set("access_kas_besar", patch.access_kas_besar ? "TRUE" : "FALSE");
  if (patch.input_kas_kecil != null) set("input_kas_kecil", patch.input_kas_kecil ? "TRUE" : "FALSE");
  if (patch.input_kas_besar != null) set("input_kas_besar", patch.input_kas_besar ? "TRUE" : "FALSE");
  set("updated_at", new Date().toISOString());
  const writeLen = Math.max(headers.length, row.length, USER_HEADERS.length);
  while (row.length < writeLen) row.push("");
  const writeRow = row.slice(0, writeLen);
  const endCol = columnLetter1Based(writeRow.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_USERS, `A${rowIndex}:${endCol}${rowIndex}`),
    valueInputOption: "RAW",
    requestBody: { values: [writeRow] }
  });
  invalidateUsersCache();
}

function hashVerificationCode(code) {
  const secret = process.env.SESSION_SECRET || "dev";
  return crypto.createHmac("sha256", secret).update(String(code)).digest("hex");
}

function generateVerificationCode() {
  return String(crypto.randomInt(100000, 999999));
}

async function purgeExpiredCodes() {
  const values = await readTabRaw(TAB_CODES);
  if (values.length <= 1) return;
  const headers = values[0];
  const now = Date.now();
  const kept = [headers];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const exp = Date.parse(String(row[3] || ""));
    if (Number.isFinite(exp) && exp >= now) kept.push(row);
  }
  if (kept.length === values.length) return;
  const sheets = await getRegistrySheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_CODES)
  });
  if (kept.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: USERS_SHEET_ID,
      range: a1Tab(TAB_CODES, "A1"),
      valueInputOption: "RAW",
      requestBody: { values: kept }
    });
  }
}

async function saveAuthCode(email, purpose, code, ttlMs = 15 * 60 * 1000) {
  await purgeExpiredCodes();
  const sheets = await getRegistrySheetsClient();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_CODES, "A:E"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[email.toLowerCase(), purpose, hashVerificationCode(code), expires, now.toISOString()]]
    }
  });
}

async function consumeAuthCode(email, purpose, code) {
  const values = await readTabRaw(TAB_CODES);
  if (values.length <= 1) return false;
  const targetEmail = email.toLowerCase();
  const hash = hashVerificationCode(code);
  const now = Date.now();
  let matchRow = -1;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[0] || "").toLowerCase() !== targetEmail) continue;
    if (String(row[1] || "") !== purpose) continue;
    if (String(row[2] || "") !== hash) continue;
    const exp = Date.parse(String(row[3] || ""));
    if (!Number.isFinite(exp) || exp < now) continue;
    matchRow = i;
    break;
  }
  if (matchRow < 0) return false;
  values.splice(matchRow, 1);
  const sheets = await getRegistrySheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_CODES)
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: USERS_SHEET_ID,
    range: a1Tab(TAB_CODES, "A1"),
    valueInputOption: "RAW",
    requestBody: { values }
  });
  return true;
}

async function createMemberUser({ name, email, phone, password }) {
  const existing = await findMemberByEmail(email);
  if (existing) {
    const err = new Error("Email sudah terdaftar.");
    err.status = 409;
    throw err;
  }
  const user_id = crypto.randomUUID();
  const password_hash = bcrypt.hashSync(String(password), 12);
  const row = {
    user_id,
    display_name: String(name).trim(),
    email: email.toLowerCase(),
    phone: String(phone).trim(),
    password_hash,
    email_verified: true,
    access_kas_kecil: false,
    access_kas_besar: false,
    input_kas_kecil: false,
    input_kas_besar: false
  };
  await appendUserRow(row);
  return row;
}

async function listMembersForAdmin() {
  await ensureUserSheetColumns();
  const users = await loadSheetUsers(true);
  return users.map(u => ({
    user_id: u.user_id,
    name: u.display_name,
    email: u.email,
    phone: u.phone,
    email_verified: u.email_verified,
    access_kas_kecil: u.access_kas_kecil,
    access_kas_besar: u.access_kas_besar,
    input_kas_kecil: u.input_kas_kecil,
    input_kas_besar: u.input_kas_besar,
    created_at: u.created_at,
    updated_at: u.updated_at
  }));
}

async function setMemberAccess(userId, patch) {
  await ensureUserSheetColumns();
  const id = String(userId || "").trim();
  const users = await loadSheetUsers(true);
  const u = users.find(x => String(x.user_id || "").trim() === id);
  if (!u) {
    const err = new Error("User tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  let access_kas_kecil = !!patch.access_kas_kecil;
  let access_kas_besar = !!patch.access_kas_besar;
  const input_kas_kecil = !!patch.input_kas_kecil;
  const input_kas_besar = !!patch.input_kas_besar;
  if (input_kas_kecil) access_kas_kecil = true;
  if (input_kas_besar) access_kas_besar = true;
  await updateUserRow(u._rowIndex, {
    access_kas_kecil,
    access_kas_besar,
    input_kas_kecil,
    input_kas_besar
  });
  return {
    user_id: u.user_id,
    email: u.email,
    access_kas_kecil,
    access_kas_besar,
    input_kas_kecil,
    input_kas_besar
  };
}

async function updateMemberPassword(email, password) {
  const u = await findMemberByEmail(email);
  if (!u) {
    const err = new Error("Email tidak terdaftar.");
    err.status = 404;
    throw err;
  }
  const password_hash = bcrypt.hashSync(String(password), 12);
  await updateUserRow(u._rowIndex, { password_hash });
}

async function deleteMemberUser(userId) {
  await ensureUserSheetColumns();
  const id = String(userId || "").trim();
  const users = await loadSheetUsers(true);
  const u = users.find(x => String(x.user_id || "").trim() === id);
  if (!u) {
    const err = new Error("User tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  const sheetId = await ensureTab(USERS_SHEET_ID, TAB_USERS, USER_HEADERS);
  const sheets = await getRegistrySheetsClient();
  const startIndex = u._rowIndex - 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: USERS_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex: startIndex + 1
            }
          }
        }
      ]
    }
  });
  invalidateUsersCache();
  return { user_id: u.user_id, email: u.email, name: u.display_name };
}

function registrySpreadsheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${USERS_SHEET_ID}/edit`;
}

function registryHelpEmail() {
  return serviceAccountEmailForHelp();
}

module.exports = {
  USERS_SHEET_ID,
  registrySpreadsheetUrl,
  registryHelpEmail,
  loadSheetUsers,
  findMemberByLogin,
  findMemberByEmail,
  createMemberUser,
  saveAuthCode,
  consumeAuthCode,
  generateVerificationCode,
  listMembersForAdmin,
  setMemberAccess,
  updateMemberPassword,
  deleteMemberUser,
  invalidateUsersCache
};
