const bcrypt = require("bcryptjs");
const { findMemberByLogin } = require("./userRegistry");

function loadEnvUsers() {
  const defs = [
    {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "Admin123!",
      role: "admin",
      display_name: process.env.ADMIN_DISPLAY_NAME || "Admin",
      email: process.env.ADMIN_EMAIL || "admin@local"
    },
    {
      username: process.env.SUPER_ADMIN_USERNAME || "superadmin",
      password: process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!",
      role: "super_admin",
      display_name: "Super Admin",
      email: process.env.SUPER_ADMIN_EMAIL || "superadmin@local"
    },
    {
      username: process.env.OWNER_USERNAME || "owner",
      password: process.env.OWNER_PASSWORD || "Owner123!",
      role: "owner",
      display_name: "Owner",
      email: process.env.OWNER_EMAIL || "owner@local"
    }
  ];

  return defs.map(u => ({
    username: u.username,
    email: u.email,
    role: u.role,
    display_name: u.display_name,
    password_hash: bcrypt.hashSync(u.password, 12),
    access_kas_kecil: u.role === "admin" || u.role === "super_admin" || u.role === "owner",
    access_kas_besar: u.role === "admin" || u.role === "super_admin" || u.role === "owner"
  }));
}

let envUsers = null;

function getEnvUsers() {
  if (!envUsers) envUsers = loadEnvUsers();
  return envUsers;
}

function findEnvUser(login) {
  const key = String(login || "").trim().toLowerCase();
  return getEnvUsers().find(
    u => u.username.toLowerCase() === key || u.email.toLowerCase() === key
  );
}

async function findUser(login) {
  const env = findEnvUser(login);
  if (env) return env;
  try {
    const member = await findMemberByLogin(login);
    if (!member || !member.email_verified) return null;
    return member;
  } catch {
    return null;
  }
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(String(password || ""), user.password_hash);
}

function publicUser(user) {
  const display_name =
    user.role === "admin"
      ? process.env.ADMIN_DISPLAY_NAME || "Admin"
      : user.display_name;
  const base = {
    id: user.user_id || user.username,
    username: user.username,
    email: user.email,
    role: user.role,
    display_name
  };
  if (user.role === "member") {
    base.access_kas_kecil = !!user.access_kas_kecil;
    base.access_kas_besar = !!user.access_kas_besar;
    base.input_kas_kecil = !!user.input_kas_kecil;
    base.input_kas_besar = !!user.input_kas_besar;
  }
  return base;
}

module.exports = { findUser, findEnvUser, verifyPassword, publicUser };
